import { supabase, SUPABASE_URL as SUPABASE_URL_FALLBACK, SUPABASE_PUBLISHABLE_KEY as SUPABASE_PUBLISHABLE_KEY_FALLBACK } from "../lib/supabase";
import type { Reservation } from "./calendarService";

/**
 * Servicio para disparar eventos de correspondencia
 * Integra el sistema de correos con los eventos de reservas
 *
 * Nota:
 * - Usamos fetch directo para evitar inconsistencias del SDK con headers/body en algunos entornos.
 * - Esto además te deja ver el body real del error (400/401/500) en consola.
 */

// Helpers
const readEnv = (key: string): string => {
  const v = (import.meta as any)?.env?.[key];
  return (typeof v === "string" ? v : "").trim();
};

const envSnapshot = () => ({
  VITE_SUPABASE_URL: readEnv("VITE_SUPABASE_URL"),
  VITE_PUBLIC_SUPABASE_URL: readEnv("VITE_PUBLIC_SUPABASE_URL"),
  VITE_SUPABASE_ANON_KEY: readEnv("VITE_SUPABASE_ANON_KEY"),
  VITE_PUBLIC_SUPABASE_ANON_KEY: readEnv("VITE_PUBLIC_SUPABASE_ANON_KEY"),
  VITE_SUPABASE_PUBLISHABLE_KEY: readEnv("VITE_SUPABASE_PUBLISHABLE_KEY"),
  VITE_SMTP_LOCAL_URL: readEnv("VITE_SMTP_LOCAL_URL"),
  VITE_SMTP_MODE: readEnv("VITE_SMTP_MODE"),
});

const resolveSupabaseUrl = () =>
  readEnv("VITE_SUPABASE_URL") ||
  readEnv("VITE_PUBLIC_SUPABASE_URL") ||
  "";

// OJO: tu código original resolvía "anon key" desde publishable.
// Lo dejo igual, pero ahora con fallback extra al export del supabase.ts
const resolveAnonKey = () =>
  readEnv("VITE_SUPABASE_ANON_KEY") ||
  readEnv("VITE_PUBLIC_SUPABASE_ANON_KEY") ||
  readEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
  "";

// ✅ NUEVO: resolve con fallback robusto (sin borrar lo anterior)
const resolveSupabaseUrlWithFallback = () => {
  const v = resolveSupabaseUrl();
  return v || (SUPABASE_URL_FALLBACK ?? "").trim();
};

const resolveAnonKeyWithFallback = () => {
  const v = resolveAnonKey();
  return v || (SUPABASE_PUBLISHABLE_KEY_FALLBACK ?? "").trim();
};

