import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// UUID reservado para bloques generados por el sistema (sin usuario autenticado)
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

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
  created_by: string;
}

const CR_TIMEZONE = 'America/Costa_Rica';
const CR_OFFSET = '-06:00';

/** Serializa cualquier valor de error a string legible */
function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

/** Extrae stack si está disponible */
function serializeStack(err: unknown): string | undefined {
  if (err instanceof Error) return err.stack;
  return undefined;
}

/** Extrae código de error de Postgres/Supabase */
function extractErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    return (e.code as string) ?? (e.error_code as string) ?? undefined;
  }
  return undefined;
}

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
  const { nowMinutes, startMinutes, endMinutes, blockMinutes, reblockBeforeMinutes } = params;

  if (nowMinutes <= startMinutes) return startMinutes;
  if (nowMinutes >= endMinutes) return null;

  const offset = Math.floor(
    (nowMinutes - startMinutes + reblockBeforeMinutes) / blockMinutes
  );
  const safeOffset = Math.max(0, offset);
  const start = startMinutes + safeOffset * blockMinutes;

  return start >= endMinutes ? null : start;
}

function getBlockWindow(params: {
  dateStr: string;
  startMinutes: number;
  endMinutes: number;
  blockMinutes: number;
}): { blockStart: Date; blockEnd: Date } | null {
  const { dateStr, startMinutes, endMinutes, blockMinutes } = params;
  if (startMinutes >= endMinutes) return null;

  const blockStart = buildCostaRicaDate(dateStr, startMinutes);
  const endBlockMinutes = Math.min(startMinutes + blockMinutes, endMinutes);
  const blockEnd = buildCostaRicaDate(dateStr, endBlockMinutes);

  return blockEnd <= blockStart ? null : { blockStart, blockEnd };
}

/** 
 * Intenta insertar un batch de bloques.
 * Si falla por conflicto (P0001 / trigger de overlap), hace fallback row-by-row
 * saltando los conflictos individuales en vez de tirar toda la operación.
 * Retorna { inserted, skipped } con los totales del batch.
 */
