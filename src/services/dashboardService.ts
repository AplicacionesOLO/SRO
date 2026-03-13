import { supabase } from '../lib/supabase';
import {
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  subMonths, subWeeks, subDays,
  format, eachDayOfInterval,
  startOfDay, endOfDay
} from 'date-fns';

export interface DashboardStats {
  totalReservations: number;
  pendingReservations: number;
  confirmedReservations: number;
  inProgressReservations: number;
  completedReservations: number;
  completionRate: number;
  confirmationRate: number;
  vsLastMonth: number;
  vsLastWeek: number;
  todayCount: number;
  weekCount: number;
  monthCount: number;
  activeDocks: number;
  totalDocks: number;
  activeWarehouses: number;
  totalCollaborators: number;
  topProviders: { name: string; count: number }[];
  topDocks: { name: string; count: number }[];
  peakHours: { hour: string; count: number }[];
  statusDistribution: { name: string; code: string; count: number; color: string }[];
  dailyTrend: { date: string; count: number }[];
  warehouseStats: { name: string; reservations: number; docks: number }[];
}

export const dashboardService = {
  async getStats(orgId: string): Promise<DashboardStats> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    // Semana actual (lunes a domingo)
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });

    // Mes actual
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);

    // Mes pasado
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    // Semana pasada
    const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

    // Últimos 7 días para tendencia (día -6 hasta hoy = exactamente 7 días)
    const trendStart = startOfDay(subDays(now, 6));
    const trendEnd = endOfDay(now);

    // ── Query 1: TODAS las reservas activas de la org (para distribución por estado) ──
    const { data: allOrgReservations } = await supabase
      .from('reservations')
      .select('id, status_id')
      .eq('org_id', orgId)
      .eq('is_cancelled', false);

    // ── Query 2: Reservas del mes actual (para KPIs y análisis temporales) ──
    const { data: monthReservations } = await supabase
      .from('reservations')
      .select('id, start_datetime, status_id, dock_id, shipper_provider')
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .gte('start_datetime', thisMonthStart.toISOString())
      .lte('start_datetime', thisMonthEnd.toISOString());

    // ── Query 3: Reservas semana actual (query independiente, no filtrada por mes) ──
    const { data: weekReservationsRaw } = await supabase
      .from('reservations')
      .select('id')
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .gte('start_datetime', thisWeekStart.toISOString())
      .lte('start_datetime', thisWeekEnd.toISOString());

    // ── Query 4: Reservas de hoy (query independiente) ────────────────────────
    const { data: todayReservationsRaw } = await supabase
      .from('reservations')
      .select('id')
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .gte('start_datetime', todayStart.toISOString())
      .lte('start_datetime', todayEnd.toISOString());

    // ── Query 5: Tendencia últimos 7 días (query independiente) ───────────────
    const { data: trendReservations } = await supabase
      .from('reservations')
      .select('id, start_datetime')
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .gte('start_datetime', trendStart.toISOString())
      .lte('start_datetime', trendEnd.toISOString());

    // ── Query 6: Mes pasado ───────────────────────────────────────────────────
    const { data: lastMonthReservations } = await supabase
      .from('reservations')
      .select('id')
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .gte('start_datetime', lastMonthStart.toISOString())
      .lte('start_datetime', lastMonthEnd.toISOString());

    // ── Query 7: Semana pasada ────────────────────────────────────────────────
    const { data: lastWeekReservations } = await supabase
      .from('reservations')
      .select('id')
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .gte('start_datetime', lastWeekStart.toISOString())
      .lte('start_datetime', lastWeekEnd.toISOString());

    // ── Catálogos ─────────────────────────────────────────────────────────────
    // ✅ FIX: Traer solo estados activos, ordenados por order_index
    const { data: statuses } = await supabase
      .from('reservation_statuses')
      .select('id, name, code, color, order_index')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('order_index', { ascending: true, nullsLast: true })
      .order('name', { ascending: true });

    const { data: docks } = await supabase
      .from('docks')
      .select('id, name, is_active, warehouse_id')
      .eq('org_id', orgId);

    const { data: warehouses } = await supabase
      .from('warehouses')
      .select('id, name')
      .eq('org_id', orgId);

    const { data: collaborators } = await supabase
      .from('collaborators')
      .select('id')
      .eq('org_id', orgId)
      .eq('is_active', true);

    const { data: providers } = await supabase
      .from('providers')
      .select('id, name')
      .eq('org_id', orgId);

    // ── Normalización ─────────────────────────────────────────────────────────
    const allReservations = monthReservations || [];
    const allOrgReservationsData = allOrgReservations || [];
    const providerMap = new Map(providers?.map(p => [p.id, p.name]) || []);

    // ── Conteo por estado: usar TODAS las reservas de la org (no solo del mes) ──
    const statusCounts: Record<string, number> = {};
    allOrgReservationsData.forEach(r => {
      if (r.status_id) {
        statusCounts[r.status_id] = (statusCounts[r.status_id] || 0) + 1;
      }
    });

    // ✅ FIX: Incluir TODOS los estados activos, incluso con 0 reservas
    // Ya viene ordenado por order_index desde la query
    const statusDistribution = (statuses || []).map(s => ({
      name: s.name,
      code: s.code,
      count: statusCounts[s.id] || 0,
      color: s.color
    }));

    // Suma real de reservas con estado asignado (para porcentajes correctos)
    const totalWithStatus = statusDistribution.reduce((acc, s) => acc + s.count, 0);

    // Buscar estados por código de forma case-insensitive
    const findByCode = (code: string) =>
      statusDistribution.find(s => s.code?.toUpperCase() === code.toUpperCase())?.count || 0;

    const pendingCount = findByCode('PENDING');
    const confirmedCount = findByCode('CONFIRMED');
    const inProgressCount = findByCode('IN_PROGRESS');
    const completedCount = findByCode('DONE');

    // ── Top proveedores ───────────────────────────────────────────────────────
    const providerCounts: Record<string, number> = {};
    allReservations.forEach(r => {
      if (r.shipper_provider) {
        const providerName = providerMap.get(r.shipper_provider) || r.shipper_provider;
        providerCounts[providerName] = (providerCounts[providerName] || 0) + 1;
      }
    });
    const topProviders = Object.entries(providerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // ── Top andenes ───────────────────────────────────────────────────────────
    const dockCounts: Record<string, number> = {};
    allReservations.forEach(r => {
      if (r.dock_id) {
        dockCounts[r.dock_id] = (dockCounts[r.dock_id] || 0) + 1;
      }
    });
    const dockMap = new Map(docks?.map(d => [d.id, d.name]) || []);
    const topDocks = Object.entries(dockCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ name: dockMap.get(id) || 'Desconocido', count }));

    // ── Horas pico ────────────────────────────────────────────────────────────
    const hourCounts: Record<string, number> = {};
    allReservations.forEach(r => {
      const hour = format(new Date(r.start_datetime), 'HH:00');
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const peakHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hour, count]) => ({ hour, count }));

    // ── Tendencia diaria: exactamente 7 días (día -6 hasta hoy) ──────────────
    const last7Days = eachDayOfInterval({ start: trendStart, end: todayStart });
    const trendData = trendReservations || [];
    const dailyTrend = last7Days.map(day => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);
      const count = trendData.filter(r => {
        const date = new Date(r.start_datetime);
        return date >= dayStart && date <= dayEnd;
      }).length;
      return { date: format(day, 'dd/MM'), count };
    });

    // ── Stats por almacén ─────────────────────────────────────────────────────
    // Ocupación = reservas del almacén / total andenes del almacén (si hay andenes)
    // Se muestra relativo al almacén con más reservas para la barra visual,
    // pero el % que se muestra en pantalla es calculado en el componente.
    const warehouseStats = (warehouses || [])
      .map(w => {
        const warehouseDocks = docks?.filter(d => d.warehouse_id === w.id) || [];
        const warehouseDockIds = new Set(warehouseDocks.map(d => d.id));
        const warehouseReservations = allReservations.filter(r =>
          r.dock_id && warehouseDockIds.has(r.dock_id)
        );
        return {
          name: w.name,
          reservations: warehouseReservations.length,
          docks: warehouseDocks.length
        };
      })
      .sort((a, b) => b.reservations - a.reservations);

    // ── Comparativas ─────────────────────────────────────────────────────────
    const lastMonthCount = lastMonthReservations?.length || 0;
    const lastWeekCount = lastWeekReservations?.length || 0;
    const thisWeekCount = weekReservationsRaw?.length || 0;

    const vsLastMonth = lastMonthCount > 0
      ? Math.round(((allReservations.length - lastMonthCount) / lastMonthCount) * 100)
      : allReservations.length > 0 ? 100 : 0;

    const vsLastWeek = lastWeekCount > 0
      ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
      : thisWeekCount > 0 ? 100 : 0;

    // ── Tasas ─────────────────────────────────────────────────────────────────
    // completionRate: % de reservas finalizadas sobre el total con estado
    const completionRate = totalWithStatus > 0
      ? Math.round((completedCount / totalWithStatus) * 100)
      : 0;

    // confirmationRate: % de reservas confirmadas (solo CONFIRMED) sobre total con estado
    const confirmationRate = totalWithStatus > 0
      ? Math.round((confirmedCount / totalWithStatus) * 100)
      : 0;

    return {
      totalReservations: allOrgReservationsData.length,
      pendingReservations: pendingCount,
      confirmedReservations: confirmedCount,
      inProgressReservations: inProgressCount,
      completedReservations: completedCount,
      completionRate,
      confirmationRate,
      vsLastMonth,
      vsLastMonth,
      vsLastWeek,
      todayCount: todayReservationsRaw?.length || 0,
      weekCount: thisWeekCount,
      monthCount: allReservations.length,
      activeDocks: docks?.filter(d => d.is_active).length || 0,
      totalDocks: docks?.length || 0,
      activeWarehouses: warehouses?.length || 0,
      totalCollaborators: collaborators?.length || 0,
      topProviders,
      topDocks,
      peakHours,
      statusDistribution,
      dailyTrend,
      warehouseStats
    };
  }
};