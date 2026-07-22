import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, startOfYear, endOfYear } from 'date-fns';

import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useActiveWarehouse } from '@/contexts/ActiveWarehouseContext';
import { useUserScope } from '@/hooks/useUserScope';
import { dashboardService, DashboardStats } from '@/services/dashboardService';
import { calendarService } from '@/services/calendarService';
import WarehousePageHeader from '@/components/feature/WarehousePageHeader';

import KPICard from './components/KPICard';
import PeriodSummary from './components/PeriodSummary';
import ProviderTypes from './components/ProviderTypes';
import TrendChart from './components/TrendChart';
import StatusDistribution from './components/StatusDistribution';
import ResourceGrid from './components/ResourceGrid';
import TopRanking from './components/TopRanking';
import PeakHours from './components/PeakHours';
import WarehousePerformance from './components/WarehousePerformance';
import QuickActions from './components/QuickActions';

type QuickPeriod = 'day' | 'week' | 'month' | 'year' | 'all';

interface DateRange {
  start: string;
  end: string;
}

const PRESETS: { label: string; value: QuickPeriod; icon: string }[] = [
  { label: 'Hoy', value: 'day', icon: 'ri-sun-line' },
  { label: 'Semana', value: 'week', icon: 'ri-calendar-schedule-line' },
  { label: 'Mes', value: 'month', icon: 'ri-calendar-2-line' },
  { label: 'Año', value: 'year', icon: 'ri-calendar-event-line' },
  { label: 'Todo', value: 'all', icon: 'ri-infinity-line' },
];

function getTodayRange(): DateRange {
  const today = format(new Date(), 'yyyy-MM-dd');
  return { start: today, end: today };
}

function getWeekRange(): DateRange {
  const now = new Date();
  return {
    start: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    end: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  };
}

function getMonthRange(): DateRange {
  const now = new Date();
  return {
    start: format(startOfMonth(now), 'yyyy-MM-dd'),
    end: format(endOfMonth(now), 'yyyy-MM-dd'),
  };
}

function getYearRange(): DateRange {
  const now = new Date();
  return {
    start: format(startOfYear(now), 'yyyy-MM-dd'),
    end: format(endOfYear(now), 'yyyy-MM-dd'),
  };
}

function getAllRange(): DateRange {
  return {
    start: '2020-01-01',
    end: format(new Date(), 'yyyy-MM-dd'),
  };
}

function getPresetRange(preset: QuickPeriod): DateRange {
  switch (preset) {
    case 'day': return getTodayRange();
    case 'week': return getWeekRange();
    case 'month': return getMonthRange();
    case 'year': return getYearRange();
    case 'all': return getAllRange();
  }
}

function isPresetActive(preset: QuickPeriod, range: DateRange): boolean {
  const presetRange = getPresetRange(preset);
  return range.start === presetRange.start && range.end === presetRange.end;
}

