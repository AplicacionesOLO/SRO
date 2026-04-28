import { supabase } from '../lib/supabase';
import {
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  subMonths, subWeeks, subDays,
  format, eachDayOfInterval,
  startOfDay, endOfDay,
  startOfYear, endOfYear, subYears,
  eachWeekOfInterval, eachMonthOfInterval,
} from 'date-fns';

export type DashboardPeriod = 'day' | 'week' | 'month' | 'year' | 'all';

export interface ProviderTypeStats {
  nacional: number;
  importado: number;
  total: number;
  nacionalPct: number;
  importadoPct: number;
}

export interface DashboardStats {
  totalReservations: number;
  pendingReservations: number;
  confirmedReservations: number;
  inProgressReservations: number;
  completedReservations: number;
  completionRate: number;
  confirmationRate: number;
  vsLastPeriod: number;
  vsLastWeek: number;
  todayCount: number;
  weekCount: number;
  monthCount: number;
  periodCount: number;
  activeDocks: number;
  totalDocks: number;
  activeWarehouses: number;
  totalCollaborators: number;
  topProviders: { name: string; count: number }[];
  topDocks: { name: string; count: number }[];
  peakHours: { hour: string; count: number }[];
  statusDistribution: { name: string; code: string; count: number; color: string }[];
  trendData: { label: string; count: number }[];
  warehouseStats: { name: string; reservations: number; docks: number }[];
  providerTypeStats: ProviderTypeStats;
  period: DashboardPeriod;
}

function getPeriodRange(period: DashboardPeriod, now: Date): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  switch (period) {
    case 'day': {
      const start = startOfDay(now);
      const end = endOfDay(now);
      const prevStart = startOfDay(subDays(now, 1));
      const prevEnd = endOfDay(subDays(now, 1));
      return { start, end, prevStart, prevEnd };
    }
    case 'week': {
      const start = startOfWeek(now, { weekStartsOn: 1 });
      const end = endOfWeek(now, { weekStartsOn: 1 });
      const prevStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      const prevEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      return { start, end, prevStart, prevEnd };
    }
    case 'month': {
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      const prevStart = startOfMonth(subMonths(now, 1));
      const prevEnd = endOfMonth(subMonths(now, 1));
      return { start, end, prevStart, prevEnd };
    }
    case 'year': {
      const start = startOfYear(now);
      const end = endOfYear(now);
      const prevStart = startOfYear(subYears(now, 1));
      const prevEnd = endOfYear(subYears(now, 1));
      return { start, end, prevStart, prevEnd };
    }
    case 'all':
    default: {
      const start = new Date('2000-01-01');
      const end = endOfDay(now);
      const prevStart = new Date('2000-01-01');
      const prevEnd = endOfDay(now);
      return { start, end, prevStart, prevEnd };
    }
  }
}

function buildTrendData(
  period: DashboardPeriod,
  reservations: { start_datetime: string }[],
  rangeStart: Date,
  rangeEnd: Date
): { label: string; count: number }[] {
  if (period === 'day') {
    // Agrupar por hora
    const hours: Record<string, number> = {};
    for (let h = 0; h < 24; h++) {
      const key = `${String(h).padStart(2, '0')}:00`;
      hours[key] = 0;
    }
    reservations.forEach(r => {
      const d = new Date(r.start_datetime);
      const key = `${String(d.getHours()).padStart(2, '0')}:00`;
      if (key in hours) hours[key]++;
    });
    return Object.entries(hours).map(([label, count]) => ({ label, count }));
  }

  if (period === 'week') {
    // Agrupar por día de la semana
    const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
    return days.map(day => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);
      const count = reservations.filter(r => {
        const d = new Date(r.start_datetime);
        return d >= dayStart && d <= dayEnd;
      }).length;
      return { label: format(day, 'EEE dd/MM'), count };
    });
  }

  if (period === 'month') {
    // Agrupar por día del mes
    const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
    return days.map(day => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);
      const count = reservations.filter(r => {
        const d = new Date(r.start_datetime);
        return d >= dayStart && d <= dayEnd;
      }).length;
      return { label: format(day, 'dd'), count };
    });
  }

  if (period === 'year') {
    // Agrupar por mes
    const months = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });
    return months.map(month => {
      const mStart = startOfMonth(month);
      const mEnd = endOfMonth(month);
      const count = reservations.filter(r => {
        const d = new Date(r.start_datetime);
        return d >= mStart && d <= mEnd;
      }).length;
      return { label: format(month, 'MMM'), count };
    });
  }

  // all: agrupar por mes
  const months = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });
  return months.map(month => {
    const mStart = startOfMonth(month);
    const mEnd = endOfMonth(month);
    const count = reservations.filter(r => {
      const d = new Date(r.start_datetime);
      return d >= mStart && d <= mEnd;
    }).length;
    return { label: format(month, 'MMM yy'), count };
  });
}

