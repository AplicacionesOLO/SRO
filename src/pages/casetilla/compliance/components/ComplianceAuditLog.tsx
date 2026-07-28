import type { ComplianceAuditEvent } from '@/types/compliance';

interface ComplianceAuditLogProps {
  events: ComplianceAuditEvent[];
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function ComplianceAuditLog({ events }: ComplianceAuditLogProps) {
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
        <i className="ri-file-search-line text-3xl text-gray-300"></i>
        <p className="mt-2 text-sm text-gray-500">Sin registros de auditoría</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <h4 className="px-4 py-3 border-b border-gray-100 text-xs font-semibold text-gray-700 flex items-center gap-1.5">
        <i className="ri-file-search-line text-teal-600"></i>
        Auditoría
      </h4>
      <div className="divide-y divide-gray-100">
        {events.map((event) => (
          <div key={event.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                <i className="ri-user-line text-gray-500 text-sm"></i>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">{event.userName || 'Sistema'}</span>
                  <span className="text-xs text-gray-400">{formatTimestamp(event.timestamp)}</span>
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{event.action}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 flex-wrap">
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-mono">{event.source}</span>
                  {event.previousState && (
                    <>
                      <span className="text-gray-300">→</span>
                      <span className="text-gray-500">{event.previousState}</span>
                      <span className="text-gray-300">→</span>
                      <span className="text-gray-700 font-medium">{event.newState}</span>
                    </>
                  )}
                  {event.ipAddress && (
                    <span className="text-gray-400 font-mono">{event.ipAddress}</span>
                  )}
                </div>
                {event.comment && (
                  <p className="text-xs text-gray-500 mt-1 italic">{event.comment}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}