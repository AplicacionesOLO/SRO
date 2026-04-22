import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Normaliza CUALQUIER shape de emails a string[] limpio.
 */
function normalizeEmails(val: unknown): string[] {
  if (!val) return [];

  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return normalizeEmails(parsed);
      } catch {
        // no es JSON válido
      }
    }
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(val)) return [];

  return val
    .flatMap((item: unknown) => {
      if (!item) return [];
      if (typeof item === "string") {
        const trimmed = item.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith("[")) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return normalizeEmails(parsed);
          } catch {
            // noop
          }
        }
        return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        const email =
          (typeof obj["email"] === "string" ? obj["email"] : null) ??
          (typeof obj["mail"] === "string" ? obj["mail"] : null) ??
          (typeof obj["address"] === "string" ? obj["address"] : null);
        if (email) return [email.trim()];
      }
      return [];
    })
    .filter(Boolean);
}

serve(async (req) => {
  const reqId = crypto.randomUUID();
  
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "Method Not Allowed", reqId });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { error: "Missing Supabase env vars", reqId });
    }

    // Auth check - usar el JWT del usuario para verificar permisos
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    
    if (!jwt) {
      return json(401, { error: "Unauthorized - No JWT", reqId });
    }

    // Cliente con service role para operaciones DB
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    
    // Verificar JWT del usuario
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json(401, { error: "Unauthorized", details: userErr?.message ?? "Invalid JWT", reqId });
    }

    const userId = userData.user.id;

    // Parse body
    let body: Record<string, unknown> | null = null;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON", reqId });
    }

    const { outboxId, bulk = false } = body ?? {};

    if (!outboxId || typeof outboxId !== "string") {
      return json(400, { error: "Missing or invalid outboxId", reqId });
    }

    console.log("[correspondence-retry-email][START]", { reqId, outboxId, bulk, userId });

    // Si es bulk, outboxId es en realidad un array de IDs serializado
    let targetIds: string[] = [outboxId];
    if (bulk) {
      try {
        const parsed = JSON.parse(outboxId);
        if (Array.isArray(parsed)) {
          targetIds = parsed;
        }
      } catch {
        // mantener el single ID
      }
    }

    // Fetch outbox rows - solo los que están en failed
    const { data: rows, error: fetchErr } = await supabaseAdmin
      .from("correspondence_outbox")
      .select("id, to_emails, cc_emails, bcc_emails, subject, body, sender_email, status, org_id")
      .in("id", targetIds)
      .eq("status", "failed");

    if (fetchErr) {
      console.error("[correspondence-retry-email][FETCH_ERROR]", { reqId, error: fetchErr.message });
      return json(500, { error: "Failed to fetch outbox rows", details: fetchErr.message, reqId });
    }

    if (!rows || rows.length === 0) {
      return json(404, { error: "No failed outbox rows found", reqId });
    }

    // NO marcar como queued antes - intentar enviar primero
    // Invocar smtp-send para cada row usando el JWT del usuario
    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const row of rows) {
      const toEmails = normalizeEmails(row.to_emails);
      const ccEmails = normalizeEmails(row.cc_emails);
      const bccEmails = normalizeEmails(row.bcc_emails);

      console.log("[correspondence-retry-email][SENDING]", {
        reqId,
        outboxId: row.id,
        toEmails,
        ccEmails,
        bccEmails,
      });

      try {
        // Llamar a smtp-send internamente usando el JWT del usuario
        const smtpResponse = await fetch(
          `${supabaseUrl}/functions/v1/smtp-send`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${jwt}`,
              "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            },
            body: JSON.stringify({
              outboxId: row.id,
              to_emails: toEmails,
              cc_emails: ccEmails,
              bcc_emails: bccEmails,
              subject: row.subject,
              body: row.body,
              sender_email: row.sender_email,
            }),
          }
        );

        if (smtpResponse.ok) {
          // Éxito: smtp-send ya actualizó el row a "sent"
          // Verificar que realmente se actualizó
          const { data: updatedRow } = await supabaseAdmin
            .from("correspondence_outbox")
            .select("status")
            .eq("id", row.id)
            .single();
          
          if (updatedRow?.status === "sent") {
            results.push({ id: row.id, success: true });
            console.log("[correspondence-retry-email][SUCCESS]", { reqId, outboxId: row.id });
          } else {
            // smtp-send respondió OK pero no actualizó el estado
            // Forzar actualización a sent
            await supabaseAdmin
              .from("correspondence_outbox")
              .update({ status: "sent", error: null, sent_at: new Date().toISOString() })
              .eq("id", row.id);
            results.push({ id: row.id, success: true });
            console.log("[correspondence-retry-email][SUCCESS_FORCED]", { reqId, outboxId: row.id });
          }
        } else {
          // Fallo: actualizar el row a failed con el error
          const errText = await smtpResponse.text();
          results.push({ id: row.id, success: false, error: errText });
          console.error("[correspondence-retry-email][SMTP_ERROR]", { reqId, outboxId: row.id, error: errText });
          
          // Actualizar el row a failed para que no quede en limbo
          await supabaseAdmin
            .from("correspondence_outbox")
            .update({ status: "failed", error: `Retry failed: ${errText}` })
            .eq("id", row.id);
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        results.push({ id: row.id, success: false, error: errMsg });
        console.error("[correspondence-retry-email][EXCEPTION]", { reqId, outboxId: row.id, error: errMsg });
        
        // Actualizar el row a failed para que no quede en limbo
        await supabaseAdmin
          .from("correspondence_outbox")
          .update({ status: "failed", error: `Retry exception: ${errMsg}` })
          .eq("id", row.id);
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log("[correspondence-retry-email][COMPLETE]", { reqId, attempted: results.length, succeeded, failed });

    return json(200, {
      success: true,
      attempted: results.length,
      succeeded,
      failed,
      results,
      reqId,
    });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("[correspondence-retry-email][FATAL]", { reqId, error: err?.message, stack: err?.stack });
    return json(500, { error: "Internal error", details: err?.message ?? String(e), reqId });
  }
});