// Helpers (sin depender del SDK para el request)
async function invokeCorrespondenceProcessEvent(payload: any, accessToken: string) {
  const SUPABASE_URL = resolveSupabaseUrlWithFallback();
  const SUPABASE_ANON_KEY = resolveAnonKeyWithFallback();

  if (!SUPABASE_URL) {
    throw {
      name: "EnvError",
      message: "Missing SUPABASE URL",
      env: {
        ...envSnapshot(),
        FALLBACK_SUPABASE_URL: (SUPABASE_URL_FALLBACK ?? "").trim(),
      },
    };
  }

  const url = `${SUPABASE_URL}/functions/v1/correspondence-process-event`;

  // ✅ Log de diagnóstico (no expone keys)
  console.log("[EmailTrigger][invoke] Using Supabase URL", {
    url: SUPABASE_URL,
    usedFallbackUrl: !resolveSupabaseUrl(),
    hasApikey: !!SUPABASE_ANON_KEY,
    usedFallbackApikey: !resolveAnonKey() && !!SUPABASE_ANON_KEY,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      // apikey ayuda en CORS/configs donde el gateway lo espera (no hace daño si ya va auth)
      ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    const err = {
      name: "FunctionsHttpError",
      status: res.status,
      statusText: res.statusText,
      body: data,
      rawText: text,
    };
    throw err;
  }

  return data;
}

export const emailTriggerService = {
  /**
   * Dispara correos cuando se crea una reserva
   */
  async onReservationCreated(orgId: string, reservation: Reservation): Promise<void> {
    const reqId = crypto.randomUUID();

    try {
      // Obtener sesión activa con token
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        console.error("[EmailTrigger][onReservationCreated] ❌ No hay sesión activa o token válido:", {
          reqId,
          hasSession: !!session,
          hasToken: !!session?.access_token,
          error: sessionError?.message,
        });
        return;
      }

      const SUPABASE_URL = resolveSupabaseUrlWithFallback();
      if (!SUPABASE_URL) {
        console.error("[EmailTrigger][onReservationCreated] ❌ Falta SUPABASE URL (no puedo invocar Edge Function).", {
          reqId,
          env: {
            ...envSnapshot(),
            FALLBACK_SUPABASE_URL: (SUPABASE_URL_FALLBACK ?? "").trim(),
          },
        });
        return;
      }

      const user = session.user;

      // Payload para la Edge Function
      const payload = {
        orgId,
        eventType: "reservation_created",
        reservationId: reservation.id,
        actorUserId: user.id,
        statusFromId: null,
        statusToId: (reservation as any).status_id ?? null,
      };

      console.log("[EmailTrigger][onReservationCreated] 📤 Disparando evento: reservation_created", {
        reqId,
        ...payload,
        hasSession: !!session,
        hasAccessToken: !!session.access_token,
        tokenPrefix: session.access_token.substring(0, 12) + "...",
        method: "fetch -> /functions/v1/correspondence-process-event",
        supabaseUrl: SUPABASE_URL,
        usedFallbackUrl: !resolveSupabaseUrl(),
      });

      const data = await invokeCorrespondenceProcessEvent(payload, session.access_token);

      console.log("[EmailTrigger][onReservationCreated] ✅ Evento de creación procesado:", {
        reqId,
        ...data,
      });
    } catch (error: any) {
      // Formato unificado de errores para Edge
      if (error?.name === "FunctionsHttpError") {
        console.error("[EmailTrigger][onReservationCreated] ❌ Error Edge Function:", {
          reqId,
          status: error.status,
          statusText: error.statusText,
          body: error.body,
        });
        return;
      }

      if (error?.name === "EnvError") {
        console.error("[EmailTrigger][onReservationCreated] ❌ EnvError:", { reqId, ...error });
        return;
      }

      console.error("[EmailTrigger][onReservationCreated] 💥 Error:", {
        reqId,
        error,
        errorName: error?.name,
        errorMessage: error?.message,
        stack: error?.stack,
      });
    }
  },

  /**
   * Dispara correos cuando cambia el estado de una reserva
   */
  async onReservationStatusChanged(
    orgId: string,
    reservation: Reservation,
    oldStatusId: string | null,
    newStatusId: string | null
  ): Promise<void> {
    const reqId = crypto.randomUUID();

    try {
      console.log("[EmailTrigger][onReservationStatusChanged] 🚀 INICIO", {
        reqId,
        orgId,
        reservationId: reservation.id,
        statusFromId: oldStatusId,
        statusToId: newStatusId,
      });

      // Obtener sesión activa con token
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        console.error("[EmailTrigger][onReservationStatusChanged] ❌ No hay sesión activa o token válido:", {
          reqId,
          hasSession: !!session,
          hasToken: !!session?.access_token,
          error: sessionError?.message,
        });
        return;
      }

      const SUPABASE_URL = resolveSupabaseUrlWithFallback();
      if (!SUPABASE_URL) {
        console.error("[EmailTrigger][onReservationStatusChanged] ❌ Falta SUPABASE URL (no puedo invocar Edge Function).", {
          reqId,
          env: {
            ...envSnapshot(),
            FALLBACK_SUPABASE_URL: (SUPABASE_URL_FALLBACK ?? "").trim(),
          },
        });
        return;
      }

      const user = session.user;

      const payload = {
        orgId,
        reservationId: reservation.id,
        actorUserId: user.id,
        eventType: "reservation_status_changed",
        statusFromId: oldStatusId,
        statusToId: newStatusId,
      };

      console.log("[EmailTrigger][onReservationStatusChanged] 📤 Disparando evento: reservation_status_changed", {
        reqId,
        ...payload,
        hasSession: !!session,
        hasAccessToken: !!session.access_token,
        tokenPrefix: session.access_token.substring(0, 12) + "...",
        method: "fetch -> /functions/v1/correspondence-process-event",
        supabaseUrl: SUPABASE_URL,
        usedFallbackUrl: !resolveSupabaseUrl(),
      });

      const data = await invokeCorrespondenceProcessEvent(payload, session.access_token);

      console.log("[EmailTrigger][onReservationStatusChanged] ✅ Evento procesado exitosamente:", {
        reqId,
        queued: data?.queued || 0,
        sent: data?.sent || 0,
        failed: data?.failed || 0,
        results: data?.results || [],
        responseReqId: data?.reqId,
      });
    } catch (error: any) {
      if (error?.name === "FunctionsHttpError") {
        console.error("[EmailTrigger][onReservationStatusChanged] ❌ Error Edge Function:", {
          reqId,
          status: error.status,
          statusText: error.statusText,
          body: error.body,
        });
        return;
      }

      if (error?.name === "EnvError") {
        console.error("[EmailTrigger][onReservationStatusChanged] ❌ EnvError:", { reqId, ...error });
        return;
      }

      console.error("[EmailTrigger][onReservationStatusChanged] 💥 Excepción:", {
        reqId,
        error,
        errorName: error?.name,
        errorMessage: error?.message,
        stack: error?.stack,
      });
    }
  },
};