async function insertBatchWithConflictFallback(
  supabaseClient: ReturnType<typeof createClient>,
  batch: DockTimeBlock[],
  batchIndex: number
): Promise<{ inserted: number; skipped: number }> {
  // Intento optimista: batch completo
  const { error: batchError, count } = await supabaseClient
    .from('dock_time_blocks')
    .insert(batch)
    .select('id', { count: 'exact' });

  if (!batchError) {
    console.log('[generate-client-pickup-blocks] insert:batch_ok', {
      batch_index: batchIndex,
      batch_size: batch.length,
      inserted: count ?? 0,
    });
    return { inserted: count ?? 0, skipped: 0 };
  }

  const errorCode = extractErrorCode(batchError);
  const errorMsg = serializeError(batchError);

  // Si el error NO es conflicto de trigger, relanzar
  if (errorCode !== 'P0001' && !errorMsg.toLowerCase().includes('conflicto') && !errorMsg.toLowerCase().includes('ya existe')) {
    console.error('[generate-client-pickup-blocks] insert:batch_error_non_conflict', {
      batch_index: batchIndex,
      code: errorCode,
      message: errorMsg,
      sample_row: batch[0],
    });
    throw batchError;
  }

  // Fallback: row-by-row para este batch, saltando conflictos
  console.warn('[generate-client-pickup-blocks] insert:batch_conflict_fallback', {
    batch_index: batchIndex,
    batch_size: batch.length,
    error_code: errorCode,
    message: errorMsg,
  });

  let inserted = 0;
  let skipped = 0;

  for (const row of batch) {
    const { error: rowError } = await supabaseClient
      .from('dock_time_blocks')
      .insert(row);

    if (!rowError) {
      inserted++;
      continue;
    }

    const rowCode = extractErrorCode(rowError);
    const rowMsg = serializeError(rowError);

    // Conflicto de overlap: ignorar y seguir
    if (
      rowCode === 'P0001' ||
      rowMsg.toLowerCase().includes('conflicto') ||
      rowMsg.toLowerCase().includes('ya existe')
    ) {
      skipped++;
      console.warn('[generate-client-pickup-blocks] insert:row_conflict_skipped', {
        dock_id: row.dock_id,
        start: row.start_datetime,
        end: row.end_datetime,
        reason: row.reason,
        error_code: rowCode,
        message: rowMsg,
      });
      continue;
    }

    // Otro error: relanzar
    console.error('[generate-client-pickup-blocks] insert:row_error', {
      dock_id: row.dock_id,
      start: row.start_datetime,
      reason: row.reason,
      code: rowCode,
      message: rowMsg,
    });
    throw rowError;
  }

  console.log('[generate-client-pickup-blocks] insert:batch_fallback_done', {
    batch_index: batchIndex,
    inserted,
    skipped,
  });

  return { inserted, skipped };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // — Identificar usuario (opcional — fallback a SYSTEM_USER_ID) —
    let userId: string = SYSTEM_USER_ID;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      if (token) {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
        if (!userError && user?.id) userId = user.id;
      }
    }

    const body = await req.json();
    const { org_id, days_ahead = 30, force_regenerate = false, rule_id, dock_id } = body;

    console.log('[generate-client-pickup-blocks] request:received', {
      org_id, days_ahead, force_regenerate, rule_id, dock_id, user_id: userId,
    });

    if (!org_id) {
      return new Response(
        JSON.stringify({ error: 'org_id es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // — 1. Fetch reglas activas —
    let rulesQuery = supabaseClient
      .from('client_pickup_rules')
      .select('*')
      .eq('org_id', org_id)
      .eq('is_active', true);

    if (rule_id) rulesQuery = rulesQuery.eq('id', rule_id);
    if (dock_id && !rule_id) rulesQuery = rulesQuery.eq('dock_id', dock_id);

    const { data: rules, error: rulesError } = await rulesQuery;
    if (rulesError) {
      console.error('[generate-client-pickup-blocks] rules:fetch_error', {
        code: extractErrorCode(rulesError),
        message: serializeError(rulesError),
      });
      throw rulesError;
    }

    console.log('[generate-client-pickup-blocks] rules:fetched', { count: rules?.length ?? 0 });

    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No hay reglas activas de Cliente Retira', blocks_created: 0, blocks_deleted: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // — 2. Fetch docks y warehouses en paralelo —
    const dockIds = [...new Set(rules.map((r: ClientPickupRule) => r.dock_id))];

    const { data: docks, error: docksError } = await supabaseClient
      .from('docks')
      .select('id, warehouse_id')
      .in('id', dockIds);

    if (docksError) {
      console.error('[generate-client-pickup-blocks] docks:fetch_error', {
        code: extractErrorCode(docksError),
        message: serializeError(docksError),
      });
      throw docksError;
    }

    const dockMap = new Map<string, Dock>(docks?.map((d: Dock) => [d.id, d]) ?? []);
    const warehouseIds = [...new Set(docks?.map((d: Dock) => d.warehouse_id).filter(Boolean) as string[])];

    const { data: warehouses, error: warehousesError } = await supabaseClient
      .from('warehouses')
      .select('id, business_start_time, business_end_time')
      .in('id', warehouseIds);

    if (warehousesError) {
      console.error('[generate-client-pickup-blocks] warehouses:fetch_error', {
        code: extractErrorCode(warehousesError),
        message: serializeError(warehousesError),
      });
      throw warehousesError;
    }

    const warehouseMap = new Map<string, Warehouse>(warehouses?.map((w: Warehouse) => [w.id, w]) ?? []);

    // — 3. Rango de fechas —
    const todayCR = getCostaRicaDateString(new Date());
    const nowMinutesCR = getCostaRicaMinutesNow(new Date());
    const dates: string[] = [];
    for (let i = 0; i <= days_ahead; i++) dates.push(addDaysToDateString(todayCR, i));

    const futureDates = dates.slice(1);
    const dayStartUtc = buildCostaRicaDate(todayCR, 0).toISOString();
    const nextDayStartUtc = buildCostaRicaDate(addDaysToDateString(todayCR, 1), 0).toISOString();
    const rangeEndUtc = buildCostaRicaDate(addDaysToDateString(todayCR, days_ahead + 1), 0).toISOString();

    const reasonPatterns = rules.map((r: ClientPickupRule) => `CLIENT_PICKUP:${r.id}`);

    // — 4. Force regenerate: borrar todos los bloques futuros —
    let blocksDeleted = 0;
    if (force_regenerate) {
      const { error: deleteError, count } = await supabaseClient
        .from('dock_time_blocks')
        .delete({ count: 'exact' })
        .eq('org_id', org_id)
        .in('reason', reasonPatterns)
        .gte('start_datetime', dayStartUtc);

      if (deleteError) {
        console.error('[generate-client-pickup-blocks] force_regenerate:delete_error', {
          code: extractErrorCode(deleteError),
          message: serializeError(deleteError),
        });
      } else {
        blocksDeleted = count ?? 0;
        console.log('[generate-client-pickup-blocks] force_regenerate:deleted', { blocksDeleted });
      }
    }

    // — 5. Borrar bloques de HOY (en un solo DELETE) —
    const { error: deleteTodayError } = await supabaseClient
      .from('dock_time_blocks')
      .delete()
      .eq('org_id', org_id)
      .in('reason', reasonPatterns)
      .gte('start_datetime', dayStartUtc)
      .lt('start_datetime', nextDayStartUtc);

    if (deleteTodayError) {
      console.error('[generate-client-pickup-blocks] today:delete_error', {
        code: extractErrorCode(deleteTodayError),
        message: serializeError(deleteTodayError),
      });
      throw deleteTodayError;
    }

    // — 6. BATCH: Cargar todos los bloques futuros existentes (1 sola query) —
    const existingKeysSet = new Set<string>();

    if (!force_regenerate && futureDates.length > 0) {
      const { data: existingBlocks, error: existingError } = await supabaseClient
        .from('dock_time_blocks')
        .select('reason, start_datetime')
        .eq('org_id', org_id)
        .in('reason', reasonPatterns)
        .gte('start_datetime', nextDayStartUtc)
        .lt('start_datetime', rangeEndUtc);

      if (existingError) {
        console.error('[generate-client-pickup-blocks] existing:batch_query_error', {
          code: extractErrorCode(existingError),
          message: serializeError(existingError),
        });
        throw existingError;
      }

      for (const block of existingBlocks ?? []) {
        const rId = block.reason?.replace('CLIENT_PICKUP:', '');
        const dateStr = getCostaRicaDateString(new Date(block.start_datetime));
        existingKeysSet.add(`${rId}:${dateStr}`);
      }

      console.log('[generate-client-pickup-blocks] existing:batch_loaded', {
        total_existing: existingKeysSet.size,
      });
    }

    // — 7. Construir bloques a insertar —
    const blocksToInsert: DockTimeBlock[] = [];

    for (const rule of rules as ClientPickupRule[]) {
      const dock = dockMap.get(rule.dock_id);
      if (!dock?.warehouse_id) {
        console.warn('[generate-client-pickup-blocks] rule:skip — dock sin warehouse_id', { rule_id: rule.id });
        continue;
      }

      const warehouse = warehouseMap.get(dock.warehouse_id);
      if (!warehouse?.business_start_time) {
        console.warn('[generate-client-pickup-blocks] rule:skip — warehouse sin horario', { rule_id: rule.id });
        continue;
      }

      const businessStartMinutes = timeToMinutes(warehouse.business_start_time);
      const businessEndMinutes = timeToMinutes(warehouse.business_end_time);

      // Hoy: bloque dinámico
      const todayStartMinutes = getDynamicStartMinutesForToday({
        nowMinutes: nowMinutesCR,
        startMinutes: businessStartMinutes,
        endMinutes: businessEndMinutes,
        blockMinutes: rule.block_minutes,
        reblockBeforeMinutes: rule.reblock_before_minutes,
      });

      if (todayStartMinutes !== null) {
        const window = getBlockWindow({
          dateStr: todayCR,
          startMinutes: todayStartMinutes,
          endMinutes: businessEndMinutes,
          blockMinutes: rule.block_minutes,
        });

        if (window) {
          blocksToInsert.push({
            org_id,
            dock_id: rule.dock_id,
            start_datetime: window.blockStart.toISOString(),
            end_datetime: window.blockEnd.toISOString(),
            reason: `CLIENT_PICKUP:${rule.id}`,
            created_by: userId,
          });
        }
      }

      // Días futuros
      for (const dateStr of futureDates) {
        const existKey = `${rule.id}:${dateStr}`;
        if (!force_regenerate && existingKeysSet.has(existKey)) continue;

        const window = getBlockWindow({
          dateStr,
          startMinutes: businessStartMinutes,
          endMinutes: businessEndMinutes,
          blockMinutes: rule.block_minutes,
        });

        if (!window) continue;

        blocksToInsert.push({
          org_id,
          dock_id: rule.dock_id,
          start_datetime: window.blockStart.toISOString(),
          end_datetime: window.blockEnd.toISOString(),
          reason: `CLIENT_PICKUP:${rule.id}`,
          created_by: userId,
        });
      }

      console.log('[generate-client-pickup-blocks] rule:done', { rule_id: rule.id });
    }

    console.log('[generate-client-pickup-blocks] insert:preparing', {
      total_blocks_to_insert: blocksToInsert.length,
    });

    // — 8. Insertar en batches de 200 con manejo de conflictos —
    let blocksCreated = 0;
    let blocksSkipped = 0;

    if (blocksToInsert.length > 0) {
      const batchSize = 200;

      for (let i = 0; i < blocksToInsert.length; i += batchSize) {
        const batch = blocksToInsert.slice(i, i + batchSize);
        const { inserted, skipped } = await insertBatchWithConflictFallback(supabaseClient, batch, i);
        blocksCreated += inserted;
        blocksSkipped += skipped;
      }
    } else {
      console.log('[generate-client-pickup-blocks] insert:nothing_to_insert');
    }

    console.log('[generate-client-pickup-blocks] finished', {
      rules_processed: rules.length,
      blocks_created: blocksCreated,
      blocks_skipped: blocksSkipped,
      blocks_deleted: blocksDeleted,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Bloques de Cliente Retira generados correctamente',
        rules_processed: rules.length,
        blocks_created: blocksCreated,
        blocks_skipped: blocksSkipped,
        blocks_deleted: blocksDeleted,
        days_ahead,
        today_cr: todayCR,
        now_minutes_cr: nowMinutesCR,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const code = extractErrorCode(error);
    const message = serializeError(error);
    const stack = serializeStack(error);

    console.error('[generate-client-pickup-blocks] unhandled_error', {
      code,
      message,
      stack,
      raw: typeof error === 'object' ? JSON.stringify(error) : String(error),
    });

    return new Response(
      JSON.stringify({ error: message, code }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