async function getDockIds(orgId: string, warehouseId?: string | null): Promise<string[] | null> {
  if (!warehouseId) return null;
  const { data: whDocks } = await supabase
    .from('docks')
    .select('id')
    .eq('org_id', orgId)
    .eq('warehouse_id', warehouseId);
  return (whDocks ?? []).map((d: any) => d.id);
}

function applyDockFilter(query: any, dockIds: string[] | null) {
  if (dockIds === null) return query;
  if (dockIds.length === 0) return query.in('dock_id', ['__NO_DOCKS__']);
  return query.in('dock_id', dockIds);
}

export const dashboardService = {
  async getStats(
    orgId: string,
    warehouseId?: string | null,
    period: DashboardPeriod = 'month'
  ): Promise<DashboardStats> {
    const now = new Date();
    const { start: periodStart, end: periodEnd, prevStart, prevEnd } = getPeriodRange(period, now);

    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);

    // Obtener dock IDs una sola vez
    const dockIds = await getDockIds(orgId, warehouseId);

    // ── Query 1: Reservas del período seleccionado ──────────────────────────
    let periodQuery = supabase
      .from('reservations')
      .select('id, start_datetime, status_id, dock_id, shipper_provider, is_imported')
      .eq('org_id', orgId)
      .eq('is_cancelled', false);

    if (period !== 'all') {
      periodQuery = periodQuery
        .gte('start_datetime', periodStart.toISOString())
        .lte('start_datetime', periodEnd.toISOString());
    }
    periodQuery = applyDockFilter(periodQuery, dockIds);
    const { data: periodReservations } = await periodQuery;

    // ── Query 2: Período anterior (para comparativa) ────────────────────────
    let prevQuery = supabase
      .from('reservations')
      .select('id, dock_id')
      .eq('org_id', orgId)
      .eq('is_cancelled', false);

    if (period !== 'all') {
      prevQuery = prevQuery
        .gte('start_datetime', prevStart.toISOString())
        .lte('start_datetime', prevEnd.toISOString());
    }
    prevQuery = applyDockFilter(prevQuery, dockIds);
    const { data: prevReservations } = await prevQuery;

    // ── Query 3: Reservas del período para distribución por estado ──────────
    // Nota: usamos periodData para que la distribución respete el filtro de período.
    // allReservations se mantiene solo para totalReservations (conteo global sin filtro de fecha).
    let allQuery = supabase
      .from('reservations')
      .select('id, status_id, dock_id')
      .eq('org_id', orgId)
      .eq('is_cancelled', false);
    allQuery = applyDockFilter(allQuery, dockIds);
    const { data: allReservations } = await allQuery;

    // ── Query 4: Hoy ────────────────────────────────────────────────────────
    let todayQuery = supabase
      .from('reservations')
      .select('id, dock_id')
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .gte('start_datetime', todayStart.toISOString())
      .lte('start_datetime', todayEnd.toISOString());
    todayQuery = applyDockFilter(todayQuery, dockIds);
    const { data: todayReservations } = await todayQuery;

    // ── Query 5: Semana actual ──────────────────────────────────────────────
    let weekQuery = supabase
      .from('reservations')
      .select('id, dock_id')
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .gte('start_datetime', thisWeekStart.toISOString())
      .lte('start_datetime', thisWeekEnd.toISOString());
    weekQuery = applyDockFilter(weekQuery, dockIds);
    const { data: weekReservations } = await weekQuery;

    // ── Query 6: Mes actual ─────────────────────────────────────────────────
    let monthQuery = supabase
      .from('reservations')
      .select('id, dock_id')
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .gte('start_datetime', thisMonthStart.toISOString())
      .lte('start_datetime', thisMonthEnd.toISOString());
    monthQuery = applyDockFilter(monthQuery, dockIds);
    const { data: monthReservations } = await monthQuery;

    // ── Catálogos ─────────────────────────────────────────────────────────────
    const { data: statuses } = await supabase
      .from('reservation_statuses')
      .select('id, name, code, color, order_index')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('order_index', { ascending: true, nullsLast: true })
      .order('name', { ascending: true });

    let docksQuery = supabase
      .from('docks')
      .select('id, name, is_active, warehouse_id')
      .eq('org_id', orgId);
    if (warehouseId) docksQuery = docksQuery.eq('warehouse_id', warehouseId);
    const { data: docks } = await docksQuery;

    let warehousesQuery = supabase
      .from('warehouses')
      .select('id, name')
      .eq('org_id', orgId);
    if (warehouseId) warehousesQuery = warehousesQuery.eq('id', warehouseId);
    const { data: warehouses } = await warehousesQuery;

    const { data: providers } = await supabase
      .from('providers')
      .select('id, name')
      .eq('org_id', orgId);

    // ── Colaboradores ─────────────────────────────────────────────────────────
    let collaboratorsCount = 0;
    if (warehouseId) {
      const { data: cwLinks } = await supabase
        .from('collaborator_warehouses')
        .select('collaborator_id')
        .eq('org_id', orgId)
        .eq('warehouse_id', warehouseId);
      const collabIds = (cwLinks ?? []).map((l: any) => l.collaborator_id);
      if (collabIds.length > 0) {
        const { data: collabs } = await supabase
          .from('collaborators')
          .select('id')
          .eq('org_id', orgId)
          .eq('is_active', true)
          .in('id', collabIds);
        collaboratorsCount = collabs?.length || 0;
      }
    } else {
      const { data: collabs } = await supabase
        .from('collaborators')
        .select('id')
        .eq('org_id', orgId)
        .eq('is_active', true);
      collaboratorsCount = collabs?.length || 0;
    }

    // ── Normalización ─────────────────────────────────────────────────────────
    const periodData = periodReservations || [];
    const allData = allReservations || [];
    const providerMap = new Map(providers?.map(p => [p.id, p.name]) || []);

    // Distribución por estado (sobre las reservas del período seleccionado)
    const statusCounts: Record<string, number> = {};
    periodData.forEach(r => {
      if (r.status_id) {
        statusCounts[r.status_id] = (statusCounts[r.status_id] || 0) + 1;
      }
    });

    const statusDistribution = (statuses || []).map(s => ({
      name: s.name,
      code: s.code,
      count: statusCounts[s.id] || 0,
      color: s.color
    }));

    const totalWithStatus = statusDistribution.reduce((acc, s) => acc + s.count, 0);
    const findByCode = (code: string) =>
      statusDistribution.find(s => s.code?.toUpperCase() === code.toUpperCase())?.count || 0;

    const pendingCount = findByCode('PENDING');
    const confirmedCount = findByCode('CONFIRMED');
    const inProgressCount = findByCode('IN_PROGRESS');
    const completedCount = findByCode('DONE');

    // ── Top proveedores (del período) ─────────────────────────────────────────
    const providerCounts: Record<string, number> = {};
    periodData.forEach(r => {
      if (r.shipper_provider) {
        const name = providerMap.get(r.shipper_provider) || r.shipper_provider;
        providerCounts[name] = (providerCounts[name] || 0) + 1;
      }
    });
    const topProviders = Object.entries(providerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // ── Top andenes (del período) ─────────────────────────────────────────────
    const dockCounts: Record<string, number> = {};
    periodData.forEach(r => {
      if (r.dock_id) dockCounts[r.dock_id] = (dockCounts[r.dock_id] || 0) + 1;
    });
    const dockMap = new Map(docks?.map(d => [d.id, d.name]) || []);
    const topDocks = Object.entries(dockCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ name: dockMap.get(id) || 'Desconocido', count }));

    // ── Horas pico (del período) ──────────────────────────────────────────────
    const hourCounts: Record<string, number> = {};
    periodData.forEach(r => {
      const hour = format(new Date(r.start_datetime), 'HH:00');
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const peakHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hour, count]) => ({ hour, count }));

    // ── Tendencia (del período) ───────────────────────────────────────────────
    const trendData = buildTrendData(period, periodData, periodStart, periodEnd);

    // ── Stats por almacén (del período) ──────────────────────────────────────
    const warehouseStats = (warehouses || [])
      .map(w => {
        const warehouseDocks = docks?.filter(d => d.warehouse_id === w.id) || [];
        const warehouseDockIds = new Set(warehouseDocks.map(d => d.id));
        const warehouseReservations = periodData.filter(r =>
          r.dock_id && warehouseDockIds.has(r.dock_id)
        );
        return {
          name: w.name,
          reservations: warehouseReservations.length,
          docks: warehouseDocks.length
        };
      })
      .sort((a, b) => b.reservations - a.reservations);

    // ── Comparativa vs período anterior ──────────────────────────────────────
    const prevCount = prevReservations?.length || 0;
    const vsLastPeriod = period === 'all'
      ? 0
      : prevCount > 0
        ? Math.round(((periodData.length - prevCount) / prevCount) * 100)
        : periodData.length > 0 ? 100 : 0;

    const lastWeekCount = 0; // legacy, no usado
    const vsLastWeek = 0;    // legacy, no usado

    // ── Tasas ─────────────────────────────────────────────────────────────────
    const completionRate = totalWithStatus > 0
      ? Math.round((completedCount / totalWithStatus) * 100)
      : 0;
    const confirmationRate = totalWithStatus > 0
      ? Math.round((confirmedCount / totalWithStatus) * 100)
      : 0;

    // ── Nacional vs Importado (del período) ──────────────────────────────────
    const importadoCount = periodData.filter(r => r.is_imported === true).length;
    const nacionalCount = periodData.filter(r => r.is_imported === false || r.is_imported === null).length;
    const providerTypeTotal = importadoCount + nacionalCount;
    const providerTypeStats: ProviderTypeStats = {
      nacional: nacionalCount,
      importado: importadoCount,
      total: providerTypeTotal,
      nacionalPct: providerTypeTotal > 0 ? Math.round((nacionalCount / providerTypeTotal) * 100) : 0,
      importadoPct: providerTypeTotal > 0 ? Math.round((importadoCount / providerTypeTotal) * 100) : 0,
    };

    return {
      totalReservations: periodData.length,
      pendingReservations: pendingCount,
      confirmedReservations: confirmedCount,
      inProgressReservations: inProgressCount,
      completedReservations: completedCount,
      completionRate,
      confirmationRate,
      vsLastPeriod,
      vsLastWeek,
      todayCount: todayReservations?.length || 0,
      weekCount: weekReservations?.length || 0,
      monthCount: monthReservations?.length || 0,
      periodCount: periodData.length,
      activeDocks: docks?.filter(d => d.is_active).length || 0,
      totalDocks: docks?.length || 0,
      activeWarehouses: warehouses?.length || 0,
      totalCollaborators: collaboratorsCount,
      topProviders,
      topDocks,
      peakHours,
      statusDistribution,
      trendData,
      warehouseStats,
      providerTypeStats,
      period,
    };
  }
};
