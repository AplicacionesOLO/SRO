import type { ComplianceIncident, IncidentStatus, IncidentSeverity } from '@/types/compliance';

interface ComplianceIncidentsPanelProps {
  incidents: ComplianceIncident[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  isHybrid?: boolean;
  onPageChange: (page: number) => void;
}

const statusConfig: Record<IncidentStatus, { label: string; classes: string }> = {
  OPEN: { label: 'Abierta', classes: 'bg-red-50 text-red-700 border-red-200' },
  IN_REVIEW: { label: 'En revisión', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  RESOLVED: { label: 'Resuelta', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  DISMISSED: { label: 'Descartada', classes: 'bg-gray-50 text-gray-500 border-gray-200' },
  VOIDED: { label: 'Anulada', classes: 'bg-gray-50 text-gray-400 border-gray-200 line-through' },
};

const severityConfig: Record<IncidentSeverity, { label: string; classes: string }> = {
  INFO: { label: 'INFO', classes: 'bg-gray-100 text-gray-600' },
  LOW: { label: 'LOW', classes: 'bg-blue-50 text-blue-600' },
  MEDIUM: { label: 'MED', classes: 'bg-amber-50 text-amber-600' },
  HIGH: { label: 'HIGH', classes: 'bg-red-50 text-red-600' },
  CRITICAL: { label: 'CRIT', classes: 'bg-red-100 text-red-800 font-bold' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Ahora';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function ComplianceIncidentsPanel({
  incidents,
  total,
  page,
  pageSize,
  totalPages,
  loading,
  isHybrid,
  onPageChange,
}: ComplianceIncidentsPanelProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  // ── Modo híbrido: incidencias no disponibles sin Rule Engine ──
  if (isHybrid) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            Incidencias
            <span className="ml-2 inline-flex px-1.5 py-0 text-[10px] font-bold bg-gray-100 text-gray-400 border border-gray-200 rounded whitespace-nowrap">NO CONECTADO</span>
          </h3>
        </div>
        <div className="px-4 py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <i className="ri-plug-line text-3xl text-gray-300"></i>
          </div>
          <p className="text-sm font-semibold text-gray-700">Módulo de incidencias no disponible</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            El módulo de incidencias estará disponible cuando se implemente el Rule Engine y la Fase 6.1.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Incidencias
          <span className="ml-2 text-xs font-normal text-gray-400">{total} total</span>
        </h3>
      </div>

      <div className="divide-y divide-gray-100">
        {incidents.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <i className="ri-shield-check-line text-4xl text-gray-300"></i>
            <p className="mt-2 text-sm text-gray-500">No hay incidencias registradas</p>
          </div>
        ) : (
          incidents.map((incident) => {
            const stConf = statusConfig[incident.status];
            const sevConf = severityConfig[incident.severity];
            return (
              <div key={incident.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <i className={`${incident.severity === 'CRITICAL' || incident.severity === 'HIGH' ? 'ri-error-warning-fill text-red-500' : 'ri-error-warning-line text-amber-500'} text-lg`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-gray-800">{incident.title}</span>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${sevConf.classes}`}>
                        {sevConf.label}
                      </span>
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${stConf.classes}`}>
                        {stConf.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2 line-clamp-2">{incident.description}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                      <span className="font-mono">{incident.code}</span>
                      <span>Reserva #{incident.reservationId.slice(-6).toUpperCase()}</span>
                      {incident.ruleName && (
                        <span className="text-teal-600 font-medium">{incident.ruleName}</span>
                      )}
                      <span>{incident.warehouseName || '—'}</span>
                      <span>{timeAgo(incident.createdAt)}</span>
                      {incident.occurrenceCount > 1 && (
                        <span className="text-amber-500 font-bold">{incident.occurrenceCount}x</span>
                      )}
                      {incident.assigneeName && (
                        <span className="text-gray-500">{incident.assigneeName}</span>
                      )}
                    </div>
                  </div>
                  {/* Acciones deshabilitadas */}
                  <div className="flex-shrink-0 flex items-center gap-1">
                    <button
                      disabled
                      className="px-2 py-1 text-xs border border-gray-200 rounded text-gray-400 cursor-not-allowed whitespace-nowrap"
                      title="Disponible cuando se implemente la RPC segura de Compliance"
                    >
                      Resolver
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">Página {page} de {totalPages}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Anterior
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}