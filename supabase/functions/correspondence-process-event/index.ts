import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "v630-sender-email-smtp-from";

console.log(`[correspondence-process-event] VERSION ${VERSION}`);

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

function safePrefix(v: string | null | undefined, n = 18) {
  if (!v) return null;
  return v.slice(0, n);
}

/**
 * Helper: Convierte null/undefined a "null" string para queries Postgres.
 * Mantiene valores falsy válidos (0, "", false) sin pisar.
 */
function asNull(value: string | null | undefined): string {
  return value === null || value === undefined ? "null" : value;
}

type Body = {
  orgId: string;
  reservationId: string;
  actorUserId: string;
  eventType: string;
  statusFromId: string | null;
  statusToId: string | null;
};

function processTemplate(template: string, ctx: Record<string, any>): string {
  if (!template) return "";
  let result = template;

  for (const [k, v] of Object.entries(ctx)) {
    const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g");
    result = result.replace(re, String(v ?? ""));
  }
  return result;
}

function formatDateEs(value: any): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

function normalizeEmailBody(input: string): string {
  const raw = String(input ?? "");

  let s = raw.replace(/<\/br\s*>/gi, "<br/>");

  s = s.replace(/\r\n/g, "\n");

  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(s) || /<br\s*\/?>/i.test(s);

  if (looksHtml) {
    s = s.replace(/\n/g, "<br/>");
    return s;
  }

  const escaped = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withBreaks = escaped.replace(/\n/g, "<br/>");

  return `
  <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111827; line-height: 1.45; white-space: normal;">
    ${withBreaks}
  </div>
  `.trim();
}