export default function Dashboard() {
  const { user, loading: authLoading, pendingAccess } = useAuth();
  const { orgId, loading: permissionsLoading } = usePermissions();
  const {
    activeWarehouseId,
    loading: warehouseLoading,
  } = useActiveWarehouse();
  const navigate = useNavigate();
  const { allowedWarehouseIds, allowedClientIds, scopeLoading } = useUserScope();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<QuickPeriod>('month');
  const [dateRange, setDateRange] = useState<DateRange>(getMonthRange());
  const [isCustom, setIsCustom] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!authLoading && user && pendingAccess) navigate('/access-pending');
  }, [authLoading, user, pendingAccess, navigate]);

  const loadDashboardData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const allowedDockIds = await calendarService.getVisibleDockIds(
        orgId,
        activeWarehouseId ?? null,
        allowedWarehouseIds,
        allowedClientIds
      );

      if (allowedDockIds.length === 0) {
        setStats(null);
        setLoading(false);
        return;
      }

      if (isCustom) {
        const data = await dashboardService.getStats(
          orgId,
          activeWarehouseId,
          'custom',
          allowedDockIds,
          { start: new Date(dateRange.start), end: new Date(dateRange.end) }
        );
        setStats(data);
      } else {
        const data = await dashboardService.getStats(
          orgId,
          activeWarehouseId,
          activePreset,
          allowedDockIds
        );
        setStats(data);
      }
    } catch {
      // silenced
    } finally {
      setLoading(false);
    }
  }, [orgId, activeWarehouseId, activePreset, isCustom, dateRange, allowedWarehouseIds, allowedClientIds]);

  useEffect(() => {
    if (orgId && !warehouseLoading && !scopeLoading) {
      loadDashboardData();
    }
  }, [orgId, activeWarehouseId, warehouseLoading, scopeLoading, activePreset, isCustom, dateRange]);

  const handlePresetClick = (preset: QuickPeriod) => {
    setActivePreset(preset);
    setIsCustom(false);
    setDateRange(getPresetRange(preset));
  };

  const handleRangeChange = (field: 'start' | 'end', value: string) => {
    const newRange = { ...dateRange, [field]: value };
    if (newRange.start && newRange.end && newRange.start > newRange.end) {
      newRange.end = newRange.start;
    }
    setDateRange(newRange);
    setIsCustom(true);
    const matchingPreset = PRESETS.find(p => isPresetActive(p.value, newRange));
    if (matchingPreset) {
      setIsCustom(false);
      setActivePreset(matchingPreset.value);
    }
  };

  if (authLoading || permissionsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No hay usuario autenticado</p>
          <button onClick={() => navigate('/login')} className="mt-4 bg-teal-600 text-white rounded-lg px-6 py-2 hover:bg-teal-700 transition-colors whitespace-nowrap cursor-pointer">
            Ir a Login
          </button>
        </div>
      </div>
    );
  }

  if (pendingAccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-time-line text-amber-600 text-2xl"></i>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Acceso Pendiente</h1>
          <p className="text-gray-600 text-sm">Tu cuenta está pendiente de asignación</p>
        </div>
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-building-line text-gray-400 text-2xl"></i>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Sin Organización</h1>
          <p className="text-gray-600 text-sm">No tienes una organización asignada</p>
        </div>
      </div>
    );
  }

  const periodLabel = stats ? stats.selectedPeriodLabel : 'Este mes';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-8 py-8">
        <div className="max-w-[1400px] mx-auto">

          {/* Header */}
          <WarehousePageHeader
            title="Dashboard"
            description="Resumen operativo de reservas y andenes"
          />

          {/* Filtros */}
          <div className="mb-8 flex flex-col gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Presets */}
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                {PRESETS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => handlePresetClick(p.value)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
                      !isCustom && activePreset === p.value
                        ? 'bg-teal-500 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <i className={`${p.icon} w-4 h-4 flex items-center justify-center`}></i>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Rango de fechas */}
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <div className="relative">
                  <i className="ri-calendar-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 flex items-center justify-center"></i>
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={e => handleRangeChange('start', e.target.value)}
                    className="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent cursor-pointer min-w-[140px]"
                  />
                </div>
                <span className="text-gray-400 text-sm">–</span>
                <div className="relative">
                  <i className="ri-calendar-check-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 flex items-center justify-center"></i>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={e => handleRangeChange('end', e.target.value)}
                    className="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-transparent cursor-pointer min-w-[140px]"
                  />
                </div>
              </div>

              <button
                onClick={loadDashboardData}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer disabled:opacity-50 ml-auto shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''} w-4 h-4 flex items-center justify-center`}></i>
                Actualizar
              </button>
            </div>

            {/* Label del período activo */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                Período:
                <span className="font-semibold text-gray-900 ml-1">{periodLabel}</span>
              </span>
              {isCustom && (
                <span className="text-xs bg-teal-50 text-teal-700 px-2.5 py-0.5 rounded-full font-medium border border-teal-100">Rango personalizado</span>
              )}
            </div>
          </div>

          {loading && !stats ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : stats ? (
            <div className="space-y-4">
              {/* KPIs: Fila 1 */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  icon="ri-calendar-todo-line"
                  iconBg="#f0fdfa"
                  iconColor="text-teal-600"
                  value={stats.periodCount}
                  label="Reservas en período"
                  trend={stats.period === 'all' ? undefined : stats.vsLastPeriod}
                  trendLabel={stats.period === 'all' ? undefined : 'vs. per. ant.'}
                  delay={0}
                />
                <KPICard
                  icon="ri-time-line"
                  iconBg="#fffbeb"
                  iconColor="text-amber-600"
                  value={stats.pendingReservations}
                  label="Por confirmar"
                  badge="Pendientes"
                  badgeColor="#d97706"
                  badgeBg="#fef3c7"
                  delay={0.05}
                />
                <KPICard
                  icon="ri-checkbox-circle-line"
                  iconBg="#f0fdf4"
                  iconColor="text-emerald-600"
                  value={stats.confirmedReservations}
                  label="Confirmadas"
                  badge={`${stats.confirmationRate}%`}
                  badgeColor="#059669"
                  badgeBg="#d1fae5"
                  delay={0.1}
                />
                <KPICard
                  icon="ri-loader-4-line"
                  iconBg="#eef2ff"
                  iconColor="text-indigo-600"
                  value={stats.inProgressReservations}
                  label="En proceso"
                  badge="Activas"
                  badgeColor="#4f46e5"
                  badgeBg="#e0e7ff"
                  delay={0.15}
                />
              </div>

              {/* KPIs: Fila 2 */}
              <PeriodSummary
                todayCount={stats.todayCount}
                weekCount={stats.weekCount}
                monthCount={stats.monthCount}
                yearCount={stats.yearCount}
                activePreset={activePreset}
                delay={0.05}
              />

              {/* ProviderTypes + TrendChart */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-5">
                  <ProviderTypes
                    stats={stats.providerTypeStats}
                    periodLabel={periodLabel}
                    delay={0.1}
                  />
                </div>
                <div className="lg:col-span-7">
                  <TrendChart
                    data={stats.trendData}
                    periodLabel={periodLabel}
                    isCustom={isCustom}
                    delay={0.15}
                  />
                </div>
              </div>

              {/* Bottom complex row */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                <div className="lg:col-span-3">
                  <StatusDistribution
                    items={stats.statusDistribution}
                    totalReservations={stats.totalReservations}
                    delay={0.2}
                  />
                </div>
                <div className="lg:col-span-3">
                  <ResourceGrid
                    activeDocks={stats.activeDocks}
                    totalDocks={stats.totalDocks}
                    activeWarehouses={stats.activeWarehouses}
                    totalCollaborators={stats.totalCollaborators}
                    completionRate={stats.completionRate}
                    delay={0.25}
                  />
                </div>
                <div className="lg:col-span-3 flex flex-col gap-4">
                  <TopRanking
                    title="Top Proveedores"
                    subtitle={periodLabel}
                    items={stats.topProviders}
                    icon="ri-truck-line"
                    iconActiveBg="bg-teal-100"
                    iconActiveColor="text-teal-600"
                    delay={0.25}
                  />
                  <TopRanking
                    title="Andenes más Usados"
                    subtitle={periodLabel}
                    items={stats.topDocks}
                    icon="ri-truck-line"
                    iconActiveBg="bg-teal-100"
                    iconActiveColor="text-teal-600"
                    delay={0.3}
                  />
                </div>
                <div className="lg:col-span-3">
                  <PeakHours
                    hours={stats.peakHours}
                    periodLabel={periodLabel}
                    delay={0.3}
                  />
                </div>
              </div>

              {/* Rendimiento por Almacén */}
              <WarehousePerformance
                warehouses={stats.warehouseStats}
                periodLabel={periodLabel}
                delay={0.35}
              />

              {/* Acciones Rápidas */}
              <QuickActions delay={0.4} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}