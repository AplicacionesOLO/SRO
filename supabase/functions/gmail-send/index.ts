import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "2026-02-10 GMAIL-SEND-MULTIPART-ALT-FIX";
console.log(`[gmail-send] VERSION ${VERSION}`);

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

function safePrefix(val: string | null | undefined, len = 16) {
  if (!val) return null;
  return val.slice(0, len);
}

function b64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function encodeMimeHeader(value: string): string {
  if (!value) return "";
  const hasNonAscii = /[^\x00-\x7F]/.test(value);
  if (!hasNonAscii) return value;
  return `=?UTF-8?B?${b64Utf8(value)}?=`;
}

function base64UrlUtf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hasHtmlTags(s: string) {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

function escapeHtml(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function toSafeHtml(body: string) {
  const src = String(body ?? "");
  if (!src.trim()) return "<div></div>";

  if (hasHtmlTags(src)) return src;

  const escaped = escapeHtml(src);
  const withBreaks = escaped.replace(/\r\n|\r|\n/g, "<br/>");

  return `<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; line-height:1.45; color:#111827;">${withBreaks}</div>`;
}

function htmlToPlain(html: string) {
  const s = String(html ?? "");
  if (!s.trim()) return "";

  if (!hasHtmlTags(s)) return s;

  let t = s
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<\/\s*div\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "");

  t = t
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  t = t.replace(/\n{3,}/g, "\n\n").trim();

  return t;
}

type RequestBody = {
  orgId: string;
  senderUserId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  outboxId?: string;
};

serve(async (req) => {
  const reqId = crypto.randomUUID();

  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const clientId = Deno.env.get("GMAIL_CLIENT_ID") ?? "";
    const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET") ?? "";

    console.log("[gmail-send][INIT]", {
      reqId,
      method: req.method,
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceRoleKey: !!serviceRoleKey,
      serviceRoleKeyPrefix: safePrefix(serviceRoleKey, 14),
      hasClientId: !!clientId,
      clientIdPrefix: safePrefix(clientId, 12),
      hasClientSecret: !!clientSecret,
    });

    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", reqId });
    }
    if (!clientId || !clientSecret) {
      return json(500, { error: "Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET", reqId });
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    if (!authHeader) {
      return json(401, { error: "Unauthorized", details: "Missing Authorization header", reqId });
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return json(401, { error: "Unauthorized", details: "Empty JWT", reqId });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);

    console.log("[gmail-send][AUTH]", {
      reqId,
      ok: !userErr && !!userData?.user?.id,
      authedUserId: userData?.user?.id ?? null,
      userErr: userErr?.message ?? null,
    });

    if (userErr || !userData?.user) {
      return json(401, { error: "Unauthorized", details: userErr?.message ?? "Invalid JWT", reqId });
    }

    let body: RequestBody | null = null;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return json(400, { error: "Bad Request", details: "Invalid JSON body", reqId });
    }

    const { orgId, senderUserId, to, subject, body: emailBody, cc, bcc, outboxId } = body ?? ({} as any);

    console.log("[gmail-send][REQ]", {
      reqId,
      orgId,
      senderUserId,
      toCount: Array.isArray(to) ? to.length : 0,
      ccCount: Array.isArray(cc) ? cc.length : 0,
      bccCount: Array.isArray(bcc) ? bcc.length : 0,
      subject,
      bodyLength: String(emailBody ?? "").length,
      outboxId: outboxId ?? null,
    });

    if (!orgId || !senderUserId || !to || !Array.isArray(to) || to.length === 0 || !subject || emailBody == null) {
      const errorMsg = "Missing required fields: orgId, senderUserId, to (array), subject, body";
      console.error("[gmail-send][VALIDATION_ERROR]", { reqId, errorMsg });

      if (outboxId) {
        await supabase
          .from("correspondence_outbox")
          .update({ status: "failed", error: errorMsg, updated_at: new Date().toISOString() })
          .eq("id", outboxId);
      }

      return json(400, { success: false, error: "Bad Request", details: errorMsg, reqId });
    }

    const selectCols =
      "id, org_id, user_id, gmail_email, provider, access_token, refresh_token, expires_at, status, last_error";

    const { data: account, error: accErr } = await supabase
      .from("gmail_accounts")
      .select(selectCols)
      .eq("org_id", orgId)
      .eq("user_id", senderUserId)
      .eq("status", "connected")
      .maybeSingle();

    if (accErr) {
      console.error("[gmail-send][DB_ERROR]", {
        reqId,
        message: accErr.message,
        details: (accErr as any)?.details ?? null,
        hint: (accErr as any)?.hint ?? null,
        code: (accErr as any)?.code ?? null,
      });

      const errorMsg = `DB error: ${accErr.message}`;

      if (outboxId) {
        await supabase
          .from("correspondence_outbox")
          .update({ status: "failed", error: errorMsg, updated_at: new Date().toISOString() })
          .eq("id", outboxId);
      }

      return json(500, { success: false, error: "DB error", details: accErr.message, reqId });
    }

    if (!account) {
      const errorMsg = `Gmail account not connected for user ${senderUserId} in org ${orgId}`;
      console.error("[gmail-send][NO_ACCOUNT]", { reqId, errorMsg });

      if (outboxId) {
        await supabase
          .from("correspondence_outbox")
          .update({ status: "failed", error: errorMsg, updated_at: new Date().toISOString() })
          .eq("id", outboxId);
      }

      return json(404, { success: false, error: "Gmail account not connected", details: errorMsg, reqId });
    }

    console.log("[gmail-send][ACCOUNT]", {
      reqId,
      accountId: account.id,
      gmailEmail: account.gmail_email,
      status: account.status,
      hasAccessToken: !!account.access_token,
      hasRefreshToken: !!account.refresh_token,
      expiresAt: account.expires_at,
    });

    let finalOutboxId = outboxId;
    if (!finalOutboxId) {
      const { data: newOutbox, error: outboxErr } = await supabase
        .from("correspondence_outbox")
        .insert({
          org_id: orgId,
          sender_user_id: senderUserId,
          sender_email: account.gmail_email,
          to_emails: to,
          cc_emails: cc ?? [],
          bcc_emails: bcc ?? [],
          subject,
          body: emailBody,
          status: "queued",
          created_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (outboxErr || !newOutbox) {
        console.error("[gmail-send][OUTBOX_CREATE_ERROR]", { reqId, message: outboxErr?.message });
        return json(500, { success: false, error: "Failed to create outbox record", details: outboxErr?.message, reqId });
      }

      finalOutboxId = newOutbox.id;
      console.log("[gmail-send][OUTBOX_CREATED]", { reqId, outboxId: finalOutboxId });
    }

    let accessToken = account.access_token;
    const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;
    const isExpired = Date.now() >= expiresAt;

    console.log("[gmail-send][TOKEN_CHECK]", {
      reqId,
      isExpired,
      expiresAt: account.expires_at,
      hasRefreshToken: !!account.refresh_token,
    });

    if (isExpired && account.refresh_token) {
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: account.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      if (!refreshRes.ok) {
        const errText = await refreshRes.text();
        console.error("[gmail-send][REFRESH_ERROR]", { reqId, status: refreshRes.status, errText });

        await supabase.from("gmail_accounts").update({ status: "error", last_error: `Refresh failed: ${errText}` }).eq("id", account.id);
        await supabase.from("correspondence_outbox").update({
          status: "failed",
          error: `Token refresh failed: ${errText}`,
          updated_at: new Date().toISOString(),
        }).eq("id", finalOutboxId);

        return json(500, { success: false, error: "Token refresh failed", details: errText, reqId });
      }

      const tokens = await refreshRes.json();
      accessToken = tokens.access_token;

      const newExpiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

      await supabase.from("gmail_accounts").update({
        access_token: accessToken,
        expires_at: newExpiresAt,
        status: "connected",
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", account.id);

      console.log("[gmail-send][REFRESH_OK]", { reqId, newExpiresAt });
    }

    const toStr = to.join(", ");
    const ccStr = cc && cc.length > 0 ? cc.join(", ") : null;
    const bccStr = bcc && bcc.length > 0 ? bcc.join(", ") : null;

    const subjectHeader = encodeMimeHeader(subject);

    const htmlPart = toSafeHtml(String(emailBody ?? ""));
    const textPart = htmlToPlain(htmlPart);

    console.log("[gmail-send][BODY_DEBUG]", {
      reqId,
      htmlLen: htmlPart.length,
      htmlFirst120: htmlPart.slice(0, 120),
      textLen: textPart.length,
      textFirst120: textPart.slice(0, 120),
    });

    const boundary = `----=_Part_${crypto.randomUUID()}`;

    const mimeLines: string[] = [];

    mimeLines.push(`From: ${account.gmail_email}`);
    mimeLines.push(`To: ${toStr}`);
    if (ccStr) mimeLines.push(`Cc: ${ccStr}`);
    if (bccStr) mimeLines.push(`Bcc: ${bccStr}`);

    mimeLines.push(`Subject: ${subjectHeader}`);
    mimeLines.push("MIME-Version: 1.0");
    mimeLines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    mimeLines.push("");

    mimeLines.push(`--${boundary}`);
    mimeLines.push('Content-Type: text/plain; charset="UTF-8"');
    mimeLines.push("Content-Transfer-Encoding: 8bit");
    mimeLines.push("");
    mimeLines.push(textPart || "");

    mimeLines.push(`--${boundary}`);
    mimeLines.push('Content-Type: text/html; charset="UTF-8"');
    mimeLines.push("Content-Transfer-Encoding: 8bit");
    mimeLines.push("");
    mimeLines.push(htmlPart || "<div></div>");

    mimeLines.push(`--${boundary}--`);
    mimeLines.push("");

    const mime = mimeLines.join("\r\n");

    const raw = base64UrlUtf8(mime);

    console.log("[gmail-send][SENDING]", {
      reqId,
      to: toStr,
      cc: ccStr,
      bcc: bccStr,
      subject,
      subjectHeader,
      boundary,
      rawLength: raw.length,
      outboxId: finalOutboxId,
    });

    const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      console.error("[gmail-send][SEND_ERROR]", { reqId, status: sendRes.status, errText });

      await supabase.from("gmail_accounts").update({ status: "error", last_error: `Send failed: ${errText}` }).eq("id", account.id);
      await supabase.from("correspondence_outbox").update({
        status: "failed",
        error: `Email send failed (${sendRes.status}): ${errText}`,
        updated_at: new Date().toISOString(),
      }).eq("id", finalOutboxId);

      return json(500, { success: false, error: "Email send failed", details: errText, outboxId: finalOutboxId, reqId });
    }

    const result = await sendRes.json();

    console.log("[gmail-send][SEND_OK]", {
      reqId,
      messageId: result.id ?? null,
      threadId: result.threadId ?? null,
      outboxId: finalOutboxId,
    });

    const { error: updateErr } = await supabase
      .from("correspondence_outbox")
      .update({
        status: "sent",
        provider_message_id: result.id,
        sent_at: new Date().toISOString(),
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", finalOutboxId);

    if (updateErr) {
      console.error("[gmail-send][OUTBOX_UPDATE_ERROR]", { reqId, outboxId: finalOutboxId, message: updateErr.message });
    }

    return json(200, { success: true, messageId: result.id, threadId: result.threadId, outboxId: finalOutboxId, reqId });
  } catch (e: any) {
    console.error("[gmail-send][FATAL]", { reqId, message: e?.message ?? String(e), stack: e?.stack ?? null });
    return json(500, { success: false, error: "Internal error", details: e?.message ?? String(e), reqId });
  }
});