serve(async (req) => {
  const reqId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    if (req.method === "OPTIONS") {
      console.log("[correspondence-process-event][OPTIONS]", { reqId });
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json(405, { error: "Method Not Allowed", reqId });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const mailInternalSecret = Deno.env.get("MAIL_INTERNAL_SECRET") ?? "";

    console.log("[correspondence-process-event][INIT]", {
      reqId,
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
      hasMailInternalSecret: !!mailInternalSecret,
      serviceRoleKeyPrefix: safePrefix(serviceRoleKey, 14),
    });

    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", reqId });
    }

    if (!mailInternalSecret) {
      return json(500, { error: "Missing MAIL_INTERNAL_SECRET", reqId });
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

    console.log("[correspondence-process-event][HEADERS]", {
      reqId,
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: safePrefix(authHeader, 16),
      hasJwt: !!jwt,
      jwtPrefix: safePrefix(jwt, 12),
    });

    if (!jwt) {
      return json(401, { error: "Unauthorized", details: "Missing Authorization Bearer token", reqId });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);

    console.log("[correspondence-process-event][AUTH]", {
      reqId,
      ok: !userErr && !!userData?.user?.id,
      authedUserId: userData?.user?.id ?? null,
      userErr: userErr?.message ?? null,
    });

    if (userErr || !userData?.user) {
      return json(401, { error: "Unauthorized", details: userErr?.message ?? "Invalid JWT", reqId });
    }

    let body: Body | null = null;
    try {
      body = (await req.json()) as Body;
    } catch {
      return json(400, { error: "Bad Request", details: "Invalid JSON body", reqId });
    }

    const { orgId, reservationId, actorUserId, eventType, statusFromId, statusToId } = body ?? ({} as any);

    console.log("[correspondence-process-event][REQ]", {
      reqId,
      orgId,
      reservationId,
      actorUserId,
      eventType,
      statusFromId,
      statusToId,
    });

    if (!orgId || !reservationId || !actorUserId || !eventType) {
      return json(400, {
        error: "Missing required fields",
        details: { orgId: !!orgId, reservationId: !!reservationId, actorUserId: !!actorUserId, eventType: !!eventType },
        reqId,
      });
    }

    if (actorUserId !== userData.user.id) {
      return json(403, { error: "Forbidden", details: "actorUserId mismatch", reqId });
    }

    let rulesQuery = supabase
      .from("correspondence_rules")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .eq("event_type", eventType);

    if (eventType === "reservation_status_changed") {
      rulesQuery = rulesQuery.or(
        [
          "and(status_from_id.is.null,status_to_id.is.null)",
          `and(status_from_id.eq.${asNull(statusFromId)},status_to_id.is.null)`,
          `and(status_from_id.is.null,status_to_id.eq.${asNull(statusToId)})`,
          `and(status_from_id.eq.${asNull(statusFromId)},status_to_id.eq.${asNull(statusToId)})`,
        ].join(",")
      );
    }

    const { data: rules, error: rulesErr } = await rulesQuery;

    if (rulesErr) {
      console.error("[correspondence-process-event][RULES_ERROR]", { reqId, message: rulesErr.message });
      return json(500, { error: "Failed to fetch rules", details: rulesErr.message, reqId });
    }

    console.log("[correspondence-process-event][RULES_MATCHED]", {
      reqId,
      rulesCount: rules?.length ?? 0,
      ruleIds: rules?.map((r: any) => r.id) ?? [],
    });

    if (!rules || rules.length === 0) {
      return json(200, { success: true, message: "No active rules found", queued: 0, sent: 0, failed: 0, results: [], reqId });
    }

    const { data: reservation, error: resErr } = await supabase
      .from("reservations")
      .select(
        `
        *,
        docks(name),
        reservation_statuses(name)
      `
      )
      .eq("id", reservationId)
      .maybeSingle();

    if (resErr || !reservation) {
      console.error("[correspondence-process-event][RESERVATION_ERROR]", {
        reqId,
        message: resErr?.message ?? "Reservation not found",
      });
      return json(500, { error: "Failed to fetch reservation", details: resErr?.message ?? "Reservation not found", reqId });
    }

    const createdById =
      (reservation as any).created_by ??
      (reservation as any).created_by_user_id ??
      (reservation as any).user_id ??
      (reservation as any).created_by_id ??
      null;

    let createdByName = "";
    if (createdById) {
      const { data: creator, error: creatorErr } = await supabase
        .from("profiles")
        .select("name, email")
        .eq("id", createdById)
        .maybeSingle();

      if (creatorErr) {
        console.warn("[correspondence-process-event][CREATOR_PROFILE_WARN]", { reqId, createdById, message: creatorErr.message });
      } else {
        createdByName = creator?.name || creator?.email || "";
      }
    }

    const { data: actorProfile, error: actorErr } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", actorUserId)
      .maybeSingle();

    if (actorErr) {
      console.warn("[correspondence-process-event][ACTOR_PROFILE_WARN]", { reqId, actorUserId, message: actorErr.message });
    }

    const actorName = actorProfile?.name || actorProfile?.email || "Usuario";

    const templateCtx = {
      reservation_id: (reservation as any)?.id ?? "",
      dock: (reservation as any)?.docks?.name ?? "",
      start_datetime: formatDateEs((reservation as any)?.start_datetime),
      end_datetime: formatDateEs((reservation as any)?.end_datetime),
      status: (reservation as any)?.reservation_statuses?.name ?? "",
      driver: (reservation as any)?.driver_name ?? "",
      truck_plate: (reservation as any)?.truck_plate ?? "",
      dua: (reservation as any)?.dua ?? "",
      invoice: (reservation as any)?.invoice ?? "",
      created_by: createdByName,
      actor: actorName,
    };

    // ✅ sender_email forzado desde SMTP_FROM
    const smtpFrom = Deno.env.get("SMTP_FROM") ?? "no-reply-sro@ologistics.com";

    let queued = 0;
    let sent = 0;
    let failed = 0;
    const results: any[] = [];

    for (const rule of rules as any[]) {
      console.log("[correspondence-process-event][PROCESS_RULE]", {
        reqId,
        ruleId: rule.id,
        name: rule.name,
        sender_mode: rule.sender_mode,
        recipients_mode: rule.recipients_mode,
      });

      let senderUserId: string | null = null;
      if (rule.sender_mode === "actor") senderUserId = actorUserId;
      if (rule.sender_mode === "fixed" && rule.sender_user_id) senderUserId = rule.sender_user_id;

      let toEmails: string[] = [];
      let ccEmails: string[] = [];
      let bccEmails: string[] = [];

      if (rule.recipients_mode === "manual") {
        toEmails = Array.isArray(rule.recipients_emails) ? rule.recipients_emails.filter(Boolean) : [];
        ccEmails = Array.isArray(rule.cc_emails) ? rule.cc_emails.filter(Boolean) : [];
        bccEmails = Array.isArray(rule.bcc_emails) ? rule.bcc_emails.filter(Boolean) : [];
      } else if (rule.recipients_mode === "users" && Array.isArray(rule.recipients_user_ids) && rule.recipients_user_ids.length > 0) {
        const { data: ps, error: pe } = await supabase.from("profiles").select("email").in("id", rule.recipients_user_ids);
        if (pe) console.error("[correspondence-process-event][RECIP_USERS_ERROR]", { reqId, ruleId: rule.id, message: pe.message });
        toEmails = (ps ?? []).map((x: any) => x.email).filter(Boolean);
      } else if (rule.recipients_mode === "roles" && Array.isArray(rule.recipients_roles) && rule.recipients_roles.length > 0) {
        const { data: rolesData, error: rolesErr } = await supabase.from("roles").select("id,name").in("name", rule.recipients_roles);
        if (rolesErr) {
          console.error("[correspondence-process-event][ROLES_LOOKUP_ERROR]", { reqId, ruleId: rule.id, message: rolesErr.message });
        } else if ((rolesData ?? []).length > 0) {
          const roleIds = rolesData!.map((r: any) => r.id);
          const { data: uor, error: uorErr } = await supabase
            .from("user_org_roles")
            .select("user_id, profiles(email)")
            .eq("org_id", orgId)
            .in("role_id", roleIds);

          if (uorErr) console.error("[correspondence-process-event][USER_ORG_ROLES_ERROR]", { reqId, ruleId: rule.id, message: uorErr.message });
          toEmails = (uor ?? []).map((u: any) => u.profiles?.email).filter(Boolean);
        }
      }

      toEmails = [...new Set(toEmails.filter(Boolean))];
      ccEmails = [...new Set(ccEmails.filter(Boolean))];
      bccEmails = [...new Set(bccEmails.filter(Boolean))];

      const subject = processTemplate(rule.subject || "", templateCtx);

      const bodyRaw = processTemplate(rule.body_template || "", templateCtx);
      const bodyHtml = normalizeEmailBody(bodyRaw);

      // ✅ sender_email = SMTP_FROM (nunca null)
      const { data: outbox, error: outboxErr } = await supabase
        .from("correspondence_outbox")
        .insert({
          org_id: orgId,
          rule_id: rule.id,
          event_type: eventType,
          reservation_id: reservationId,
          actor_user_id: actorUserId,
          sender_user_id: senderUserId,
          sender_email: smtpFrom,
          to_emails: toEmails,
          cc_emails: ccEmails,
          bcc_emails: bccEmails,
          subject,
          body: bodyHtml,
          status: "queued",
          created_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (outboxErr || !outbox) {
        failed++;
        console.error("[correspondence-process-event][OUTBOX_INSERT_ERROR]", { reqId, ruleId: rule.id, message: outboxErr?.message });
        results.push({ ruleId: rule.id, status: "failed", error: outboxErr?.message ?? "outbox insert failed" });
        continue;
      }

      queued++;

      if (toEmails.length === 0) {
        failed++;

        await supabase.from("correspondence_outbox").update({
          status: "failed",
          error: "No recipients resolved",
        }).eq("id", outbox.id);

        await supabase.from("correspondence_logs").insert({
          org_id: orgId,
          rule_id: rule.id,
          reservation_id: reservationId,
          event_type: eventType,
          recipients: [],
          subject,
          body: bodyHtml,
          status: "failed",
          error_message: "No recipients resolved",
          created_at: new Date().toISOString(),
        });

        results.push({ ruleId: rule.id, outboxId: outbox.id, status: "failed", error: "No recipients resolved" });
        continue;
      }

      try {
        console.log("[correspondence-process-event][CALLING_SMTP_SEND]", {
          reqId,
          ruleId: rule.id,
          outboxId: outbox.id,
          toCount: toEmails.length,
          ccCount: ccEmails.length,
          bccCount: bccEmails.length,
        });

        const sendRes = await fetch(`${supabaseUrl}/functions/v1/smtp-send`, {
          method: "POST",
          headers: {
            "X-Internal-Call": mailInternalSecret,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orgId,
            to: toEmails,
            cc: ccEmails,
            bcc: bccEmails,
            subject,
            body: bodyHtml,
            outboxId: outbox.id,
          }),
        });

        const sendText = await sendRes.text();
        let sendJson: any = null;
        try { sendJson = JSON.parse(sendText); } catch { /* ignore */ }

        console.log("[correspondence-process-event][SMTP_SEND_RESPONSE]", {
          reqId,
          ruleId: rule.id,
          outboxId: outbox.id,
          status: sendRes.status,
          ok: sendRes.ok,
          response: sendJson,
        });

        if (!sendRes.ok || !sendJson?.success) {
          failed++;

          const errMsg = sendJson?.details || sendJson?.error || sendText || `HTTP ${sendRes.status}`;

          await supabase.from("correspondence_outbox").update({
            status: "failed",
            error: errMsg,
          }).eq("id", outbox.id);

          await supabase.from("correspondence_logs").insert({
            org_id: orgId,
            rule_id: rule.id,
            reservation_id: reservationId,
            event_type: eventType,
            recipients: toEmails,
            subject,
            body: bodyHtml,
            status: "failed",
            error_message: errMsg,
            created_at: new Date().toISOString(),
          });

          results.push({ ruleId: rule.id, outboxId: outbox.id, status: "failed", error: errMsg });
          continue;
        }

        sent++;

        await supabase.from("correspondence_logs").insert({
          org_id: orgId,
          rule_id: rule.id,
          reservation_id: reservationId,
          event_type: eventType,
          recipients: toEmails,
          subject,
          body: bodyHtml,
          status: "sent",
          error_message: null,
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });

        results.push({ ruleId: rule.id, outboxId: outbox.id, status: "sent", messageId: sendJson?.messageId ?? null });
      } catch (e: any) {
        failed++;

        const errMsg = e?.message ?? String(e);

        console.error("[correspondence-process-event][SMTP_SEND_ERROR]", {
          reqId,
          ruleId: rule.id,
          outboxId: outbox.id,
          error: errMsg,
        });

        await supabase.from("correspondence_outbox").update({
          status: "failed",
          error: errMsg,
        }).eq("id", outbox.id);

        await supabase.from("correspondence_logs").insert({
          org_id: orgId,
          rule_id: rule.id,
          reservation_id: reservationId,
          event_type: eventType,
          recipients: toEmails,
          subject,
          body: bodyHtml,
          status: "failed",
          error_message: errMsg,
          created_at: new Date().toISOString(),
        });

        results.push({ ruleId: rule.id, outboxId: outbox.id, status: "failed", error: errMsg });
      }
    }

    console.log("[correspondence-process-event][SUMMARY]", {
      reqId,
      queued,
      sent,
      failed,
      durationMs: Date.now() - startedAt,
    });

    return json(200, { success: true, queued, sent, failed, results, reqId });
  } catch (e: any) {
    console.error("[correspondence-process-event][FATAL]", { reqId, error: e?.message ?? String(e) });
    return json(500, { error: "Internal error", details: e?.message ?? String(e), reqId });
  }
});