import { supabase } from '../lib/supabase';
import { getStartOfDayInTimezone, getEndOfDayInTimezone, DEFAULT_TIMEZONE } from '../utils/timezoneUtils';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReservationRangeReportRow {
  client_name: string;
  warehouse_name: string;
  provider_name: string;
  chofer: string;
  matricula: string;
  dua: string;
  order_request_number: string;
  start_datetime: string | null;
  end_datetime: string | null;
  ingreso_at: string | null;
  salida_at: string | null;
  duracion_minutos: number | null;
  status_name: string;
  warehouse_timezone: string;
}

type RangeReservationRow = {
  id: string;
  dua: string | null;
  driver: string | null;
  truck_plate: string | null;
  purchase_order: string | null;
  order_request_number: string | null;
  shipper_provider: string | null;
  dock_id: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  status_id: string | null;
  is_cancelled: boolean | null;
};

class CasetillaReportService {
  // Paginación completa de lecturas (evita el límite de 1000 filas de PostgREST)
  private async _fetchAll<T>(
    buildQuery: (from: number, to: number) => any,
    pageSize = 1000
  ): Promise<T[]> {
    const all: T[] = [];
    let from = 0;
    for (;;) {
      const to = from + pageSize - 1;
      const { data, error } = await buildQuery(from, to);
      if (error) throw error;
      const rows = (data ?? []) as T[];
      if (rows.length === 0) break;
      all.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  private async _getDockIdsForClient(orgId: string, clientId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('client_docks')
      .select('dock_id')
      .eq('org_id', orgId)
      .eq('client_id', clientId);
    if (error || !data) return [];
    return data.map((r: any) => r.dock_id as string);
  }

  /**
   * Reporte consolidado: TODAS las reservas cuyo inicio de cita cae dentro del rango,
   * con cliente, almacén, proveedor, IN, OUT y duración real.
   */
  async getReservationsRangeReport(
    orgId: string,
    from: Date,
    to: Date,
    timezone?: string | null,
    allowedWarehouseIds?: string[] | null,
    clientId?: string | null
  ): Promise<ReservationRangeReportRow[]> {
    const tz = timezone || DEFAULT_TIMEZONE;

    let fromIso: string;
    let toIso: string;
    try {
      fromIso = getStartOfDayInTimezone(from, tz).toISOString();
      toIso = getEndOfDayInTimezone(to, tz).toISOString();
    } catch {
      return [];
    }

    // ─── SEGREGACIÓN: dock_ids permitidos (almacén + cliente) ────────────────
    let allowedDockIds: Set<string> | null = null;

    if (allowedWarehouseIds && allowedWarehouseIds.length > 0) {
      const { data: allowedDocks } = await supabase
        .from('docks')
        .select('id')
        .eq('org_id', orgId)
        .in('warehouse_id', allowedWarehouseIds);
      allowedDockIds = new Set((allowedDocks ?? []).map((d: any) => d.id as string));
    }

    if (clientId) {
      const clientDockIds = await this._getDockIdsForClient(orgId, clientId);
      const clientSet = new Set(clientDockIds);
      if (allowedDockIds !== null) {
        allowedDockIds = new Set([...allowedDockIds].filter((id) => clientSet.has(id)));
      } else {
        allowedDockIds = clientSet;
      }
    }

    // ─── RESERVAS del rango (por start_datetime) ─────────────────────────────
    const reservations = await this._fetchAll<RangeReservationRow>((f, t) =>
      supabase
        .from('reservations')
        .select('id, dua, driver, truck_plate, purchase_order, order_request_number, shipper_provider, dock_id, start_datetime, end_datetime, status_id, is_cancelled')
        .eq('org_id', orgId)
        .eq('is_cancelled', false)
        .gte('start_datetime', fromIso)
        .lte('start_datetime', toIso)
        .order('start_datetime', { ascending: true })
        .order('id', { ascending: true })
        .range(f, t)
    );

    let rows = reservations;
    if (allowedDockIds !== null) {
      rows = rows.filter((r) => r.dock_id && allowedDockIds!.has(r.dock_id));
    }
    if (rows.length === 0) return [];

    // ─── INGRESOS y SALIDAS por reserva (en lotes) ───────────────────────────
    const reservationIds = rows.map((r) => r.id).filter(Boolean);
    const ingresosMap = new Map<string, string>(); // reservation_id -> primer ingreso
    const salidasMap = new Map<string, string>(); // reservation_id -> salida

    const BATCH = 50;
    for (let i = 0; i < reservationIds.length; i += BATCH) {
      const batch = reservationIds.slice(i, i + BATCH);

      const { data: ingData } = await supabase
        .from('casetilla_ingresos')
        .select('reservation_id, created_at')
        .eq('org_id', orgId)
        .in('reservation_id', batch)
        .order('created_at', { ascending: true });
      (ingData ?? []).forEach((x: any) => {
        if (x.reservation_id && !ingresosMap.has(x.reservation_id)) {
          ingresosMap.set(x.reservation_id, x.created_at);
        }
      });

      const { data: salData } = await supabase
        .from('casetilla_salidas')
        .select('reservation_id, exit_at')
        .eq('org_id', orgId)
        .in('reservation_id', batch)
        .order('exit_at', { ascending: true });
      (salData ?? []).forEach((x: any) => {
        if (x.reservation_id && !salidasMap.has(x.reservation_id)) {
          salidasMap.set(x.reservation_id, x.exit_at);
        }
      });
    }

    // ─── Docks → Almacenes ───────────────────────────────────────────────────
    const dockIds = [...new Set(rows.map((r) => r.dock_id).filter(Boolean))] as string[];
    const docksMap = new Map<string, { warehouse_id: string | null }>();
    if (dockIds.length > 0) {
      const { data: docksData } = await supabase
        .from('docks')
        .select('id, warehouse_id')
        .eq('org_id', orgId)
        .in('id', dockIds);
      (docksData ?? []).forEach((d: any) => docksMap.set(d.id, { warehouse_id: d.warehouse_id ?? null }));
    }

    const warehouseIds = [...new Set([...docksMap.values()].map((d) => d.warehouse_id).filter(Boolean))] as string[];
    const warehousesMap = new Map<string, { name: string; timezone: string }>();
    if (warehouseIds.length > 0) {
      const { data: whData } = await supabase
        .from('warehouses')
        .select('id, name, timezone')
        .eq('org_id', orgId)
        .in('id', warehouseIds);
      (whData ?? []).forEach((w: any) =>
        warehousesMap.set(w.id, { name: w.name, timezone: w.timezone || DEFAULT_TIMEZONE })
      );
    }

    // ─── Cliente por dock (client_docks → clients) ───────────────────────────
    const dockClientMap = new Map<string, string[]>();
    if (dockIds.length > 0) {
      const { data: cdData } = await supabase
        .from('client_docks')
        .select('dock_id, client_id')
        .eq('org_id', orgId)
        .in('dock_id', dockIds);

      const clientIds = [...new Set((cdData ?? []).map((c: any) => c.client_id).filter(Boolean))] as string[];
      const clientsMap = new Map<string, string>();
      if (clientIds.length > 0) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('id, name')
          .eq('org_id', orgId)
          .in('id', clientIds);
        (clientData ?? []).forEach((c: any) => clientsMap.set(c.id, c.name));
      }

      (cdData ?? []).forEach((cd: any) => {
        const name = clientsMap.get(cd.client_id);
        if (!name) return;
        const arr = dockClientMap.get(cd.dock_id) ?? [];
        arr.push(name);
        dockClientMap.set(cd.dock_id, arr);
      });
    }

    // ─── Proveedores ─────────────────────────────────────────────────────────
    const providerIds = [
      ...new Set(
        rows
          .map((r) => r.shipper_provider)
          .filter((id): id is string => !!id && UUID_REGEX.test(id))
      ),
    ];
    const providersMap = new Map<string, string>();
    if (providerIds.length > 0) {
      const { data: provData } = await supabase
        .from('providers')
        .select('id, name')
        .in('id', providerIds);
      (provData ?? []).forEach((p: any) => providersMap.set(p.id, p.name));
    }

    // ─── Estados ─────────────────────────────────────────────────────────────
    const statusMap = new Map<string, string>();
    {
      const { data: stData } = await supabase
        .from('reservation_statuses')
        .select('id, name')
        .eq('org_id', orgId);
      (stData ?? []).forEach((s: any) => statusMap.set(s.id, s.name));
    }

    // ─── Filas finales ───────────────────────────────────────────────────────
    return rows.map((r) => {
      const dock = r.dock_id ? docksMap.get(r.dock_id) : undefined;
      const wh = dock?.warehouse_id ? warehousesMap.get(dock.warehouse_id) : undefined;

      const shipper = r.shipper_provider ?? null;
      const isUUID = !!shipper && UUID_REGEX.test(shipper);
      const providerName = isUUID
        ? providersMap.get(shipper as string) ?? 'N/A'
        : shipper ?? 'Sin proveedor';

      const clientNames = r.dock_id ? dockClientMap.get(r.dock_id) ?? [] : [];

      const ingresoAt = ingresosMap.get(r.id) ?? null;
      const salidaAt = salidasMap.get(r.id) ?? null;

      let duracion: number | null = null;
      if (ingresoAt && salidaAt) {
        duracion = Math.round((new Date(salidaAt).getTime() - new Date(ingresoAt).getTime()) / 60000);
      }

      return {
        client_name: clientNames.length > 0 ? [...new Set(clientNames)].join(', ') : '',
        warehouse_name: wh?.name ?? 'N/A',
        provider_name: providerName,
        chofer: r.driver ?? '',
        matricula: r.truck_plate ?? '',
        dua: r.dua ?? '',
        order_request_number: r.order_request_number ?? '',
        start_datetime: r.start_datetime ?? null,
        end_datetime: r.end_datetime ?? null,
        ingreso_at: ingresoAt,
        salida_at: salidaAt,
        duracion_minutos: duracion,
        status_name: r.status_id ? statusMap.get(r.status_id) ?? '' : '',
        warehouse_timezone: wh?.timezone ?? DEFAULT_TIMEZONE,
      };
    });
  }
}

export const casetillaReportService = new CasetillaReportService();