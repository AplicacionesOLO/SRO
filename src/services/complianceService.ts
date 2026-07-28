import type {
  ComplianceSummary,
  ComplianceReservation,
  ComplianceReservationDetail,
  ComplianceIncident,
  ComplianceFilters,
  ComplianceMetric,
} from '@/types/compliance';
import { INOUT_COMPLIANCE_DEMO_MODE } from '@/types/compliance';
import { supabase } from '@/lib/supabase';
import {
  demoSummary,
  demoReservations,
  demoIncidents,
  getDemoReservationDetail,
  demoMetrics,
} from '@/mocks/complianceDemoData';

// ─── Helper: paginar resultados ─────────────────────────────────────────

function paginateResults<T>(items: T[], page: number, pageSize: number): { data: T[]; total: number; page: number; pageSize: number; totalPages: number } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const data = items.slice(start, start + pageSize);
  return { data, total, page: safePage, pageSize, totalPages };
}

// ─── Helper: filtrar reservas ───────────────────────────────────────────

function filterReservations(reservations: ComplianceReservation[], filters: ComplianceFilters): ComplianceReservation[] {
  let result = [...reservations];

  if (filters.result) {
    result = result.filter((r) => r.result === filters.result);
  }
  if (filters.severity) {
    result = result.filter((r) => r.severity === filters.severity);
  }
  if (filters.warehouseId) {
    result = result.filter((r) => r.warehouseId === filters.warehouseId);
  }
  if (filters.searchTerm.trim()) {
    const term = filters.searchTerm.toLowerCase();
    result = result.filter(
      (r) =>
        r.id.toLowerCase().includes(term) ||
        (r.driver ?? '').toLowerCase().includes(term) ||
        (r.truckPlate ?? '').toLowerCase().includes(term) ||
        (r.providerName ?? '').toLowerCase().includes(term) ||
        (r.clientName ?? '').toLowerCase().includes(term)
    );
  }

  return result;
}

// ─── Helper: verificar si un string es UUID válido ────────────────────

function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// ─── Helper: mapear una fila de reservation de Supabase → ComplianceReservation ──

function mapRealReservation(
  r: any,
  docksMap: Map<string, { name: string; warehouse_id: string | null }>,
  statusesMap: Map<string, { name: string; code: string; color: string }>,
  clientsMap: Map<string, string>,
  providersMap: Map<string, string>,
  warehousesMap: Map<string, string>
): ComplianceReservation {
  const dock = r.dock_id ? docksMap.get(r.dock_id) : null;
  const status = r.status_id ? statusesMap.get(r.status_id) : null;
  const whId = dock?.warehouse_id ?? null;
  const whName = whId ? (warehousesMap.get(whId) ?? 'Warehouse no encontrado') : (dock ? 'Warehouse no resuelto' : null);

  // Resolver proveedor: shipper_provider es text con formato UUID
  const sp = r.shipper_provider as string | null;
  const providerName = sp
    ? (isUUID(sp) ? (providersMap.get(sp) ?? 'Proveedor sin homologar') : sp)
    : null;

  // Resolver cliente: client_id es UUID pero casi siempre NULL en esta BD
  const clientName = r.client_id ? (clientsMap.get(r.client_id) ?? null) : null;

  const startDate = r.start_datetime ? new Date(r.start_datetime) : null;

  return {
    id: r.id,
    reservationDate: startDate ? startDate.toISOString().split('T')[0] : '—',
    reservationTime: startDate ? startDate.toTimeString().slice(0, 5) : '—',
    clientName,
    clientId: r.client_id ?? null,
    providerName,
    driver: r.driver ?? null,
    truckPlate: r.truck_plate ?? null,
    dockId: r.dock_id ?? null,
    dockName: dock?.name ?? (r.dock_id ? 'Andén no encontrado' : 'Andén no asignado'),
    warehouseId: whId,
    warehouseName: whName,
    currentStatus: status?.code ?? null,
    previousStatus: null,
    // ── CRÍTICO: NO derivar resultado del estado operativo ──
    // Mientras el Rule Engine no exista, toda reserva real es NOT_EVALUATED
    result: 'NOT_EVALUATED',
    severity: null,
    incidentCount: null,
    rulesApplied: null,
    rulesTotal: null,
    lastActivity: r.updated_at ?? r.start_datetime ?? new Date().toISOString(),
    decisiveRule: null,
    decisiveRuleName: null,
    warehouseResolution: {
      reservationId: r.id,
      dockId: r.dock_id ?? null,
      dockName: dock?.name ?? (r.dock_id ? 'Andén no encontrado' : null),
      resolvedWarehouseId: whId,
      warehouseName: whName,
      orgName: null,
      couldNotResolve: !whId,
    },
    isDemo: false,
    isRealData: true,
  };
}

