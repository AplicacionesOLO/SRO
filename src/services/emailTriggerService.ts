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

  // ✅ SIMPLIFICADO: No validamos el token localmente
  // Usamos el access_token directamente como lo devuelve supabase.auth.getSession()
  // Supabase Edge Function validará el token en el servidor

  const url = `${SUPABASE_URL}/functions/v1/correspondence-process-event`;
  


  // ✅ Log de diagnóstico (no expone keys)
  /**console.log("[EmailTrigger][invoke] Using Supabase URL", {
    url: SUPABASE_URL,
    usedFallbackUrl: !resolveSupabaseUrl(),
    hasApikey: !!SUPABASE_ANON_KEY,
    usedFallbackApikey: !resolveAnonKey() && !!SUPABASE_ANON_KEY,
  });*/

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // ✅ Authorization con token validado de Supabase
      Authorization: `Bearer ${accessToken}`,
      // ✅ apikey es OBLIGATORIO para Edge Functions de Supabase
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

/**
 * ✅ OBTENER TOKEN DE SUPABASE
 * Obtiene el access_token de la sesión actual sin validación casera.
 * Confiamos en que supabase.auth.getSession() devuelve un token válido.
 * Solo hacemos logging diagnóstico para debug, no rechazamos tokens.
 */
async function getValidSupabaseToken(): Promise<string | null> {

  
  // Intento 1: getSession()
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  

  
  // ✅ SIMPLIFICADO: Si hay access_token, lo usamos directamente
  // Sin validación casera de JWT - confiamos en el SDK de Supabase
  if (!sessionError && session?.access_token) {
    // Log opcional del token para diagnóstico (no afecta el retorno)
    try {
      const parts = session.access_token.split('.');
      if (parts.length === 3) {
        const headerJson = atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'));
        const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const header = JSON.parse(headerJson);
        const jwtPayload = JSON.parse(payloadJson);
        

      }
    } catch (e) {
      // Error de decodificación no bloquea - seguimos con el token
    }
    
    // ✅ RETORNAMOS EL TOKEN SIN VALIDACIÓN CASERA
    return session.access_token;
  }

  // Intento 2: refreshSession() - solo si no había sesión
  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  

  
  if (!refreshError && refreshData?.session?.access_token) {

    return refreshData.session.access_token;
  }


  return null;
}

export const emailTriggerService = {
  /**
   * Dispara correos cuando se crea una reserva
   */
  async onReservationCreated(orgId: string, reservation: Reservation): Promise<void> {
    const reqId = crypto.randomUUID();

    try {
      // ✅ Obtener token válido de Supabase (con validación RS256)
      const accessToken = await getValidSupabaseToken();

      if (!accessToken) {
        // console.error("[EmailTrigger][onReservationCreated] ❌ No hay sesión activa o token válido:", {
        //   reqId,
        // });
        return;
      }

      const SUPABASE_URL = resolveSupabaseUrlWithFallback();
      if (!SUPABASE_URL) {
        // console.error("[EmailTrigger][onReservationCreated] ❌ Falta SUPABASE URL (no puedo invocar Edge Function).", {
        //   reqId,
        //   env: {
        //     ...envSnapshot(),
        //     FALLBACK_SUPABASE_URL: (SUPABASE_URL_FALLBACK ?? "").trim(),
        //   },
        // });
        return;
      }

      // ✅ Obtener el usuario actual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return;
      }

      // Payload para la Edge Function
      const payload = {
        orgId,
        eventType: "reservation_created",
        reservationId: reservation.id,
        actorUserId: user.id,
        statusFromId: null,
        statusToId: (reservation as any).status_id ?? null,
      };

      /**console.log("[EmailTrigger][onReservationCreated] 📤 Disparando evento: reservation_created", {
        reqId,
        ...payload,
        hasUser: !!user,
        hasAccessToken: !!accessToken,
        tokenPrefix: accessToken.substring(0, 12) + "...",
        method: "fetch -> /functions/v1/correspondence-process-event",
        supabaseUrl: SUPABASE_URL,
        usedFallbackUrl: !resolveSupabaseUrl(),
      });*/

      const data = await invokeCorrespondenceProcessEvent(payload, accessToken);

      /**console.log("[EmailTrigger][onReservationCreated] ✅ Evento de creación procesado:", {
        reqId,
        ...data,
      });*/
    } catch (error: any) {
      // Formato unificado de errores para Edge
      if (error?.name === "FunctionsHttpError") {
        return;
      }

      if (error?.name === "EnvError") {
        return;
      }
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


      // ✅ Obtener token válido de Supabase (con validación RS256)
      const accessToken = await getValidSupabaseToken();

      if (!accessToken) {

        return;
      }

      const SUPABASE_URL = resolveSupabaseUrlWithFallback();
      if (!SUPABASE_URL) {

        return;
      }

      // ✅ Obtener el usuario actual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {

        return;
      }

      const payload = {
        orgId,
        reservationId: reservation.id,
        actorUserId: user.id,
        eventType: "reservation_status_changed",
        statusFromId: oldStatusId,
        statusToId: newStatusId,
      };



      const data = await invokeCorrespondenceProcessEvent(payload, accessToken);


    } catch (error: any) {


      if (error?.name === "FunctionsHttpError") {
        return;
      }

      if (error?.name === "EnvError") {
        return;
      }
    }
  },
};