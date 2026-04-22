import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "2026-02-06 CALLBACK-GMAIL-PROFILE-REQUIRED";

serve(async (req) => {
  const reqId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) return new Response(`OAuth error: ${error}`, { status: 400 });
    if (!code || !stateParam) return new Response("Missing code or state", { status: 400 });

    let state: { orgId: string; userId: string; redirectUrl: string };
    try { state = JSON.parse(atob(stateParam)); } catch { return new Response("Invalid state parameter", { status: 400 }); }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const clientId = Deno.env.get("GMAIL_CLIENT_ID") ?? "";
    const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET") ?? "";

    if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret) return new Response("Missing environment variables", { status: 500 });

    const callbackUrl = `${supabaseUrl}/functions/v1/gmail-callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: callbackUrl, grant_type: "authorization_code" }),
    });

    if (!tokenRes.ok) { const errText = await tokenRes.text(); return new Response(`Token exchange failed: ${errText}`, { status: 500 }); }
    const tokens = await tokenRes.json();

    const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!profileRes.ok) { const errText = await profileRes.text(); return new Response(`Failed to obtain Gmail profile: ${errText}`, { status: 500 }); }

    const profile = await profileRes.json();
    const gmailEmail = profile.emailAddress;
    if (!gmailEmail) return new Response("Gmail profile does not contain emailAddress.", { status: 500 });

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    const { data: existing } = await supabase.from("gmail_accounts").select("id").eq("org_id", state.orgId).eq("user_id", state.userId).maybeSingle();
    const upsertData = { gmail_email: gmailEmail, access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? null, expires_at: expiresAt, status: "connected", last_error: null, updated_at: new Date().toISOString() };

    let dbResult;
    if (existing) {
      dbResult = await supabase.from("gmail_accounts").update(upsertData).eq("id", existing.id).select().single();
    } else {
      dbResult = await supabase.from("gmail_accounts").insert({ org_id: state.orgId, user_id: state.userId, ...upsertData, created_at: new Date().toISOString() }).select().single();
    }

    if (dbResult.error) return new Response(`Database error: ${dbResult.error.message}`, { status: 500 });

    const redirectUrl = new URL(state.redirectUrl);
    redirectUrl.searchParams.set("gmail_connected", "true");
    return Response.redirect(redirectUrl.toString(), 302);
  } catch (e: any) {
    console.error("[gmail-callback][FATAL]", { reqId, message: e?.message ?? String(e) });
    return new Response(`Internal error: ${e?.message}`, { status: 500 });
  }
});