import { supabase } from '../lib/supabase';
import { calendarService, type Dock, type Reservation } from './calendarService';
import { providersService } from './providersService';
import { sortDocksByNameNumber } from '../utils/sortDocks';
import { manpowerRulesService } from './manpowerRulesService';
import type { ManpowerRule } from '../types/manpowerRule';

export interface Proceso3DStatus {
  id: string;
  name: string;
  code: string;
  color: string;
  order_index?: number | null;
}

export interface Proceso3DCategory {
  id: string;
  name: string;
  code: string;
  color: string;
}

/** Tiempos reales registrados en el Punto de Control IN/OUT para una cita. */
export interface GateTimes {
  ingresoAt?: string;
  salidaAt?: string;
}

/** Un cambio de estado de la cita (historial real, tabla activity_log). */
export interface StatusChange {
  from: string | null;
  to: string;
  /** epoch ms */
  at: number;
}

/** Tipo de carga del catálogo (define unidades y tiempo por unidad). */
export interface CargoTypeInfo {
  id: string;
  name: string;
  measurement_key: string | null;
  unit_label: string | null;
  seconds_per_unit: number | null;
  default_minutes: number | null;
}

export interface Proceso3DData {
  docks: Dock[];
  reservations: Reservation[];
  statuses: Proceso3DStatus[];
  categories: Proceso3DCategory[];
  providerNames: Map<string, string>;
  gateTimes: Map<string, GateTimes>;
  /** Cambios de estado por cita, ordenados por hora */
  statusHistory: Map<string, StatusChange[]>;
  cargoTypes: Map<string, CargoTypeInfo>;
  /** Reglas de recursos (personal / equipo) por tipo de carga */
  crewRules: ManpowerRule[];
}

const providerNamesCache = new Map<string, { at: number; value: Map<string, string> }>();
const PROVIDERS_TTL_MS = 5 * 60_000;

async function getProviderNames(orgId: string): Promise<Map<string, string>> {
  const cached = providerNamesCache.get(orgId);
  if (cached && Date.now() - cached.at < PROVIDERS_TTL_MS) return cached.value;
  try {
    const providers = await providersService.getActive(orgId);
    const map = new Map<string, string>(providers.map((p: any) => [p.id, p.name]));
    providerNamesCache.set(orgId, { at: Date.now(), value: map });
    return map;
  } catch {
    return new Map();
  }
}

const CACHE_MS = 5 * 60_000;
const cargoCache = new Map<string, { at: number; value: Map<string, CargoTypeInfo> }>();
const rulesCache = new Map<string, { at: number; value: ManpowerRule[] }>();

async function getCargoTypes(orgId: string): Promise<Map<string, CargoTypeInfo>> {
  const hit = cargoCache.get(orgId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const { data, error } = await supabase
    .from('cargo_types')
    .select('id, name, measurement_key, unit_label, seconds_per_unit, default_minutes')
    .eq('org_id', orgId);
  if (error) return hit?.value ?? new Map();
  const value = new Map(
    (data ?? []).map((c: any) => [
      c.id as string,
      {
        ...c,
        seconds_per_unit: c.seconds_per_unit != null ? Number(c.seconds_per_unit) : null,
      } as CargoTypeInfo,
    ])
  );
  cargoCache.set(orgId, { at: Date.now(), value });
  return value;
}

async function getCrewRules(orgId: string, warehouseId: string | null): Promise<ManpowerRule[]> {
  const key = `${orgId}|${warehouseId ?? ''}`;
  const hit = rulesCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  try {
    const value = await manpowerRulesService.getRules(orgId, warehouseId ? { warehouseId } : undefined);
    rulesCache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return hit?.value ?? [];
  }
}

/**
 * Historial real de estados: cada cambio de status_id queda en activity_log con su hora.
 * Permite ubicar los camiones en el recorrido y medir el avance de la descarga.
 */
async function getStatusHistory(
  orgId: string,
  reservationIds: string[],
  statusCodeById: Map<string, string>
): Promise<Map<string, StatusChange[]>> {
  const result = new Map<string, StatusChange[]>();
  if (reservationIds.length === 0) return result;
  const chunks: string[][] = [];
  // ~5 cambios por cita: lotes chicos para no pasar el máximo de filas por consulta
  for (let i = 0; i < reservationIds.length; i += 80) chunks.push(reservationIds.slice(i, i + 80));

  await Promise.all(
    chunks.map(async (ids) => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('entity_id, old_value, new_value, created_at')
        .eq('org_id', orgId)
        .eq('entity_type', 'reservation')
        .eq('field', 'status_id')
        .in('entity_id', ids)
        .order('created_at', { ascending: true })
        .limit(1000);
      if (error) return;
      for (const row of (data ?? []) as any[]) {
        const to = row.new_value ? statusCodeById.get(row.new_value) : undefined;
        if (!to) continue;
        const list = result.get(row.entity_id) ?? [];
        list.push({
          from: row.old_value ? statusCodeById.get(row.old_value) ?? null : null,
          to,
          at: new Date(row.created_at).getTime(),
        });
        result.set(row.entity_id, list);
      }
    })
  );
  for (const list of result.values()) list.sort((a, b) => a.at - b.at);
  return result;
}

