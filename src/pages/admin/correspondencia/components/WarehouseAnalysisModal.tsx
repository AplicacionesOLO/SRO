import { useState, useEffect, useMemo } from 'react';
import { correspondenceService } from '../../../../services/correspondenceService';
import { useAuth } from '../../../../contexts/AuthContext';
import { usePermissions } from '../../../../hooks/usePermissions';
import type { CorrespondenceLog } from '../../../../types/correspondence';
import { CORRESPONDENCE_LOG_STATUS_LABELS, CORRESPONDENCE_EVENT_LABELS } from '../../../../types/correspondence';

interface WarehouseAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouses: Array<{ id: string; name: string; code?: string }>;
}

interface AnalysisStats {
  total: number;
  sent: number;
  failed: number;
  queued: number;
  byEventType: Record<string, number>;
  byMonth: Record<string, { total: number; sent: number; failed: number; queued: number }>;
  byRule: Record<string, { name: string; count: number; sent: number; failed: number }>;
  topSenders: Array<{ email: string; name: string; count: number }>;
  recentErrors: Array<{ id: string; date: string; subject: string; error: string; sender: string }>;
  successRate: number;
}

export function WarehouseAnalysisModal({ isOpen, onClose, warehouses }: WarehouseAnalysisModalProps) {
  const { user } = useAuth();
  const { orgId: currentOrgId } = usePermissions();
  const orgId = useMemo(() => currentOrgId || user?.orgId || null, [currentOrgId, user?.orgId]);

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: '',
    to: ''
  });
  const [logs, setLogs] = useState<CorrespondenceLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'errors'>('overview');

  // Cargar logs cuando se selecciona un almacén
  useEffect(() => {
    if (!isOpen || !orgId || !selectedWarehouseId) {
      setLogs([]);
      return;
    }

    const loadLogs = async () => {
      setLoading(true);
      try {
        const data = await correspondenceService.getLogs(orgId, selectedWarehouseId);
        setLogs(data);
      } catch (error) {
        // non-blocking
      } finally {
        setLoading(false);
      }
    };

    loadLogs();
  }, [isOpen, orgId, selectedWarehouseId]);

  // Calcular estadísticas
  const stats: AnalysisStats | null = useMemo(() => {
    if (!logs.length) return null;

    let filteredLogs = [...logs];

    // Filtrar por rango de fechas si está definido
    if (dateRange.from) {
      filteredLogs = filteredLogs.filter(log => log.created_at >= dateRange.from);
    }
    if (dateRange.to) {
      const dateTo = new Date(dateRange.to);
      dateTo.setHours(23, 59, 59, 999);
      filteredLogs = filteredLogs.filter(log => new Date(log.created_at) <= dateTo);
    }

    const total = filteredLogs.length;
    const sent = filteredLogs.filter(l => l.status === 'sent').length;
    const failed = filteredLogs.filter(l => l.status === 'failed').length;
    const queued = filteredLogs.filter(l => l.status === 'queued').length;

    // Por tipo de evento
    const byEventType: Record<string, number> = {};
    filteredLogs.forEach(log => {
      byEventType[log.event_type] = (byEventType[log.event_type] || 0) + 1;
    });

    // Por mes
    const byMonth: Record<string, { total: number; sent: number; failed: number; queued: number }> = {};
    filteredLogs.forEach(log => {
      const month = log.created_at.substring(0, 7); // YYYY-MM
      if (!byMonth[month]) {
        byMonth[month] = { total: 0, sent: 0, failed: 0, queued: 0 };
      }
      byMonth[month].total++;
      byMonth[month][log.status]++;
    });

    // Por regla
    const byRule: Record<string, { name: string; count: number; sent: number; failed: number }> = {};
    filteredLogs.forEach(log => {
      const ruleId = log.rule_id || 'sin_regla';
      const ruleName = log.rule?.name || 'Sin regla';
      if (!byRule[ruleId]) {
        byRule[ruleId] = { name: ruleName, count: 0, sent: 0, failed: 0 };
      }
      byRule[ruleId].count++;
      if (log.status === 'sent') byRule[ruleId].sent++;
      if (log.status === 'failed') byRule[ruleId].failed++;
    });

    // Top remitentes
    const senderCounts: Record<string, { email: string; name: string; count: number }> = {};
    filteredLogs.forEach(log => {
      const email = log.sender_email;
      if (!senderCounts[email]) {
        senderCounts[email] = {
          email,
          name: log.sender_user?.full_name || 'Usuario',
          count: 0
        };
      }
      senderCounts[email].count++;
    });
    const topSenders = Object.values(senderCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Errores recientes
    const recentErrors = filteredLogs
      .filter(l => l.status === 'failed' && l.error)
      .slice(0, 10)
      .map(l => ({
        id: l.id,
        date: l.created_at,
        subject: l.subject,
        error: l.error || 'Error desconocido',
        sender: l.sender_user?.full_name || l.sender_email
      }));

    const successRate = total > 0 ? Math.round((sent / total) * 100) : 0;

    return {
      total,
      sent,
      failed,
      queued,
      byEventType,
      byMonth,
      byRule,
      topSenders,
      recentErrors,
      successRate
    };
  }, [logs, dateRange]);

  const selectedWarehouse = warehouses.find(w => w.id === selectedWarehouseId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-teal-600 to-teal-700">
          <div className="flex items-center gap-3">
            <i className="ri-bar-chart-box-line text-white text-xl"></i>
            <h3 className="text-lg font-semibold text-white">
              Análisis de Correspondencia por Almacén
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        {/* Controles */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Selector de Almacén */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Almacén a analizar
              </label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="">Seleccionar almacén...</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.code ? `(${w.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Fecha desde */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Desde
              </label>
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            {/* Fecha hasta */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hasta
              </label>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Tabs */}
          {stats && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'overview'
                    ? 'bg-teal-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                <i className="ri-dashboard-line mr-2"></i>
                Resumen
              </button>
              <button
                onClick={() => setActiveTab('details')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'details'
                    ? 'bg-teal-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                <i className="ri-list-view mr-2"></i>
                Detalles
              </button>
              <button
                onClick={() => setActiveTab('errors')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'errors'
                    ? 'bg-red-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                <i className="ri-error-warning-line mr-2"></i>
                Errores ({stats.recentErrors.length})
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!selectedWarehouseId ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <i className="ri-store-2-line text-5xl mb-4 text-gray-300"></i>
              <p className="text-lg">Seleccioná un almacén para ver el análisis</p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <i className="ri-loader-4-line animate-spin text-3xl text-teal-600 mb-4"></i>
              <p className="text-gray-600">Cargando datos de {selectedWarehouse?.name}...</p>
            </div>
          ) : !stats ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <i className="ri-mail-line text-5xl mb-4 text-gray-300"></i>
              <p className="text-lg">No hay datos de correspondencia para este almacén</p>
            </div>
          ) : activeTab === 'overview' ? (
            <div className="space-y-6">
              {/* KPIs principales */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-teal-50 to-teal-100 p-4 rounded-lg border border-teal-200">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="ri-mail-line text-teal-600"></i>
                    <span className="text-sm text-teal-700">Total Emails</span>
                  </div>
                  <p className="text-3xl font-bold text-teal-800">{stats.total}</p>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="ri-check-line text-green-600"></i>
                    <span className="text-sm text-green-700">Enviados</span>
                  </div>
                  <p className="text-3xl font-bold text-green-800">{stats.sent}</p>
                  <p className="text-xs text-green-600 mt-1">
                    {Math.round((stats.sent / stats.total) * 100)}% del total
                  </p>
                </div>

                <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-lg border border-red-200">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="ri-close-line text-red-600"></i>
                    <span className="text-sm text-red-700">Fallidos</span>
                  </div>
                  <p className="text-3xl font-bold text-red-800">{stats.failed}</p>
                  <p className="text-xs text-red-600 mt-1">
                    {Math.round((stats.failed / stats.total) * 100)}% del total
                  </p>
                </div>

                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 rounded-lg border border-yellow-200">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="ri-time-line text-yellow-600"></i>
                    <span className="text-sm text-yellow-700">En Cola</span>
                  </div>
                  <p className="text-3xl font-bold text-yellow-800">{stats.queued}</p>
                  <p className="text-xs text-yellow-600 mt-1">
                    {Math.round((stats.queued / stats.total) * 100)}% del total
                  </p>
                </div>
              </div>

              {/* Tasa de éxito */}
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  <i className="ri-percent-line mr-2"></i>
                  Tasa de Éxito
                </h4>
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        stats.successRate >= 90
                          ? 'bg-green-500'
                          : stats.successRate >= 70
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${stats.successRate}%` }}
                    ></div>
                  </div>
                  <span className={`text-2xl font-bold ${
                    stats.successRate >= 90
                      ? 'text-green-600'
                      : stats.successRate >= 70
                      ? 'text-yellow-600'
                      : 'text-red-600'
                  }`}>
                    {stats.successRate}%
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  {stats.successRate >= 90
                    ? 'Excelente rendimiento de envío'
                    : stats.successRate >= 70
                    ? 'Rendimiento aceptable, hay margen de mejora'
                    : 'Atención: alta tasa de fallos detectada'}
                </p>
              </div>

              {/* Por tipo de evento */}
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  <i className="ri-calendar-event-line mr-2"></i>
                  Distribución por Tipo de Evento
                </h4>
                <div className="space-y-2">
                  {Object.entries(stats.byEventType).map(([event, count]) => (
                    <div key={event} className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 w-48">
                        {CORRESPONDENCE_EVENT_LABELS[event as keyof typeof CORRESPONDENCE_EVENT_LABELS] || event}
                      </span>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-500 rounded-full flex items-center justify-end px-2"
                          style={{ width: `${(count / stats.total) * 100}%` }}
                        >
                          <span className="text-xs text-white font-medium">{count}</span>
                        </div>
                      </div>
                      <span className="text-sm text-gray-500 w-12 text-right">
                        {Math.round((count / stats.total) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top remitentes */}
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  <i className="ri-user-line mr-2"></i>
                  Top Remitentes
                </h4>
                <div className="space-y-2">
                  {stats.topSenders.map((sender, idx) => (
                    <div key={sender.email} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{sender.name}</p>
                          <p className="text-xs text-gray-500">{sender.email}</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-teal-600">{sender.count} emails</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : activeTab === 'details' ? (
            <div className="space-y-6">
              {/* Por mes */}
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  <i className="ri-calendar-line mr-2"></i>
                  Actividad por Mes
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Mes</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Total</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-green-600">Enviados</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-red-600">Fallidos</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-yellow-600">En Cola</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {Object.entries(stats.byMonth)
                        .sort((a, b) => b[0].localeCompare(a[0]))
                        .map(([month, data]) => (
                          <tr key={month}>
                            <td className="px-3 py-2 text-sm text-gray-900">
                              {new Date(month + '-01').toLocaleDateString('es-ES', { year: 'numeric', month: 'long' })}
                            </td>
                            <td className="px-3 py-2 text-sm text-center font-medium">{data.total}</td>
                            <td className="px-3 py-2 text-sm text-center text-green-600">{data.sent}</td>
                            <td className="px-3 py-2 text-sm text-center text-red-600">{data.failed}</td>
                            <td className="px-3 py-2 text-sm text-center text-yellow-600">{data.queued}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Por regla */}
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  <i className="ri-file-list-line mr-2"></i>
                  Rendimiento por Regla
                </h4>
                <div className="space-y-3">
                  {Object.entries(stats.byRule)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([ruleId, rule]) => {
                      const successRate = rule.count > 0 ? Math.round((rule.sent / rule.count) * 100) : 0;
                      return (
                        <div key={ruleId} className="p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-900">{rule.name}</span>
                            <span className={`text-sm font-bold ${
                              successRate >= 90 ? 'text-green-600' : successRate >= 70 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {successRate}% éxito
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>{rule.count} total</span>
                            <span className="text-green-600">{rule.sent} enviados</span>
                            <span className="text-red-600">{rule.failed} fallidos</span>
                          </div>
                          <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                successRate >= 90 ? 'bg-green-500' : successRate >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${successRate}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700">
                <i className="ri-error-warning-line mr-2 text-red-600"></i>
                Errores Recientes
              </h4>
              {stats.recentErrors.length === 0 ? (
                <div className="p-8 text-center text-gray-500 bg-green-50 rounded-lg border border-green-200">
                  <i className="ri-check-double-line text-4xl text-green-500 mb-2"></i>
                  <p>No hay errores recientes. ¡Todo funciona correctamente!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {stats.recentErrors.map((error) => (
                    <div key={error.id} className="p-4 bg-red-50 rounded-lg border border-red-200">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-red-800">{error.subject}</p>
                          <p className="text-xs text-red-600 mt-1">
                            {new Date(error.date).toLocaleString('es-ES')} • {error.sender}
                          </p>
                        </div>
                        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                          Fallido
                        </span>
                      </div>
                      <div className="p-3 bg-white rounded border border-red-100">
                        <p className="text-sm text-red-700 font-mono">{error.error}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default WarehouseAnalysisModal;