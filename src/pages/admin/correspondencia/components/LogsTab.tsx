import { useState, useEffect, useCallback, useMemo } from 'react';
import { correspondenceService } from '../../../../services/correspondenceService';
import { useAuth } from '../../../../contexts/AuthContext';
import { usePermissions } from '../../../../hooks/usePermissions';
import type { CorrespondenceLog } from '../../../../types/correspondence';
import { CORRESPONDENCE_LOG_STATUS_LABELS, CORRESPONDENCE_EVENT_LABELS } from '../../../../types/correspondence';
import { ConfirmModal } from '../../../../components/base/ConfirmModal';

export function LogsTab() {
  const { user } = useAuth();
  const { orgId: currentOrgId } = usePermissions();

  // ✅ FIX: Usar el resolver correcto de orgId (currentOrgId → user.orgId → fallback)
  const orgId = useMemo(() => {
    const resolved = currentOrgId || user?.orgId || null;
    console.log('[LogsTab] orgId resolver', {
      currentOrgId,
      userOrgId: user?.orgId,
      resolved
    });
    return resolved;
  }, [currentOrgId, user?.orgId]);

  const [logs, setLogs] = useState<CorrespondenceLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<CorrespondenceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<CorrespondenceLog | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

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

  // ✅ FIX: Remover lastOrgLoadedRef - permitir recargas cuando sea necesario
  const loadLogs = useCallback(async () => {
    if (!orgId) {
      console.log('[LogsTab] loadLogs - no orgId, skipping');
      setLogs([]);
      setLoading(false);
      return;
    }

    try {
      console.log('[LogsTab] loadLogs start', { orgId });
      setLoading(true);
      const data = await correspondenceService.getLogs(orgId);
      console.log('[LogsTab] loadLogs success', {
        orgId,
        count: data.length,
        sample: data.slice(0, 3).map(l => ({
          id: l.id,
          event: l.event_type,
          status: l.status,
          to: l.to_emails
        }))
      });
      setLogs(data);
    } catch (error) {
      console.error('[LogsTab] loadLogs error', { orgId, error });
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const applyFilters = useCallback(() => {
    let filtered = [...logs];

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
  }, [logs, statusFilter, eventFilter, senderFilter, dateFromFilter, dateToFilter]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleRetry = async (logId: string) => {
    try {
      setRetrying(logId);
      await correspondenceService.retryFailedEmail(logId);

      // ✅ FIX: Recargar directamente sin depender de cache
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

        {/* Botón limpiar filtros */}
        {(statusFilter !== 'all' || eventFilter !== 'all' || senderFilter || dateFromFilter || dateToFilter) && (
          <div className="mt-3 flex justify-end">
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
          </div>
        )}
      </div>

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
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    <i className="ri-mail-line text-3xl mb-2"></i>
                    <p>No hay registros de envíos</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {log.rule?.name || '-'}
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
                ))
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