export async function getGateTimes(orgId: string, reservationIds: string[]): Promise<Map<string, GateTimes>> {
  const result = new Map<string, GateTimes>();
  if (reservationIds.length === 0) return result;

  // Lotes para no exceder el largo de URL en el filtro IN
  const chunks: string[][] = [];
  for (let i = 0; i < reservationIds.length; i += 150) chunks.push(reservationIds.slice(i, i + 150));

  await Promise.all(
    chunks.map(async (ids) => {
      const [ingresos, salidas] = await Promise.all([
        supabase
          .from('casetilla_ingresos')
          .select('reservation_id, created_at')
          .eq('org_id', orgId)
          .in('reservation_id', ids),
        supabase
          .from('casetilla_salidas')
          .select('reservation_id, exit_at, created_at')
          .eq('org_id', orgId)
          .in('reservation_id', ids),
      ]);

      for (const row of (ingresos.data ?? []) as any[]) {
        if (!row.reservation_id) continue;
        const entry = result.get(row.reservation_id) ?? {};
        // Si hubo varios ingresos, nos quedamos con el primero
        if (!entry.ingresoAt || row.created_at < entry.ingresoAt) entry.ingresoAt = row.created_at;
        result.set(row.reservation_id, entry);
      }
      for (const row of (salidas.data ?? []) as any[]) {
        if (!row.reservation_id) continue;
        const entry = result.get(row.reservation_id) ?? {};
        const at = row.exit_at || row.created_at;
        if (!entry.salidaAt || at > entry.salidaAt) entry.salidaAt = at;
        result.set(row.reservation_id, entry);
      }
    })
  );

  return result;
}

/** Registro del Punto de Control (casetilla) de una cita: chofer y fotos de IN y OUT. */
export interface GateDetail {
  ingreso: {
    at: string;
    chofer: string | null;
    cedula: string | null;
    matricula: string | null;
    observaciones: string | null;
    fotos: string[];
  } | null;
  salida: { at: string; chofer: string | null; matricula: string | null; fotos: string[] } | null;
}

