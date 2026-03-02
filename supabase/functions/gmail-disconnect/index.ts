// supabase/functions/gmail-disconnect/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "2026-02-13 DISCONNECT-KEEP-REFRESH";
console.log(`[gmail-disconnect] VERSION ${VERSION}`);

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

type Body = { orgId: string; userId: string };

serve(async (req) => {
  const reqId = crypto.randomUUID();

  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { success: false, error: "Method Not Allowed", reqId });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) return json(500, { success: false, error: "Missing env vars", reqId });

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json(401, { success: false, error: "Unauthorized", details: "Missing token", reqId });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json(401, { success: false, error: "Unauthorized", details: userErr?.message ?? "Invalid token", reqId });
    }

    let body: Body | null = null;
    try {
      body = (await req.json()) as Body;
    } catch {
      return json(400, { success: false, error: "Bad Request", details: "Invalid JSON", reqId });
    }

    const orgId = body?.orgId ?? "";
    const userId = body?.userId ?? "";
    if (!orgId || !userId) return json(400, { success: false, error: "Bad Request", details: "Missing orgId/userId", reqId });
    if (userId !== userData.user.id) return json(403, { success: false, error: "Forbidden", details: "userId mismatch", reqId });

    const { data: account, error: accErr } = await supabaseAdmin
      .from("gmail_accounts")
      .select("id, access_token, refresh_token, gmail_email, status")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (accErr) return json(500, { success: false, error: "DB read failed", details: accErr.message, reqId });

    if (!account) {
      return json(200, { success: true, disconnected: true, message: "No account to disconnect", reqId });
    }

    const tokenToRevoke = account.refresh_token || account.access_token;
    if (tokenToRevoke) {
      try {
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: tokenToRevoke }),
        });
      } catch {}
    }

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("gmail_accounts")
      .update({
        status: "disconnected",
        expires_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id)
      .select("id, status, gmail_email")
      .single();

    if (updErr) {
      return json(500, { success: false, error: "DB update failed", details: updErr.message, reqId });
    }

    return json(200, {
      success: true,
      disconnected: true,
      gmailEmail: account.gmail_email,
      accountId: account.id,
      status: updated.status,
      reqId,
    });
  } catch (e: any) {
    return json(500, { success: false, error: "Internal error", details: e?.message ?? String(e), reqId });
  }
});