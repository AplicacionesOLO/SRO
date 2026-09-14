import { supabase } from '@/lib/supabase';
import type {
  ForecastConfig,
  ForecastResult,
  ForecastReservation,
  ReservationForecast,
  ForecastResourceAllocation,
  DailyWarehouseAggregation,
  DailyCategoryNeed,
  DailyReservationSummary,
  DailyTimeBlock,
  DailyTimeBlockCategory,
  WeeklyWarehouseAggregation,
  WeeklyCategoryNeed,
  CalendarSuggestion,
  CategorySubstitution,
} from '@/types/manpowerForecast';
import type { ResourceCategory, ManpowerResource } from '@/types/manpowerResource';
import type { ManpowerRule } from '@/types/manpowerRule';
import { toWarehouseDateString, toWarehouseTimeString, getDatePartsInTimezone, DEFAULT_TIMEZONE } from '@/utils/timezoneUtils';

const DEFAULT_MARGIN_PCT = 20;
const DEFAULT_APPOINTMENT_LIMIT = null;

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v.trim());

const lower = (v: string | null | undefined) => (v || '').trim().toLowerCase();

/**
 * Calcula la duración (en horas) de una operación según el ritmo de los recursos.
 * Fórmula: duración = cantidad ÷ Σ (cantidad_recurso × ritmo_por_hora).
 * Devuelve null si no hay cantidad o si el ritmo total es 0.
 */
export function computeDurationHours(
  quantity: number | null | undefined,
  allocations: Array<{ quantity: number; rate_per_hour: number | null | undefined }>
): number | null {
  if (quantity == null || quantity <= 0) return null;
  const totalThroughput = allocations.reduce(
    (sum, a) => sum + (a.quantity || 0) * (a.rate_per_hour ?? 0),
    0
  );
  if (totalThroughput <= 0) return null;
  return quantity / totalThroughput;
}

function timeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function countPersonas(allocations: ForecastResourceAllocation[]): number {
  return allocations
    .filter((a) => a.type === 'PERSONAL')
    .reduce((sum, a) => sum + (a.quantity || 0), 0);
}

/**
 * Total de participaciones (suma de personas en todas las citas).
 * A diferencia del pico simultáneo, mide cuántas veces participa el personal en el período.
 */
function sumPersonas(list: ReservationForecast[], useRecommended: boolean): number {
  return list.reduce(
    (sum, f) => sum + countPersonas(useRecommended ? f.recommended_resources : f.min_resources),
    0
  );
}

/**
 * Rango de tiempo real seteado en la cita (end - start) expresado en horas.
 * Devuelve null si falta alguna fecha o el rango no es positivo.
 */
function computeAppointmentDurationHours(
  startDatetime: string | null | undefined,
  endDatetime: string | null | undefined
): number | null {
  if (!startDatetime || !endDatetime) return null;
  const startMs = new Date(startDatetime).getTime();
  const endMs = new Date(endDatetime).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  const hours = (endMs - startMs) / 3_600_000;
  return hours > 0 ? hours : null;
}

/** Tolerancia (minutos) para no marcar exceso por redondeos menores. */
const DURATION_TOLERANCE_HOURS = 1 / 60;

/**
 * Obtiene todos los proveedores de la organización paginando (evita el límite de 1000 filas
 * que dejaría proveedores sin resolver y mostraría su UUID en lugar del nombre).
 */
