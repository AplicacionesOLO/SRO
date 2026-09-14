import { supabase } from '../lib/supabase';

/**
 * Analítica de tiempos reales de descarga (IN → OUT).
 *
 * Fuente de verdad:
 *  - Tiempo real = casetilla_salidas.exit_at − casetilla_ingresos.created_at
 *  - Se descartan datos atípicos: duración negativa o mayor a 2× el default_minutes del tipo
 *  - reservations.cargo_type (texto, contiene el UUID de cargo_types.id)
 *  - reservations.shipper_provider (texto, contiene el UUID de providers.id)
 *
 * IMPORTANTE: Supabase/PostgREST limita cada consulta a ~1000 filas por defecto.
 * Como casetilla_ingresos/casetilla_salidas/providers superan ese límite, TODAS
 * las lecturas se paginan para no perder datos.
 *
 * Todo es de SOLO LECTURA: no se escribe ningún perfil ni catálogo.
 */

export interface CargoTypeAverage {
  cargoTypeId: string; // valor crudo de reservations.cargo_type (UUID o texto)
  cargoTypeName: string;
  avgMinutes: number;
  sampleSize: number;
}

export interface ProviderSuggestion {
  providerId: string; // valor crudo de reservations.shipper_provider (UUID o texto)
  providerName: string;
  cargoTypeId: string;
  cargoTypeName: string;
  avgMinutes: number;
  sampleSize: number;
}

export interface TimeAnalyticsResult {
  cargoTypeAverages: CargoTypeAverage[];
  providerSuggestions: ProviderSuggestion[];
  /** Nº de reservas analizadas con IN y OUT (tras paginar todo). */
  analyzedReservations: number;
  /** Nº de citas (IN/OUT) válidas tras descartar atípicos. */
  validSamples: number;
}

/** Umbral de reservas para considerar un proveedor como "con datos suficientes". */
const PROVIDER_MIN_RESERVATIONS = 10; // "más de 10 reservas" → sample_size > 10

/** Factor multiplicador sobre `default_minutes` para descartar citas como datos atípicos. */
const OUTLIER_MULTIPLIER = 2;

/** Tope máximo (minutos) para tipos de carga sin `default_minutes` configurado. */
const FALLBACK_MAX_MINUTES = 1440; // 24h

