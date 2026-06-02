import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDateInTimezone(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getMinutesInTimezone(date: Date, tz: string): number {
  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function calcCutoffTime(businessEndTime: string, cutoffHours: number): string {
  const endMins = timeToMinutes(businessEndTime);
  const cutoffMins = endMins - cutoffHours * 60;
  if (cutoffMins < 0) return '00:00';
  const h = Math.floor(cutoffMins / 60);
  const m = cutoffMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const {
      org_id,
      dock_id,
      start_datetime,
      client_id,
      ...otherFields
    } = body;

    if (!org_id || !UUID_REGEX.test(org_id)) {
      return new Response(JSON.stringify({ error: 'org_id required and must be a valid UUID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!dock_id || !UUID_REGEX.test(dock_id)) {
      return new Response(JSON.stringify({ error: 'dock_id required and must be a valid UUID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!start_datetime) {
      return new Response(JSON.stringify({ error: 'start_datetime required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user belongs to org
    const { data: userOrg } = await supabase
      .from('user_org_roles')
      .select('org_id')
      .eq('user_id', userId)
      .eq('org_id', org_id)
      .maybeSingle();

    if (!userOrg) {
      return new Response(JSON.stringify({ error: 'User does not belong to the specified organization' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── RESOLVE CLIENT_ID FROM DOCK IF NOT PROVIDED ───────────────────────
    let effectiveClientId: string | null = client_id || null;
    if (!effectiveClientId && dock_id) {
      const { data: clientDock } = await supabase
        .from('client_docks')
        .select('client_id')
        .eq('dock_id', dock_id)
        .maybeSingle();
      if (clientDock?.client_id) {
        effectiveClientId = clientDock.client_id;
      }
    }

    // ── SAME-DAY CUTOFF VALIDATION ────────────────────────────────────────
    if (effectiveClientId && UUID_REGEX.test(effectiveClientId)) {
      const startDate = new Date(start_datetime);

      // Get warehouse info from dock
      const { data: dockData, error: dockErr } = await supabase
        .from('docks')
        .select('warehouse_id')
        .eq('id', dock_id)
        .eq('org_id', org_id)
        .maybeSingle();

      if (!dockErr && dockData?.warehouse_id) {
        const { data: whData } = await supabase
          .from('warehouses')
          .select('timezone, business_end_time')
          .eq('id', dockData.warehouse_id)
          .eq('org_id', org_id)
          .maybeSingle();

        const tz = whData?.timezone || 'America/Costa_Rica';
        const startDateStr = formatDateInTimezone(startDate, tz);
        const todayStr = formatDateInTimezone(new Date(), tz);

        if (startDateStr === todayStr) {
          // Load cutoff rule for this client
          const { data: ruleData } = await supabase
            .from('client_rules')
            .select('same_day_cutoff_enabled, same_day_cutoff_hours')
            .eq('org_id', org_id)
            .eq('client_id', effectiveClientId)
            .maybeSingle();

          const enabled = ruleData?.same_day_cutoff_enabled ?? false;
          const hours = ruleData?.same_day_cutoff_hours ?? 0;

          if (enabled && hours > 0 && whData?.business_end_time) {
            // Check bypass list
            const { data: bypassUsers } = await supabase
              .from('client_same_day_bypass_users')
              .select('user_id')
              .eq('org_id', org_id)
              .eq('client_id', effectiveClientId);

            const bypassList = (bypassUsers || []).map((r: any) => r.user_id);
            const hasBypass = bypassList.includes(userId);

            if (!hasBypass) {
              const cutoffTimeStr = calcCutoffTime(whData.business_end_time, hours);
              const nowMins = getMinutesInTimezone(new Date(), tz);
              const cutoffMins = timeToMinutes(cutoffTimeStr);

              if (nowMins >= cutoffMins) {
                return new Response(
                  JSON.stringify({
                    error: 'SAME_DAY_CUTOFF_BLOCKED',
                    message: `No es posible crear reservas para hoy después de las ${cutoffTimeStr}. El corte del mismo día para este cliente se cumplió (${hours}h antes del cierre del almacén a las ${whData.business_end_time.slice(0, 5)}).`,
                    cutoff_time: cutoffTimeStr,
                  }),
                  {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  }
                );
              }
            }
          }
        }
      }
    }

    // ── CREATE RESERVATION ────────────────────────────────────────────────
    const insertPayload = {
      org_id,
      dock_id,
      start_datetime,
      created_by: userId,
      updated_by: userId,
      ...otherFields,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('reservations')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertError) {
      const msg = insertError.message?.toLowerCase() || '';
      const details = insertError.details?.toLowerCase() || '';
      const hint = insertError.hint?.toLowerCase() || '';
      if (
        msg.includes('reservations_no_overlap') ||
        msg.includes('exclusion constraint') ||
        details.includes('reservations_no_overlap') ||
        details.includes('exclusion constraint') ||
        hint.includes('reservations_no_overlap') ||
        hint.includes('exclusion constraint')
      ) {
        return new Response(
          JSON.stringify({ error: 'OVERLAP_CONFLICT', message: 'Ese andén ya está reservado en ese horario. Elegí otro espacio.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: 'INSERT_ERROR', message: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch full record
    const { data: full, error: fetchErr } = await supabase
      .from('reservations')
      .select(`
        *,
        status:reservation_statuses(name, code, color)
      `)
      .eq('id', inserted.id)
      .single();

    if (fetchErr || !full) {
      return new Response(
        JSON.stringify({
          data: { id: inserted.id, ...insertPayload },
          warning: 'Reservation created but could not fetch full record',
        }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ data: full }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: error?.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
