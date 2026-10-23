export type AuthErrorKind =
  | 'network'
  | 'timeout'
  | 'credentials'
  | 'rate_limit'
  | 'email_not_confirmed'
  | 'server'
  | 'profile'
  | 'unknown';

export interface AuthFailure {
  kind: AuthErrorKind;
  message: string;
  detail: string;
}

/** Error tipado que viaja desde AuthContext hacia la pantalla de login. */
export class AuthFlowError extends Error {
  kind: AuthErrorKind;

  detail: string;

  constructor(failure: AuthFailure) {
    super(failure.message);
    this.name = 'AuthFlowError';
    this.kind = failure.kind;
    this.detail = failure.detail;
  }
}

const NETWORK_HINTS = [
  'failed to fetch',
  'fetch failed',
  'networkerror',
  'network error',
  'network request failed',
  'load failed',
  'err_network',
  'err_connection',
  'err_internet_disconnected',
  'err_name_not_resolved',
  'err_timed_out',
  'network connection lost',
  'connection refused',
  'connection closed',
  'connection reset',
  'cannot connect',
  'offline',
];

function readMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const anyErr = error as Record<string, unknown>;
  const parts = [anyErr.message, anyErr.error_description, anyErr.details, anyErr.hint, anyErr.error]
    .filter((p) => typeof p === 'string' && p.length > 0);
  return parts.join(' | ');
}

function readStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const anyErr = error as Record<string, unknown>;
  const raw = anyErr.status ?? anyErr.statusCode ?? anyErr.code;
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Traduce cualquier error del login a un mensaje honesto.
 * Antes cualquier fallo se mostraba como "contraseña incorrecta", incluso
 * cuando el problema era que la red nunca llegó al servidor.
 */
export function describeAuthError(error: unknown): AuthFailure {
  const raw = readMessage(error);
  const msg = raw.toLowerCase();
  const status = readStatus(error);

  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
    return {
      kind: 'credentials',
      message: 'Correo o contraseña incorrectos.',
      detail: raw || 'invalid_credentials',
    };
  }

  if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
    return {
      kind: 'email_not_confirmed',
      message: 'Tu correo todavía no está confirmado. Revisá el enlace que te llegó por email.',
      detail: raw || 'email_not_confirmed',
    };
  }

  if (
    status === 429 ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('over_email_send_rate_limit')
  ) {
    return {
      kind: 'rate_limit',
      message: 'Demasiados intentos en poco tiempo. Esperá unos minutos y volvé a intentar.',
      detail: raw || 'rate_limit',
    };
  }

  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')) {
    return {
      kind: 'timeout',
      message: 'La conexión tardó demasiado. Revisá tu internet y volvé a intentar.',
      detail: raw || 'timeout',
    };
  }

  if (NETWORK_HINTS.some((hint) => msg.includes(hint))) {
    return {
      kind: 'network',
      message: 'No pudimos conectar con el servidor. Esto no es tu contraseña: la petición no llegó al sistema.',
      detail: raw || 'network_error',
    };
  }

  if (status !== null && status >= 500) {
    return {
      kind: 'server',
      message: 'El servidor está presentando problemas en este momento. Intentá de nuevo en unos minutos.',
      detail: raw || `http_${status}`,
    };
  }

  if (msg.includes('database error') || msg.includes('internal server error')) {
    return {
      kind: 'server',
      message: 'El servidor está presentando problemas en este momento. Intentá de nuevo en unos minutos.',
      detail: raw || 'server_error',
    };
  }

  return {
    kind: 'unknown',
    message: 'No pudimos completar el inicio de sesión.',
    detail: raw || 'unknown_error',
  };
}

export interface ReachabilityResult {
  ok: boolean;
  detail: string;
  ms: number;
}

/**
 * Verifica si el backend responde desde la red del usuario.
 * Sirve para separar "contraseña mala" de "no hay conexión / bloqueo del ISP".
 */
export async function checkBackendReachability(
  baseUrl: string,
  apiKey?: string,
  timeoutMs = 9000,
): Promise<ReachabilityResult> {
  const startedAt = Date.now();
  if (!baseUrl) {
    return {
      ok: false,
      detail: 'La aplicación no tiene configurada la dirección del servidor.',
      ms: 0,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/auth/v1/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: apiKey ? { apikey: apiKey } : undefined,
    });

    const ms = Date.now() - startedAt;

    if (response.status >= 500) {
      return { ok: false, detail: `El servidor respondió con error ${response.status}.`, ms };
    }

    return { ok: true, detail: `Servidor alcanzable (HTTP ${response.status}) en ${ms} ms.`, ms };
  } catch (error) {
    const ms = Date.now() - startedAt;
    const name = (error as { name?: string })?.name;
    if (name === 'AbortError') {
      return { ok: false, detail: `Sin respuesta después de ${Math.round(timeoutMs / 1000)} segundos.`, ms };
    }
    return {
      ok: false,
      detail: 'No hubo respuesta del servidor. Puede ser un bloqueo de red del proveedor de internet.',
      ms,
    };
  } finally {
    clearTimeout(timer);
  }
}