const PAGE_SIZE = 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class TimeAnalyticsService {
  /**
   * Lee TODAS las filas de una consulta, paginando en bloques de 1000
   * para superar el límite por defecto de PostgREST.
   */
  private async _fetchAll<T>(buildQuery: () => any): Promise<T[]> {
    const all: T[] = [];
    let from = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as T[];
      all.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return all;
  }

  /**
   * Calcula promedios de tiempo real de descarga por tipo de carga y
   * sugeridos por proveedor (proveedores con más de 10 reservas IN/OUT).
   */
  async computeAnalytics(orgId: string, warehouseId?: string | null): Promise<TimeAnalyticsResult> {
    const empty: TimeAnalyticsResult = {
      cargoTypeAverages: [],
      providerSuggestions: [],
      analyzedReservations: 0,
      validSamples: 0,
    };

    // 1) Dock IDs del almacén (para filtrar por almacén activo)
    let dockIds: string[] | null = null;
    if (warehouseId) {
      const docks = await this._fetchAll<{ id: string }>(() =>
        supabase
          .from('docks')
          .select('id')
          .eq('org_id', orgId)
          .eq('warehouse_id', warehouseId)
          .order('id', { ascending: true })
      );
      dockIds = docks.map((d) => d.id);
      if (dockIds.length === 0) return empty;
    }

    // 2) Ingresos (IN) y salidas (OUT) — paginado para traer TODO
    const [ingresos, salidas] = await Promise.all([
      this._fetchAll<{ reservation_id: string; created_at: string }>(() =>
        supabase
          .from('casetilla_ingresos')
          .select('reservation_id, created_at')
          .eq('org_id', orgId)
          .not('reservation_id', 'is', null)
          .order('id', { ascending: true })
      ),
      this._fetchAll<{ reservation_id: string; exit_at: string }>(() =>
        supabase
          .from('casetilla_salidas')
          .select('reservation_id, exit_at')
          .eq('org_id', orgId)
          .not('reservation_id', 'is', null)
          .order('id', { ascending: true })
      ),
    ]);

    // 3) Map ingreso más temprano por reserva (IN real)
    const ingresoMap = new Map<string, string>();
    for (const ing of ingresos) {
      const rid = ing.reservation_id;
      const t = ing.created_at;
      if (!rid || !t) continue;
      const prev = ingresoMap.get(rid);
      if (!prev || new Date(t) < new Date(prev)) {
        ingresoMap.set(rid, t);
      }
    }

    // 4) Map salida (exit_at) por reserva
    const salidaMap = new Map<string, string>();
    for (const sal of salidas) {
      const rid = sal.reservation_id;
      if (!rid || !sal.exit_at) continue;
      if (!salidaMap.has(rid)) {
        salidaMap.set(rid, sal.exit_at);
      }
    }

    // 5) Reservas con IN y OUT
    const eligibleIds = [...ingresoMap.keys()].filter((id) => salidaMap.has(id));
    if (eligibleIds.length === 0) return empty;

    // 6) Reservas (cargo_type, shipper_provider, dock_id) por lotes
    const reservations = await this._fetchReservationsInBatches(orgId, eligibleIds);
    if (reservations.length === 0) return empty;

    // Filtrar por almacén si corresponde
    let rows = reservations;
    if (dockIds !== null) {
      const dockSet = new Set(dockIds);
      rows = rows.filter((r) => dockSet.has(r.dock_id));
    }

    // 7) Catálogos para resolver nombres (paginado: providers puede superar 1000)
    const [cargoTypes, providers] = await Promise.all([
      this._fetchAll<{ id: string; name: string; default_minutes: number | null }>(() =>
        supabase
          .from('cargo_types')
          .select('id, name, default_minutes')
          .eq('org_id', orgId)
          .order('id', { ascending: true })
      ),
      this._fetchAll<{ id: string; name: string }>(() =>
        supabase.from('providers').select('id, name').eq('org_id', orgId).order('id', { ascending: true })
      ),
    ]);

    const cargoTypesMap = new Map<string, string>();
    const cargoDefaultMap = new Map<string, number | null>();
    cargoTypes.forEach((ct) => {
      cargoTypesMap.set(ct.id, ct.name);
      cargoDefaultMap.set(ct.id, ct.default_minutes != null ? Number(ct.default_minutes) : null);
    });
    const providersMap = new Map<string, string>();
    providers.forEach((p) => providersMap.set(p.id, p.name));

    const resolveCargoTypeName = (raw: string | null): string => {
      if (!raw) return 'Sin tipo de carga';
      if (UUID_RE.test(raw)) return cargoTypesMap.get(raw) ?? raw;
      return raw;
    };

    const resolveProviderName = (raw: string | null): string => {
      if (!raw) return 'Sin proveedor';
      if (UUID_RE.test(raw)) return providersMap.get(raw) ?? raw;
      return raw;
    };

    // Tope válido de duración por tipo de carga (2× default_minutes, o fallback si no hay).
    const maxValidMinutesFor = (cargoTypeId: string): number => {
      const def = cargoDefaultMap.get(cargoTypeId);
      if (def != null && def > 0) return def * OUTLIER_MULTIPLIER;
      return FALLBACK_MAX_MINUTES;
    };

    // 8) Agrupar por tipo de carga y por proveedor × tipo
    const cargoAcc = new Map<
      string,
      { cargoTypeId: string; cargoTypeName: string; total: number; count: number }
    >();
    const providerAcc = new Map<
      string,
      { providerId: string; providerName: string; cargoTypeId: string; cargoTypeName: string; total: number; count: number }
    >();

    let validSamples = 0;

    for (const r of rows) {
      const ingAt = ingresoMap.get(r.id);
      const salAt = salidaMap.get(r.id);
      if (!ingAt || !salAt) continue;

      const mins = Math.round((new Date(salAt).getTime() - new Date(ingAt).getTime()) / 60000);
      if (mins < 0) continue; // dato anómalo (salida anterior al ingreso)

      const cargoTypeId = r.cargo_type ?? '';
      const cargoTypeName = resolveCargoTypeName(r.cargo_type);

      // Descartar datos atípicos: duraciones que superan 2× el default del tipo de carga
      if (mins > maxValidMinutesFor(cargoTypeId)) continue;

      validSamples += 1;

      // Tipo de carga
      let cg = cargoAcc.get(cargoTypeId);
      if (!cg) {
        cg = { cargoTypeId, cargoTypeName, total: 0, count: 0 };
        cargoAcc.set(cargoTypeId, cg);
      }
      cg.total += mins;
      cg.count += 1;

      // Proveedor × tipo
      const providerId = r.shipper_provider ?? '';
      const providerName = resolveProviderName(r.shipper_provider);
      const key = `${providerId}::${cargoTypeId}`;
      let pg = providerAcc.get(key);
      if (!pg) {
        pg = { providerId, providerName, cargoTypeId, cargoTypeName, total: 0, count: 0 };
        providerAcc.set(key, pg);
      }
      pg.total += mins;
      pg.count += 1;
    }

    // 9) Construir resultados
    const cargoTypeAverages: CargoTypeAverage[] = [...cargoAcc.values()]
      .map((g) => ({
        cargoTypeId: g.cargoTypeId,
        cargoTypeName: g.cargoTypeName,
        avgMinutes: Math.round(g.total / g.count),
        sampleSize: g.count,
      }))
      .sort((a, b) => a.cargoTypeName.localeCompare(b.cargoTypeName));

    // Solo proveedores con más de 10 reservas IN/OUT
    const providerSuggestions: ProviderSuggestion[] = [...providerAcc.values()]
      .filter((g) => g.count > PROVIDER_MIN_RESERVATIONS)
      .map((g) => ({
        providerId: g.providerId,
        providerName: g.providerName,
        cargoTypeId: g.cargoTypeId,
        cargoTypeName: g.cargoTypeName,
        avgMinutes: Math.round(g.total / g.count),
        sampleSize: g.count,
      }))
      .sort((a, b) => a.providerName.localeCompare(b.providerName) || a.cargoTypeName.localeCompare(b.cargoTypeName));

    return {
      cargoTypeAverages,
      providerSuggestions,
      analyzedReservations: rows.length,
      validSamples,
    };
  }

  /** Trae reservas por lotes para no reventar el límite de URL de Supabase. */
  private async _fetchReservationsInBatches(
    orgId: string,
    ids: string[]
  ): Promise<{ id: string; cargo_type: string | null; shipper_provider: string | null; dock_id: string }[]> {
    const results: { id: string; cargo_type: string | null; shipper_provider: string | null; dock_id: string }[] = [];
    const BATCH = 200;

    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const { data, error } = await supabase
        .from('reservations')
        .select('id, cargo_type, shipper_provider, dock_id')
        .eq('org_id', orgId)
        .in('id', batch);

      if (error) throw error;
      results.push(...((data ?? []) as any[]));
    }

    return results;
  }
}

export const timeAnalyticsService = new TimeAnalyticsService();