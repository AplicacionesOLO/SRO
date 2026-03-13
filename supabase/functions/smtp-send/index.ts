import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "v675-gmail-auth-starttls";

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

type SmtpSendBody = {
  outboxId?: string;
  to_emails: string[];
  subject: string;
  body: string;
  sender_email?: string;
  cc_emails?: string[];
  bcc_emails?: string[];
};

function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function buildRawEmail(opts: {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  htmlBody: string;
}): string {
  const boundary = `boundary_${crypto.randomUUID().replace(/-/g, "")}`;
  const plainText = decodeHtmlToText(opts.htmlBody);

  const lines: string[] = [];
  lines.push(`From: ${opts.from}`);
  lines.push(`To: ${opts.to.join(", ")}`);
  if (opts.cc.length > 0) lines.push(`Cc: ${opts.cc.join(", ")}`);
  lines.push(`Subject: =?UTF-8?B?${encodeBase64Utf8(opts.subject)}?=`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push(`MIME-Version: 1.0`);
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  lines.push("");
  lines.push(`--${boundary}`);
  lines.push(`Content-Type: text/plain; charset="UTF-8"`);
  lines.push(`Content-Transfer-Encoding: base64`);
  lines.push("");
  lines.push(encodeBase64Utf8(plainText));
  lines.push("");
  lines.push(`--${boundary}`);
  lines.push(`Content-Type: text/html; charset="UTF-8"`);
  lines.push(`Content-Transfer-Encoding: base64`);
  lines.push("");
  lines.push(encodeBase64Utf8(opts.htmlBody));
  lines.push("");
  lines.push(`--${boundary}--`);

  return lines.join("\r\n");
}

async function updateOutboxStatus(params: {
  outboxId?: string;
  status: "sent" | "failed";
  error?: string | null;
}) {
  if (!params.outboxId) return;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) return;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const payload: Record<string, unknown> = {
    status: params.status,
    error: params.error ?? null,
  };

  if (params.status === "sent") {
    payload.sent_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("correspondence_outbox")
    .update(payload)
    .eq("id", params.outboxId);

  if (error) {
    console.error("[smtp-send][OUTBOX_UPDATE_ERROR]", {
      outboxId: params.outboxId,
      status: params.status,
      message: error.message,
    });
  }
}

async function sendViaSMTP(opts: {
  host: string;
  port: number;
  smtpUser: string;
  smtpPass: string;
  envelopeFrom: string;
  headerFrom: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  htmlBody: string;
}): Promise<void> {
  const allRecipients = [...new Set([...opts.to, ...opts.cc, ...opts.bcc])];

  let conn:
    | Deno.Conn
    | Deno.TlsConn
    | null = null;

  let reader: Deno.Reader & Deno.Closer;
  let writer: Deno.Writer & Deno.Closer;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let pending = "";

  async function readResponse(): Promise<string> {
    const chunks: string[] = [];
    const buf = new Uint8Array(4096);

    while (true) {
      const n = await reader.read(buf);
      if (n === null) break;

      pending += decoder.decode(buf.subarray(0, n));
      const lines = pending.split("\r\n");
      pending = lines.pop() ?? "";

      for (const line of lines) {
        if (!line) continue;
        chunks.push(line);

        if (/^\d{3} /.test(line)) {
          return chunks.join("\n");
        }
      }
    }

    if (chunks.length > 0) return chunks.join("\n");
    throw new Error("SMTP connection closed unexpectedly");
  }

  async function sendCommand(cmd: string): Promise<string> {
    await writer.write(encoder.encode(cmd + "\r\n"));
    return await readResponse();
  }

  try {
    conn = await Deno.connect({ hostname: opts.host, port: opts.port });
    reader = conn;
    writer = conn;

    const greeting = await readResponse();
    if (!greeting.startsWith("2")) {
      throw new Error(`SMTP greeting rejected: ${greeting}`);
    }

    let ehloResp = await sendCommand("EHLO smtp-send-edge");
    if (!ehloResp.startsWith("2")) {
      throw new Error(`EHLO rejected: ${ehloResp}`);
    }

    const startTlsResp = await sendCommand("STARTTLS");
    if (!startTlsResp.startsWith("2")) {
      throw new Error(`STARTTLS rejected: ${startTlsResp}`);
    }

    const tlsConn = await Deno.startTls(conn, { hostname: opts.host });
    conn = tlsConn;
    reader = tlsConn;
    writer = tlsConn;
    pending = "";

    ehloResp = await sendCommand("EHLO smtp-send-edge");
    if (!ehloResp.startsWith("2")) {
      throw new Error(`EHLO after STARTTLS rejected: ${ehloResp}`);
    }

    const authResp = await sendCommand("AUTH LOGIN");
    if (!authResp.startsWith("3")) {
      throw new Error(`AUTH LOGIN rejected: ${authResp}`);
    }

    const userResp = await sendCommand(encodeBase64Utf8(opts.smtpUser));
    if (!userResp.startsWith("3")) {
      throw new Error(`SMTP username rejected: ${userResp}`);
    }

    const passResp = await sendCommand(encodeBase64Utf8(opts.smtpPass));
    if (!passResp.startsWith("2")) {
      throw new Error(`SMTP password rejected: ${passResp}`);
    }

    const mailFromResp = await sendCommand(`MAIL FROM:<${opts.envelopeFrom}>`);
    if (!mailFromResp.startsWith("2")) {
      throw new Error(`MAIL FROM rejected: ${mailFromResp}`);
    }

    for (const rcpt of allRecipients) {
      const rcptResp = await sendCommand(`RCPT TO:<${rcpt}>`);
      if (!rcptResp.startsWith("2")) {
        throw new Error(`RCPT TO <${rcpt}> rejected: ${rcptResp}`);
      }
    }

    const dataResp = await sendCommand("DATA");
    if (!dataResp.startsWith("3")) {
      throw new Error(`DATA rejected: ${dataResp}`);
    }

    const rawEmail = buildRawEmail({
      from: opts.headerFrom,
      to: opts.to,
      cc: opts.cc,
      subject: opts.subject,
      htmlBody: opts.htmlBody,
    });

    const dotStuffed = rawEmail.replace(/(^|\r\n)\./g, "$1..");

    await writer.write(encoder.encode(dotStuffed + "\r\n.\r\n"));
    const endResp = await readResponse();
    if (!endResp.startsWith("2")) {
      throw new Error(`Message rejected: ${endResp}`);
    }

    try {
      await sendCommand("QUIT");
    } catch {
      // ignore
    }
  } finally {
    try {
      conn?.close();
    } catch {
      // ignore
    }
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

    const smtpHost = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com";
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") ?? "587", 10);
    const smtpUser = (Deno.env.get("SMTP_USER") ?? "").trim();
    const smtpPass = (Deno.env.get("SMTP_PASS") ?? "").replace(/\s+/g, "");
    const smtpFrom = Deno.env.get("SMTP_FROM") ?? "no-reply-sro@ologistics.com";

    if (!smtpUser) {
      return json(500, { success: false, error: "Missing SMTP_USER", reqId });
    }

    if (!smtpPass) {
      return json(500, { success: false, error: "Missing SMTP_PASS", reqId });
    }

    let body: SmtpSendBody;
    try {
      body = (await req.json()) as SmtpSendBody;
    } catch {
      return json(400, { error: "Invalid JSON body", reqId });
    }

    const {
      outboxId,
      to_emails,
      subject,
      body: htmlBody,
      sender_email,
      cc_emails = [],
      bcc_emails = [],
    } = body;

    if (!to_emails?.length) {
      return json(400, { error: "Missing to_emails", reqId });
    }

    if (!subject) {
      return json(400, { error: "Missing subject", reqId });
    }

    if (!htmlBody) {
      return json(400, { error: "Missing body", reqId });
    }

    const headerFrom = sender_email || smtpFrom;

    await sendViaSMTP({
      host: smtpHost,
      port: smtpPort,
      smtpUser,
      smtpPass,
      envelopeFrom: smtpUser,
      headerFrom,
      to: to_emails,
      cc: cc_emails,
      bcc: bcc_emails,
      subject,
      htmlBody,
    });

    await updateOutboxStatus({
      outboxId,
      status: "sent",
      error: null,
    });

    return json(200, {
      success: true,
      version: VERSION,
      message: "Email sent successfully",
      to: to_emails,
      from: headerFrom,
      reqId,
    });
  } catch (e: any) {
    const errorMessage = e?.message ?? String(e);

    console.error("[smtp-send][FATAL]", {
      reqId,
      version: VERSION,
      error: errorMessage,
    });

    try {
      const parsed = await req.clone().json().catch(() => null);
      await updateOutboxStatus({
        outboxId: parsed?.outboxId,
        status: "failed",
        error: errorMessage,
      });
    } catch {
      // ignore
    }

    return json(500, {
      success: false,
      version: VERSION,
      error: "Failed to send email",
      details: errorMessage,
      reqId,
    });
  }
});