async function fetchAllProviders(orgId: string): Promise<Array<{ id: string; name: string }>> {
  const pageSize = 1000;
  let from = 0;
  const all: Array<{ id: string; name: string }> = [];
  for (;;) {
    const { data, error } = await supabase
      .from('providers')
      .select('id, name')
      .eq('org_id', orgId)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) break;
    const rows = (data ?? []) as Array<{ id: string; name: string }>;
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/**
 * Intervalo [inicio, fin] en minutos (timezone del almacén) de una reserva,
 * recortado al rango de horas laborales. Devuelve null si queda vacío.
 */
function getIntervalMin(
  f: ReservationForecast,
  tz: string,
  startMin: number,
  endMin: number
): { s: number; e: number } | null {
  const sp = getDatePartsInTimezone(new Date(f.reservation.start_datetime), tz);
  const sMin = sp.hour * 60 + sp.minute;

  let eMin = 24 * 60;
  if (f.reservation.end_datetime) {
    const ep = getDatePartsInTimezone(new Date(f.reservation.end_datetime), tz);
    eMin = ep.hour * 60 + ep.minute;
    if (eMin <= sMin) eMin = 24 * 60;
  } else {
    eMin = sMin + Math.ceil((f.min_duration_hours ?? 1) * 60);
    if (eMin > 24 * 60) eMin = 24 * 60;
  }

  const s = Math.max(sMin, startMin);
  const e = Math.min(eMin, endMin);
  if (s >= e) return null;
  return { s, e };
}

/**
 * Calcula el PICO SIMULTÁNEO de unidades por categoría de recurso dentro del
 * horario laboral. A diferencia de la suma de usos, responde a la pregunta
 * "¿cuántas unidades necesito A LA VEZ en el momento más cargado?".
 * 1 apilador alcanza para varias citas si no se superponen en el tiempo.
 */
function computeCategoryPeaks(
  list: ReservationForecast[],
  tz: string,
  businessStart: string | null | undefined,
  businessEnd: string | null | undefined
): Map<string, { min: number; rec: number }> {
  const startMin = timeToMinutes(businessStart) ?? 6 * 60;
  let endMin = timeToMinutes(businessEnd) ?? 17 * 60;
  if (endMin <= startMin) endMin = 24 * 60;

  const peaks = new Map<string, { min: number; rec: number }>();
  const categoryIds = new Set<string>();
  const qtyByRes = new Map<string, { min: Map<string, number>; rec: Map<string, number> }>();

  for (const f of list) {
    const m = new Map<string, number>();
    const r = new Map<string, number>();
    for (const a of f.min_resources) {
      m.set(a.category_id, (m.get(a.category_id) ?? 0) + a.quantity);
      categoryIds.add(a.category_id);
    }
    for (const a of f.recommended_resources) {
      r.set(a.category_id, (r.get(a.category_id) ?? 0) + a.quantity);
      categoryIds.add(a.category_id);
    }
    qtyByRes.set(f.reservation.id, { min: m, rec: r });
  }

  const sweep = (events: Array<{ t: number; d: number }>): number => {
    events.sort((a, b) => a.t - b.t || a.d - b.d);
    let cur = 0;
    let peak = 0;
    for (const ev of events) {
      cur += ev.d;
      if (cur > peak) peak = cur;
    }
    return peak;
  };

  for (const categoryId of categoryIds) {
    const minEvents: Array<{ t: number; d: number }> = [];
    const recEvents: Array<{ t: number; d: number }> = [];
    for (const f of list) {
      const q = qtyByRes.get(f.reservation.id);
      if (!q) continue;
      const minQty = q.min.get(categoryId) ?? 0;
      const recQty = q.rec.get(categoryId) ?? 0;
      if (minQty <= 0 && recQty <= 0) continue;
      const iv = getIntervalMin(f, tz, startMin, endMin);
      if (!iv) continue;
      if (minQty > 0) {
        minEvents.push({ t: iv.s, d: minQty });
        minEvents.push({ t: iv.e, d: -minQty });
      }
      if (recQty > 0) {
        recEvents.push({ t: iv.s, d: recQty });
        recEvents.push({ t: iv.e, d: -recQty });
      }
    }
    peaks.set(categoryId, { min: sweep(minEvents), rec: sweep(recEvents) });
  }

  return peaks;
}

/**
 * Calcula el pico de personas simultáneas dentro del horario laboral del almacén.
 * Barrido de línea sobre los intervalos [inicio, fin] de cada reserva en el timezone
 * del almacén, recortados al rango de horas laborales.
 */
function computePeakPersonas(
  list: ReservationForecast[],
  tz: string,
  businessStart: string | null | undefined,
  businessEnd: string | null | undefined,
  useRecommended: boolean
): number {
  const startMin = timeToMinutes(businessStart) ?? 6 * 60;
  let endMin = timeToMinutes(businessEnd) ?? 17 * 60;
  if (endMin <= startMin) endMin = 24 * 60;

  const events: Array<{ t: number; d: number }> = [];
  for (const f of list) {
    const personas = countPersonas(
      useRecommended ? f.recommended_resources : f.min_resources
    );
    if (personas <= 0) continue;

    const iv = getIntervalMin(f, tz, startMin, endMin);
    if (!iv) continue;

    events.push({ t: iv.s, d: personas });
    events.push({ t: iv.e, d: -personas });
  }

  events.sort((a, b) => a.t - b.t || a.d - b.d);

  let current = 0;
  let peak = 0;
  for (const ev of events) {
    current += ev.d;
    if (current > peak) peak = current;
  }
  return peak;
}

interface ForecastContext {
  dockToWarehouse: Map<string, string>;
  warehouseToCountry: Map<string, string>;
  warehouseName: Map<string, string>;
  countryName: Map<string, string>;
  cargoNameToId: Map<string, string>;
  cargoNameById: Map<string, string>;
  providerLookup: Map<string, string>; // name(normalizado)/id → id
  providerName: Map<string, string>; // id → name
  categoryById: Map<string, ResourceCategory>;
  poolByKey: Map<string, ManpowerResource>; // `${category}|${country}|${warehouse}` → resource
  warehouseTimezone: Map<string, string>;
  warehouseBusinessStart: Map<string, string | null>;
  warehouseBusinessEnd: Map<string, string | null>;
}

/**
 * Sugiere un recurso de reemplazo cuando una categoría tiene faltante de stock.
 * Regla de negocio: si faltan carretillas, sugerir apiladores como reemplazo.
 */
function computeSubstitutions(
  categories: Array<{ category_id: string; category_name: string; stock_loaded: boolean; deficit: number }>,
  ctx: ForecastContext
): CategorySubstitution[] {
  const result: CategorySubstitution[] = [];
  for (const c of categories) {
    if (!c.stock_loaded || c.deficit <= 0) continue;
    const n = lower(c.category_name);
    if (!n.includes('carretilla')) continue;
    const targetName = 'apilador';
    let targetId: string | null = null;
    for (const [id, cat] of ctx.categoryById.entries()) {
      if (lower(cat.name) === targetName) {
        targetId = id;
        break;
      }
    }
    result.push({
      from_category_id: c.category_id,
      from_category_name: c.category_name,
      quantity: c.deficit,
      to_category_id: targetId,
      to_category_name: targetName,
    });
  }
  return result;
}

/**
 * Aplica las sustituciones sugeridas: suma la demanda de reemplazo a la categoría
 * destino y recalcula su faltante. Devuelve las categorías actualizadas y la lista
 * de sustituciones aplicadas.
 */
function applySubstitutions<T extends DailyCategoryNeed>(
  categories: T[],
  ctx: ForecastContext,
  countryId: string,
  warehouseId: string
): { categories: T[]; substitutions: CategorySubstitution[] } {
  const substitutions = computeSubstitutions(categories, ctx);
  for (const s of substitutions) {
    if (!s.to_category_id) continue;
    let target = categories.find((c) => c.category_id === s.to_category_id);
    if (!target) {
      const cat = ctx.categoryById.get(s.to_category_id);
      const pool = ctx.poolByKey.get(`${s.to_category_id}|${countryId}|${warehouseId}`);
      target = {
        category_id: s.to_category_id,
        category_name: cat?.name || s.to_category_name,
        type: cat?.type || 'EQUIPMENT',
        unit_label: cat?.unit_label ?? null,
        needed_min: 0,
        needed_rec: 0,
        stock: pool?.quantity ?? 0,
        stock_loaded: !!pool,
        deficit: 0,
      } as T;
      categories.push(target);
    }
    target.needed_rec += s.quantity;
    target.deficit = Math.max(0, target.needed_rec - target.stock);
  }
  categories.sort((a, b) => a.category_name.localeCompare(b.category_name));
  return { categories, substitutions };
}

function matchRule(
  res: ForecastReservation,
  rules: ManpowerRule[],
  ctx: ForecastContext
): { rule: ManpowerRule | null; reason: string | null } {
  const warehouseId = ctx.dockToWarehouse.get(res.dock_id) ?? null;
  if (!warehouseId) return { rule: null, reason: 'Sin almacén asignado' };

  const countryId = ctx.warehouseToCountry.get(warehouseId) ?? null;
  const cargoTypeId = ctx.cargoNameToId.get(lower(res.cargo_type));
  if (!cargoTypeId) return { rule: null, reason: 'Tipo de carga sin catálogo' };

  const bultos = res.quantity_value;

  const candidates = rules.filter(
    (r) =>
      r.is_active &&
      r.country_id === countryId &&
      r.warehouse_id === warehouseId &&
      r.cargo_type_id === cargoTypeId &&
      (r.min_bultos == null || (bultos != null && bultos >= r.min_bultos)) &&
      (r.max_bultos == null || (bultos != null && bultos <= r.max_bultos))
  );

  if (candidates.length === 0) {
    return { rule: null, reason: 'Sin regla para esta combinación' };
  }

  // Resolver proveedor de la reserva
  let providerId: string | null = null;
  if (res.shipper_provider) {
    const key = lower(res.shipper_provider);
    providerId = ctx.providerLookup.get(key) ?? (isUuid(res.shipper_provider) ? res.shipper_provider : null);
  }

  // Preferir reglas ligadas a ese proveedor; si no, las generales (sin proveedor)
  const providerSpecific = candidates.filter((r) => r.provider_id && r.provider_id === providerId);
  const general = candidates.filter((r) => !r.provider_id);

  const pool = providerSpecific.length > 0 ? providerSpecific : general;
  if (pool.length === 0) {
    return { rule: null, reason: 'La regla está ligada a otro proveedor' };
  }

  pool.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  return { rule: pool[0], reason: null };
}

function buildAllocations(
  rule: ManpowerRule,
  quantityFactor: number,
  ctx: ForecastContext,
  warehouseId: string | null,
  countryId: string | null
): ForecastResourceAllocation[] {
  if (!rule.items || rule.items.length === 0) return [];

  return rule.items.map((item) => {
    const cat = ctx.categoryById.get(item.category_id);
    const poolKey = `${item.category_id}|${countryId || ''}|${warehouseId || ''}`;
    const pool = ctx.poolByKey.get(poolKey);
    const effectiveRate = pool?.rate_per_hour ?? cat?.rate_per_hour ?? null;
    return {
      category_id: item.category_id,
      category_name: cat?.name || 'Recurso',
      type: cat?.type || 'PERSONAL',
      unit_label: cat?.unit_label ?? null,
      rate_per_hour: effectiveRate,
      quantity: Math.ceil(item.quantity * quantityFactor),
    };
  });
}

export const manpowerForecastService = {
  // ============================================================
  // CONFIGURACIÓN
  // ============================================================
  async getConfig(orgId: string): Promise<ForecastConfig> {
    const { data, error } = await supabase
      .from('manpower_forecast_config')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) {
      throw new Error(`Error al cargar la configuración: ${error.message}`);
    }

    if (data) {
      return {
        id: data.id,
        org_id: data.org_id,
        recommended_margin_pct: Number(data.recommended_margin_pct ?? DEFAULT_MARGIN_PCT),
        daily_appointment_limit:
          data.daily_appointment_limit != null ? Number(data.daily_appointment_limit) : DEFAULT_APPOINTMENT_LIMIT,
      };
    }

    return {
      org_id: orgId,
      recommended_margin_pct: DEFAULT_MARGIN_PCT,
      daily_appointment_limit: DEFAULT_APPOINTMENT_LIMIT,
    };
  },

  async saveConfig(
    orgId: string,
    userId: string,
    config: { recommended_margin_pct: number; daily_appointment_limit: number | null }
  ): Promise<void> {
    const existing = await supabase
      .from('manpower_forecast_config')
      .select('id')
      .eq('org_id', orgId)
      .maybeSingle();

    const payload = {
      recommended_margin_pct: config.recommended_margin_pct,
      daily_appointment_limit: config.daily_appointment_limit,
    };

    let error;
    if (existing.data) {
      const res = await supabase
        .from('manpower_forecast_config')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', existing.data.id);
      error = res.error;
    } else {
      const res = await supabase
        .from('manpower_forecast_config')
        .insert({ org_id: orgId, ...payload });
      error = res.error;
    }

    if (error) throw new Error(`Error al guardar la configuración: ${error.message}`);
  },

  // ============================================================
  // MOTOR DE PRONÓSTICO
  // ============================================================
  async buildForecast(
    orgId: string,
    startDate: string,
    endDate: string,
    warehouseId?: string | null
  ): Promise<ForecastResult> {
    const config = await this.getConfig(orgId);

    // Normalizar rango: si vienen fechas simples (YYYY-MM-DD), cubrir el día completo
    const startIso = startDate.length === 10 ? `${startDate}T00:00:00.000Z` : startDate;
    const endIso = endDate.length === 10 ? `${endDate}T23:59:59.999Z` : endDate;
    // Ampliar el rango 1 día a cada lado para cubrir desfases de timezone entre almacenes
    const DAY_MS = 24 * 60 * 60 * 1000;
    const fetchStartIso = new Date(new Date(startIso).getTime() - DAY_MS).toISOString();
    const fetchEndIso = new Date(new Date(endIso).getTime() + DAY_MS).toISOString();

    // ── 1. Datos maestros en paralelo ────────────────────────────
    const [
      docksRes,
      warehousesRes,
      countriesRes,
      cargoTypesRes,
      categoriesRes,
      rulesRes,
      itemsRes,
      poolRes,
      reservationsRes,
    ] = await Promise.all([
      supabase.from('docks').select('id, warehouse_id').eq('org_id', orgId),
      supabase.from('warehouses').select('id, name, country_id, timezone, business_start_time, business_end_time').eq('org_id', orgId),
      supabase.from('countries').select('id, name').eq('org_id', orgId),
      supabase.from('cargo_types').select('id, name').eq('org_id', orgId),
      supabase.from('manpower_resource_categories').select('*').eq('org_id', orgId),
      supabase.from('manpower_resource_rules').select('*').eq('org_id', orgId).eq('is_active', true),
      supabase.from('manpower_resource_rule_items').select('*').eq('org_id', orgId),
      supabase.from('manpower_resources').select('*').eq('org_id', orgId),
      supabase
        .from('reservations')
        .select(
          'id, dock_id, start_datetime, end_datetime, cargo_type, quantity_value, shipper_provider, truck_plate, purchase_order'
        )
        .eq('org_id', orgId)
        .eq('is_cancelled', false)
        .gte('start_datetime', fetchStartIso)
        .lte('start_datetime', fetchEndIso),
    ]);

    // Proveedores: paginado para no truncar en orgs con muchos proveedores
    const providersData = await fetchAllProviders(orgId);

    // ── 2. Construir contexto de resolución ──────────────────────
    const ctx: ForecastContext = {
      dockToWarehouse: new Map(),
      warehouseToCountry: new Map(),
      warehouseName: new Map(),
      countryName: new Map(),
      cargoNameToId: new Map(),
      cargoNameById: new Map(),
      providerLookup: new Map(),
      providerName: new Map(),
      categoryById: new Map(),
      poolByKey: new Map(),
      warehouseTimezone: new Map(),
      warehouseBusinessStart: new Map(),
      warehouseBusinessEnd: new Map(),
    };

    for (const d of docksRes.data ?? []) {
      if (d.warehouse_id) ctx.dockToWarehouse.set(d.id, d.warehouse_id);
    }
    for (const w of warehousesRes.data ?? []) {
      ctx.warehouseName.set(w.id, w.name);
      if (w.country_id) ctx.warehouseToCountry.set(w.id, w.country_id);
      ctx.warehouseTimezone.set(w.id, w.timezone || DEFAULT_TIMEZONE);
      ctx.warehouseBusinessStart.set(w.id, w.business_start_time ?? null);
      ctx.warehouseBusinessEnd.set(w.id, w.business_end_time ?? null);
    }
    for (const c of countriesRes.data ?? []) {
      ctx.countryName.set(c.id, c.name);
    }
    for (const ct of cargoTypesRes.data ?? []) {
      ctx.cargoNameToId.set(lower(ct.name), ct.id);
      ctx.cargoNameToId.set(ct.id, ct.id);
      ctx.cargoNameById.set(ct.id, ct.name);
    }
    for (const p of providersData) {
      ctx.providerName.set(p.id, p.name);
      if (p.name) ctx.providerLookup.set(lower(p.name), p.id);
      ctx.providerLookup.set(p.id, p.id);
    }
    for (const cat of categoriesRes.data ?? []) {
      ctx.categoryById.set(cat.id, cat as ResourceCategory);
    }
    for (const pool of poolRes.data ?? []) {
      const key = `${pool.category_id}|${pool.country_id}|${pool.warehouse_id}`;
      ctx.poolByKey.set(key, pool as ManpowerResource);
    }

    // ── 3. Agrupar items de reglas ───────────────────────────────
    const rules = (rulesRes.data ?? []) as ManpowerRule[];
    const items = itemsRes.data ?? [];
    const itemsByRule = new Map<string, any[]>();
    for (const item of items) {
      if (!itemsByRule.has(item.rule_id)) itemsByRule.set(item.rule_id, []);
      itemsByRule.get(item.rule_id)!.push(item);
    }
    for (const rule of rules) {
      rule.items = (itemsByRule.get(rule.id) ?? []).map((i) => ({
        id: i.id,
        org_id: i.org_id,
        rule_id: i.rule_id,
        category_id: i.category_id,
        quantity: i.quantity,
        created_at: i.created_at,
        updated_at: i.updated_at,
      }));
    }

    // ── 4. Matcheo por reserva ───────────────────────────────────
    const marginFactor = 1 + config.recommended_margin_pct / 100;

    const reservations = (reservationsRes.data ?? []) as ForecastReservation[];
    const forecasts: ReservationForecast[] = reservations.map((res) => {
      const warehouseId = ctx.dockToWarehouse.get(res.dock_id) ?? null;
      const countryId = warehouseId ? ctx.warehouseToCountry.get(warehouseId) ?? null : null;
      const cargoTypeId = ctx.cargoNameToId.get(lower(res.cargo_type));

      let providerName: string | null = null;
      if (res.shipper_provider) {
        const pid =
          ctx.providerLookup.get(lower(res.shipper_provider)) ??
          (isUuid(res.shipper_provider) ? res.shipper_provider : null);
        if (pid) providerName = ctx.providerName.get(pid) ?? res.shipper_provider;
      }

      const { rule, reason } = matchRule(res, rules, ctx);

      const min_resources = rule
        ? buildAllocations(rule, 1, ctx, warehouseId, countryId)
        : [];
      const recommended_resources = rule
        ? buildAllocations(rule, marginFactor, ctx, warehouseId, countryId)
        : [];

      const min_duration_hours = computeDurationHours(res.quantity_value, min_resources);
      const recommended_duration_hours = computeDurationHours(
        res.quantity_value,
        recommended_resources
      );

      // Rango de tiempo real seteado en la cita (lo que el usuario cargó al agendarla)
      const appointment_duration_hours = computeAppointmentDurationHours(
        res.start_datetime,
        res.end_datetime
      );
      // La duración calculada nunca debería superar el tiempo de la cita
      const duration_exceeds_appointment =
        recommended_duration_hours != null &&
        appointment_duration_hours != null &&
        recommended_duration_hours > appointment_duration_hours + DURATION_TOLERANCE_HOURS;

      return {
        reservation: res,
        warehouse_id: warehouseId,
        warehouse_name: warehouseId ? ctx.warehouseName.get(warehouseId) ?? null : null,
        country_id: countryId,
        country_name: countryId ? ctx.countryName.get(countryId) ?? null : null,
        cargo_type_name: cargoTypeId ? ctx.cargoNameById.get(cargoTypeId) ?? res.cargo_type : res.cargo_type,
        provider_name: providerName,
        bultos: res.quantity_value,
        matched: !!rule,
        matched_rule_id: rule?.id ?? null,
        matched_rule_priority: rule?.priority ?? null,
        match_reason: reason,
        min_resources,
        recommended_resources,
        min_duration_hours,
        recommended_duration_hours,
        appointment_duration_hours,
        duration_exceeds_appointment,
      };
    });

    // ── 5. Filtrar por almacén y rango en timezone del almacén ────
    const dateInRange = (f: ReservationForecast): boolean => {
      const tz = f.warehouse_id
        ? ctx.warehouseTimezone.get(f.warehouse_id) ?? DEFAULT_TIMEZONE
        : DEFAULT_TIMEZONE;
      const localDate = toWarehouseDateString(new Date(f.reservation.start_datetime), tz);
      return localDate >= startDate && localDate <= endDate;
    };
    const rangeFilteredForecasts = forecasts.filter(dateInRange);
    const filteredForecasts = warehouseId
      ? rangeFilteredForecasts.filter((f) => f.warehouse_id === warehouseId)
      : rangeFilteredForecasts;

    // ── 6. Agregación diaria por almacén ─────────────────────────
    const daily = this._aggregateDaily(filteredForecasts, ctx, config);

    // ── 6b. Agregación semanal por almacén ───────────────────────
    const weekly = this._aggregateWeekly(daily);

    // ── 7. Advertencias (sin categorías / sin stock) ─────────────
    const warnings: string[] = [];
    if (!categoriesRes.data || categoriesRes.data.length === 0) {
      warnings.push('No hay categorías de recursos cargadas. Cargá el estándar en la pestaña "Recursos".');
    }
    if (!poolRes.data || poolRes.data.length === 0) {
      warnings.push('No hay stock de recursos cargado. Agregá recursos por almacén en la pestaña "Recursos".');
    }

    // ── 8. Sugerencias de calendario por sobrecarga ───────────────
    const suggestions = this._computeSuggestions(daily, config);

    return {
      config,
      reservations: filteredForecasts,
      daily,
      weekly,
      warnings,
      suggestions,
      start_date: startDate,
      end_date: endDate,
    };
  },

  // ============================================================
  // AGREGACIÓN DIARIA
  // ============================================================
  _aggregateDaily(
    forecasts: ReservationForecast[],
    ctx: ForecastContext,
    config: ForecastConfig
  ): DailyWarehouseAggregation[] {
    // Todas las reservas cuentan como cita; solo las que matchearon aportan recursos/personas
    const groups = new Map<string, ReservationForecast[]>();
    for (const f of forecasts) {
      const tz = f.warehouse_id
        ? ctx.warehouseTimezone.get(f.warehouse_id) ?? DEFAULT_TIMEZONE
        : DEFAULT_TIMEZONE;
      const date = toWarehouseDateString(new Date(f.reservation.start_datetime), tz);
      const key = `${date}|${f.warehouse_id || 'none'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }

    const result: DailyWarehouseAggregation[] = [];

    for (const [key, list] of groups.entries()) {
      const [date, warehouseId] = key.split('|');
      const countryId = ctx.warehouseToCountry.get(warehouseId) ?? '';
      const tz = ctx.warehouseTimezone.get(warehouseId) ?? DEFAULT_TIMEZONE;

      // Pico simultáneo por categoría (mín y recomendado): cuántas unidades se
      // necesitan A LA VEZ en el momento más cargado, no la suma total de usos.
      const needMap = computeCategoryPeaks(
        list,
        tz,
        ctx.warehouseBusinessStart.get(warehouseId),
        ctx.warehouseBusinessEnd.get(warehouseId)
      );
      let totalBultos = 0;
      let minDuration = 0;
      let recDuration = 0;
      for (const f of list) {
        totalBultos += f.bultos ?? 0;
        minDuration += f.min_duration_hours ?? 0;
        recDuration += f.recommended_duration_hours ?? 0;
      }

      // Participaciones = suma de personas en todas las citas (a diferencia del pico simultáneo)
      const participacionesMin = sumPersonas(list, false);
      const participacionesRec = sumPersonas(list, true);

      // Stock por categoría en ese almacén
      const categories: DailyCategoryNeed[] = [];
      const externalReasons: string[] = [];

      for (const [categoryId, need] of needMap.entries()) {
        const cat = ctx.categoryById.get(categoryId);
        const poolKey = `${categoryId}|${countryId}|${warehouseId}`;
        const pool = ctx.poolByKey.get(poolKey);
        const stockLoaded = !!pool;
        const stock = pool?.quantity ?? 0;
        const deficit = Math.max(0, need.rec - stock);

        categories.push({
          category_id: categoryId,
          category_name: cat?.name || 'Recurso',
          type: cat?.type || 'PERSONAL',
          unit_label: cat?.unit_label ?? null,
          needed_min: need.min,
          needed_rec: need.rec,
          stock,
          stock_loaded: stockLoaded,
          deficit,
        });

        if (!stockLoaded) {
          externalReasons.push(`${cat?.name || 'Recurso'}: sin stock cargado (${need.rec} req.)`);
        } else if (deficit > 0) {
          externalReasons.push(`${cat?.name || 'Recurso'}: faltan ${deficit} (${need.rec} req. vs ${stock} disp.)`);
        }
      }

      // Tope de citas por día
      const limit = config.daily_appointment_limit;
      if (limit != null && list.length > limit) {
        externalReasons.push(`Citas del día (${list.length}) superan el tope de ${limit}`);
      }

      // Aplicar sustituciones (ej. carretilla faltante → apilador) a nivel día
      const { categories: finalCategories, substitutions } = applySubstitutions(
        categories,
        ctx,
        countryId,
        warehouseId
      );

      // Resumen de reservas del día (para sugerencias de calendario)
      const reservations: DailyReservationSummary[] = list.map((f) => ({
        reservation_id: f.reservation.id,
        cargo_type_name: f.cargo_type_name,
        provider_name: f.provider_name,
        bultos: f.bultos,
        time: toWarehouseTimeString(new Date(f.reservation.start_datetime), tz),
      }));

      result.push({
        date,
        date_label: this._formatDateLabel(date),
        warehouse_id: warehouseId === 'none' ? '' : warehouseId,
        warehouse_name: warehouseId === 'none' ? '—' : ctx.warehouseName.get(warehouseId) ?? '—',
        country_id: countryId,
        country_name: countryId ? ctx.countryName.get(countryId) ?? '—' : '—',
        reservation_count: list.length,
        total_bultos: totalBultos,
        min_duration_hours: minDuration,
        recommended_duration_hours: recDuration,
        peak_personas_min: computePeakPersonas(
          list,
          tz,
          ctx.warehouseBusinessStart.get(warehouseId),
          ctx.warehouseBusinessEnd.get(warehouseId),
          false
        ),
        peak_personas_rec: computePeakPersonas(
          list,
          tz,
          ctx.warehouseBusinessStart.get(warehouseId),
          ctx.warehouseBusinessEnd.get(warehouseId),
          true
        ),
        participaciones_min: participacionesMin,
        participaciones_rec: participacionesRec,
        categories: finalCategories,
        substitutions,
        requires_external: externalReasons.length > 0,
        external_reasons: externalReasons,
        reservations,
        blocks: this._computeTimeBlocks(list, ctx, warehouseId, countryId, tz, date),
      });
    }

    result.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.warehouse_name.localeCompare(b.warehouse_name);
    });

    return result;
  },

  // ============================================================
  // FRANJAS HORARIAS (bloques de citas consecutivas)
  // ============================================================
  _formatClock(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    const suffix = h >= 12 ? 'pm' : 'am';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? `${h12}:00 ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
  },

  _reservationEndMin(f: ReservationForecast, tz: string, sMin: number): number {
    if (f.reservation.end_datetime) {
      const ep = getDatePartsInTimezone(new Date(f.reservation.end_datetime), tz);
      const eMin = ep.hour * 60 + ep.minute;
      if (eMin > sMin) return eMin;
    }
    return sMin + Math.ceil((f.min_duration_hours ?? 1) * 60);
  },

  _computeTimeBlocks(
    list: ReservationForecast[],
    ctx: ForecastContext,
    warehouseId: string,
    countryId: string,
    tz: string,
    date: string
  ): DailyTimeBlock[] {
    // Un bloque nuevo se abre cuando hay un hueco de más de 60 min entre citas
    const gapMinutes = 60;
    const sorted = [...list].sort(
      (a, b) =>
        new Date(a.reservation.start_datetime).getTime() -
        new Date(b.reservation.start_datetime).getTime()
    );

    const groups: ReservationForecast[][] = [];
    let current: ReservationForecast[] = [];
    let currentEndMin = -1;

    for (const f of sorted) {
      const sp = getDatePartsInTimezone(new Date(f.reservation.start_datetime), tz);
      const sMin = sp.hour * 60 + sp.minute;
      const eMin = this._reservationEndMin(f, tz, sMin);

      if (current.length === 0) {
        current = [f];
        currentEndMin = eMin;
      } else if (sMin - currentEndMin > gapMinutes) {
        groups.push(current);
        current = [f];
        currentEndMin = eMin;
      } else {
        current.push(f);
        currentEndMin = Math.max(currentEndMin, eMin);
      }
    }
    if (current.length > 0) groups.push(current);

    return groups.map((group, idx) => {
      let startMin = Infinity;
      let endMin = -1;
      let totalBultos = 0;
      const reservations: DailyReservationSummary[] = [];

      for (const f of group) {
        const sp = getDatePartsInTimezone(new Date(f.reservation.start_datetime), tz);
        const sMin = sp.hour * 60 + sp.minute;
        const eMin = this._reservationEndMin(f, tz, sMin);
        startMin = Math.min(startMin, sMin);
        endMin = Math.max(endMin, eMin);
        totalBultos += f.bultos ?? 0;
        reservations.push({
          reservation_id: f.reservation.id,
          cargo_type_name: f.cargo_type_name,
          provider_name: f.provider_name,
          bultos: f.bultos,
          time: toWarehouseTimeString(new Date(f.reservation.start_datetime), tz),
        });
      }

      // Pico simultáneo por categoría dentro de la franja
      const needMap = computeCategoryPeaks(
        group,
        tz,
        ctx.warehouseBusinessStart.get(warehouseId),
        ctx.warehouseBusinessEnd.get(warehouseId)
      );

      const categories: DailyTimeBlockCategory[] = [];
      for (const [categoryId, need] of needMap.entries()) {
        const cat = ctx.categoryById.get(categoryId);
        const poolKey = `${categoryId}|${countryId}|${warehouseId}`;
        const pool = ctx.poolByKey.get(poolKey);
        const stockLoaded = !!pool;
        const stock = pool?.quantity ?? 0;
        categories.push({
          category_id: categoryId,
          category_name: cat?.name || 'Recurso',
          type: cat?.type || 'PERSONAL',
          unit_label: cat?.unit_label ?? null,
          needed_min: need.min,
          needed_rec: need.rec,
          stock,
          stock_loaded: stockLoaded,
          deficit: Math.max(0, need.rec - stock),
        });
      }
      const { categories: finalCategories, substitutions } = applySubstitutions(
        categories,
        ctx,
        countryId,
        warehouseId
      );

      return {
        id: `${date}-${warehouseId || 'none'}-block-${idx}`,
        start_time: this._formatClock(startMin),
        end_time: this._formatClock(endMin),
        label: `${this._formatClock(startMin)} – ${this._formatClock(endMin)}`,
        reservation_count: group.length,
        total_bultos: totalBultos,
        peak_personas_min: computePeakPersonas(
          group,
          tz,
          ctx.warehouseBusinessStart.get(warehouseId),
          ctx.warehouseBusinessEnd.get(warehouseId),
          false
        ),
        peak_personas_rec: computePeakPersonas(
          group,
          tz,
          ctx.warehouseBusinessStart.get(warehouseId),
          ctx.warehouseBusinessEnd.get(warehouseId),
          true
        ),
        participaciones_min: sumPersonas(group, false),
        participaciones_rec: sumPersonas(group, true),
        categories: finalCategories,
        substitutions,
        reservations,
      };
    });
  },

  // ============================================================
  // AGREGACIÓN SEMANAL
  // ============================================================
  _weekStart(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    const day = d.getUTCDay(); // 0 = domingo
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(d.getTime() + diff * 86_400_000);
    return monday.toISOString().slice(0, 10);
  },

  _weekEnd(dateStr: string): string {
    const start = this._weekStart(dateStr);
    const monday = new Date(`${start}T00:00:00Z`);
    const sunday = new Date(monday.getTime() + 6 * 86_400_000);
    return sunday.toISOString().slice(0, 10);
  },

  _formatWeekLabel(start: string, end: string): string {
    const fmt = (s: string) => {
      const d = new Date(`${s}T00:00:00`);
      return d.toLocaleDateString('es', { day: '2-digit', month: 'short' });
    };
    return `${fmt(start)} – ${fmt(end)}`;
  },

  _aggregateWeekly(daily: DailyWarehouseAggregation[]): WeeklyWarehouseAggregation[] {
    const groups = new Map<string, DailyWarehouseAggregation[]>();
    for (const d of daily) {
      const ws = this._weekStart(d.date);
      const key = `${ws}|${d.warehouse_id || 'none'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }

    const result: WeeklyWarehouseAggregation[] = [];

    for (const [key, list] of groups.entries()) {
      const [weekStart, warehouseId] = key.split('|');
      const weekEnd = this._weekEnd(weekStart);

      const catMap = new Map<string, WeeklyCategoryNeed>();
      let reservationCount = 0;
      let totalBultos = 0;
      let minDuration = 0;
      let recDuration = 0;
      let peakMin = 0;
      let peakRec = 0;
      let participacionesMin = 0;
      let participacionesRec = 0;
      let requiresExternal = false;

      for (const d of list) {
        reservationCount += d.reservation_count;
        totalBultos += d.total_bultos;
        minDuration += d.min_duration_hours;
        recDuration += d.recommended_duration_hours;
        peakMin = Math.max(peakMin, d.peak_personas_min);
        peakRec = Math.max(peakRec, d.peak_personas_rec);
        participacionesMin += d.participaciones_min;
        participacionesRec += d.participaciones_rec;
        if (d.requires_external) requiresExternal = true;
        for (const c of d.categories) {
          let cur = catMap.get(c.category_id);
          if (!cur) {
            cur = {
              category_id: c.category_id,
              category_name: c.category_name,
              type: c.type,
              unit_label: c.unit_label,
              needed_min: 0,
              needed_rec: 0,
              stock: c.stock,
              stock_loaded: c.stock_loaded,
              deficit: 0,
            };
            catMap.set(c.category_id, cur);
          }
          cur.needed_min = Math.max(cur.needed_min, c.needed_min);
          cur.needed_rec = Math.max(cur.needed_rec, c.needed_rec);
          // Pico de faltante: el peor día de la semana
          cur.deficit = Math.max(cur.deficit, c.deficit);
        }
      }

      const categories = Array.from(catMap.values()).sort((a, b) =>
        a.category_name.localeCompare(b.category_name)
      );

      // Agregar sustituciones (la peor de la semana por par origen→destino)
      const substMap = new Map<string, CategorySubstitution>();
      for (const d of list) {
        for (const s of d.substitutions ?? []) {
          const key = `${s.from_category_id}|${s.to_category_id || 'none'}`;
          const existing = substMap.get(key);
          if (!existing) {
            substMap.set(key, { ...s });
          } else {
            existing.quantity = Math.max(existing.quantity, s.quantity);
          }
        }
      }
      const substitutions = Array.from(substMap.values());

      result.push({
        week_start: weekStart,
        week_end: weekEnd,
        week_label: this._formatWeekLabel(weekStart, weekEnd),
        warehouse_id: warehouseId === 'none' ? '' : warehouseId,
        warehouse_name: warehouseId === 'none' ? '—' : list[0]?.warehouse_name ?? '—',
        country_name: list[0]?.country_name ?? '—',
        reservation_count: reservationCount,
        total_bultos: totalBultos,
        min_duration_hours: minDuration,
        recommended_duration_hours: recDuration,
        peak_personas_min: peakMin,
        peak_personas_rec: peakRec,
        participaciones_min: participacionesMin,
        participaciones_rec: participacionesRec,
        categories,
        substitutions,
        requires_external: requiresExternal,
      });
    }

    result.sort((a, b) => {
      if (a.week_start !== b.week_start) return a.week_start.localeCompare(b.week_start);
      return a.warehouse_name.localeCompare(b.warehouse_name);
    });

    return result;
  },

  // ============================================================
  // SUGERENCIAS DE CALENDARIO POR SOBRECARGA
  // ============================================================
  _spareCapacity(d: DailyWarehouseAggregation): number {
    return d.categories.reduce(
      (sum, c) => sum + Math.max(0, c.stock - c.needed_rec),
      0
    );
  },

  _computeSuggestions(
    daily: DailyWarehouseAggregation[],
    config: ForecastConfig
  ): CalendarSuggestion[] {
    const suggestions: CalendarSuggestion[] = [];
    const keyOf = (date: string, wh: string) => `${date}|${wh}`;
    const byKey = new Map(daily.map((d) => [keyOf(d.date, d.warehouse_id), d]));

    const overloaded = daily.filter((d) => {
      const overLimit =
        config.daily_appointment_limit != null &&
        d.reservation_count > config.daily_appointment_limit;
      return d.requires_external || overLimit;
    });
    const overloadedKeys = new Set(
      overloaded.map((d) => keyOf(d.date, d.warehouse_id))
    );

    for (const d of overloaded) {
      const overLimit =
        config.daily_appointment_limit != null &&
        d.reservation_count > config.daily_appointment_limit;

      let overloadType: 'deficit' | 'appointment_limit' = 'deficit';
      let reservationsToMove: DailyReservationSummary[] = [];

      if (overLimit) {
        overloadType = 'appointment_limit';
        const excess = d.reservation_count - (config.daily_appointment_limit ?? 0);
        const sorted = [...d.reservations].sort(
          (a, b) => (a.bultos ?? 0) - (b.bultos ?? 0)
        );
        reservationsToMove = sorted.slice(0, Math.max(0, excess));
      } else {
        overloadType = 'deficit';
        // Mover las citas más grandes primero (mayor impacto en la demanda)
        const sorted = [...d.reservations].sort(
          (a, b) => (b.bultos ?? 0) - (a.bultos ?? 0)
        );
        reservationsToMove = sorted.slice(0, Math.min(2, sorted.length));
      }

      if (reservationsToMove.length === 0) continue;

      // Buscar días destino cercanos (mismo almacén, ±4 días, sin sobrecarga)
      const windowDays = 4;
      const targets: DailyWarehouseAggregation[] = [];
      const base = new Date(`${d.date}T00:00:00Z`);
      for (let offset = -windowDays; offset <= windowDays; offset++) {
        if (offset === 0) continue;
        const dt = new Date(base.getTime() + offset * 86_400_000);
        const dateStr = dt.toISOString().slice(0, 10);
        const t = byKey.get(keyOf(dateStr, d.warehouse_id));
        if (t && !overloadedKeys.has(keyOf(t.date, t.warehouse_id))) {
          targets.push(t);
        }
      }

      targets.sort((a, b) => this._spareCapacity(b) - this._spareCapacity(a));
      const target = targets[0] ?? null;

      suggestions.push({
        id: `sugg-${d.date}-${d.warehouse_id}-${overloadType}`,
        source_date: d.date,
        source_date_label: d.date_label,
        warehouse_id: d.warehouse_id,
        warehouse_name: d.warehouse_name,
        country_name: d.country_name,
        overload_type: overloadType,
        reservations_to_move: reservationsToMove,
        target_date: target ? target.date : null,
        target_date_label: target ? target.date_label : null,
        reason: overLimit
          ? `${d.reservation_count} citas superan el tope de ${config.daily_appointment_limit} por día`
          : 'La demanda de recursos supera el stock disponible',
      });
    }

    return suggestions;
  },

  _formatDateLabel(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: 'short' });
  },
};