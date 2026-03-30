import { useChatAudit } from '../../../hooks/useChatAudit';
import type { ChatAuditLog, ChatAuditStatus } from '../../../types/chat';

const STATUS_CONFIG: Record<ChatAuditStatus, { label: string; color: string; icon: string }> = {
  success: { label: 'Éxito',     color: 'bg-emerald-100 text-emerald-700', icon: 'ri-checkbox-circle-line' },
  denied:  { label: 'Denegado', color: 'bg-amber-100 text-amber-700',    icon: 'ri-lock-line' },
  error:   { label: 'Error',    color: 'bg-red-100 text-red-600',        icon: 'ri-error-warning-line' },
};

function formatDate(str: string): string {
  return new Date(str).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AuditRow({ log }: { log: ChatAuditLog }) {
  const status = STATUS_CONFIG[log.status] ?? STATUS_CONFIG.success;
  const usedCount = Array.isArray(log.used_document_ids) ? log.used_document_ids.length : 0;

  return (
    <tr className="hover:bg-gray-50 transition-colors border-b border-gray-100">
      <td className="px-5 py-3.5 text-xs text-gray-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
      <td className="px-5 py-3.5">
        <p className="text-sm text-gray-800 truncate max-w-xs">{log.question}</p>
        {log.answer && (
          <p className="text-xs text-gray-400 truncate max-w-xs mt-0.5">{log.answer}</p>
        )}
      </td>
      <td className="px-5 py-3.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
          <i className={status.icon}></i>
          {status.label}
        </span>
      </td>
      <td className="px-5 py-3.5 text-center">
        {usedCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-teal-600 font-medium">
            <i className="ri-file-list-line"></i>
            {usedCount}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>
    </tr>
  );
}

export default function ChatAuditoriaPage() {
  const { logs, loading, error, hasMore, loadMore } = useChatAudit();

  const total = logs.length;
  const byStatus = {
    success: logs.filter((l) => l.status === 'success').length,
    denied: logs.filter((l) => l.status === 'denied').length,
    error: logs.filter((l) => l.status === 'error').length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-6 py-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Auditoría del Asistente</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Registro completo de consultas, documentos usados y estado de acceso
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total consultas',  value: total,             icon: 'ri-chat-history-line',   color: 'text-gray-600' },
            { label: 'Exitosas',         value: byStatus.success,  icon: 'ri-checkbox-circle-line', color: 'text-emerald-600' },
            { label: 'Denegadas',        value: byStatus.denied,   icon: 'ri-lock-line',            color: 'text-amber-600' },
            { label: 'Con error',        value: byStatus.error,    icon: 'ri-error-warning-line',  color: 'text-red-500' },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3">
              <div className="w-9 h-9 flex items-center justify-center">
                <i className={`${s.icon} text-xl ${s.color}`}></i>
              </div>
              <div>
                <div className="text-lg font-semibold text-gray-900">{s.value}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-4 text-sm text-red-600">
            <i className="ri-error-warning-line"></i> {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 text-left whitespace-nowrap">Fecha</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 text-left">Pregunta / Respuesta</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 text-left whitespace-nowrap">Estado</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 text-center whitespace-nowrap">Docs usados</th>
                </tr>
              </thead>
              <tbody>
                {loading && logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center">
                      <i className="ri-loader-4-line text-2xl text-teal-500 animate-spin"></i>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center">
                      <i className="ri-chat-history-line text-3xl text-gray-200 block mb-2"></i>
                      <p className="text-sm text-gray-400">Sin registros de auditoría aún</p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => <AuditRow key={log.id} log={log} />)
                )}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {hasMore && !loading && (
            <div className="px-5 py-3 border-t border-gray-100 text-center">
              <button
                onClick={loadMore}
                className="text-sm text-teal-600 hover:text-teal-700 cursor-pointer"
              >
                Cargar más registros
              </button>
            </div>
          )}
          {loading && logs.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 text-center">
              <i className="ri-loader-4-line text-teal-500 animate-spin text-sm"></i>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