// ─── Servicio ───────────────────────────────────────────────────────────

class ComplianceService {
  /**
   * Obtener resumen de métricas de cumplimiento.
   * MODO HÍBRIDO: totalPeriod = COUNT real de BD. totalEvaluated = 0 (motor no conectado).
   */
  async getComplianceSummary(orgId: string, filters: Partial<ComplianceFilters>): Promise<ComplianceSummary> {
    if (INOUT_COMPLIANCE_DEMO_MODE && !orgId) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return demoSummary;
    }

    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const { count, error } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('is_cancelled', false)
        .gte('start_datetime', thirtyDaysAgo.toISOString())
        .lte('start_datetime', now.toISOString());

      if (error) throw error;

      const totalReal = count ?? 0;

      const summary: ComplianceSummary = {
        totalPeriod: totalReal,
        totalEvaluated: 0,
        passed: 0,
        warned: 0,
        blocked: 0,
        errored: 0,
        notEvaluated: totalReal,
        openIncidents: 0,
        overrides: 0,
        avgResolutionMs: 0,
        compliancePercent: 0,
        periodStart: thirtyDaysAgo.toISOString(),
        periodEnd: now.toISOString(),
        dataSource: 'hybrid',
        dataLoadError: false,
        metrics: [
          { label: 'Reservas del periodo', value: totalReal, icon: 'ri-file-list-3-line', color: 'teal', tooltip: 'Total de reservas activas en los últimos 30 días — DATO REAL desde la base de datos', filterResult: undefined },
          { label: 'Reservas evaluadas', value: 0, icon: 'ri-shield-check-line', color: 'gray', tooltip: '0 — El motor de reglas aún no está conectado. Solo las reservas demo muestran resultados simulados.', filterResult: undefined },
          { label: 'Incidencias abiertas', value: 0, icon: 'ri-error-warning-line', color: 'amber', tooltip: '0 — El motor de incidencias aún no está implementado', filterView: 'incidents', filterIncidentStatus: 'OPEN' },
          { label: 'Transiciones bloqueadas', value: 0, icon: 'ri-forbid-line', color: 'red', tooltip: '0 — El motor de reglas aún no está conectado', filterResult: 'BLOCK' },
          { label: 'Overrides realizados', value: 0, icon: 'ri-shield-flash-line', color: 'violet', tooltip: '0 — El motor de reglas aún no está conectado', filterResult: 'BLOCK' },
          { label: 'Tiempo promedio resolución', value: 0, icon: 'ri-timer-line', color: 'cyan', tooltip: '0 min — El motor de incidencias aún no está implementado', format: 'duration' },
        ],
      };

