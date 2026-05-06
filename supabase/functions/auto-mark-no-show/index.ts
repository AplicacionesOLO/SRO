import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface WarehouseConfig {
  id: string;
  timezone: string;
  no_show_tolerance_minutes: number;
}

interface Reservation {
  id: string;
  org_id: string;
  dock_id: string;
  start_datetime: string;
  status_id: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const authHeader = req.headers.get('Authorization');
    const jwt = authHeader?.replace('Bearer ', '').trim();

    // ── MODO CRON: validar header interno con service role key ──────────────
    const cronSecret = req.headers.get('X-Internal-Cron-Secret');
    let isCronMode = false;
    let userId: string | null = null;

    if (cronSecret && cronSecret === supabaseServiceKey) {
      isCronMode = true;
    } else if (jwt) {
      // ── MODO USUARIO: validar JWT ────────────────────────────────────────
      const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });

      const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();

      if (userErr || !user) {
        return new Response(JSON.stringify({ error: 'Token inválido', detail: userErr?.message }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      userId = user.id;
    } else {
      return new Response(JSON.stringify({ error: 'Autenticación requerida' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => null);
    const { org_id } = body || {};

    if (!org_id) {
      return new Response(JSON.stringify({ error: 'org_id requerido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── VALIDACIÓN ORG (solo modo usuario) ───────────────────────────────
    if (!isCronMode && userId) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('org_id')
        .eq('id', userId)
        .maybeSingle();

      const { data: userOrg } = await supabaseAdmin
        .from('user_org_roles')
        .select('org_id')
        .eq('user_id', userId)
        .eq('org_id', org_id)
        .maybeSingle();

      const belongsToOrg = (profile && profile.org_id === org_id) || (userOrg && userOrg.org_id === org_id);

      if (!belongsToOrg) {
        return new Response(JSON.stringify({ error: 'No tenés permisos para esta organización' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const supabase = supabaseAdmin;

    // 1) Obtener status NO_SHOW
    const { data: noShowStatus, error: noShowErr } = await supabase
      .from('reservation_statuses')
      .select('id')
      .eq('org_id', org_id)
      .eq('code', 'NO_SHOW')
      .maybeSingle();

    if (noShowErr || !noShowStatus) {
      return new Response(JSON.stringify({ error: 'Status NO_SHOW no encontrado para esta org', detail: noShowErr?.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const noShowStatusId = noShowStatus.id;

    // 2) Obtener warehouses con tolerancia configurada
    const { data: warehouses, error: whErr } = await supabase
      .from('warehouses')
      .select('id, timezone, no_show_tolerance_minutes')
      .eq('org_id', org_id)
      .not('no_show_tolerance_minutes', 'is', null)
      .gt('no_show_tolerance_minutes', 0);

    if (whErr) throw whErr;
    if (!warehouses || warehouses.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No hay warehouses con tolerancia configurada' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3) Obtener docks de esos warehouses
    const whIds = warehouses.map((w: any) => w.id);
    const { data: docks, error: dockErr } = await supabase
      .from('docks')
      .select('id, warehouse_id')
      .eq('org_id', org_id)
      .in('warehouse_id', whIds);

    if (dockErr) throw dockErr;
    if (!docks || docks.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No hay docks en los warehouses con tolerancia' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const dockIds = (docks as any[]).map((d) => d.id as string);
    const dockToWh = new Map<string, string>();
    (docks as any[]).forEach((d) => {
      dockToWh.set(d.id as string, d.warehouse_id as string);
    });

    const whMap = new Map<string, WarehouseConfig>();
    (warehouses as any[]).forEach((w) => {
      whMap.set(w.id as string, {
        id: w.id as string,
        timezone: (w.timezone as string) || 'America/Costa_Rica',
        no_show_tolerance_minutes: Number(w.no_show_tolerance_minutes),
      });
    });

    // 4) Buscar reservas NO_CANCELLED, NO_SHOW, sin ingreso, vencidas por tolerancia
    //    Ya NO se limita a PENDING/CONFIRMED — evalúa cualquier estado excepto NO_SHOW.
    //    Esto detecta reservas que avanzaron manualmente sin pasar por IN.
    const { data: reservations, error: resErr } = await supabase
      .from('reservations')
      .select('id, org_id, dock_id, start_datetime, status_id')
      .eq('org_id', org_id)
      .eq('is_cancelled', false)
      .neq('status_id', noShowStatusId)
      .in('dock_id', dockIds)
      .not('start_datetime', 'is', null)
      .order('start_datetime', { ascending: false })
      .limit(500);

    if (resErr) throw resErr;
    if (!reservations || reservations.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No hay reservas candidatas para marcar' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5) Excluir reservas que ya tienen ingreso en casetilla_ingresos
    const resIds = (reservations as any[]).map((r) => r.id as string);
    const { data: ingresos, error: ingErr } = await supabase
      .from('casetilla_ingresos')
      .select('reservation_id')
      .eq('org_id', org_id)
      .in('reservation_id', resIds);

    if (ingErr) throw ingErr;
    const ingresoSet = new Set(((ingresos as any[]) || []).map((i) => i.reservation_id as string));

    const now = new Date();
    const candidatas: Reservation[] = [];

    for (const r of reservations as any[]) {
      const rid = r.id as string;
      if (ingresoSet.has(rid)) continue;

      const whId = dockToWh.get(r.dock_id as string);
      if (!whId) continue;

      const wh = whMap.get(whId);
      if (!wh) continue;

      const start = new Date(r.start_datetime as string);
      const cutoff = new Date(start.getTime() + wh.no_show_tolerance_minutes * 60_000);

      if (now > cutoff) {
        candidatas.push({
          id: rid,
          org_id: r.org_id as string,
          dock_id: r.dock_id as string,
          start_datetime: r.start_datetime as string,
          status_id: r.status_id as string,
        });
      }
    }

    if (candidatas.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'Ninguna reserva superó el tiempo de tolerancia' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6) Actualizar estado a NO_SHOW en batch de 50
    const BATCH_SIZE = 50;
    let updated = 0;
    const logs: { reservation_id: string; old_status: string; new_status: string }[] = [];

    for (let i = 0; i < candidatas.length; i += BATCH_SIZE) {
      const batch = candidatas.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map((c) => c.id);

      const { error: updErr } = await supabase
        .from('reservations')
        .update({ status_id: noShowStatusId, updated_at: now.toISOString() })
        .eq('org_id', org_id)
        .in('id', batchIds);

      if (updErr) {
        console.error('[auto-mark-no-show] Error actualizando batch', updErr);
        continue;
      }

      updated += batch.length;

      // 7) Registrar en activity_log
      for (const c of batch) {
        logs.push({
          reservation_id: c.id,
          old_status: c.status_id,
          new_status: noShowStatusId,
        });
      }
    }

    // Insertar logs en activity_log (NO reservation_activity_log)
    if (logs.length > 0) {
      const logRows = logs.map((l) => ({
        org_id,
        entity_type: 'reservation',
        entity_id: l.reservation_id,
        action: 'updated',
        field: 'status_id',
        old_value: l.old_status,
        new_value: l.new_status,
        metadata: { reason: 'AUTO_NO_SHOW', source: 'pg_cron' },
        actor_user_id: null,
      }));

      const { error: logErr } = await supabase.from('activity_log').insert(logRows);
      if (logErr) {
        console.error('[auto-mark-no-show] Error registrando logs', logErr);
      }
    }

    return new Response(
      JSON.stringify({
        processed: updated,
        total_candidates: candidatas.length,
        message: `Se marcaron ${updated} reservas como No arribó`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[auto-mark-no-show] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Error interno', detail: error?.message || String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});