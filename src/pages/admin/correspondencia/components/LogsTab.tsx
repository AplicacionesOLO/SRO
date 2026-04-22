import { useState, useEffect, useCallback, useMemo } from 'react';
import { correspondenceService } from '../../../../services/correspondenceService';
import { useAuth } from '../../../../contexts/AuthContext';
import { usePermissions } from '../../../../hooks/usePermissions';
import { useActiveWarehouse } from '../../../../contexts/ActiveWarehouseContext';
import type { CorrespondenceLog } from '../../../../types/correspondence';
import { CORRESPONDENCE_LOG_STATUS_LABELS, CORRESPONDENCE_EVENT_LABELS } from '../../../../types/correspondence';
import { ConfirmModal } from '../../../../components/base/ConfirmModal';
import { WarehouseAnalysisModal } from './WarehouseAnalysisModal';

export function LogsTab() {
  const { user } = useAuth();
  const { orgId: currentOrgId } = usePermissions();
  const { activeWarehouseId, activeWarehouse, allowedWarehouses } = useActiveWarehouse();

  const orgId = useMemo(() => currentOrgId || user?.orgId || null, [currentOrgId, user?.orgId]);

  const [logs, setLogs] = useState<CorrespondenceLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<CorrespondenceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<CorrespondenceLog | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [sendingQueued, setSendingQueued] = useState<string | null>(null);
  const [sendingAllQueued, setSendingAllQueued] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  // ✅ Estado para popup de errores
  const [popup, setPopup] = useState<{
    isOpen: boolean;
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'error',
    title: '',
    message: ''
  });

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [senderFilter, setSenderFilter] = useState<string>('');
  const [dateFromFilter, setDateFromFilter] = useState<string>('');
  const [dateToFilter, setDateToFilter] = useState<string>('');

  // Debug info
  const debugInfo = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(l => l.created_at.startsWith(today));
    const nullWarehouseLogs = logs.filter(l => !l.warehouse_id);
    const sanDiegoLogs = logs.filter(l => {
      const wh = allowedWarehouses.find(w => w.id === l.warehouse_id);
      return wh?.name?.toLowerCase().includes('san diego');
    });
    const sanDiegoToday = sanDiegoLogs.filter(l => l.created_at.startsWith(today));
    return {
      total: logs.length,
      today: todayLogs.length,
      nullWarehouse: nullWarehouseLogs.length,
      sanDiego: sanDiegoLogs.length,
      sanDiegoToday: sanDiegoToday.length,
      filtered: filteredLogs.length
    };
  }, [logs, filteredLogs, allowedWarehouses]);

  // Mostrar registros sin almacén
  const [showNullWarehouse, setShowNullWarehouse] = useState(false);

  // ✅ Traemos todos los logs y filtramos en el frontend para poder debuggear
  const loadLogs = useCallback(async () => {
    if (!orgId) {
      setLogs([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      // No pasar warehouseId para traer TODOS los logs de la org
      // El filtrado lo hacemos en el frontend
      const data = await correspondenceService.getLogs(orgId, undefined);
      setLogs(data);
    } catch (error) {
      setPopup({ isOpen: true, type: 'error', title: 'Error', message: 'Error al cargar los logs' });
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const applyFilters = useCallback(() => {
    let filtered = [...logs];

    // Filtro de almacén (si no estamos mostrando todos)
    if (activeWarehouseId && !showNullWarehouse) {
      filtered = filtered.filter(log => log.warehouse_id === activeWarehouseId);
    } else if (activeWarehouseId && showNullWarehouse) {
      // Mostrar los del almacén activo + los sin almacén
      filtered = filtered.filter(log => log.warehouse_id === activeWarehouseId || !log.warehouse_id);
    } else if (!activeWarehouseId && !showNullWarehouse) {
      // Sin almacén seleccionado, mostrar solo los que tienen almacén
      filtered = filtered.filter(log => !!log.warehouse_id);
    }
    // Si no hay almacén seleccionado y showNullWarehouse=true, mostrar todos

    if (statusFilter !== 'all') filtered = filtered.filter(log => log.status === statusFilter);
    if (eventFilter !== 'all') filtered = filtered.filter(log => log.event_type === eventFilter);

    if (senderFilter.trim()) {
      const search = senderFilter.toLowerCase();
      filtered = filtered.filter(log =>
        log.sender_email.toLowerCase().includes(search) ||
        log.sender_user?.full_name?.toLowerCase().includes(search)
      );
    }

    if (dateFromFilter) {
      filtered = filtered.filter(log => log.created_at >= dateFromFilter);
    }

    if (dateToFilter) {
      const dateTo = new Date(dateToFilter);
      dateTo.setHours(23, 59, 59, 999);
      filtered = filtered.filter(log => new Date(log.created_at) <= dateTo);
    }

    setFilteredLogs(filtered);
  }, [logs, statusFilter, eventFilter, senderFilter, dateFromFilter, dateToFilter, activeWarehouseId, showNullWarehouse]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleRetry = async (logId: string) => {
    try {
      setRetrying(logId);
      await correspondenceService.retryFailedEmail(logId);
      setPopup({ isOpen: true, type: 'success', title: 'Reintento exitoso', message: 'El correo fue reenviado correctamente.' });
      await loadLogs();
    } catch (error: any) {
      setPopup({
        isOpen: true,
        type: 'error',
        title: 'Error al reintentar',
        message: error.message || 'Error al reintentar envío'
      });
    } finally {
      setRetrying(null);
    }
  };

  const handleRetryAll = async () => {
    if (!orgId) return;
    try {
      setRetryingAll(true);
      // Solo reintentar los fallidos visibles en el filtro actual
      const visibleFailedIds = filteredLogs
        .filter(l => l.status === 'failed')
        .map(l => l.id);
      
      let succeeded = 0;
      let failed = 0;
      
      for (const logId of visibleFailedIds) {
        try {
          await correspondenceService.retryFailedEmail(logId);
          succeeded++;
        } catch {
          failed++;
        }
      }
      
      await loadLogs();
      
      if (visibleFailedIds.length === 0) {
        setPopup({ isOpen: true, type: 'info', title: 'Sin fallidos', message: 'No hay correos fallidos para reintentar.' });
      } else {
        setPopup({
          isOpen: true,
          type: failed === 0 ? 'success' : 'warning',
          title: 'Reintento masivo completado',
          message: `${visibleFailedIds.length} intentados — ${succeeded} enviados correctamente, ${failed} fallidos.`,
        });
      }
    } catch (error: any) {
      setPopup({ isOpen: true, type: 'error', title: 'Error al reintentar todos', message: error.message || 'Error inesperado' });
    } finally {
      setRetryingAll(false);
    }
  };

  const handleSendQueued = async (logId: string) => {
    try {
      setSendingQueued(logId);
      await correspondenceService.retryQueuedEmail(logId);
      setPopup({ isOpen: true, type: 'success', title: 'Envío exitoso', message: 'El correo fue enviado correctamente.' });
      await loadLogs();
    } catch (error: any) {
      setPopup({
        isOpen: true,
        type: 'error',
        title: 'Error al enviar',
        message: error.message || 'Error al enviar correo en cola'
      });
    } finally {
      setSendingQueued(null);
    }
  };

  const handleSendAllQueued = async () => {
    if (!orgId) return;
    try {
      setSendingAllQueued(true);
      // Solo enviar los en cola visibles en el filtro actual
      const visibleQueuedIds = filteredLogs
        .filter(l => l.status === 'queued')
        .map(l => l.id);
      
      let succeeded = 0;
      let failed = 0;
      
      for (const logId of visibleQueuedIds) {
        try {
          await correspondenceService.retryQueuedEmail(logId);
          succeeded++;
        } catch {
          failed++;
        }
      }
      
      await loadLogs();
      
      if (visibleQueuedIds.length === 0) {
        setPopup({ isOpen: true, type: 'info', title: 'Sin correos en cola', message: 'No hay correos en cola para enviar.' });
      } else {
        setPopup({
          isOpen: true,
          type: failed === 0 ? 'success' : 'warning',
          title: 'Envío masivo completado',
          message: `${visibleQueuedIds.length} intentados — ${succeeded} enviados correctamente, ${failed} fallidos.`,
        });
      }
    } catch (error: any) {
      setPopup({ isOpen: true, type: 'error', title: 'Error al enviar todos', message: error.message || 'Error inesperado' });
    } finally {
      setSendingAllQueued(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'queued':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const uniqueEvents = Array.from(new Set(logs.map(log => log.event_type)));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-gray-600">
          <i className="ri-loader-4-line animate-spin text-xl"></i>
          <span>Cargando bitácora...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ✅ Popup de errores */}
      <ConfirmModal
        isOpen={popup.isOpen}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onConfirm={() => setPopup(prev => ({ ...prev, isOpen: false }))}
        confirmText="Entendido"
      />

      {/* Modal de Análisis */}
      <WarehouseAnalysisModal
        isOpen={showAnalysisModal}
        onClose={() => setShowAnalysisModal(false)}
        warehouses={allowedWarehouses}
      />

      {/* Banner de filtro por almacén */}
      <div className="flex items-center justify-between">
        {activeWarehouseId && activeWarehouse ? (
          <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg flex items-center gap-2 flex-1">
            <i className="ri-store-2-line text-teal-600 text-sm w-4 h-4 flex items-center justify-center"></i>
            <p className="text-sm text-teal-800">
              Mostrando envíos del almacén <strong>{activeWarehouse.name}</strong>.
            </p>
          </div>
        ) : (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 flex-1">
            <i className="ri-information-line text-amber-600 text-sm w-4 h-4 flex items-center justify-center"></i>
            <p className="text-sm text-amber-800">
              Mostrando envíos de todos los almacenes. Seleccioná un almacén para filtrar.
            </p>
          </div>
        )}
        
        {/* Botón de Análisis */}
        <button
          onClick={() => setShowAnalysisModal(true)}
          className="ml-4 flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
        >
          <i className="ri-bar-chart-box-line"></i>
          Análisis por Almacén
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Filtro Estado */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estado
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="all">Todos</option>
              <option value="queued">En cola</option>
              <option value="sent">Enviado</option>
              <option value="failed">Fallido</option>
            </select>
          </div>

          {/* Filtro Evento */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Evento
            </label>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="all">Todos</option>
              {uniqueEvents.map(event => (
                <option key={event} value={event}>
                  {CORRESPONDENCE_EVENT_LABELS[event as keyof typeof CORRESPONDENCE_EVENT_LABELS] || event}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Remitente */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Remitente
            </label>
            <input
              type="text"
              value={senderFilter}
              onChange={(e) => setSenderFilter(e.target.value)}
              placeholder="Buscar por nombre o email"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          {/* Filtro Fecha Desde */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Desde
            </label>
            <input
              type="date"
              value={dateFromFilter}
              onChange={(e) => setDateFromFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>

          {/* Filtro Fecha Hasta */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={dateToFilter}
              onChange={(e) => setDateToFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Botones de acción rápida */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                setDateFromFilter(today);
                setDateToFilter(today);
              }}
              className="text-sm px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 font-medium"
            >
              <i className="ri-calendar-check-line mr-1"></i>
              Hoy
            </button>
            <button
              onClick={() => {
                const today = new Date();
                const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                setDateFromFilter(weekAgo.toISOString().split('T')[0]);
                setDateToFilter(today.toISOString().split('T')[0]);
              }}
              className="text-sm px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 font-medium"
            >
              <i className="ri-calendar-line mr-1"></i>
              Últimos 7 días
            </button>
            {(statusFilter !== 'all' || eventFilter !== 'all' || senderFilter || dateFromFilter || dateToFilter) && (
              <button
                onClick={() => {
                  setStatusFilter('all');
                  setEventFilter('all');
                  setSenderFilter('');
                  setDateFromFilter('');
                  setDateToFilter('');
                }}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium"
              >
                Limpiar filtros
              </button>
            )}
          </div>
          
          {/* Debug info */}
          <div className="flex items-center gap-4">
            <div className="text-xs text-gray-500">
              Total: {debugInfo.total} | Hoy: {debugInfo.today} | Sin almacén: {debugInfo.nullWarehouse} | San Diego: {debugInfo.sanDiego} | San Diego Hoy: {debugInfo.sanDiegoToday} | Mostrando: {debugInfo.filtered}
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showNullWarehouse}
                onChange={(e) => setShowNullWarehouse(e.target.checked)}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              Mostrar registros sin almacén asignado
            </label>
          </div>
        </div>
      </div>

      {/* Barra de acciones bulk - usa filteredLogs para respetar filtros actuales */}
      {(() => {
        const failedCount = filteredLogs.filter(l => l.status === 'failed').length;
        const queuedCount = filteredLogs.filter(l => l.status === 'queued').length;
        
        if (failedCount === 0 && queuedCount === 0) return null;
        
        return (
          <div className="space-y-3">
            {queuedCount > 0 && (
              <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-yellow-800">
                  <i className="ri-time-line text-base w-4 h-4 flex items-center justify-center"></i>
                  <span>
                    Hay <strong>{queuedCount}</strong> correo{queuedCount !== 1 ? 's' : ''} en cola
                    {activeWarehouseId ? ` en ${activeWarehouse?.name}` : ''}.
                  </span>
                </div>
                <button
                  onClick={handleSendAllQueued}
                  disabled={sendingAllQueued}
                  className="flex items-center gap-2 px-4 py-1.5 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {sendingAllQueued ? (
                    <>
                      <i className="ri-loader-4-line animate-spin"></i>
                      Enviando...
                    </>
                  ) : (
                    <>
                      <i className="ri-send-plane-line"></i>
                      Enviar visibles en cola
                    </>
                  )}
                </button>
              </div>
            )}
            {failedCount > 0 && (
              <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-red-700">
                  <i className="ri-error-warning-line text-base w-4 h-4 flex items-center justify-center"></i>
                  <span>
                    Hay <strong>{failedCount}</strong> correo{failedCount !== 1 ? 's' : ''} con estado fallido
                    {activeWarehouseId ? ` en ${activeWarehouse?.name}` : ''}.
                  </span>
                </div>
                <button
                  onClick={handleRetryAll}
                  disabled={retryingAll}
                  className="flex items-center gap-2 px-4 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {retryingAll ? (
                    <>
                      <i className="ri-loader-4-line animate-spin"></i>
                      Reintentando...
                    </>
                  ) : (
                    <>
                      <i className="ri-refresh-line"></i>
                      Reintentar visibles fallidos
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Tabla de logs */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Regla
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Almacén
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Evento
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Remitente
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Destinatarios
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Asunto
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    <i className="ri-mail-line text-3xl mb-2"></i>
                    <p>{activeWarehouseId ? `No hay envíos para ${activeWarehouse?.name}` : 'No hay registros de envíos'}</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  // Use outbox.warehouse_id as source of truth (not rule.warehouse_id)
                  const logWarehouseId = (log as any).warehouse_id ?? null;
                  const warehouseName = logWarehouseId
                    ? allowedWarehouses.find(w => w.id === logWarehouseId)?.name || 'Almacén'
                    : null;
                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {log.rule?.name || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {warehouseName ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-teal-50 text-teal-700">
                            <i className="ri-store-2-line text-xs"></i>
                            {warehouseName}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-600 border border-red-200" title="Este registro no tiene almacén asignado - puede ser de San Diego">
                            <i className="ri-error-warning-line text-xs"></i>
                            Sin almacén
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {CORRESPONDENCE_EVENT_LABELS[log.event_type as keyof typeof CORRESPONDENCE_EVENT_LABELS] || log.event_type}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="flex flex-col">
                          <span className="font-medium">{log.sender_user?.full_name || 'Usuario'}</span>
                          <span className="text-xs text-gray-500">{log.sender_email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="flex flex-wrap gap-1">
                          {log.to_emails.slice(0, 2).map((email, idx) => (
                            <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                              {email}
                            </span>
                          ))}
                          {log.to_emails.length > 2 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                              +{log.to_emails.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">
                        {log.subject}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(log.status)}`}>
                          {CORRESPONDENCE_LOG_STATUS_LABELS[log.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-teal-600 hover:text-teal-700 mr-3"
                          title="Ver detalle"
                        >
                          <i className="ri-eye-line text-lg"></i>
                        </button>
                        {log.status === 'queued' && (
                          <button
                            onClick={() => handleSendQueued(log.id)}
                            disabled={sendingQueued === log.id}
                            className="text-yellow-600 hover:text-yellow-700 mr-3 disabled:opacity-50"
                            title="Enviar ahora"
                          >
                            {sendingQueued === log.id ? (
                              <i className="ri-loader-4-line animate-spin text-lg"></i>
                            ) : (
                              <i className="ri-send-plane-line text-lg"></i>
                            )}
                          </button>
                        )}
                        {log.status === 'failed' && (
                          <button
                            onClick={() => handleRetry(log.id)}
                            disabled={retrying === log.id}
                            className="text-orange-600 hover:text-orange-700 disabled:opacity-50"
                            title="Reintentar envío"
                          >
                            {retrying === log.id ? (
                              <i className="ri-loader-4-line animate-spin text-lg"></i>
                            ) : (
                              <i className="ri-refresh-line text-lg"></i>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de detalle */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Detalle del Envío
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Estado */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estado
                </label>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeClass(selectedLog.status)}`}>
                  {CORRESPONDENCE_LOG_STATUS_LABELS[selectedLog.status]}
                </span>
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de creación
                  </label>
                  <p className="text-sm text-gray-900">{formatDate(selectedLog.created_at)}</p>
                </div>
                {selectedLog.sent_at && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha de envío
                    </label>
                    <p className="text-sm text-gray-900">{formatDate(selectedLog.sent_at)}</p>
                  </div>
                )}
              </div>

              {/* Regla y Evento */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Regla
                  </label>
                  <p className="text-sm text-gray-900">{selectedLog.rule?.name || '-'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Evento
                  </label>
                  <p className="text-sm text-gray-900">
                    {CORRESPONDENCE_EVENT_LABELS[selectedLog.event_type as keyof typeof CORRESPONDENCE_EVENT_LABELS] || selectedLog.event_type}
                  </p>
                </div>
              </div>

              {/* Remitente */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Remitente
                </label>
                <p className="text-sm text-gray-900">
                  {selectedLog.sender_user?.full_name || 'Usuario'} ({selectedLog.sender_email})
                </p>
              </div>

              {/* Destinatarios */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Destinatarios (Para)
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedLog.to_emails.map((email, idx) => (
                    <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-md text-sm bg-gray-100 text-gray-700">
                      {email}
                    </span>
                  ))}
                </div>
              </div>

              {selectedLog.cc_emails && selectedLog.cc_emails.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CC
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedLog.cc_emails.map((email, idx) => (
                      <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-md text-sm bg-gray-100 text-gray-700">
                        {email}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedLog.bcc_emails && selectedLog.bcc_emails.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    BCC
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedLog.bcc_emails.map((email, idx) => (
                      <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-md text-sm bg-gray-100 text-gray-700">
                        {email}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Asunto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Asunto
                </label>
                <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-lg">
                  {selectedLog.subject}
                </p>
              </div>

              {/* Cuerpo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cuerpo del mensaje
                </label>
                <div 
                  className="text-sm text-gray-900 bg-gray-50 p-4 rounded-lg border border-gray-200 max-h-64 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: selectedLog.body }}
                />
              </div>

              {/* Provider Message ID */}
              {selectedLog.provider_message_id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ID del mensaje (Gmail)
                  </label>
                  <p className="text-sm text-gray-600 font-mono bg-gray-50 p-2 rounded">
                    {selectedLog.provider_message_id}
                  </p>
                </div>
              )}

              {/* Error */}
              {selectedLog.error && (
                <div>
                  <label className="block text-sm font-medium text-red-700 mb-1">
                    Error
                  </label>
                  <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
                    {selectedLog.error}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              {selectedLog.status === 'queued' && (
                <button
                  onClick={() => {
                    handleSendQueued(selectedLog.id);
                    setSelectedLog(null);
                  }}
                  disabled={sendingQueued === selectedLog.id}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {sendingQueued === selectedLog.id ? (
                    <>
                      <i className="ri-loader-4-line animate-spin mr-2"></i>
                      Enviando...
                    </>
                  ) : (
                    <>
                      <i className="ri-send-plane-line mr-2"></i>
                      Enviar ahora
                    </>
                  )}
                </button>
              )}
              {selectedLog.status === 'failed' && (
                <button
                  onClick={() => {
                    handleRetry(selectedLog.id);
                    setSelectedLog(null);
                  }}
                  disabled={retrying === selectedLog.id}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {retrying === selectedLog.id ? (
                    <>
                      <i className="ri-loader-4-line animate-spin mr-2"></i>
                      Reintentando...
                    </>
                  ) : (
                    <>
                      <i className="ri-refresh-line mr-2"></i>
                      Reintentar envío
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 whitespace-nowrap"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LogsTab;
