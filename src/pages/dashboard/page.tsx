import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, startOfYear, endOfYear } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useActiveWarehouse } from '../../contexts/ActiveWarehouseContext';
import { useUserScope } from '../../hooks/useUserScope';
import { dashboardService, DashboardStats } from '../../services/dashboardService';
import { calendarService } from '../../services/calendarService';
import WarehousePageHeader from '../../components/feature/WarehousePageHeader';

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
    activeWarehouse,
    allowedWarehouses,
    hasMultipleWarehouses,
    setActiveWarehouseId,
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
      // Si el inicio es mayor que el fin, ajustar el fin al inicio
      newRange.end = newRange.start;
    }
    setDateRange(newRange);
    setIsCustom(true);
    // Verificar si coincide con algún preset
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

  const maxTrend = Math.max(...(stats?.trendData.map(d => d.count) || [1]), 1);
  const periodLabel = stats ? stats.selectedPeriodLabel : 'Este mes';
  const compareLabel = stats ? (stats.period === 'all' ? '' : 'vs per. ant.') : 'vs per. ant.';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-6 py-6">
        <div className="max-w-7xl mx-auto">

          <WarehousePageHeader
            title="Dashboard"
            subtitle={format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
            activeWarehouse={activeWarehouse}
            allowedWarehouses={allowedWarehouses}
            hasMultipleWarehouses={hasMultipleWarehouses}
            onWarehouseChange={setActiveWarehouseId}
            loading={warehouseLoading}
          />

          {/* Filtros: Presets + Rango de fechas */}
          <div className="mb-6 flex flex-col gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Presets */}
              <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
                {PRESETS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => handlePresetClick(p.value)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      !isCustom && activePreset === p.value
                        ? 'bg-teal-500 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <i className={`${p.icon} w-4 h-4 flex items-center justify-center`}></i>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Rango de fechas */}
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1.5">
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
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 ml-auto"
              >
                <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`}></i>
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
                <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full font-medium">Rango personalizado</span>
              )}
            </div>
          </div>

          {loading && !stats ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : stats ? (
            <>
              {/* KPIs Principales */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl p-5 border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
                      <i className="ri-calendar-todo-line text-teal-600 text-lg"></i>
                    </div>
                    {compareLabel && (
                      <div className={`flex items-center gap-1 text-xs font-medium ${stats.vsLastPeriod >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <i className={stats.vsLastPeriod >= 0 ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}></i>
                        {Math.abs(stats.vsLastPeriod)}%
                        <span className="text-gray-400 font-normal ml-0.5">{compareLabel}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{stats.periodCount}</p>
                  <p className="text-xs text-gray-500 mt-1">Reservas en período</p>
                </div>

                <div className="bg-white rounded-xl p-5 border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                      <i className="ri-time-line text-amber-600 text-lg"></i>
                    </div>
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pendientes</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{stats.pendingReservations}</p>
                  <p className="text-xs text-gray-500 mt-1">Por confirmar</p>
                </div>

                <div className="bg-white rounded-xl p-5 border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                      <i className="ri-checkbox-circle-line text-green-600 text-lg"></i>
                    </div>
                    <span className="text-xs font-medium text-green-600">{stats.confirmationRate}%</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{stats.confirmedReservations}</p>
                  <p className="text-xs text-gray-500 mt-1">Confirmadas</p>
                </div>

                <div className="bg-white rounded-xl p-5 border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                      <i className="ri-loader-4-line text-indigo-600 text-lg"></i>
                    </div>
                    <span className="text-xs font-medium text-indigo-600">Activas</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{stats.inProgressReservations}</p>
                  <p className="text-xs text-gray-500 mt-1">En proceso</p>
                </div>
              </div>

              {/* Resumen rápido de períodos fijos */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className={`rounded-xl p-4 border flex items-center gap-4 ${activePreset === 'day' ? 'bg-teal-50 border-teal-200' : 'bg-white border-gray-100'}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${activePreset === 'day' ? 'bg-teal-100' : 'bg-gray-100'}`}>
                    <i className={`ri-sun-line ${activePreset === 'day' ? 'text-teal-600' : 'text-gray-500'}`}></i>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{stats.todayCount}</p>
                    <p className="text-xs text-gray-500">Hoy</p>
                  </div>
                </div>
                <div className={`rounded-xl p-4 border flex items-center gap-4 ${activePreset === 'week' ? 'bg-teal-50 border-teal-200' : 'bg-white border-gray-100'}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${activePreset === 'week' ? 'bg-teal-100' : 'bg-gray-100'}`}>
                    <i className={`ri-calendar-check-line ${activePreset === 'week' ? 'text-teal-600' : 'text-gray-500'}`}></i>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{stats.weekCount}</p>
                    <p className="text-xs text-gray-500">Esta semana</p>
                  </div>
                </div>
                <div className={`rounded-xl p-4 border flex items-center gap-4 ${activePreset === 'month' ? 'bg-teal-50 border-teal-200' : 'bg-white border-gray-100'}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${activePreset === 'month' ? 'bg-teal-100' : 'bg-gray-100'}`}>
                    <i className={`ri-calendar-2-line ${activePreset === 'month' ? 'text-teal-600' : 'text-gray-500'}`}></i>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{stats.monthCount}</p>
                    <p className="text-xs text-gray-500">Este mes</p>
                  </div>
                </div>
              </div>

              {/* Nacional vs Importado */}
              <div className="bg-white rounded-xl p-5 border border-gray-100 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900">Reservas por Tipo de Proveedor</h3>
                  <span className="text-xs text-gray-400">{periodLabel} · {stats.providerTypeStats.total} total</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-4 bg-emerald-50 rounded-xl p-4">
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <i className="ri-home-4-line text-emerald-600 text-xl"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-emerald-700 font-medium mb-1">Nacional</p>
                      <div className="flex items-end gap-2">
                        <span className="text-2xl font-bold text-gray-900">{stats.providerTypeStats.nacional}</span>
                        <span className="text-sm font-semibold text-emerald-600 mb-0.5">{stats.providerTypeStats.nacionalPct}%</span>
                      </div>
                      <div className="mt-2 h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${stats.providerTypeStats.nacionalPct}%` }}></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 bg-orange-50 rounded-xl p-4">
                    <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <i className="ri-ship-line text-orange-600 text-xl"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-orange-700 font-medium mb-1">Importado</p>
                      <div className="flex items-end gap-2">
                        <span className="text-2xl font-bold text-gray-900">{stats.providerTypeStats.importado}</span>
                        <span className="text-sm font-semibold text-orange-600 mb-0.5">{stats.providerTypeStats.importadoPct}%</span>
                      </div>
                      <div className="mt-2 h-1.5 bg-orange-100 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${stats.providerTypeStats.importadoPct}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tendencia */}
              <div className="bg-white rounded-xl p-5 border border-gray-100 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Tendencia de reservas
                    <span className="ml-2 text-xs font-normal text-gray-400">— {periodLabel}</span>
                  </h3>
                  <span className="text-xs text-gray-500">{isCustom ? 'Por día/semana/mes' : 'Por día'}</span>
                </div>
                {stats.trendData.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Sin datos para este período</p>
                ) : (
                  <div className="overflow-x-auto">
                    <div
                      className="flex items-end gap-1 h-28"
                      style={{ minWidth: stats.trendData.length > 20 ? `${stats.trendData.length * 28}px` : '100%' }}
                    >
                      {stats.trendData.map((item, idx) => (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1 min-w-[20px]">
                          {item.count > 0 && (
                            <span className="text-[10px] font-medium text-gray-600">{item.count}</span>
                          )}
                          <div
                            className="w-full bg-teal-500 rounded-t-sm transition-all hover:bg-teal-600"
                            style={{ height: `${Math.max((item.count / maxTrend) * 100, item.count > 0 ? 8 : 2)}%`, minHeight: '2px' }}
                          ></div>
                          <span className="text-[9px] text-gray-400 truncate w-full text-center">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Distribución por Estado + Recursos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-xl p-5 border border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Distribución por Estado</h3>
                  <div className="space-y-3">
                    {stats.statusDistribution.map((status, idx) => {
                      const percentage = stats.totalReservations > 0
                        ? Math.round((status.count / stats.totalReservations) * 100)
                        : 0;
                      return (
                        <div key={idx}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color }}></div>
                              <span className="text-sm text-gray-700">{status.name}</span>
                            </div>
                            <span className="text-sm font-medium text-gray-900">{status.count}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${percentage}%`, backgroundColor: status.color }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 border border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Recursos Operativos</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                          <i className="ri-truck-line text-indigo-600"></i>
                        </div>
                        <span className="text-xs text-gray-500">Andenes</span>
                      </div>
                      <p className="text-xl font-bold text-gray-900">
                        {stats.activeDocks}<span className="text-sm font-normal text-gray-400">/{stats.totalDocks}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">activos</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <i className="ri-building-2-line text-emerald-600"></i>
                        </div>
                        <span className="text-xs text-gray-500">Almacenes</span>
                      </div>
                      <p className="text-xl font-bold text-gray-900">{stats.activeWarehouses}</p>
                      <p className="text-xs text-gray-500 mt-1">configurados</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                          <i className="ri-user-3-line text-amber-600"></i>
                        </div>
                        <span className="text-xs text-gray-500">Colaboradores</span>
                      </div>
                      <p className="text-xl font-bold text-gray-900">{stats.totalCollaborators}</p>
                      <p className="text-xs text-gray-500 mt-1">activos</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center">
                          <i className="ri-percent-line text-rose-600"></i>
                        </div>
                        <span className="text-xs text-gray-500">Cumplimiento</span>
                      </div>
                      <p className="text-xl font-bold text-gray-900">{stats.completionRate}%</p>
                      <p className="text-xs text-gray-500 mt-1">finalizadas</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Top Proveedores + Horas Pico + Andenes */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-xl p-5 border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">Top Proveedores</h3>
                    <span className="text-xs text-gray-400">{periodLabel}</span>
                  </div>
                  {stats.topProviders.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Sin datos</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.topProviders.map((provider, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                              idx === 0 ? 'bg-amber-100 text-amber-700' :
                              idx === 1 ? 'bg-gray-200 text-gray-600' :
                              idx === 2 ? 'bg-orange-100 text-orange-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>{idx + 1}</span>
                            <span className="text-sm text-gray-700 truncate max-w-[140px]">{provider.name}</span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900">{provider.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl p-5 border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">Horas Pico</h3>
                    <span className="text-xs text-gray-400">{periodLabel}</span>
                  </div>
                  {stats.peakHours.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Sin datos</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.peakHours.map((hour, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${idx === 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                              <i className={`ri-time-line ${idx === 0 ? 'text-red-600' : 'text-gray-500'}`}></i>
                            </div>
                            <span className="text-sm text-gray-700">{hour.hour}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${idx === 0 ? 'bg-red-500' : 'bg-gray-400'}`}
                                style={{ width: `${(hour.count / stats.peakHours[0].count) * 100}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-semibold text-gray-900 w-6 text-right">{hour.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl p-5 border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">Andenes más Usados</h3>
                    <span className="text-xs text-gray-400">{periodLabel}</span>
                  </div>
                  {stats.topDocks.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Sin datos</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.topDocks.map((dock, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${idx === 0 ? 'bg-teal-100' : 'bg-gray-100'}`}>
                              <i className={`ri-truck-line ${idx === 0 ? 'text-teal-600' : 'text-gray-500'}`}></i>
                            </div>
                            <span className="text-sm text-gray-700">{dock.name}</span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900">{dock.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Rendimiento por Almacén */}
              {stats.warehouseStats.length > 0 && (
                <div className="bg-white rounded-xl p-5 border border-gray-100 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">Rendimiento por Almacén</h3>
                    <span className="text-xs text-gray-400">{periodLabel}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left text-xs font-medium text-gray-500 uppercase pb-3">Almacén</th>
                          <th className="text-center text-xs font-medium text-gray-500 uppercase pb-3">Reservas</th>
                          <th className="text-center text-xs font-medium text-gray-500 uppercase pb-3">Andenes</th>
                          <th className="text-right text-xs font-medium text-gray-500 uppercase pb-3">Ocupación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.warehouseStats.map((warehouse, idx) => {
                          const maxReservations = Math.max(...stats.warehouseStats.map(w => w.reservations), 1);
                          const occupancy = Math.round((warehouse.reservations / maxReservations) * 100);
                          return (
                            <tr key={idx} className="border-b border-gray-50 last:border-0">
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                                    <i className="ri-building-2-line text-gray-500"></i>
                                  </div>
                                  <span className="text-sm font-medium text-gray-900">{warehouse.name}</span>
                                </div>
                              </td>
                              <td className="py-3 text-center">
                                <span className="text-sm font-semibold text-gray-900">{warehouse.reservations}</span>
                              </td>
                              <td className="py-3 text-center">
                                <span className="text-sm text-gray-600">{warehouse.docks}</span>
                              </td>
                              <td className="py-3">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-teal-500 rounded-full" style={{ width: `${occupancy}%` }}></div>
                                  </div>
                                  <span className="text-xs text-gray-500 w-8 text-right">{occupancy}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Acciones Rápidas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => navigate('/calendario')}
                  className="flex items-center gap-4 bg-white rounded-xl p-5 border border-gray-100 hover:border-teal-200 transition-all cursor-pointer group"
                >
                  <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center group-hover:bg-teal-100 transition-colors">
                    <i className="ri-add-line text-teal-600 text-xl"></i>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900">Nueva Reserva</p>
                    <p className="text-xs text-gray-500">Crear reservación</p>
                  </div>
                  <i className="ri-arrow-right-s-line text-gray-400 ml-auto"></i>
                </button>

                <button
                  onClick={() => navigate('/andenes')}
                  className="flex items-center gap-4 bg-white rounded-xl p-5 border border-gray-100 hover:border-indigo-200 transition-all cursor-pointer group"
                >
                  <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                    <i className="ri-truck-line text-indigo-600 text-xl"></i>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900">Ver Andenes</p>
                    <p className="text-xs text-gray-500">Estado actual</p>
                  </div>
                  <i className="ri-arrow-right-s-line text-gray-400 ml-auto"></i>
                </button>

                <button
                  onClick={() => navigate('/casetilla')}
                  className="flex items-center gap-4 bg-white rounded-xl p-5 border border-gray-100 hover:border-amber-200 transition-all cursor-pointer group"
                >
                  <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center group-hover:bg-amber-100 transition-colors">
                    <i className="ri-door-open-line text-amber-600 text-xl"></i>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-gray-900">Casetilla</p>
                    <p className="text-xs text-gray-500">Control de ingreso</p>
                  </div>
                  <i className="ri-arrow-right-s-line text-gray-400 ml-auto"></i>
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}