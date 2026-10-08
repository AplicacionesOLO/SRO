// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  FUNCIÓN DESACTIVADA — NO USAR
//
// La regla "No arribó" (No-Show) automática tiene UNA SOLA fuente de verdad:
//
//      public.auto_mark_no_show_v5()   ← ejecutada por el cron
//
// El cron `auto-mark-no-show-every-5-min` (*/5 * * * *) corre literalmente:
//      SELECT auto_mark_no_show_v5()
//
// Esta Edge Function `auto-mark-no-show` quedó OBSOLETA y desactivada a
// propósito. Tenía una implementación PARALELA de la misma regla, que podía
// desincronizarse de la función de base de datos — fue justo lo que causó el
// incidente de octubre (reservas importadas / traslados marcados por error,
// porque la lógica buena vivía aquí y el cron no la usaba).
//
// El cron NUNCA la llamó y el frontend tampoco. Se conserva únicamente como
// referencia y para que cualquier llamador externo antiguo reciba una respuesta
// explícita en lugar de un 401/404 confuso: ahora responde 410 Gone.
//
// Si en el futuro hace falta un endpoint para disparar el marcado manualmente,
// NO reactivar este archivo: crear un wrapper que ejecute
//      SELECT public.auto_mark_no_show_v5()
// y que devuelva su resultado. Una sola lógica, un solo lugar.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEPRECATION_PAYLOAD = {
  error: 'Función desactivada',
  code: 'FUNCTION_DISABLED',
  detail:
    'auto-mark-no-show fue desactivada a propósito. La fuente de verdad única de la regla No Arribó es la función de base de datos public.auto_mark_no_show_v5(), ejecutada por el cron "auto-mark-no-show-every-5-min" cada 5 minutos.',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // No ejecuta ninguna lógica de negocio ni toca la base de datos.
  console.warn('[auto-mark-no-show] Invocación RECHAZADA: función desactivada.');

  return new Response(JSON.stringify(DEPRECATION_PAYLOAD), {
    status: 410,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
