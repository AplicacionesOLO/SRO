import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

console.log("[gmail-connection-status] v2026-02-12-JWT-OFF");

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

function nowIso() {
  return new Date().toISOString();
}

function toMs(ts: unknown): number | null {
  if (!ts) return null;
  const d = new Date(ts as any);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  reqId: string
): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenRes.ok) return null;
    const tokens = await tokenRes.json();
    return {
      access_token: tokens.access_token,
      expires_in: tokens.expires_in ?? 3600,
    };
  } catch (e) {
    console.error("[REFRESH_ERROR]", String(e));
    return null;
  }
}

serve(async (req) => {
  const reqId = crypto.randomUUID();

  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json(405, { error: "Method Not Allowed", reqId });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const clientId = Deno.env.get("GMAIL_CLIENT_ID") ?? "";
    const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { error: "Missing env", reqId });
    }

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON", reqId });
    }

    const orgId = body?.orgId ?? null;
    const userId = body?.userId ?? null;

    if (!orgId || !userId) {
      return json(400, { error: "Missing orgId or userId", reqId });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabaseAdmin
      .from("gmail_accounts")
      .select("id, org_id, user_id, gmail_email, provider, status, expires_at, last_error, created_at, updated_at, access_token, refresh_token")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return json(500, { error: "DB error", details: error.message, reqId });
    }

    if (!data) {
      return json(200, {
        connected: false,
        account: null,
        debug: { reqId, found: false },
      });
    }

    const statusRaw = String(data.status ?? "").toLowerCase();
    const isConnectedByStatus = statusRaw === "connected" || statusRaw === "active" || statusRaw === "ok";
    const expiresAtMs = toMs(data.expires_at);
    const isExpired = expiresAtMs ? Date.now() >= expiresAtMs : false;

    let finalData = data;
    let wasRefreshed = false;

    if (isExpired && data.refresh_token && clientId && clientSecret) {
      const refreshed = await refreshAccessToken(data.refresh_token, clientId, clientSecret, reqId);

      if (refreshed) {
        const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

        const { data: updated } = await supabaseAdmin
          .from("gmail_accounts")
          .update({
            access_token: refreshed.access_token,
            expires_at: newExpiresAt,
            status: "connected",
            last_error: null,
            updated_at: nowIso(),
          })
          .eq("id", data.id)
          .select("id, org_id, user_id, gmail_email, provider, status, expires_at, last_error, created_at, updated_at, access_token, refresh_token")
          .single();

        if (updated) {
          finalData = updated;
          wasRefreshed = true;
        }
      } else {
        await supabaseAdmin
          .from("gmail_accounts")
          .update({ status: "expired", last_error: "Token refresh failed", updated_at: nowIso() })
          .eq("id", data.id);
        finalData = { ...data, status: "expired" };
      }
    } else if (isExpired && !data.refresh_token) {
      await supabaseAdmin
        .from("gmail_accounts")
        .update({ status: "expired", last_error: "No refresh token", updated_at: nowIso() })
        .eq("id", data.id);
      finalData = { ...data, status: "expired" };
    }

    const finalStatusRaw = String(finalData.status ?? "").toLowerCase();
    const finalIsConnectedByStatus = finalStatusRaw === "connected" || finalStatusRaw === "active" || finalStatusRaw === "ok";
    const finalExpiresAtMs = toMs(finalData.expires_at);
    const finalIsExpired = finalExpiresAtMs ? Date.now() >= finalExpiresAtMs : false;
    const connected = finalIsConnectedByStatus && !finalIsExpired;

    const normalizedAccount = connected
      ? {
          id: finalData.id,
          org_id: finalData.org_id,
          user_id: finalData.user_id,
          gmail_email: finalData.gmail_email,
          provider: finalData.provider,
          status: finalData.status,
          expires_at: finalData.expires_at,
          last_error: finalData.last_error,
          created_at: finalData.created_at,
          updated_at: finalData.updated_at,
        }
      : null;

    return json(200, {
      connected,
      account: normalizedAccount,
      debug: { reqId, found: true, wasRefreshed },
    });
  } catch (e) {
    console.error("[FATAL]", String(e));
    return json(500, { error: "Internal error", details: String(e), reqId: crypto.randomUUID() });
  }
});