      return summary;
    } catch (err: any) {
      console.error('[Compliance] Error loading real summary, falling back to demo:', err?.message);
      return { ...demoSummary, dataSource: 'demo', dataLoadError: true };
    }
  }

  /**
   * Obtener reservas con paginación.
   * MODO HÍBRIDO: datos operativos reales + compliance NO evaluado (NOT_EVALUATED).
   */
  async getEvaluatedReservations(
    orgId: string,
    filters: ComplianceFilters
  ): Promise<{ data: ComplianceReservation[]; total: number; page: number; pageSize: number; totalPages: number }> {
    if (INOUT_COMPLIANCE_DEMO_MODE && !orgId) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const filtered = filterReservations(demoReservations, filters);
      return paginateResults(filtered, filters.page, filters.pageSize);
    }

    try {
      const from = (filters.page - 1) * filters.pageSize;
      const to = from + filters.pageSize - 1;

      // ── Mismo rango de fechas que getComplianceSummary: 30 días ──
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const dateFrom = filters.dateFrom || thirtyDaysAgo.toISOString();
      const dateTo = filters.dateTo || now.toISOString();

      let query = supabase
        .from('reservations')
        .select('id, start_datetime, driver, truck_plate, dock_id, status_id, shipper_provider, client_id, updated_at, is_cancelled', { count: 'exact' })
        .eq('org_id', orgId)
        .eq('is_cancelled', false)
        .gte('start_datetime', dateFrom)
        .lte('start_datetime', dateTo)
        .order('start_datetime', { ascending: false })
        .range(from, to);

      const { data: reservations, error: resErr, count } = await query;

      if (resErr) throw resErr;
      if (!reservations || reservations.length === 0) {
        return { data: [], total: 0, page: filters.page, pageSize: filters.pageSize, totalPages: 1 };
      }

      // Recolectar IDs para batch queries
      const dockIds = [...new Set(reservations.map((r: any) => r.dock_id as string).filter(Boolean))];
      const statusIds = [...new Set(reservations.map((r: any) => r.status_id as string).filter(Boolean))];
      const clientIds = [...new Set(reservations.map((r: any) => r.client_id as string).filter(Boolean))];
      const spValues = reservations.map((r: any) => r.shipper_provider as string).filter(Boolean);
      const uuidProviderIds = [...new Set(spValues.filter(isUUID))];

      // Cargar datos relacionados en paralelo
      const [docksResult, statusesResult, clientsResult, providersResult] = await Promise.all([
        dockIds.length > 0
          ? supabase.from('docks').select('id, name, warehouse_id').in('id', dockIds)
          : { data: [] },
        statusIds.length > 0
          ? supabase.from('reservation_statuses').select('id, name, code, color').eq('is_active', true).in('id', statusIds)
          : { data: [] },
        clientIds.length > 0
          ? supabase.from('clients').select('id, name').in('id', clientIds)
          : { data: [] },
        uuidProviderIds.length > 0
          ? supabase.from('providers').select('id, name').in('id', uuidProviderIds)
          : { data: [] },
      ]);

      // Índices
      const docksMap = new Map<string, { name: string; warehouse_id: string | null }>();
      (docksResult.data ?? []).forEach((d: any) => docksMap.set(d.id, { name: d.name, warehouse_id: d.warehouse_id ?? null }));

      const statusesMap = new Map<string, { name: string; code: string; color: string }>();
      (statusesResult.data ?? []).forEach((s: any) => statusesMap.set(s.id, { name: s.name, code: s.code, color: s.color }));

      const clientsMap = new Map<string, string>();
      (clientsResult.data ?? []).forEach((c: any) => clientsMap.set(c.id, c.name));

      const providersMap = new Map<string, string>();
      (providersResult.data ?? []).forEach((p: any) => providersMap.set(p.id, p.name));

      // Cargar warehouses
      const warehouseIds = [...new Set([...docksMap.values()].map((d) => d.warehouse_id).filter(Boolean))];
      let warehousesMap = new Map<string, string>();
      if (warehouseIds.length > 0) {
        const { data: whData } = await supabase.from('warehouses').select('id, name').in('id', warehouseIds);
        (whData ?? []).forEach((w: any) => warehousesMap.set(w.id, w.name));
      }

      // Mapear a ComplianceReservation — todas NOT_EVALUATED
      const mapped: ComplianceReservation[] = reservations.map((r: any) =>
        mapRealReservation(r, docksMap, statusesMap, clientsMap, providersMap, warehousesMap)
      );

      // Aplicar filtros de resultado (NOT_EVALUATED es el único resultado posible para reales)
      let filtered = mapped;
      if (filters.result) {
        filtered = filtered.filter((r) => r.result === filters.result);
      }
      if (filters.searchTerm.trim()) {
        const term = filters.searchTerm.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.id.toLowerCase().includes(term) ||
            (r.driver ?? '').toLowerCase().includes(term) ||
            (r.truckPlate ?? '').toLowerCase().includes(term) ||
            (r.providerName ?? '').toLowerCase().includes(term) ||
            (r.clientName ?? '').toLowerCase().includes(term)
        );
      }

      const total = count ?? filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));

      return { data: filtered, total, page: filters.page, pageSize: filters.pageSize, totalPages };
    } catch (err: any) {
      console.error('[Compliance] Error loading real reservations, falling back to demo:', err?.message);
      const filtered = filterReservations(demoReservations, filters);
      return paginateResults(filtered, filters.page, filters.pageSize);
    }
  }

  /**
   * Obtener detalle completo de una reserva para Compliance.
   * MODO HÍBRIDO: datos operativos reales + compliance NO evaluado + tabs demo.
   */
  async getComplianceReservationDetail(orgId: string, reservationId: string): Promise<ComplianceReservationDetail> {
    if (INOUT_COMPLIANCE_DEMO_MODE && !orgId) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return getDemoReservationDetail(reservationId);
    }

    try {
      const { data: r, error } = await supabase
        .from('reservations')
        .select('id, start_datetime, driver, truck_plate, dock_id, status_id, shipper_provider, client_id, updated_at, is_cancelled')
        .eq('id', reservationId)
        .eq('org_id', orgId)
        .maybeSingle();

      if (error || !r) {
        return getDemoReservationDetail(reservationId);
      }

      const dockId = r.dock_id as string | null;
      const statusId = r.status_id as string | null;
      const clientId = r.client_id as string | null;
      const sp = r.shipper_provider as string | null;

      // Cargar relaciones
      const [dockResult, statusResult, clientResult, providerResult] = await Promise.all([
        dockId ? supabase.from('docks').select('id, name, warehouse_id').eq('id', dockId).maybeSingle() : { data: null },
        statusId ? supabase.from('reservation_statuses').select('id, name, code, color').eq('id', statusId).eq('is_active', true).maybeSingle() : { data: null },
        clientId ? supabase.from('clients').select('id, name').eq('id', clientId).maybeSingle() : { data: null },
        (sp && isUUID(sp)) ? supabase.from('providers').select('id, name').eq('id', sp).maybeSingle() : { data: null },
      ]);

      const dock = dockResult.data as any;
      const status = statusResult.data as any;
      const client = clientResult.data as any;
      const provider = providerResult.data as any;

      const whId = dock?.warehouse_id ?? null;
      let whName: string | null = null;
      if (whId) {
        const { data: wh } = await supabase.from('warehouses').select('name').eq('id', whId).maybeSingle();
        whName = (wh as any)?.name ?? 'Warehouse no encontrado';
      }

      const startDate = r.start_datetime ? new Date(r.start_datetime) : null;

      const realReservation: ComplianceReservation = {
        id: r.id,
        reservationDate: startDate ? startDate.toISOString().split('T')[0] : '—',
        reservationTime: startDate ? startDate.toTimeString().slice(0, 5) : '—',
        clientName: client?.name ?? (clientId ? 'Cliente no encontrado' : null),
        clientId,
        providerName: sp
          ? (isUUID(sp) ? (provider?.name ?? 'Proveedor sin homologar') : sp)
          : null,
        driver: r.driver ?? null,
        truckPlate: r.truck_plate ?? null,
        dockId: dockId,
        dockName: dock?.name ?? (dockId ? 'Andén no encontrado' : 'Andén no asignado'),
        warehouseId: whId,
        warehouseName: whName,
        currentStatus: status?.code ?? (statusId ? 'Estado desconocido' : null),
        previousStatus: null,
        result: 'NOT_EVALUATED',
        severity: null,
        incidentCount: null,
        rulesApplied: null,
        rulesTotal: null,
        lastActivity: r.updated_at ?? r.start_datetime ?? new Date().toISOString(),
        decisiveRule: null,
        decisiveRuleName: null,
        warehouseResolution: {
          reservationId: r.id,
          dockId,
          dockName: dock?.name ?? (dockId ? 'Andén no encontrado' : null),
          resolvedWarehouseId: whId,
          warehouseName: whName,
          orgName: null,
          couldNotResolve: !whId,
        },
        isDemo: false,
        isRealData: true,
      };

      // Merge con datos demo para los tabs simulados
      const demoDetail = getDemoReservationDetail(reservationId);
      return {
        ...realReservation,
        execution: demoDetail.execution,
        evaluatedRules: demoDetail.evaluatedRules,
        incidents: demoDetail.incidents,
        timeline: demoDetail.timeline,
        auditLog: demoDetail.auditLog,
        technicalContext: demoDetail.technicalContext,
      };
    } catch (err: any) {
      console.error('[Compliance] Error loading real detail, falling back to demo:', err?.message);
      return getDemoReservationDetail(reservationId);
    }
  }

  /**
   * Obtener incidencias con paginación.
   * MODO DEMO: siempre simulado.
   */
  async getIncidents(
    _orgId: string,
    filters: ComplianceFilters
  ): Promise<{ data: ComplianceIncident[]; total: number; page: number; pageSize: number; totalPages: number }> {
    await new Promise((resolve) => setTimeout(resolve, 350));
    let filtered = [...demoIncidents];

    if (filters.incidentStatus) {
      filtered = filtered.filter((i) => i.status === filters.incidentStatus);
    }
    if (filters.severity) {
      filtered = filtered.filter((i) => i.severity === filters.severity);
    }
    if (filters.warehouseId) {
      filtered = filtered.filter((i) => i.warehouseId === filters.warehouseId);
    }
    if (filters.ruleCode) {
      filtered = filtered.filter((i) => i.ruleCode === filters.ruleCode);
    }
    if (filters.searchTerm.trim()) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.title.toLowerCase().includes(term) ||
          i.description.toLowerCase().includes(term) ||
          i.reservationId.toLowerCase().includes(term)
      );
    }

    return paginateResults(filtered, filters.page, filters.pageSize);
  }

  async getReservationTimeline(reservationId: string) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return getDemoReservationDetail(reservationId).timeline;
  }

  async getReservationAudit(reservationId: string) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return getDemoReservationDetail(reservationId).auditLog;
  }

  async getWarehouseResolution(reservationId: string) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return getDemoReservationDetail(reservationId).warehouseResolution;
  }
}

export const complianceService = new ComplianceService();