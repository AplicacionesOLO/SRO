import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const CR_TIMEZONE = 'America/Costa_Rica';
const CR_OFFSET = '-06:00';

function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

function extractErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    return (e.code as string) ?? (e.error_code as string) ?? undefined;
  }
  return undefined;
}

function getCostaRicaParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: CR_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day), hour: Number(map.hour), minute: Number(map.minute), second: Number(map.second) };
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

function getDynamicStartMinutesForToday(params: { nowMinutes: number; startMinutes: number; endMinutes: number; blockMinutes: number; reblockBeforeMinutes: number }): number | null {
  const { nowMinutes, startMinutes, endMinutes, blockMinutes, reblockBeforeMinutes } = params;
  if (nowMinutes <= startMinutes) return startMinutes;
  if (nowMinutes >= endMinutes) return null;
  const offset = Math.floor((nowMinutes - startMinutes + reblockBeforeMinutes) / blockMinutes);
  const start = startMinutes + Math.max(0, offset) * blockMinutes;
  return start >= endMinutes ? null : start;
}

function getBlockWindow(params: { dateStr: string; startMinutes: number; endMinutes: number; blockMinutes: number }): { blockStart: Date; blockEnd: Date } | null {
  const { dateStr, startMinutes, endMinutes, blockMinutes } = params;
  if (startMinutes >= endMinutes) return null;
  const blockStart = buildCostaRicaDate(dateStr, startMinutes);
  const endBlockMinutes = Math.min(startMinutes + blockMinutes, endMinutes);
  const blockEnd = buildCostaRicaDate(dateStr, endBlockMinutes);
  return blockEnd <= blockStart ? null : { blockStart, blockEnd };
}

