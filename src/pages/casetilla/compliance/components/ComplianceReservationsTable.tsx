import type { ComplianceReservation, ComplianceResult } from '@/types/compliance';
import { getStatusLabel, UNCLASSIFIED_STATUSES } from '@/types/compliance';

interface ComplianceReservationsTableProps {
  reservations: ComplianceReservation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  selectedId: string | null;
  resultFilter: ComplianceResult | null;
  isHybrid?: boolean;
  onSelectReservation: (reservation: ComplianceReservation) => void;
  onPageChange: (page: number) => void;
  onResultFilterChange: (result: ComplianceResult | null) => void;
}

const resultConfig: Record<ComplianceResult, { label: string; classes: string }> = {
  PASS: { label: 'PASS', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  WARN: { label: 'WARN', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  BLOCK: { label: 'BLOCK', classes: 'bg-red-50 text-red-700 border-red-200' },
  ERROR: { label: 'ERROR', classes: 'bg-red-100 text-red-800 border-red-300' },
  NOT_EVALUATED: { label: 'NO EVAL', classes: 'bg-gray-50 text-gray-500 border-gray-200' },
};

const quickFilters: { label: string; value: ComplianceResult | null }[] = [
  { label: 'Todas', value: null },
  { label: 'Correctas', value: 'PASS' },
  { label: 'Advertencia', value: 'WARN' },
  { label: 'Bloqueadas', value: 'BLOCK' },
  { label: 'Error', value: 'ERROR' },
];

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function ComplianceReservationsTable({
  reservations,
  total,
  page,
  pageSize,
  totalPages,
  loading,
  selectedId,
  resultFilter,
  isHybrid,
  onSelectReservation,
  onPageChange,
  onResultFilterChange,
}: ComplianceReservationsTableProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Filtros rápidos */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        {quickFilters.map((f) => (
          <button
            key={f.label}
            onClick={() => onResultFilterChange(f.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              resultFilter === f.value
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-auto">{total} resultados</span>
      </div>

      {/* Tabla desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">Reserva</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">Fecha/Hora</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">
                Estado
                <span className="block text-[9px] font-normal text-green-600 normal-case">Operativo — REAL</span>
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">
                Resultado
                <span className="block text-[9px] font-normal text-gray-500 normal-case">Compliance — PENDIENTE</span>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">Regla determinante</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">Incidencias</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">Almacén</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">Última actualización</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider whitespace-nowrap">Acción</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {reservations.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <i className="ri-inbox-line text-4xl text-gray-300"></i>
                  <p className="mt-2 text-sm text-gray-500">No se encontraron reservas evaluadas</p>
                </td>
              </tr>
            ) : (
              reservations.map((r) => {
                const resConf = resultConfig[r.result];
                const isSelected = selectedId === r.id;
                const statusLabel = getStatusLabel(r.currentStatus);
                const isUnclassified = r.currentStatus ? UNCLASSIFIED_STATUSES.has(r.currentStatus.trim()) : false;
                const truncatedClient = (r.clientName?.length ?? 0) > 18 ? `${r.clientName?.slice(0, 16)}…` : r.clientName;

                return (
                  <tr
                    key={r.id}
                    onClick={() => onSelectReservation(r)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-teal-50 border-l-2 border-l-teal-500' : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Reserva */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-mono text-teal-700 font-medium whitespace-nowrap">#{r.id.slice(-8).toUpperCase()}</span>
                        {r.isRealData && (
                          <span className="inline-flex px-1 py-0 text-[9px] font-bold bg-green-50 text-green-600 border border-green-200 rounded whitespace-nowrap" title="Datos operativos reales">BD</span>
                        )}
                        {r.isDemo && (
                          <span className="inline-flex px-1 py-0 text-[9px] font-medium bg-amber-50 text-amber-600 border border-amber-200 rounded whitespace-nowrap" title="Datos demostrativos">DEMO</span>
                        )}
                      </div>
                      {truncatedClient && (
                        <p className="text-[11px] text-gray-400 truncate max-w-[140px]" title={r.clientName || 'Cliente no registrado en BD'}>{truncatedClient}</p>
                      )}
                      {r.isRealData && !r.clientName && (
                        <p className="text-[10px] text-amber-500 italic">Cliente no registrado</p>
                      )}
                    </td>

                    {/* Fecha/Hora */}
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {r.reservationDate} {r.reservationTime}
                    </td>

                    {/* Estado — nombre amigable + tooltip con código */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                          isUnclassified ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-700'
                        }`}
                        title={`Código técnico: ${r.currentStatus || '—'}${isUnclassified ? ' — Estado pendiente de clasificación en STATE_MACHINE_SPEC' : ''}`}
                      >
                        {statusLabel}
                        {isUnclassified && (
                          <span className="text-[10px]" title="Pendiente de clasificación">*</span>
                        )}
                      </span>
                    </td>

                    {/* Resultado */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${resConf.classes} whitespace-nowrap`}>
                        {resConf.label}
                      </span>
                    </td>

                    {/* Regla determinante */}
                    <td className="px-4 py-3">
                      {r.decisiveRule ? (
                        <span
                          className="text-xs font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded whitespace-nowrap inline-block max-w-[160px] truncate"
                          title={`${r.decisiveRule}: ${r.decisiveRuleName || ''}`}
                        >
                          {r.decisiveRule} {r.decisiveRuleName ? `— ${r.decisiveRuleName.length > 16 ? r.decisiveRuleName.slice(0, 14) + '…' : r.decisiveRuleName}` : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    {/* Incidencias */}
                    <td className="px-4 py-3 text-center">
                      {r.incidentCount === null ? (
                        <span className="text-gray-400 text-xs" title="Motor de reglas no conectado — incidencias no disponibles">—</span>
                      ) : r.incidentCount > 0 ? (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 text-red-700 rounded-full text-xs font-bold">
                          <i className="ri-alert-line text-[10px] w-3 h-3 flex items-center justify-center"></i>
                          {r.incidentCount}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">0</span>
                      )}
                    </td>

                    {/* Almacén */}
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap max-w-[160px] truncate" title={r.warehouseName || ''}>
                      {r.warehouseName || '—'}
                    </td>

                    {/* Última Act. */}
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {formatDate(r.lastActivity)}
                    </td>

                    {/* Acción — Ver detalle */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectReservation(r); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-eye-line w-3.5 h-3.5 flex items-center justify-center"></i>
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Cards mobile */}
      <div className="md:hidden divide-y divide-gray-100">
        {reservations.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <i className="ri-inbox-line text-4xl text-gray-300"></i>
            <p className="mt-2 text-sm text-gray-500">No se encontraron reservas evaluadas</p>
          </div>
        ) : (
          reservations.map((r) => {
            const resConf = resultConfig[r.result];
            const statusLabel = getStatusLabel(r.currentStatus);
            return (
              <div
                key={r.id}
                onClick={() => onSelectReservation(r)}
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-sm text-teal-700 font-bold">#{r.id.slice(-8).toUpperCase()}</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${resConf.classes}`}>
                    {resConf.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
                  <span>{r.reservationDate} {r.reservationTime}</span>
                  <span className="text-right">
                    <span className="bg-gray-100 px-1.5 py-0.5 rounded text-xs" title={`Código: ${r.currentStatus}`}>{statusLabel}</span>
                  </span>
                  <span title={r.warehouseName || ''}>{r.warehouseName || '—'}</span>
                  <span className="text-right flex items-center justify-end gap-1">
                    {r.incidentCount > 0 && (
                      <span className="text-red-600 font-bold"><i className="ri-alert-line"></i> {r.incidentCount}</span>
                    )}
                    {r.decisiveRule && <span className="text-teal-600 text-[10px]">{r.decisiveRule}</span>}
                  </span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onSelectReservation(r); }}
                  className="mt-2 w-full text-center text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg py-1.5 hover:bg-teal-100 cursor-pointer"
                >
                  <i className="ri-eye-line mr-1 w-3 h-3 inline-flex items-center justify-center"></i>
                  Ver detalle
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Página {page} de {totalPages} ({total} resultados)
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Anterior
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`w-8 h-8 text-xs rounded-lg cursor-pointer ${
                    pageNum === page ? 'bg-teal-600 text-white' : 'border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}