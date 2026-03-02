import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "2026-02-06 CALLBACK-GMAIL-PROFILE-REQUIRED";

console.log(`[gmail-callback] VERSION ${VERSION}`);

serve(async (req) => {
  const reqId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    console.log("[gmail-callback][INIT]", {
      reqId,
      hasCode: !!code,
      codePrefix: code ? code.slice(0, 12) : null,
      hasState: !!stateParam,
      error: error ?? null,
      timestamp: new Date().toISOString(),
    });

    if (error) {
      console.error("[gmail-callback][OAUTH_ERROR]", { reqId, error });
      return new Response(`OAuth error: ${error}`, { status: 400 });
    }

    if (!code || !stateParam) {
      console.error("[gmail-callback][MISSING_PARAMS]", { reqId, hasCode: !!code, hasState: !!stateParam });
      return new Response("Missing code or state", { status: 400 });
    }

    let state: { orgId: string; userId: string; redirectUrl: string };
    try {
      state = JSON.parse(atob(stateParam));
      console.log("[gmail-callback][STATE_DECODED]", {
        reqId,
        orgId: state.orgId,
        userId: state.userId,
        redirectUrlPrefix: state.redirectUrl.slice(0, 50),
      });
    } catch (e) {
      console.error("[gmail-callback][STATE_DECODE_ERROR]", { reqId, error: String(e) });
      return new Response("Invalid state parameter", { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const clientId = Deno.env.get("GMAIL_CLIENT_ID") ?? "";
    const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET") ?? "";

    console.log("[gmail-callback][ENV_CHECK]", {
      reqId,
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
      hasClientId: !!clientId,
      clientIdPrefix: clientId ? clientId.slice(0, 12) : null,
      hasClientSecret: !!clientSecret,
    });

    if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret) {
      console.error("[gmail-callback][MISSING_ENV]", { reqId });
      return new Response("Missing environment variables", { status: 500 });
    }

    const callbackUrl = `${supabaseUrl}/functions/v1/gmail-callback`;

    console.log("[gmail-callback][TOKEN_EXCHANGE_START]", {
      reqId,
      callbackUrl,
      timestamp: new Date().toISOString(),
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[gmail-callback][TOKEN_EXCHANGE_ERROR]", {
        reqId,
        orgId: state.orgId,
        userId: state.userId,
        status: tokenRes.status,
        statusText: tokenRes.statusText,
        errText,
      });
      return new Response(`Token exchange failed: ${errText}`, { status: 500 });
    }

    const tokens = await tokenRes.json();

    console.log("[gmail-callback][TOKEN_EXCHANGE_SUCCESS]", {
      reqId,
      hasAccessToken: !!tokens.access_token,
      accessTokenPrefix: tokens.access_token ? tokens.access_token.slice(0, 12) : null,
      hasRefreshToken: !!tokens.refresh_token,
      refreshTokenPrefix: tokens.refresh_token ? tokens.refresh_token.slice(0, 12) : null,
      expiresIn: tokens.expires_in,
      tokenType: tokens.token_type,
      scope: tokens.scope,
    });

    if (!tokens.refresh_token) {
      console.warn("[gmail-callback][NO_REFRESH_TOKEN]", {
        reqId,
        orgId: state.orgId,
        userId: state.userId,
        warning: "No refresh_token received. User may need to revoke and reconnect with prompt=consent",
      });
    }

    console.log("[gmail-callback][GMAIL_PROFILE_FETCH_START]", { reqId });

    const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileRes.ok) {
      const errText = await profileRes.text();
      console.error("[gmail-callback][GMAIL_PROFILE_ERROR]", {
        reqId,
        orgId: state.orgId,
        userId: state.userId,
        status: profileRes.status,
        statusText: profileRes.statusText,
        errText,
        reason: "Cannot obtain Gmail email address. Insufficient scope or API error.",
      });
      return new Response(
        `Failed to obtain Gmail profile. Status: ${profileRes.status}. Error: ${errText}. Please ensure gmail.readonly scope is granted.`,
        { status: 500 }
      );
    }

    const profile = await profileRes.json();
    const gmailEmail = profile.emailAddress;

    if (!gmailEmail) {
      console.error("[gmail-callback][GMAIL_EMAIL_MISSING]", {
        reqId,
        orgId: state.orgId,
        userId: state.userId,
        profileData: profile,
        reason: "Gmail API returned profile without emailAddress field",
      });
      return new Response("Gmail profile does not contain emailAddress. Cannot proceed.", { status: 500 });
    }

    console.log("[gmail-callback][GMAIL_PROFILE_SUCCESS]", {
      reqId,
      gmailEmail,
      messagesTotal: profile.messagesTotal ?? null,
      threadsTotal: profile.threadsTotal ?? null,
      historyId: profile.historyId ?? null,
    });

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    console.log("[gmail-callback][DB_UPSERT_START]", {
      reqId,
      orgId: state.orgId,
      userId: state.userId,
      gmailEmail,
      expiresAt,
      hasRefreshToken: !!tokens.refresh_token,
    });

    const { data: existing } = await supabase
      .from("gmail_accounts")
      .select("id")
      .eq("org_id", state.orgId)
      .eq("user_id", state.userId)
      .maybeSingle();

    const upsertData = {
      gmail_email: gmailEmail,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: expiresAt,
      status: "connected",
      last_error: null,
      updated_at: new Date().toISOString(),
    };

    let dbResult;
    if (existing) {
      console.log("[gmail-callback][DB_UPDATE]", { reqId, existingId: existing.id });
      dbResult = await supabase
        .from("gmail_accounts")
        .update(upsertData)
        .eq("id", existing.id)
        .select()
        .single();
    } else {
      console.log("[gmail-callback][DB_INSERT]", { reqId });
      dbResult = await supabase
        .from("gmail_accounts")
        .insert({
          org_id: state.orgId,
          user_id: state.userId,
          ...upsertData,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
    }

    if (dbResult.error) {
      console.error("[gmail-callback][DB_ERROR]", {
        reqId,
        orgId: state.orgId,
        userId: state.userId,
        error: dbResult.error.message,
        details: dbResult.error,
      });
      return new Response(`Database error: ${dbResult.error.message}`, { status: 500 });
    }

    console.log("[gmail-callback][DB_SUCCESS]", {
      reqId,
      accountId: dbResult.data.id,
      status: dbResult.data.status,
      gmailEmail: dbResult.data.gmail_email,
      expiresAt: dbResult.data.expires_at,
      hasRefreshTokenPersisted: !!dbResult.data.refresh_token,
    });

    console.log("[gmail-callback][DONE]", {
      reqId,
      durationMs: Date.now() - startedAt,
      redirectUrl: state.redirectUrl,
    });

    const redirectUrl = new URL(state.redirectUrl);
    redirectUrl.searchParams.set("gmail_connected", "true");

    return Response.redirect(redirectUrl.toString(), 302);
  } catch (e: any) {
    console.error("[gmail-callback][FATAL]", {
      reqId,
      message: e?.message ?? String(e),
      stack: e?.stack ?? null,
    });
    return new Response(`Internal error: ${e?.message}`, { status: 500 });
  }
});