async function insertBatchWithConflictFallback(supabaseClient: ReturnType<typeof createClient>, batch: any[], batchIndex: number): Promise<{ inserted: number; skipped: number }> {
  const { error: batchError, count } = await supabaseClient.from('dock_time_blocks').insert(batch).select('id', { count: 'exact' });
  if (!batchError) return { inserted: count ?? 0, skipped: 0 };

  const errorCode = extractErrorCode(batchError);
  const errorMsg = serializeError(batchError);
  if (errorCode !== 'P0001' && !errorMsg.toLowerCase().includes('conflicto') && !errorMsg.toLowerCase().includes('ya existe')) throw batchError;

  let inserted = 0, skipped = 0;
  for (const row of batch) {
    const { error: rowError } = await supabaseClient.from('dock_time_blocks').insert(row);
    if (!rowError) { inserted++; continue; }
    const rowCode = extractErrorCode(rowError);
    const rowMsg = serializeError(rowError);
    if (rowCode === 'P0001' || rowMsg.toLowerCase().includes('conflicto') || rowMsg.toLowerCase().includes('ya existe')) { skipped++; continue; }
    throw rowError;
  }
  return { inserted, skipped };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders });

  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { autoRefreshToken: false, persistSession: false } });

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
    if (!org_id) return new Response(JSON.stringify({ error: 'org_id es requerido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let rulesQuery = supabaseClient.from('client_pickup_rules').select('*').eq('org_id', org_id).eq('is_active', true);
    if (rule_id) rulesQuery = rulesQuery.eq('id', rule_id);
    if (dock_id && !rule_id) rulesQuery = rulesQuery.eq('dock_id', dock_id);

    const { data: rules, error: rulesError } = await rulesQuery;
    if (rulesError) throw rulesError;
    if (!rules || rules.length === 0) return new Response(JSON.stringify({ message: 'No hay reglas activas', blocks_created: 0, blocks_deleted: 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const dockIds = [...new Set(rules.map((r: any) => r.dock_id))];
    const { data: docks, error: docksError } = await supabaseClient.from('docks').select('id, warehouse_id').in('id', dockIds);
    if (docksError) throw docksError;

    const dockMap = new Map(docks?.map((d: any) => [d.id, d]) ?? []);
    const warehouseIds = [...new Set(docks?.map((d: any) => d.warehouse_id).filter(Boolean) as string[])];
    const { data: warehouses, error: warehousesError } = await supabaseClient.from('warehouses').select('id, business_start_time, business_end_time').in('id', warehouseIds);
    if (warehousesError) throw warehousesError;

    const warehouseMap = new Map(warehouses?.map((w: any) => [w.id, w]) ?? []);
    const todayCR = getCostaRicaDateString(new Date());
    const nowMinutesCR = getCostaRicaMinutesNow(new Date());
    const dates: string[] = [];
    for (let i = 0; i <= days_ahead; i++) dates.push(addDaysToDateString(todayCR, i));

    const futureDates = dates.slice(1);
    const dayStartUtc = buildCostaRicaDate(todayCR, 0).toISOString();
    const nextDayStartUtc = buildCostaRicaDate(addDaysToDateString(todayCR, 1), 0).toISOString();
    const rangeEndUtc = buildCostaRicaDate(addDaysToDateString(todayCR, days_ahead + 1), 0).toISOString();
    const reasonPatterns = rules.map((r: any) => `CLIENT_PICKUP:${r.id}`);

    let blocksDeleted = 0;
    if (force_regenerate) {
      const { count } = await supabaseClient.from('dock_time_blocks').delete({ count: 'exact' }).eq('org_id', org_id).in('reason', reasonPatterns).gte('start_datetime', dayStartUtc);
      blocksDeleted = count ?? 0;
    }

    await supabaseClient.from('dock_time_blocks').delete().eq('org_id', org_id).in('reason', reasonPatterns).gte('start_datetime', dayStartUtc).lt('start_datetime', nextDayStartUtc);

    const existingKeysSet = new Set<string>();
    if (!force_regenerate && futureDates.length > 0) {
      const { data: existingBlocks } = await supabaseClient.from('dock_time_blocks').select('reason, start_datetime').eq('org_id', org_id).in('reason', reasonPatterns).gte('start_datetime', nextDayStartUtc).lt('start_datetime', rangeEndUtc);
      for (const block of existingBlocks ?? []) {
        const rId = block.reason?.replace('CLIENT_PICKUP:', '');
        const dateStr = getCostaRicaDateString(new Date(block.start_datetime));
        existingKeysSet.add(`${rId}:${dateStr}`);
      }
    }

    const blocksToInsert: any[] = [];
    for (const rule of rules as any[]) {
      const dock = dockMap.get(rule.dock_id) as any;
      if (!dock?.warehouse_id) continue;
      const warehouse = warehouseMap.get(dock.warehouse_id) as any;
      if (!warehouse?.business_start_time) continue;

      const businessStartMinutes = timeToMinutes(warehouse.business_start_time);
      const businessEndMinutes = timeToMinutes(warehouse.business_end_time);

      const todayStartMinutes = getDynamicStartMinutesForToday({ nowMinutes: nowMinutesCR, startMinutes: businessStartMinutes, endMinutes: businessEndMinutes, blockMinutes: rule.block_minutes, reblockBeforeMinutes: rule.reblock_before_minutes });
      if (todayStartMinutes !== null) {
        const window = getBlockWindow({ dateStr: todayCR, startMinutes: todayStartMinutes, endMinutes: businessEndMinutes, blockMinutes: rule.block_minutes });
        if (window) blocksToInsert.push({ org_id, dock_id: rule.dock_id, start_datetime: window.blockStart.toISOString(), end_datetime: window.blockEnd.toISOString(), reason: `CLIENT_PICKUP:${rule.id}`, created_by: userId });
      }

      for (const dateStr of futureDates) {
        if (!force_regenerate && existingKeysSet.has(`${rule.id}:${dateStr}`)) continue;
        const window = getBlockWindow({ dateStr, startMinutes: businessStartMinutes, endMinutes: businessEndMinutes, blockMinutes: rule.block_minutes });
        if (!window) continue;
        blocksToInsert.push({ org_id, dock_id: rule.dock_id, start_datetime: window.blockStart.toISOString(), end_datetime: window.blockEnd.toISOString(), reason: `CLIENT_PICKUP:${rule.id}`, created_by: userId });
      }
    }

    let blocksCreated = 0, blocksSkipped = 0;
    if (blocksToInsert.length > 0) {
      const batchSize = 200;
      for (let i = 0; i < blocksToInsert.length; i += batchSize) {
        const batch = blocksToInsert.slice(i, i + batchSize);
        const { inserted, skipped } = await insertBatchWithConflictFallback(supabaseClient, batch, i);
        blocksCreated += inserted; blocksSkipped += skipped;
      }
    }

    return new Response(JSON.stringify({ success: true, rules_processed: rules.length, blocks_created: blocksCreated, blocks_skipped: blocksSkipped, blocks_deleted: blocksDeleted, days_ahead, today_cr: todayCR }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: serializeError(error), code: extractErrorCode(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});