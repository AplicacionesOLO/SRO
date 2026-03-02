import { supabase } from '../lib/supabase';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, subWeeks, format, eachDayOfInterval, startOfDay, endOfDay } from 'date-fns';

export interface DashboardStats {
  // KPIs principales
  totalReservations: number;
  pendingReservations: number;
  confirmedReservations: number;
  inProgressReservations: number;
  completedReservations: number;
  
  // Tasas
  completionRate: number;
  confirmationRate: number;
  
  // Comparativas
  vsLastMonth: number;
  vsLastWeek: number;
  
  // Por período
  todayCount: number;
  weekCount: number;
  monthCount: number;
  
  // Operacionales
  activeDocks: number;
  totalDocks: number;
  activeWarehouses: number;
  totalCollaborators: number;
  
  // Top datos
  topProviders: { name: string; count: number }[];
  topDocks: { name: string; count: number }[];
  peakHours: { hour: string; count: number }[];
  
  // Distribución por estado
  statusDistribution: { name: string; code: string; count: number; color: string }[];
  
  // Tendencia diaria (últimos 7 días)
  dailyTrend: { date: string; count: number }[];
  
  // Por almacén
  warehouseStats: { name: string; reservations: number; docks: number }[];
}

export const dashboardService = {
  async getStats(orgId: string): Promise<DashboardStats> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));
    const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

    // Obtener todas las reservas del mes actual
    const { data: reservations } = await supabase
      .from('reservations')
      .select(`
        id,
        start_datetime,
        end_datetime,
        status_id,
        dock_id,
        shipper_provider,
        is_cancelled,
        created_at
      `)
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .gte('start_datetime', thisMonthStart.toISOString())
      .lte('start_datetime', thisMonthEnd.toISOString());

    // Reservas del mes pasado para comparación
    const { data: lastMonthReservations } = await supabase
      .from('reservations')
      .select('id')
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .gte('start_datetime', lastMonthStart.toISOString())
      .lte('start_datetime', lastMonthEnd.toISOString());

    // Reservas de la semana pasada
    const { data: lastWeekReservations } = await supabase
      .from('reservations')
      .select('id')
      .eq('org_id', orgId)
      .eq('is_cancelled', false)
      .gte('start_datetime', lastWeekStart.toISOString())
      .lte('start_datetime', lastWeekEnd.toISOString());

    // Estados de reservación
    const { data: statuses } = await supabase
      .from('reservation_statuses')
      .select('id, name, code, color')
      .eq('org_id', orgId);

    // Andenes
    const { data: docks } = await supabase
      .from('docks')
      .select('id, name, is_active, warehouse_id')
      .eq('org_id', orgId);

    // Almacenes
    const { data: warehouses } = await supabase
      .from('warehouses')
      .select('id, name')
      .eq('org_id', orgId);

    // Colaboradores
    const { data: collaborators } = await supabase
      .from('collaborators')
      .select('id')
      .eq('org_id', orgId)
      .eq('is_active', true);

    // Obtener proveedores
    const { data: providers } = await supabase
      .from('providers')
      .select('id, name')
      .eq('org_id', orgId);

    const allReservations = reservations || [];
    const statusMap = new Map(statuses?.map(s => [s.id, s]) || []);
    const providerMap = new Map(providers?.map(p => [p.id, p.name]) || []);

    // Filtrar por período
    const todayReservations = allReservations.filter(r => {
      const date = new Date(r.start_datetime);
      return date >= todayStart && date <= todayEnd;
    });

    const weekReservations = allReservations.filter(r => {
      const date = new Date(r.start_datetime);
      return date >= thisWeekStart && date <= thisWeekEnd;
    });

    // Contar por estado
    const statusCounts: Record<string, number> = {};
    allReservations.forEach(r => {
      if (r.status_id) {
        statusCounts[r.status_id] = (statusCounts[r.status_id] || 0) + 1;
      }
    });

    // Distribución por estado
    const statusDistribution = (statuses || []).map(s => ({
      name: s.name,
      code: s.code,
      count: statusCounts[s.id] || 0,
      color: s.color
    })).sort((a, b) => b.count - a.count);

    // Contar por código de estado
    const pendingCount = statusDistribution.find(s => s.code === 'PENDING')?.count || 0;
    const confirmedCount = statusDistribution.find(s => s.code === 'CONFIRMED')?.count || 0;
    const inProgressCount = statusDistribution.find(s => s.code === 'IN_PROGRESS')?.count || 0;
    const completedCount = statusDistribution.find(s => s.code === 'DONE')?.count || 0;

    // Top proveedores - Resolver nombres
    const providerCounts: Record<string, number> = {};
    allReservations.forEach(r => {
      if (r.shipper_provider) {
        // Si es un UUID, buscar el nombre en el mapa
        const providerName = providerMap.get(r.shipper_provider) || r.shipper_provider;
        providerCounts[providerName] = (providerCounts[providerName] || 0) + 1;
      }
    });
    const topProviders = Object.entries(providerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Top andenes
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

    // Horas pico
    const hourCounts: Record<string, number> = {};
    allReservations.forEach(r => {
      const hour = format(new Date(r.start_datetime), 'HH:00');
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const peakHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hour, count]) => ({ hour, count }));

    // Tendencia diaria (últimos 7 días)
    const last7Days = eachDayOfInterval({
      start: subWeeks(now, 1),
      end: now
    });
    const dailyTrend = last7Days.map(day => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);
      const count = allReservations.filter(r => {
        const date = new Date(r.start_datetime);
        return date >= dayStart && date <= dayEnd;
      }).length;
      return {
        date: format(day, 'dd/MM'),
        count
      };
    });

    // Stats por almacén
    const warehouseStats = (warehouses || []).map(w => {
      const warehouseDocks = docks?.filter(d => d.warehouse_id === w.id) || [];
      const warehouseDockIds = warehouseDocks.map(d => d.id);
      const warehouseReservations = allReservations.filter(r => warehouseDockIds.includes(r.dock_id));
      return {
        name: w.name,
        reservations: warehouseReservations.length,
        docks: warehouseDocks.length
      };
    }).sort((a, b) => b.reservations - a.reservations);

    // Calcular comparativas
    const lastMonthCount = lastMonthReservations?.length || 0;
    const lastWeekCount = lastWeekReservations?.length || 0;
    const vsLastMonth = lastMonthCount > 0 
      ? Math.round(((allReservations.length - lastMonthCount) / lastMonthCount) * 100)
      : 0;
    const vsLastWeek = lastWeekCount > 0
      ? Math.round(((weekReservations.length - lastWeekCount) / lastWeekCount) * 100)
      : 0;

    // Tasas
    const totalWithStatus = allReservations.filter(r => r.status_id).length;
    const completionRate = totalWithStatus > 0 
      ? Math.round((completedCount / totalWithStatus) * 100)
      : 0;
    const confirmationRate = totalWithStatus > 0
      ? Math.round(((confirmedCount + completedCount + inProgressCount) / totalWithStatus) * 100)
      : 0;

    return {
      totalReservations: allReservations.length,
      pendingReservations: pendingCount,
      confirmedReservations: confirmedCount,
      inProgressReservations: inProgressCount,
      completedReservations: completedCount,
      completionRate,
      confirmationRate,
      vsLastMonth,
      vsLastWeek,
      todayCount: todayReservations.length,
      weekCount: weekReservations.length,
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
