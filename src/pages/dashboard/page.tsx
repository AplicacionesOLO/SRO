
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { dashboardService, DashboardStats } from '../../services/dashboardService';

export default function Dashboard() {
  const { user, loading: authLoading, pendingAccess } = useAuth();
  const { orgId, loading: permissionsLoading } = usePermissions();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!authLoading && user && pendingAccess) {
      navigate('/access-pending');
    }
  }, [authLoading, user, pendingAccess, navigate]);

  useEffect(() => {
    if (orgId) {
      loadDashboardData();
    }
  }, [orgId]);

  const loadDashboardData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await dashboardService.getStats(orgId);
      setStats(data);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
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

  const maxDailyCount = Math.max(...(stats?.dailyTrend.map(d => d.count) || [1]));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-6 py-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-500 text-sm mt-1">
                  {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                </p>
              </div>
              <button
                onClick={loadDashboardData}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <i className={`ri-refresh-line ${loading ? 'animate-spin' : ''}`}></i>
                Actualizar
              </button>
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
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
                      <i className="ri-calendar-todo-line text-teal-600 text-lg"></i>
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-medium ${stats.vsLastMonth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      <i className={`ri-arrow-${stats.vsLastMonth >= 0 ? 'up' : 'down'}-s-line`}></i>
                      {Math.abs(stats.vsLastMonth)}%
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{stats.monthCount}</p>
                  <p className="text-xs text-gray-500 mt-1">Reservas este mes</p>
                </div>

                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                      <i className="ri-time-line text-amber-600 text-lg"></i>
                    </div>
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pendientes</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{stats.pendingReservations}</p>
                  <p className="text-xs text-gray-500 mt-1">Por confirmar</p>
                </div>

                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                      <i className="ri-checkbox-circle-line text-green-600 text-lg"></i>
                    </div>
                    <span className="text-xs font-medium text-green-600">{stats.confirmationRate}%</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{stats.confirmedReservations}</p>
                  <p className="text-xs text-gray-500 mt-1">Confirmadas</p>
                </div>

                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
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

              {/* Resumen Operativo + Tendencia */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                {/* Resumen del día */}
                <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl p-5 text-white">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                      <i className="ri-sun-line text-xl"></i>
                    </div>
                    <div>
                      <p className="text-teal-100 text-xs">Hoy</p>
                      <p className="text-xl font-bold">{stats.todayCount} reservas</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/20">
                    <div>
                      <p className="text-teal-100 text-xs">Esta semana</p>
                      <p className="text-lg font-semibold">{stats.weekCount}</p>
                    </div>
                    <div>
                      <p className="text-teal-100 text-xs">vs semana ant.</p>
                      <p className={`text-lg font-semibold ${stats.vsLastWeek >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                        {stats.vsLastWeek > 0 ? '+' : ''}{stats.vsLastWeek}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tendencia 7 días */}
                <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">Tendencia últimos 7 días</h3>
                    <span className="text-xs text-gray-500">Reservas por día</span>
                  </div>
                  <div className="flex items-end justify-between gap-2 h-24">
                    {stats.dailyTrend.map((day, idx) => (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs font-medium text-gray-700">{day.count}</span>
                        <div 
                          className="w-full bg-teal-500 rounded-t-sm transition-all hover:bg-teal-600"
                          style={{ height: `${Math.max((day.count / maxDailyCount) * 100, 8)}%`, minHeight: '4px' }}
                        ></div>
                        <span className="text-[10px] text-gray-500">{day.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Distribución por Estado + Recursos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                {/* Distribución por estado */}
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
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
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: status.color }}
                              ></div>
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

                {/* Recursos operativos */}
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
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
                {/* Top Proveedores */}
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Top Proveedores</h3>
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
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="text-sm text-gray-700 truncate max-w-[140px]">{provider.name}</span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900">{provider.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Horas Pico */}
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Horas Pico</h3>
                  {stats.peakHours.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Sin datos</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.peakHours.map((hour, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              idx === 0 ? 'bg-red-100' : 'bg-gray-100'
                            }`}>
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

                {/* Top Andenes */}
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Andenes más Usados</h3>
                  {stats.topDocks.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Sin datos</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.topDocks.map((dock, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              idx === 0 ? 'bg-teal-100' : 'bg-gray-100'
                            }`}>
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
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm mb-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Rendimiento por Almacén</h3>
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
                          const maxReservations = Math.max(...stats.warehouseStats.map(w => w.reservations));
                          const occupancy = maxReservations > 0 ? Math.round((warehouse.reservations / maxReservations) * 100) : 0;
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
                                    <div 
                                      className="h-full bg-teal-500 rounded-full"
                                      style={{ width: `${occupancy}%` }}
                                    ></div>
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
                  className="flex items-center gap-4 bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:border-teal-200 hover:shadow-md transition-all cursor-pointer group"
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
                  className="flex items-center gap-4 bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer group"
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
                  className="flex items-center gap-4 bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:border-amber-200 hover:shadow-md transition-all cursor-pointer group"
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
