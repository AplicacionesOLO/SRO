import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "2026-02-06 AUTH-URL-WITH-PROFILE-SCOPE";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, payload: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

function safePrefix(value: string | null | undefined, len = 16) {
  if (!value) return null;
  return value.slice(0, len);
}

function getAnonKeyType(key: string) {
  if (!key) return "missing";
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.startsWith("eyJ")) return "legacy_jwt_like";
  return "unknown";
}

function readJsonBody<T>(req: Request): Promise<T> {
  return req.json() as Promise<T>;
}

type Body = {
  orgId: string;
  userId: string;
  redirectUrl: string;
  scope?: string[];
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  console.log(`[gmail-auth-url] VERSION ${VERSION}`);

  const reqId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const clientId = Deno.env.get("GMAIL_CLIENT_ID") ?? "";
    const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET") ?? "";

    console.log("[gmail-auth-url][INIT]", {
      reqId,
      hasSupabaseUrl: !!supabaseUrl,
      hasAnonKey: !!anonKey,
      anonKeyType: getAnonKeyType(anonKey),
      anonKeyPrefix: safePrefix(anonKey, 20),
      hasClientId: !!clientId,
      clientIdPrefix: safePrefix(clientId, 12),
      hasClientSecret: !!clientSecret,
      origin: req.headers.get("origin"),
    });

    if (!supabaseUrl || !anonKey) {
      return json(500, { error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY", reqId });
    }
    if (!clientId || !clientSecret) {
      return json(500, { error: "Missing Gmail OAuth secrets (GMAIL_CLIENT_ID/GMAIL_CLIENT_SECRET)", reqId });
    }

    if (req.method !== "POST") {
      return json(405, { error: "Method Not Allowed", reqId });
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const apikeyHeader = req.headers.get("apikey") || "";

    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

    console.log("[gmail-auth-url][REQ_HEADERS]", {
      reqId,
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: safePrefix(authHeader, 16),
      hasJwt: !!jwt,
      jwtPrefix: safePrefix(jwt, 12),
      hasApikeyHeader: !!apikeyHeader,
      apikeyPrefix: safePrefix(apikeyHeader, 16),
      apikeyMatchesEnv: apikeyHeader ? apikeyHeader === anonKey : null,
    });

    if (!jwt) {
      return json(401, { error: "Missing Authorization Bearer token", reqId });
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);

    console.log("[gmail-auth-url][AUTH_RESULT]", {
      reqId,
      ok: !!userData?.user && !userErr,
      userId: userData?.user?.id ?? null,
      userEmail: userData?.user?.email ?? null,
      err: userErr?.message ?? null,
    });

    if (userErr || !userData?.user) {
      return json(401, { error: "Unauthorized", details: userErr?.message ?? "Invalid token", reqId });
    }

    const body = await readJsonBody<Body>(req);

    console.log("[gmail-auth-url][BODY]", {
      reqId,
      orgId: body?.orgId ?? null,
      userId: body?.userId ?? null,
      redirectUrlPrefix: safePrefix(body?.redirectUrl, 40),
      scopeCount: body?.scope?.length ?? 0,
    });

    if (!body?.orgId || !body?.userId || !body?.redirectUrl) {
      return json(400, { error: "Missing orgId/userId/redirectUrl", reqId });
    }

    if (body.userId !== userData.user.id) {
      return json(403, { error: "Forbidden: userId mismatch", reqId });
    }

    const defaultScopes = [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email"
    ];
    const scopes = (body.scope && body.scope.length ? body.scope : defaultScopes).join(" ");

    console.log("[gmail-auth-url][SCOPES]", {
      reqId,
      scopes,
      scopeCount: scopes.split(" ").length,
    });

    const statePayload = {
      orgId: body.orgId,
      userId: body.userId,
      redirectUrl: body.redirectUrl,
      ts: Date.now(),
      nonce: crypto.randomUUID(),
    };
    const state = btoa(JSON.stringify(statePayload));

    const callbackUrl = `${supabaseUrl}/functions/v1/gmail-callback`;

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);

    const authUrl = url.toString();

    console.log("[gmail-auth-url][DONE]", {
      reqId,
      durationMs: Date.now() - startedAt,
      callbackUrl,
      authUrlPrefix: safePrefix(authUrl, 80),
      hasAccessTypeOffline: authUrl.includes("access_type=offline"),
      hasPromptConsent: authUrl.includes("prompt=consent"),
      hasUserinfoScope: authUrl.includes("userinfo.email"),
    });

    return json(200, { authUrl, reqId });
  } catch (e: any) {
    console.error("[gmail-auth-url][FATAL]", { message: e?.message ?? String(e), stack: e?.stack ?? null });
    return json(500, { error: "Internal error", details: e?.message ?? String(e) });
  }
});