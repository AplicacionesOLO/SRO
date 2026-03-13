import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ClientPickupRule {
  id: string;
  org_id: string;
  client_id: string;
  dock_id: string;
  block_minutes: number;
  reblock_before_minutes: number;
  is_active: boolean;
}

interface Dock {
  id: string;
  warehouse_id: string | null;
}

interface Warehouse {
  id: string;
  business_start_time: string;
  business_end_time: string;
}

interface DockTimeBlock {
  org_id: string;
  dock_id: string;
  start_datetime: string;
  end_datetime: string;
  reason: string;
  created_by?: string;
}

const CR_TIMEZONE = 'America/Costa_Rica';
const CR_OFFSET = '-06:00';

function getCostaRicaParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getCostaRicaDateString(date = new Date()): string {
  const p = getCostaRicaParts(date);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function getCostaRicaMinutesNow(date = new Date()): number {
  const p = getCostaRicaParts(date);
  return p.hour * 60 + p.minute;
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function timeToMinutes(time: string): number {
  const [hh = '0', mm = '0'] = time.split(':');
  return Number(hh) * 60 + Number(mm);
}

function buildCostaRicaDate(dateStr: string, minutesFromMidnight: number): Date {
  const hh = Math.floor(minutesFromMidnight / 60);
  const mm = minutesFromMidnight % 60;
  const iso = `${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00${CR_OFFSET}`;
  return new Date(iso);
}

function getDynamicStartMinutesForToday(params: {
  nowMinutes: number;
  startMinutes: number;
  endMinutes: number;
  blockMinutes: number;
  reblockBeforeMinutes: number;
}): number | null {
  const {
    nowMinutes,
    startMinutes,
    endMinutes,
    blockMinutes,
    reblockBeforeMinutes,
  } = params;

  // Antes de apertura: mostrar el primer bloque del día
  if (nowMinutes <= startMinutes) {
    return startMinutes;
  }

  // Si ya cerró el horario del almacén, no mostrar bloque dinámico
  if (nowMinutes >= endMinutes) {
    return null;
  }

  // Fórmula:
  // el salto al siguiente bloque ocurre reblock_before minutos antes del final del bloque actual
  // ejemplo: start=07:00, block=120, reblock=10
  // a las 08:50 => debe pasar al bloque de 09:00
  const offset = Math.floor(
    (nowMinutes - startMinutes + reblockBeforeMinutes) / blockMinutes
  );

  const safeOffset = Math.max(0, offset);
  const start = startMinutes + safeOffset * blockMinutes;

  if (start >= endMinutes) {
    return null;
  }

  return start;
}

function getBlockWindow(params: {
  dateStr: string;
  startMinutes: number;
  endMinutes: number;
  blockMinutes: number;
}): { blockStart: Date; blockEnd: Date } | null {
  const { dateStr, startMinutes, endMinutes, blockMinutes } = params;

  if (startMinutes >= endMinutes) {
    return null;
  }

  const blockStart = buildCostaRicaDate(dateStr, startMinutes);
  const endBlockMinutes = Math.min(startMinutes + blockMinutes, endMinutes);
  const blockEnd = buildCostaRicaDate(dateStr, endBlockMinutes);

  if (blockEnd <= blockStart) {
    return null;
  }

  return { blockStart, blockEnd };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    console.log('[generate-client-pickup-blocks] cors:preflight', {
      origin: req.headers.get('origin'),
      method: req.method,
    });

    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();

      if (token) {
        const {
          data: { user },
          error: userError,
        } = await supabaseClient.auth.getUser(token);

        if (userError) {
          console.warn('[generate-client-pickup-blocks] auth:optional_user_error', {
            message: userError.message,
          });
        } else if (user) {
          userId = user.id;
        }
      }
    } else {
      console.log('[generate-client-pickup-blocks] auth:none_provided');
    }

    const body = await req.json();
    const { org_id, days_ahead = 30, force_regenerate = false, rule_id } = body;

    console.log('[generate-client-pickup-blocks] request:received', {
      org_id,
      days_ahead,
      force_regenerate,
      rule_id,
      user_id: userId,
    });

    if (!org_id) {
      return new Response(
        JSON.stringify({ error: 'org_id es requerido' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    let rulesQuery = supabaseClient
      .from('client_pickup_rules')
      .select('*')
      .eq('org_id', org_id)
      .eq('is_active', true);

    if (rule_id) {
      rulesQuery = rulesQuery.eq('id', rule_id);
    }

    const { data: rules, error: rulesError } = await rulesQuery;

    if (rulesError) {
      console.error('[generate-client-pickup-blocks] rules:query_error', { rulesError });
      throw rulesError;
    }

    console.log('[generate-client-pickup-blocks] rules:fetched', {
      count: rules?.length ?? 0,
      rule_ids: rules?.map((r) => r.id),
      dock_ids: rules?.map((r) => r.dock_id),
      filter_rule_id: rule_id ?? 'none',
    });

    if (!rules || rules.length === 0) {
      console.warn('[generate-client-pickup-blocks] rules:empty — no hay reglas activas para procesar');

      return new Response(
        JSON.stringify({
          message: 'No hay reglas activas de Cliente Retira',
          blocks_created: 0,
          blocks_deleted: 0,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const dockIds = [...new Set(rules.map((r) => r.dock_id))];
    console.log('[generate-client-pickup-blocks] docks:fetching', { dockIds });

    const { data: docks, error: docksError } = await supabaseClient
      .from('docks')
      .select('id, warehouse_id')
      .in('id', dockIds);

    if (docksError) {
      console.error('[generate-client-pickup-blocks] docks:query_error', { docksError });
      throw docksError;
    }

    console.log('[generate-client-pickup-blocks] docks:fetched', {
      count: docks?.length ?? 0,
      docks: docks?.map((d) => ({ id: d.id, warehouse_id: d.warehouse_id })),
    });

    const dockMap = new Map<string, Dock>(docks?.map((d) => [d.id, d]) || []);

    const warehouseIds = [
      ...new Set((docks?.map((d) => d.warehouse_id).filter(Boolean) as string[]) || []),
    ];
    console.log('[generate-client-pickup-blocks] warehouses:fetching', { warehouseIds });

    const { data: warehouses, error: warehousesError } = await supabaseClient
      .from('warehouses')
      .select('id, business_start_time, business_end_time')
      .in('id', warehouseIds);

    if (warehousesError) {
      console.error('[generate-client-pickup-blocks] warehouses:query_error', { warehousesError });
      throw warehousesError;
    }

    console.log('[generate-client-pickup-blocks] warehouses:fetched', {
      count: warehouses?.length ?? 0,
      warehouses: warehouses?.map((w) => ({
        id: w.id,
        business_start_time: w.business_start_time,
        business_end_time: w.business_end_time,
      })),
    });

    const warehouseMap = new Map<string, Warehouse>(warehouses?.map((w) => [w.id, w]) || []);

    const todayCR = getCostaRicaDateString(new Date());
    const nowMinutesCR = getCostaRicaMinutesNow(new Date());

    const dates: string[] = [];
    for (let i = 0; i <= days_ahead; i++) {
      dates.push(addDaysToDateString(todayCR, i));
    }

    console.log('[generate-client-pickup-blocks] dates:range', {
      from: dates[0],
      to: dates[dates.length - 1],
      total_days: dates.length,
      today_cr: todayCR,
      now_minutes_cr: nowMinutesCR,
    });

    let blocksDeleted = 0;

    if (force_regenerate) {
      const ruleIds = rules.map((r) => r.id);
      const reasonPatterns = ruleIds.map((id) => `CLIENT_PICKUP:${id}`);
      const dayStart = buildCostaRicaDate(todayCR, 0);

      console.log('[generate-client-pickup-blocks] force_regenerate:deleting', {
        reasonPatterns,
        from: dayStart.toISOString(),
      });

      const { error: deleteError, count } = await supabaseClient
        .from('dock_time_blocks')
        .delete({ count: 'exact' })
        .eq('org_id', org_id)
        .in('reason', reasonPatterns)
        .gte('start_datetime', dayStart.toISOString());

      if (deleteError) {
        console.error('[generate-client-pickup-blocks] force_regenerate:delete_error', { deleteError });
      } else {
        blocksDeleted = count || 0;
        console.log('[generate-client-pickup-blocks] force_regenerate:deleted', { blocksDeleted });
      }
    }

    const blocksToInsert: DockTimeBlock[] = [];

    for (const rule of rules as ClientPickupRule[]) {
      const dock = dockMap.get(rule.dock_id);
      if (!dock || !dock.warehouse_id) {
        console.warn('[generate-client-pickup-blocks] rule:skip — dock sin warehouse_id', {
          rule_id: rule.id,
          dock_id: rule.dock_id,
        });
        continue;
      }

      const warehouse = warehouseMap.get(dock.warehouse_id);
      if (!warehouse || !warehouse.business_start_time) {
        console.warn('[generate-client-pickup-blocks] rule:skip — warehouse sin business_start_time', {
          rule_id: rule.id,
          warehouse_id: dock.warehouse_id,
        });
        continue;
      }

      const businessStartMinutes = timeToMinutes(warehouse.business_start_time);
      const businessEndMinutes = timeToMinutes(warehouse.business_end_time);

      console.log('[generate-client-pickup-blocks] rule:processing', {
        rule_id: rule.id,
        dock_id: rule.dock_id,
        block_minutes: rule.block_minutes,
        reblock_before_minutes: rule.reblock_before_minutes,
        warehouse_id: dock.warehouse_id,
        business_start_time: warehouse.business_start_time,
        business_end_time: warehouse.business_end_time,
      });

      let skippedExisting = 0;
      let addedForRule = 0;
      let deletedTodayForRule = 0;

      for (const dateStr of dates) {
        const isToday = dateStr === todayCR;

        let blockStartMinutes: number | null;

        if (isToday) {
          blockStartMinutes = getDynamicStartMinutesForToday({
            nowMinutes: nowMinutesCR,
            startMinutes: businessStartMinutes,
            endMinutes: businessEndMinutes,
            blockMinutes: rule.block_minutes,
            reblockBeforeMinutes: rule.reblock_before_minutes,
          });

          const dayStart = buildCostaRicaDate(dateStr, 0);
          const nextDayStart = buildCostaRicaDate(addDaysToDateString(dateStr, 1), 0);

          const { error: deleteTodayError, count: deleteTodayCount } = await supabaseClient
            .from('dock_time_blocks')
            .delete({ count: 'exact' })
            .eq('org_id', org_id)
            .eq('dock_id', rule.dock_id)
            .eq('reason', `CLIENT_PICKUP:${rule.id}`)
            .gte('start_datetime', dayStart.toISOString())
            .lt('start_datetime', nextDayStart.toISOString());

          if (deleteTodayError) {
            console.error('[generate-client-pickup-blocks] today:delete_error', {
              rule_id: rule.id,
              dock_id: rule.dock_id,
              dateStr,
              deleteTodayError,
            });
            throw deleteTodayError;
          }

          deletedTodayForRule += deleteTodayCount || 0;

          if (blockStartMinutes === null) {
            console.log('[generate-client-pickup-blocks] today:no_active_block', {
              rule_id: rule.id,
              dock_id: rule.dock_id,
              dateStr,
              now_minutes_cr: nowMinutesCR,
              business_start_minutes: businessStartMinutes,
              business_end_minutes: businessEndMinutes,
            });
            continue;
          }
        } else {
          // Días futuros: solo el primer bloque desde apertura.
          blockStartMinutes = businessStartMinutes;
        }

        const window = getBlockWindow({
          dateStr,
          startMinutes: blockStartMinutes,
          endMinutes: businessEndMinutes,
          blockMinutes: rule.block_minutes,
        });

        if (!window) {
          console.warn('[generate-client-pickup-blocks] rule:skip_window_invalid', {
            rule_id: rule.id,
            dock_id: rule.dock_id,
            dateStr,
            blockStartMinutes,
            businessEndMinutes,
          });
          continue;
        }

        const { blockStart, blockEnd } = window;

        if (!isToday) {
          const { data: existing, error: existingError } = await supabaseClient
            .from('dock_time_blocks')
            .select('id')
            .eq('org_id', org_id)
            .eq('dock_id', rule.dock_id)
            .eq('reason', `CLIENT_PICKUP:${rule.id}`)
            .gte('start_datetime', buildCostaRicaDate(dateStr, 0).toISOString())
            .lt('start_datetime', buildCostaRicaDate(addDaysToDateString(dateStr, 1), 0).toISOString())
            .maybeSingle();

          if (existingError) {
            console.error('[generate-client-pickup-blocks] existing:query_error', {
              rule_id: rule.id,
              dock_id: rule.dock_id,
              dateStr,
              existingError,
            });
            throw existingError;
          }

          if (existing) {
            skippedExisting++;
            continue;
          }
        }

        const block: DockTimeBlock = {
          org_id: org_id,
          dock_id: rule.dock_id,
          start_datetime: blockStart.toISOString(),
          end_datetime: blockEnd.toISOString(),
          reason: `CLIENT_PICKUP:${rule.id}`,
        };

        if (userId) {
          block.created_by = userId;
        }

        blocksToInsert.push(block);
        addedForRule++;
      }

      console.log('[generate-client-pickup-blocks] rule:done', {
        rule_id: rule.id,
        dock_id: rule.dock_id,
        blocks_to_insert: addedForRule,
        blocks_skipped_existing: skippedExisting,
        blocks_deleted_today: deletedTodayForRule,
        sample_start_utc: blocksToInsert.at(-1)?.start_datetime ?? 'n/a',
        sample_end_utc: blocksToInsert.at(-1)?.end_datetime ?? 'n/a',
      });
    }

    console.log('[generate-client-pickup-blocks] insert:preparing', {
      total_blocks_to_insert: blocksToInsert.length,
    });

    let blocksCreated = 0;

    if (blocksToInsert.length > 0) {
      const batchSize = 100;

      for (let i = 0; i < blocksToInsert.length; i += batchSize) {
        const batch = blocksToInsert.slice(i, i + batchSize);

        const { error: insertError, count } = await supabaseClient
          .from('dock_time_blocks')
          .insert(batch)
          .select('id', { count: 'exact' });

        if (insertError) {
          console.error('[generate-client-pickup-blocks] insert:batch_error', {
            batch_index: i,
            batch_size: batch.length,
            insertError,
            sample_row: batch[0],
          });
          throw insertError;
        } else {
          blocksCreated += count || 0;
          console.log('[generate-client-pickup-blocks] insert:batch_ok', {
            batch_index: i,
            batch_size: batch.length,
            running_total: blocksCreated,
          });
        }
      }
    } else {
      console.warn('[generate-client-pickup-blocks] insert:nothing_to_insert — no hubo bloques nuevos para insertar');
    }

    console.log('[generate-client-pickup-blocks] finished', {
      rules_processed: rules.length,
      blocks_created: blocksCreated,
      blocks_deleted: blocksDeleted,
      days_ahead,
      today_cr: todayCR,
      now_minutes_cr: nowMinutesCR,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Bloques de Cliente Retira generados correctamente',
        rules_processed: rules.length,
        blocks_created: blocksCreated,
        blocks_deleted: blocksDeleted,
        days_ahead,
        today_cr: todayCR,
        now_minutes_cr: nowMinutesCR,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[generate-client-pickup-blocks] unhandled_error', {
      message: error instanceof Error ? error.message : 'Error desconocido',
      details: error,
    });

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Error desconocido',
        details: error,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});