import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * auto-dispatch-internal-transfer
 *
 * Automatismo de backend para reservas marcadas como TRASLADO INTERNO.
 * Un Traslado Interno nunca pasa por el Punto de Control IN/OUT, por lo que
 * no requiere registrar la salida. Para que el flujo cierre solo, cuando la
 * reserva llega a "Descargado" (DISCHARGED) se espera un lapso breve y se la
 * pasa automáticamente a "Despachado" (DISPATCHED).
 *
 * Invocada por un trigger de base de datos vía pg_net → corre 100% en backend.
 * NO confía en el llamador: sólo actúa sobre Traslado Interno, en DISCHARGED
 * y no cancelado. Usa service role para escribir y concurrencia optimista.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DISPATCH_DELAY_MS = 3000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 });

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return json({ skipped: true, reason: 'invalid_body' }, 400);
    }

    const reservationId: string | undefined = body?.reservation_id;
    if (!reservationId) {
      return json({ skipped: true, reason: 'missing_reservation_id' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // 1) Esperar el lapso requerido antes de despachar.
    await sleep(DISPATCH_DELAY_MS);

    // 2) Releer la reserva: pudo haber cambiado en esos segundos.
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select('id, org_id, status_id, is_cancelled, is_internal_transfer')
      .eq('id', reservationId)
      .maybeSingle();

    if (fetchError || !reservation) {
      return json({ skipped: true, reason: 'reservation_not_found' });
    }

    if (reservation.is_cancelled === true) {
      return json({ skipped: true, reason: 'cancelled' });
    }

    // Doble candado: sólo Traslado Interno.
    if (reservation.is_internal_transfer !== true) {
      return json({ skipped: true, reason: 'not_internal_transfer' });
    }

    // 3) Confirmar que sigue exactamente en "Descargado" (DISCHARGED).
    const { data: currentStatus } = await supabase
      .from('reservation_statuses')
      .select('code')
      .eq('id', reservation.status_id)
      .maybeSingle();

    const currentCode = (currentStatus?.code || '').trim();
    if (currentCode !== 'DISCHARGED') {
      return json({ skipped: true, reason: 'not_discharged', current_code: currentCode });
    }

    // 4) Resolver el estado destino "Despachado" (DISPATCHED) activo de la org.
    const { data: statuses } = await supabase
      .from('reservation_statuses')
      .select('id, code')
      .eq('org_id', reservation.org_id)
      .eq('is_active', true);

    const dispatched = (statuses || []).find((s: any) => (s.code || '').trim() === 'DISPATCHED');
    if (!dispatched?.id) {
      return json({ skipped: true, reason: 'dispatched_status_not_found' }, 200);
    }

    const now = new Date().toISOString();

    // 5) Pasar a "Despachado" con concurrencia optimista.
    const { data: updated, error: updateError } = await supabase
      .from('reservations')
      .update({ status_id: dispatched.id, updated_at: now })
      .eq('id', reservationId)
      .eq('org_id', reservation.org_id)
      .eq('status_id', reservation.status_id)
      .eq('is_internal_transfer', true)
      .eq('is_cancelled', false)
      .select('id, status_id');

    if (updateError) {
      return json({ skipped: true, reason: 'update_failed', details: updateError.message }, 500);
    }

    if (!updated || updated.length === 0) {
      return json({ skipped: true, reason: 'state_changed_concurrently' });
    }

    return json({
      data: {
        reservation_id: reservationId,
        from: 'DISCHARGED',
        to: 'DISPATCHED',
        auto: true,
        dispatched_at: now,
      },
    });
  } catch (error: any) {
    return json({ skipped: true, reason: 'unexpected_error', details: error?.message }, 500);
  }
});