/** Lee el ingreso (el primero) y la salida (la última) de casetilla de una cita. Solo lectura. */
export async function getGateDetail(orgId: string, reservationId: string): Promise<GateDetail> {
  const [ing, sal] = await Promise.all([
    supabase
      .from('casetilla_ingresos')
      .select('created_at, chofer, cedula, matricula, observaciones, fotos')
      .eq('org_id', orgId)
      .eq('reservation_id', reservationId)
      .order('created_at', { ascending: true })
      .limit(1),
    supabase
      .from('casetilla_salidas')
      .select('exit_at, created_at, chofer, matricula, fotos')
      .eq('org_id', orgId)
      .eq('reservation_id', reservationId)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  if (ing.error) throw ing.error;
  if (sal.error) throw sal.error;
  const i = (ing.data ?? [])[0] as any;
  const s = (sal.data ?? [])[0] as any;
  const urls = (v: unknown) => (Array.isArray(v) ? v.filter((u): u is string => typeof u === 'string' && u.length > 0) : []);
  return {
    ingreso: i
      ? {
          at: i.created_at,
          chofer: i.chofer ?? null,
          cedula: i.cedula ?? null,
          matricula: i.matricula ?? null,
          observaciones: i.observaciones ?? null,
          fotos: urls(i.fotos),
        }
      : null,
    salida: s ? { at: s.exit_at || s.created_at, chofer: s.chofer ?? null, matricula: s.matricula ?? null, fotos: urls(s.fotos) } : null,
  };
}

export const proceso3dService = {
  /**
   * Personal disponible en el almacén según Recursos de Manpower: suma de las cantidades
   * activas de las categorías de tipo PERSONAL. null = sin almacén o sin datos (no se compara).
   * Solo lectura; si falla no afecta al resto de la simulación.
   */
  async getStaffAvailable(orgId: string, warehouseId: string | null): Promise<number | null> {
    if (!warehouseId) return null;
    try {
      const [cats, res] = await Promise.all([
        supabase.from('manpower_resource_categories').select('id, type, is_active').eq('org_id', orgId),
        supabase.from('manpower_resources').select('category_id, quantity, status').eq('org_id', orgId).eq('warehouse_id', warehouseId),
      ]);
      if (cats.error || res.error) return null;
      const personal = new Set(
        (cats.data ?? []).filter((c: any) => c.type === 'PERSONAL' && c.is_active !== false).map((c: any) => c.id as string)
      );
      const rows = (res.data ?? []).filter((r: any) => personal.has(r.category_id) && (r.status ?? 'ACTIVO') === 'ACTIVO');
      if (!rows.length) return null;
      return rows.reduce((sum: number, r: any) => sum + (Number(r.quantity) || 0), 0);
    } catch {
      return null;
    }
  },

  /**
   * Carga todo lo necesario para la simulación 3D de un almacén en un rango (normalmente un día).
   * Respeta el alcance del usuario (almacenes / clientes permitidos) igual que el Calendario.
   */
  async load(params: {
    orgId: string;
    warehouseId: string | null;
    startISO: string;
    endISO: string;
    allowedWarehouseIds?: string[] | null;
    allowedClientIds?: string[] | null;
    warehouseTimezoneMap?: Map<string, string>;
  }): Promise<Proceso3DData> {
    const { orgId, warehouseId, startISO, endISO, allowedWarehouseIds, allowedClientIds, warehouseTimezoneMap } = params;

    const allowedDockIds = await calendarService.getVisibleDockIds(orgId, warehouseId, allowedWarehouseIds, allowedClientIds);

    const [docksRaw, statusesRaw, categoriesRaw, providerNames, cargoTypes, crewRules] = await Promise.all([
      calendarService.getDocks(orgId, warehouseId, allowedWarehouseIds, allowedClientIds, warehouseTimezoneMap),
      calendarService.getReservationStatuses(orgId),
      calendarService.getDockCategories(orgId),
      getProviderNames(orgId),
      getCargoTypes(orgId),
      getCrewRules(orgId, warehouseId),
    ]);

    const statuses = (statusesRaw ?? []) as Proceso3DStatus[];
    const categories = (categoriesRaw ?? []) as Proceso3DCategory[];
    const dockIdSet = new Set(allowedDockIds);
    const docks = (docksRaw ?? [])
      .filter((d) => d.is_active !== false && dockIdSet.has(d.id))
      .sort(sortDocksByNameNumber);

    if (allowedDockIds.length === 0) {
      return {
        docks,
        reservations: [],
        statuses,
        categories,
        providerNames,
        gateTimes: new Map(),
        statusHistory: new Map(),
        cargoTypes,
        crewRules,
      };
    }

    const reservationsRaw = await calendarService.getReservations(orgId, startISO, endISO, allowedWarehouseIds, allowedDockIds);

    const statusMap = new Map(statuses.map((s) => [s.id, s]));
    const reservations = reservationsRaw
      .filter((r) => dockIdSet.has(r.dock_id))
      .map((r) => {
        const st = r.status_id ? statusMap.get(r.status_id) : undefined;
        return st ? { ...r, status: { name: st.name, code: st.code, color: st.color } } : r;
      });

    const ids = reservations.map((r) => r.id);
    const codeById = new Map(statuses.map((s) => [s.id, (s.code ?? '').toUpperCase()]));
    const [gateTimes, statusHistory] = await Promise.all([
      getGateTimes(orgId, ids),
      getStatusHistory(orgId, ids, codeById),
    ]);

    return { docks, reservations, statuses, categories, providerNames, gateTimes, statusHistory, cargoTypes, crewRules };
  },
};
