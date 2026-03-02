/**
 * Servicio para envío de correos vía backend local (smtp-local-service).
 * NO usa Supabase Edge Functions.
 * NO usa smtp-send.
 * Conecta directamente al backend Node.js corriendo en la red corporativa.
 * 
 * MODO DE OPERACIÓN:
 * - VITE_SMTP_MODE=local → usa backend local (desarrollo)
 * - VITE_SMTP_MODE=supabase → usa Edge Functions (producción)
 */

const SMTP_MODE = (import.meta as any).env?.VITE_SMTP_MODE ?? 'supabase';
const SMTP_LOCAL_URL = (import.meta as any).env?.VITE_SMTP_LOCAL_URL ?? 'http://localhost:3100';

console.log('[smtpLocalService] Configuración:', { SMTP_MODE, SMTP_LOCAL_URL });

/**
 * Envía un correo de prueba a través del backend SMTP local.
 * Solo funciona cuando VITE_SMTP_MODE=local
 */
export async function sendTestEmailLocal(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<{
  success: boolean;
  message?: string;
  outboxId?: string;
  messageId?: string;
  error?: string;
  details?: any;
}> {
  const url = `${SMTP_LOCAL_URL}/api/email/send-test`;

  console.log('[smtpLocalService] sendTestEmailLocal', {
    SMTP_MODE,
    SMTP_LOCAL_URL,
    url,
    to: params.to,
    subject: params.subject,
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: params.to,
        subject: params.subject,
        body: params.body,
      }),
    });

    const text = await res.text();
    let json: any = null;

    try {
      json = JSON.parse(text);
    } catch {
      // Si la respuesta no es JSON, tratarla como mensaje de error
      json = { success: false, error: text };
    }

    console.log('[smtpLocalService] sendTestEmailLocal response', {
      status: res.status,
      ok: res.ok,
      json,
    });

    if (!res.ok) {
      return {
        success: false,
        error: json?.error ?? `HTTP ${res.status}`,
        details: json,
      };
    }

    return {
      success: json.success ?? true,
      message: json.message,
      outboxId: json.data?.outboxId ?? json.outboxId,
      messageId: json.data?.messageId ?? json.messageId,
      error: json.error,
      details: json.details,
    };
  } catch (networkError: any) {
    console.error('[smtpLocalService] sendTestEmailLocal network error', networkError);
    return {
      success: false,
      error: networkError?.message ?? 'Error de red',
      details: networkError,
    };
  }
}

/**
 * Fuerza el procesamiento manual de la cola de correos.
 * Útil para enviar correos inmediatamente sin esperar el polling automático.
 */
export async function processQueue(limit?: number): Promise<{
  success: boolean;
  message?: string;
  stats?: {
    totalProcessed: number;
    totalSuccess: number;
    totalFailed: number;
    lastRun: string;
    isRunning: boolean;
    pollInterval: number;
    batchSize: number;
  };
  error?: string;
  details?: any;
}> {
  const url = `${SMTP_LOCAL_URL}/process-queue`;

  console.log('[smtpLocalService] processQueue', {
    SMTP_MODE,
    SMTP_LOCAL_URL,
    url,
    limit,
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit }),
    });

    const text = await res.text();
    let json: any = null;

    try {
      json = JSON.parse(text);
    } catch {
      json = { success: false, error: text };
    }

    console.log('[smtpLocalService] processQueue response', {
      status: res.status,
      ok: res.ok,
      json,
    });

    if (!res.ok) {
      return {
        success: false,
        error: json?.error ?? `HTTP ${res.status}`,
        details: json,
      };
    }

    return {
      success: json.success ?? true,
      message: json.message,
      stats: json.stats,
      error: json.error,
      details: json.details,
    };
  } catch (networkError: any) {
    console.error('[smtpLocalService] processQueue network error', networkError);
    return {
      success: false,
      error: networkError?.message ?? 'Error de red',
      details: networkError,
    };
  }
}

/**
 * Obtiene las estadísticas del worker de cola.
 */
export async function getQueueStats(): Promise<{
  success: boolean;
  stats?: {
    totalProcessed: number;
    totalSuccess: number;
    totalFailed: number;
    lastRun: string | null;
    lastError: string | null;
    isRunning: boolean;
    pollInterval: number;
    batchSize: number;
    enabled: boolean;
  };
  error?: string;
  details?: any;
}> {
  const url = `${SMTP_LOCAL_URL}/queue/stats`;

  console.log('[smtpLocalService] getQueueStats', {
    SMTP_MODE,
    SMTP_LOCAL_URL,
    url,
  });

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const text = await res.text();
    let json: any = null;

    try {
      json = JSON.parse(text);
    } catch {
      json = { success: false, error: text };
    }

    console.log('[smtpLocalService] getQueueStats response', {
      status: res.status,
      ok: res.ok,
      json,
    });

    if (!res.ok) {
      return {
        success: false,
        error: json?.error ?? `HTTP ${res.status}`,
        details: json,
      };
    }

    return {
      success: json.success ?? true,
      stats: json.stats,
      error: json.error,
      details: json.details,
    };
  } catch (networkError: any) {
    console.error('[smtpLocalService] getQueueStats network error', networkError);
    return {
      success: false,
      error: networkError?.message ?? 'Error de red',
      details: networkError,
    };
  }
}

/**
 * Verifica si el modo local está activo
 */
export function isLocalMode(): boolean {
  return SMTP_MODE === 'local';
}

/**
 * Obtiene la configuración actual
 */
export function getSmtpConfig() {
  return {
    mode: SMTP_MODE,
    localUrl: SMTP_LOCAL_URL,
    isLocal: isLocalMode(),
  };
}

