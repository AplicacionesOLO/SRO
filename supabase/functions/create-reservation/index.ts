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

function safeJsonResponse(data: unknown, status: number): Response {
  try {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (_) {
    return new Response(JSON.stringify({ error: 'Internal server error', detail: 'Response serialization failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== 'POST') {
    return safeJsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return safeJsonResponse({ error: 'Missing or invalid Authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return safeJsonResponse({ error: 'Invalid or expired token' }, 401);
    }

    const userId = user.id;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return safeJsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const {
      org_id,
      dock_id,
      start_datetime,
      end_datetime,
      client_id,
      overlap_bypass,
      ...otherFields
    } = body;

    // ── Validate required fields ──────────────────────────────────────
    if (!org_id || !UUID_REGEX.test(org_id)) {
      return safeJsonResponse({ error: 'org_id required and must be a valid UUID' }, 400);
    }

    if (!dock_id || !UUID_REGEX.test(dock_id)) {
      return safeJsonResponse({ error: 'dock_id required and must be a valid UUID' }, 400);
    }

    if (!start_datetime) {
      return safeJsonResponse({ error: 'start_datetime required' }, 400);
    }

    if (!end_datetime) {
      return safeJsonResponse({ error: 'end_datetime required' }, 400);
    }

    // ── Validate start < end ──────────────────────────────────────────
    const startDate = new Date(start_datetime);
    const endDate = new Date(end_datetime);

    if (isNaN(startDate.getTime())) {
      return safeJsonResponse({ error: 'start_datetime is not a valid date' }, 400);
    }

    if (isNaN(endDate.getTime())) {
      return safeJsonResponse({ error: 'end_datetime is not a valid date' }, 400);
    }

    if (endDate <= startDate) {
      return safeJsonResponse({
        error: 'INVALID_TIME_RANGE',
        message: 'La fecha/hora de fin debe ser posterior a la de inicio.',
      }, 400);
    }

    // Verify user belongs to org
    const { data: userOrg } = await supabase
      .from('user_org_roles')
      .select('org_id')
      .eq('user_id', userId)
      .eq('org_id', org_id)
      .maybeSingle();

    if (!userOrg) {
      return safeJsonResponse({ error: 'User does not belong to the specified organization' }, 403);
    }

    // ── RESOLVE CLIENT_ID FROM DOCK IF NOT PROVIDED ───────────────────────
    let effectiveClientId: string | null = client_id || null;
    if (!effectiveClientId && dock_id) {
      const { data: clientDock } = await supabase
        .from('client_docks')
        .select('client_id')
        .eq('dock_id', dock_id)
        .eq('org_id', org_id)
        .maybeSingle();
      if (clientDock?.client_id) {
        effectiveClientId = clientDock.client_id;
      }
    }

    // ── SAME-DAY CUTOFF VALIDATION ────────────────────────────────────────
    if (effectiveClientId && UUID_REGEX.test(effectiveClientId)) {
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
          const { data: ruleData } = await supabase
            .from('client_rules')
            .select('same_day_cutoff_enabled, same_day_cutoff_hours')
            .eq('org_id', org_id)
            .eq('client_id', effectiveClientId)
            .maybeSingle();

          const enabled = ruleData?.same_day_cutoff_enabled ?? false;
          const hours = ruleData?.same_day_cutoff_hours ?? 0;

          if (enabled && hours > 0 && whData?.business_end_time) {
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
                return safeJsonResponse({
                  error: 'SAME_DAY_CUTOFF_BLOCKED',
                  message: `No es posible crear reservas para hoy después de las ${cutoffTimeStr}. El corte del mismo día para este cliente se cumplió (${hours}h antes del cierre del almacén a las ${whData.business_end_time.slice(0, 5)}).`,
                  cutoff_time: cutoffTimeStr,
                }, 403);
              }
            }
          }
        }
      }
    }

    // ── OVERLAP CHECK ─────────────────────────────────────────────────────
    // Si overlap_bypass viene explícitamente en true desde el frontend,
    // saltamos TODOS los chequeos de solapamiento. El frontend ya verificó
    // que el usuario está autorizado (via client_overlap_rules).
    const bypassOverlap = overlap_bypass === true;

    if (!bypassOverlap) {
      if (effectiveClientId && UUID_REGEX.test(effectiveClientId)) {
        const { data: overlapRule } = await supabase
          .from('client_overlap_rules')
          .select('*')
          .eq('org_id', org_id)
          .eq('client_id', effectiveClientId)
          .maybeSingle();

        if (overlapRule && overlapRule.enabled === true) {
          const allowedStatusIds: string[] = overlapRule.allowed_status_ids || [];
          const authorizedRoleIds: string[] = overlapRule.authorized_role_ids || [];
          const authorizedUserIds: string[] = overlapRule.authorized_user_ids || [];
          const minGapMinutes: number = overlapRule.min_gap_minutes || 0;

          const isUserAuthorized = authorizedUserIds.includes(userId);

          let isRoleAuthorized = false;
          if (!isUserAuthorized && authorizedRoleIds.length > 0) {
            const { data: userRoles } = await supabase
              .from('user_org_roles')
              .select('role_id')
              .eq('user_id', userId)
              .eq('org_id', org_id);

            const userRoleIds = (userRoles || []).map((r: any) => r.role_id);
            isRoleAuthorized = authorizedRoleIds.some((roleId: string) => userRoleIds.includes(roleId));
          }

          const isAuthorized = isUserAuthorized || isRoleAuthorized;

          if (!isAuthorized) {
            const { data: overlappingReservations, error: overlapQueryErr } = await supabase
              .from('reservations')
              .select('id, start_datetime, end_datetime, status_id')
              .eq('org_id', org_id)
              .eq('dock_id', dock_id)
              .eq('is_cancelled', false)
              .lt('start_datetime', end_datetime)
              .gt('end_datetime', start_datetime);

            if (overlapQueryErr) {
              console.error('Overlap query error:', overlapQueryErr);
            } else if (overlappingReservations && overlappingReservations.length > 0) {
              for (const existing of overlappingReservations) {
                if (allowedStatusIds.length > 0 && existing.status_id && allowedStatusIds.includes(existing.status_id)) {
                  continue;
                }

                const newStart = new Date(start_datetime).getTime();
                const existingStart = new Date(existing.start_datetime).getTime();

                if (minGapMinutes > 0) {
                  const diffMs = Math.abs(newStart - existingStart);
                  const diffMinutes = diffMs / 60000;

                  if (diffMinutes < minGapMinutes) {
                    return safeJsonResponse({
                      error: 'OVERLAP_RULE_BLOCKED',
                      message: `No se permite superponer citas en este andén. La cita existente (${existing.id.slice(0, 8)}) comienza con menos de ${minGapMinutes} minutos de diferencia. La diferencia es de ${Math.round(diffMinutes)} minuto(s).`,
                      existing_reservation_id: existing.id,
                      min_gap_minutes: minGapMinutes,
                      actual_gap_minutes: Math.round(diffMinutes),
                    }, 409);
                  }
                } else {
                  return safeJsonResponse({
                    error: 'OVERLAP_RULE_BLOCKED',
                    message: `No se permite superponer citas en este andén. Ya existe una reserva (${existing.id.slice(0, 8)}) en ese horario y no estás autorizado para crear citas superpuestas.`,
                    existing_reservation_id: existing.id,
                  }, 409);
                }
              }
            }
          }
          // If user IS authorized, skip overlap check — allow the reservation to proceed
        } else {
          // ── FALLBACK OVERLAP CHECK (replaces DB exclusion constraint) ─────
          const { data: anyOverlap, error: fallbackErr } = await supabase
            .from('reservations')
            .select('id')
            .eq('org_id', org_id)
            .eq('dock_id', dock_id)
            .eq('is_cancelled', false)
            .lt('start_datetime', end_datetime)
            .gt('end_datetime', start_datetime)
            .maybeSingle();

          if (fallbackErr) {
            console.error('Fallback overlap query error:', fallbackErr);
          } else if (anyOverlap) {
            return safeJsonResponse({
              error: 'OVERLAP_CONFLICT',
              message: 'Ese andén ya está reservado en ese horario. Elegí otro espacio.',
            }, 409);
          }
        }
      } else {
        // ── FALLBACK OVERLAP CHECK (no client context) ──────────────────────
        const { data: anyOverlap, error: fallbackErr } = await supabase
          .from('reservations')
          .select('id')
          .eq('org_id', org_id)
          .eq('dock_id', dock_id)
          .eq('is_cancelled', false)
          .lt('start_datetime', end_datetime)
          .gt('end_datetime', start_datetime)
          .maybeSingle();

        if (fallbackErr) {
          console.error('Fallback overlap query error (no client):', fallbackErr);
        } else if (anyOverlap) {
          return safeJsonResponse({
            error: 'OVERLAP_CONFLICT',
            message: 'Ese andén ya está reservado en ese horario. Elegí otro espacio.',
          }, 409);
        }
      }
    }

    // ── CREATE RESERVATION ────────────────────────────────────────────────
    const safeOtherFields: Record<string, unknown> = {};
    const allowedColumns = new Set([
      'client_id', 'purchase_order', 'truck_plate', 'order_request_number',
      'shipper_provider', 'driver', 'dua', 'invoice', 'status_id', 'notes',
      'transport_type', 'cargo_type', 'operation_type', 'is_imported',
      'is_cancelled', 'cancel_reason', 'cancelled_by', 'cancelled_at',
      'is_consolidated', 'bl_number', 'quantity_value', 'recurrence',
    ]);

    for (const [key, value] of Object.entries(otherFields)) {
      if (allowedColumns.has(key)) {
        safeOtherFields[key] = value;
      }
    }

    const insertPayload = {
      org_id,
      dock_id,
      start_datetime,
      end_datetime,
      created_by: userId,
      updated_by: userId,
      ...(effectiveClientId ? { client_id: effectiveClientId } : {}),
      ...safeOtherFields,
    };

    console.log('[create-reservation] INSERT payload:', JSON.stringify({
      org_id, dock_id, start_datetime, end_datetime,
      client_id: effectiveClientId,
      bypassOverlap,
      keys: Object.keys(insertPayload),
    }));

    let insertedId: string | null = null;
    let insertError: any = null;

    if (bypassOverlap) {
      // ── BYPASS INSERT: usa RPC que setea el flag de bypass + INSERT en una sola transacción ──
      // Esto es necesario porque el trigger trg_validate_reservation_business_hours
      // en la DB también chequea solapamiento. Sin esta RPC, el trigger bloquea el INSERT
      // aunque la edge function ya haya autorizado el bypass.
      const { data: rpcData, error: rpcError } = await supabase.rpc('insert_reservation_bypass', {
        p_data: insertPayload,
      });

      if (rpcError) {
        insertError = rpcError;
        console.error('[create-reservation] BYPASS RPC error:', JSON.stringify({
          code: rpcError.code,
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint,
        }));
      } else {
        insertedId = rpcData as string;
      }
    } else {
      // ── NORMAL INSERT: sin bypass, el trigger de DB hace su chequeo normal ──
      const { data: inserted, error: err } = await supabase
        .from('reservations')
        .insert(insertPayload)
        .select('id')
        .single();

      if (err) {
        insertError = err;
        console.error('[create-reservation] INSERT error:', JSON.stringify({
          code: err.code,
          message: err.message,
          details: err.details,
          hint: err.hint,
        }));
      } else if (inserted) {
        insertedId = inserted.id;
      }
    }

    if (insertError) {
      return safeJsonResponse({
        error: 'INSERT_ERROR',
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
      }, 500);
    }

    if (!insertedId) {
      return safeJsonResponse({
        error: 'INSERT_ERROR',
        message: 'No se pudo crear la reserva (sin respuesta del servidor)',
      }, 500);
    }

    // Fetch full record
    const { data: full, error: fetchErr } = await supabase
      .from('reservations')
      .select(`
        *,
        status:reservation_statuses(name, code, color)
      `)
      .eq('id', insertedId)
      .single();

    if (fetchErr || !full) {
      console.log('[create-reservation] Created but fetch failed, returning partial data');
      return safeJsonResponse({
        data: { id: insertedId, ...insertPayload },
        warning: 'Reservation created but could not fetch full record',
      }, 201);
    }

    return safeJsonResponse({ data: full }, 201);
  } catch (error: any) {
    console.error('[create-reservation] UNHANDLED ERROR:', error?.message || error, error?.stack);
    return safeJsonResponse({
      error: 'Internal server error',
      detail: error?.message || String(error),
    }, 500);
  }
});
