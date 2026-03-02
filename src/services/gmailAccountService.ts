// ⚠️ DEPRECATED - 2026-02-13
// Este servicio ya NO se usa en el flujo principal de envío de correos.
// El sistema ahora utiliza SMTP centralizado (smtp-send Edge Function).
// Los correos se envían desde no-reply-sro@ologistics.com.
// 
// Se mantiene temporalmente para:
// - Compatibilidad con datos históricos en tabla gmail_accounts
// - Posible migración futura de cuentas legacy
// 
// Plan de migración:
// 1. ✅ Deprecate (actual)
// 2. Monitorear uso durante 1-2 meses
// 3. Eliminar servicio y componentes relacionados
// 4. DROP tabla gmail_accounts cuando se confirme que no hay dependencias

// src/services/gmailAccountService.ts
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../lib/supabase";
import type { GmailConnectionStatus, GmailAccount } from "../types/gmailAccount";

console.log(" GAS ENV SUPABASE URL:", import.meta.env.VITE_SUPABASE_URL);

const FN_GMAIL_AUTH_URL = "gmail-auth-url";
const FN_GMAIL_STATUS = "gmail-connection-status";
const FN_GMAIL_DISCONNECT = "gmail-disconnect";

function log(tag: string, data?: any) {
  console.log(`[GmailService] ${tag}`, data ?? "");
}

function errLog(tag: string, data?: any) {
  console.error(`[GmailService] ${tag}`, data ?? "");
}

function safePrefix(v: string | null | undefined, n = 12) {
  if (!v) return null;
  return v.slice(0, n);
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const token = data?.session?.access_token ?? null;

  log("getSession", {
    hasSession: !!data?.session,
    sessionError: error ? { message: error.message, name: error.name } : null,
    userFromSession: data?.session?.user?.id ?? null,
    hasAccessToken: !!token,
    accessTokenPrefix: safePrefix(token, 12),
  });

  return token;
}

/**
 * Llama Edge Function y devuelve JSON.
 * - Intenta primero supabase.functions.invoke()
 * - Si falla, hace fetch directo
 */
async function callEdgeFunctionJson<T>(fnName: string, body: any): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("No auth session / missing access token");

  // ---------- 1) TRY invoke() ----------
  try {
    log("invoke:request", { fnName, body });

    // IMPORTANTE:
    // - NO forces apikey raro aquí.
    // - Si lo pasas, que sea el publishable key del mismo proyecto.
    const { data, error } = await supabase.functions.invoke(fnName, {
      body,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
    });

    log("invoke:response", {
      fnName,
      ok: !error,
      error: error?.message ?? null,
      hasData: data !== undefined && data !== null,
    });

    if (error) throw error;
    return data as T;
  } catch (e: any) {
    errLog("invoke:failed -> fallback fetch", { fnName, error: e?.message ?? String(e) });
  }

  // ---------- 2) FALLBACK fetch ----------
  const endpoint = `${SUPABASE_URL}/functions/v1/${fnName}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    // gateway expects apikey -> publishable (sb_publishable_...)
    apikey: SUPABASE_PUBLISHABLE_KEY,
  };

  log("fetch:request", {
    endpoint,
    apikeyPrefix: safePrefix(headers.apikey, 16),
    authPrefix: safePrefix(headers.Authorization, 16),
    body,
  });

  const res = await fetch(endpoint, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();

  log("fetch:response", {
    endpoint,
    status: res.status,
    ok: res.ok,
    textPreview: text?.slice(0, 300),
  });

  if (!res.ok) {
    let details: any = null;
    try {
      details = JSON.parse(text);
    } catch {
      // ignore
    }

    throw new Error(
      `Edge Function ${fnName} failed: ${res.status} ${res.statusText} :: ${
        details ? JSON.stringify(details) : text
      }`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch (parseError) {
    errLog("fetch:parse_success_json_failed", parseError);
    return text as unknown as T;
  }
}

/* ============================================================
   ✅ gmail-disconnect types/helpers
   ============================================================ */

export type GmailDisconnectResponse = {
  success: boolean;
  disconnected?: boolean;
  gmailEmail?: string;
  accountId?: string;
  status?: string;
  message?: string;
  reqId?: string;
  error?: string;
  details?: any;
};

function normalizeDisconnectResponse(raw: any): { ok: boolean; data: GmailDisconnectResponse } {
  const data: GmailDisconnectResponse = raw ?? { success: false };

  const ok =
    !!data?.success &&
    (data.disconnected === true ||
      data.status === "disconnected" ||
      data.message === "No account to disconnect");

  return { ok, data };
}

/* ============================================================
   ✅ Consulta simple a tabla gmail_accounts (sin Edge Functions)
   ============================================================ */

/**
 * Obtiene la cuenta Gmail activa/conectada para una org.
 * Consulta directamente la tabla public.gmail_accounts.
 * @returns GmailAccount | null
 */
export async function getActiveGmailAccount(orgId: string): Promise<GmailAccount | null> {
  try {
    log("getActiveGmailAccount:start", { orgId });

    const { data, error } = await supabase
      .from("gmail_accounts")
      .select("id, gmail_email, status, expires_at, updated_at")
      .eq("org_id", orgId)
      .eq("status", "connected")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      errLog("getActiveGmailAccount:error", { orgId, error });
      return null;
    }

    // Validar expires_at si existe
    if (data && data.expires_at) {
      const expiresAt = new Date(data.expires_at);
      const now = new Date();
      if (expiresAt <= now) {
        log("getActiveGmailAccount:expired", { orgId, expiresAt, now });
        return null;
      }
    }

    log("getActiveGmailAccount:done", { orgId, hasAccount: !!data, email: data?.gmail_email });
    return data as GmailAccount | null;
  } catch (error) {
    errLog("getActiveGmailAccount:catch", { orgId, error });
    return null;
  }
}

/* ============================================================
   API pública
   ============================================================ */

export async function getGmailConnectionStatus(orgId: string, userId: string): Promise<GmailConnectionStatus> {
  log("getGmailConnectionStatus:start", { orgId, userId });

  const data = await callEdgeFunctionJson<GmailConnectionStatus>(FN_GMAIL_STATUS, { orgId, userId });

  log("getGmailConnectionStatus:done", data);
  return data;
}

export async function getGmailAuthUrl(orgId: string, userId: string, redirectUrl: string): Promise<string> {
  log("getGmailAuthUrl:start", {
    functionName: FN_GMAIL_AUTH_URL,
    orgId,
    userId,
    redirectUrlPrefix: safePrefix(redirectUrl, 44),
  });

  const data = await callEdgeFunctionJson<{ authUrl: string }>(FN_GMAIL_AUTH_URL, {
    orgId,
    userId,
    redirectUrl,
  });

  if (!data?.authUrl) {
    throw new Error(`Edge Function did not return authUrl. Response: ${JSON.stringify(data)}`);
  }

  log("getGmailAuthUrl:done", { authUrlPrefix: safePrefix(data.authUrl, 80) });
  return data.authUrl;
}

export async function disconnectGmailAccount(orgId: string, userId: string): Promise<GmailDisconnectResponse> {
  log("disconnectGmailAccount:start", { orgId, userId });

  const raw = await callEdgeFunctionJson<GmailDisconnectResponse>(FN_GMAIL_DISCONNECT, { orgId, userId });

  const { ok, data } = normalizeDisconnectResponse(raw);

  log("disconnectGmailAccount:done", { ok, data });

  if (!ok) {
    throw new Error(`Disconnect failed: ${JSON.stringify(data)}`);
  }

  return data;
}