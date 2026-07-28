import { useState, useEffect } from 'react';
import type { ComplianceReservationDetail, ComplianceReservation } from '@/types/compliance';
import type { ComplianceIncident, IncidentSeverity, IncidentStatus } from '@/types/compliance';
import { getStatusLabel, UNCLASSIFIED_STATUSES } from '@/types/compliance';
import { complianceService } from '@/services/complianceService';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import RuleEnginePipeline from './RuleEnginePipeline';
import WarehouseResolutionCard from './WarehouseResolutionCard';
import EvaluatedRulesList from './EvaluatedRulesList';
import ReservationComplianceTimeline from './ReservationComplianceTimeline';
import ComplianceTechnicalContext from './ComplianceTechnicalContext';
import ComplianceAuditLog from './ComplianceAuditLog';

interface ReservationComplianceDrawerProps {
  reservation: ComplianceReservation | null;
  isOpen: boolean;
  onClose: () => void;
}

const resultLabels: Record<string, string> = {
  PASS: 'PASS',
  WARN: 'WARN',
  BLOCK: 'BLOCK',
  ERROR: 'ERROR',
  NOT_EVALUATED: 'NO EVAL',
};

const resultColors: Record<string, string> = {
  PASS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  WARN: 'bg-amber-50 text-amber-700 border-amber-200',
  BLOCK: 'bg-red-50 text-red-700 border-red-200',
  ERROR: 'bg-red-100 text-red-800 border-red-300',
  NOT_EVALUATED: 'bg-gray-50 text-gray-500 border-gray-200',
};

type DetailTab = 'summary' | 'rules' | 'timeline' | 'incidents' | 'technical' | 'audit' | 'stateflow';

export default function ReservationComplianceDrawer({ reservation, isOpen, onClose }: ReservationComplianceDrawerProps) {
  const [detail, setDetail] = useState<ComplianceReservationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('summary');
  const { user } = useAuth();
  const { orgId: currentOrgId } = usePermissions();
  const orgId = currentOrgId || user?.orgId || '';

  useEffect(() => {
    if (isOpen && reservation) {
      setLoading(true);
      setError(null);
      setActiveTab('summary');
      complianceService
        .getComplianceReservationDetail(orgId, reservation.id)
        .then((data) => {
          setDetail(data);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message || 'Error al cargar detalle');
          setLoading(false);
        });
    } else {
      setDetail(null);
    }
  }, [isOpen, reservation?.id, orgId]);

  if (!isOpen || !reservation) return null;

  const tabs: { key: DetailTab; label: string; icon: string; count?: number }[] = [
    { key: 'summary', label: 'Resumen', icon: 'ri-file-list-3-line' },
    { key: 'rules', label: 'Reglas', icon: 'ri-scales-line', count: detail?.evaluatedRules.length },
    { key: 'timeline', label: 'Timeline', icon: 'ri-history-line' },
    { key: 'incidents', label: 'Incidencias', icon: 'ri-alert-line', count: detail?.incidents.length },
    { key: 'technical', label: 'Técnico', icon: 'ri-code-s-slash-line' },
    { key: 'audit', label: 'Auditoría', icon: 'ri-file-search-line' },
    { key: 'stateflow', label: 'State Flow', icon: 'ri-git-branch-line' },
  ];

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose}></div>

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full sm:w-[640px] lg:w-[800px] bg-gray-50 z-50 shadow-2xl flex flex-col animate-slideInRight">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center">
              <i className="ri-file-list-3-line text-teal-600 text-lg"></i>
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Reserva #{reservation.id.slice(-8).toUpperCase()}</h2>
              <p className="text-xs text-gray-500">{reservation.reservationDate} {reservation.reservationTime}</p>
            </div>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${resultColors[reservation.result]}`}>
              {resultLabels[reservation.result]}
            </span>
            {reservation.isDemo && (
              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Demo</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Acciones deshabilitadas con tooltip */}
            <button disabled className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-400 cursor-not-allowed flex items-center gap-1" title="Disponible cuando se implemente la RPC segura de Compliance">
              <i className="ri-shield-flash-line w-3.5 h-3.5 flex items-center justify-center"></i>
              Override
            </button>
            <button disabled className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-400 cursor-not-allowed flex items-center gap-1" title="Disponible cuando se implemente la RPC segura de Compliance">
              <i className="ri-download-line w-3.5 h-3.5 flex items-center justify-center"></i>
              Exportar
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer">
              <i className="ri-close-line text-gray-500 text-lg"></i>
            </button>
          </div>
        </div>

        {/* ═══ RESUMEN INMEDIATO — visible sin navegar tabs ═══ */}
        {detail && (
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex-shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
              <div className="bg-white rounded-lg border border-gray-200 p-2">
                <span className="text-gray-400 block mb-0.5">
                  Resultado
                  {!detail.isDemo && detail.isRealData && <span className="text-[9px] text-gray-500 ml-1">PENDIENTE</span>}
                </span>
                <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-bold border ${resultColors[detail.result]}`}>
                  {resultLabels[detail.result]}
                </span>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-2">
                <span className="text-gray-400 block mb-0.5">Severidad</span>
                <span className={`text-sm font-semibold ${detail.severity === 'HIGH' || detail.severity === 'CRITICAL' ? 'text-red-600' : detail.severity === 'MEDIUM' ? 'text-amber-600' : 'text-gray-600'}`}>
                  {detail.severity || '—'}
                </span>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-2">
                <span className="text-gray-400 block mb-0.5">Regla determinante</span>
                <span className="text-sm font-semibold text-teal-700" title={detail.decisiveRuleName || ''}>
                  {detail.decisiveRule || '—'}
                </span>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-2">
                <span className="text-gray-400 block mb-0.5">
                  Estado actual
                  {!detail.isDemo && detail.isRealData && <span className="text-[9px] text-green-600 ml-1">REAL</span>}
                </span>
                <span
                  className={`text-sm font-semibold ${detail.currentStatus && UNCLASSIFIED_STATUSES.has(detail.currentStatus.trim()) ? 'text-amber-600' : 'text-gray-800'}`}
                  title={`Código: ${detail.currentStatus}`}
                >
                  {getStatusLabel(detail.currentStatus)}
                </span>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-2">
                <span className="text-gray-400 block mb-0.5">
                  Warehouse
                  {!detail.isDemo && detail.isRealData && <span className="text-[9px] text-green-600 ml-1">REAL</span>}
                </span>
                <span className="text-sm font-semibold text-gray-800 truncate block" title={detail.warehouseResolution.warehouseName || 'No resuelto'}>
                  {detail.warehouseResolution.warehouseName || 'No resuelto'}
                </span>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-2">
                <span className="text-gray-400 block mb-0.5">Incidencias</span>
                {detail.incidentCount === null ? (
                  <span className="text-sm font-semibold text-gray-400" title="Motor de reglas no conectado">—</span>
                ) : (
                  <span className={`text-sm font-semibold ${detail.incidentCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {detail.incidentCount} {detail.incidentCount === 1 ? 'abierta' : 'abiertas'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 bg-white border-b border-gray-100 overflow-x-auto flex-shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === tab.key ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <i className={`${tab.icon} w-3.5 h-3.5 flex items-center justify-center`}></i>
              {tab.label}
              {tab.count !== undefined && (
                <span className={`px-1 rounded-full text-[10px] ${activeTab === tab.key ? 'bg-teal-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <i className="ri-loader-4-line text-3xl text-teal-600 animate-spin"></i>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              <i className="ri-error-warning-line mr-1"></i>
              {error}
              <button onClick={() => { setError(null); setLoading(true); complianceService.getComplianceReservationDetail(orgId, reservation.id).then(setDetail).finally(() => setLoading(false)); }} className="ml-2 text-red-600 underline cursor-pointer">
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && detail && (
            <>
              {/* TAB: Summary */}
              {activeTab === 'summary' && (
                <div className="space-y-4">
                  {/* Resumen */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h4 className="text-xs font-semibold text-gray-700 mb-3">Resumen de la Reserva</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <div><span className="text-xs text-gray-400">ID {!detail.isDemo && <span className="text-[9px] text-green-600">REAL</span>}</span><p className="text-gray-800 font-mono text-xs">{detail.id}</p></div>
                      <div><span className="text-xs text-gray-400">Fecha/Hora {!detail.isDemo && <span className="text-[9px] text-green-600">REAL</span>}</span><p className="text-gray-800">{detail.reservationDate} {detail.reservationTime}</p></div>
                      <div><span className="text-xs text-gray-400">Cliente {!detail.isDemo && <span className="text-[9px] text-green-600">REAL</span>}</span><p className="text-gray-800">{detail.clientName || 'No registrado'}</p></div>
                      <div><span className="text-xs text-gray-400">Proveedor {!detail.isDemo && <span className="text-[9px] text-green-600">REAL</span>}</span><p className="text-gray-800">{detail.providerName || '—'}</p></div>
                      <div><span className="text-xs text-gray-400">Conductor {!detail.isDemo && <span className="text-[9px] text-green-600">REAL</span>}</span><p className="text-gray-800">{detail.driver || '—'}</p></div>
                      <div><span className="text-xs text-gray-400">Placa {!detail.isDemo && <span className="text-[9px] text-green-600">REAL</span>}</span><p className="text-gray-800 font-mono">{detail.truckPlate || '—'}</p></div>
                      <div><span className="text-xs text-gray-400">Dock {!detail.isDemo && <span className="text-[9px] text-green-600">REAL</span>}</span><p className="text-gray-800">{detail.dockName || '—'}</p></div>
                      <div><span className="text-xs text-gray-400">Estado actual {!detail.isDemo && <span className="text-[9px] text-green-600">REAL</span>}</span><p className="text-gray-800 font-medium">{getStatusLabel(detail.currentStatus) || '—'}</p></div>
                      <div><span className="text-xs text-gray-400">Estado anterior</span><p className="text-gray-500">{detail.previousStatus || '—'}</p></div>
                      <div><span className="text-xs text-gray-400">Resultado <span className="text-[9px] text-gray-500">PENDIENTE</span></span>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-bold border ${resultColors[detail.result]}`}>{resultLabels[detail.result]}</span>
                      </div>
                      <div><span className="text-xs text-gray-400">Severidad <span className="text-[9px] text-gray-500">PENDIENTE</span></span><p className="text-gray-800">{detail.severity || '—'}</p></div>
                      <div><span className="text-xs text-gray-400">Incidencias <span className="text-[9px] text-gray-500">PENDIENTE</span></span><p className="text-gray-800">{detail.incidentCount === null ? '—' : detail.incidentCount}</p></div>
                    </div>
                  </div>

                  {/* Warehouse Resolution */}
                  <WarehouseResolutionCard resolution={detail.warehouseResolution} />

                  {/* Pipeline */}
                  <RuleEnginePipeline stages={detail.execution.stages} isDemo={detail.isDemo} />
                </div>
              )}

              {/* TAB: Rules */}
              {activeTab === 'rules' && (
                <EvaluatedRulesList rules={detail.evaluatedRules} />
              )}

              {/* TAB: Timeline */}
              {activeTab === 'timeline' && (
                <ReservationComplianceTimeline events={detail.timeline} isDemo={detail.isDemo} />
              )}

              {/* TAB: Incidents */}
              {activeTab === 'incidents' && (
                <div className="space-y-3">
                  {detail.incidents.length === 0 ? (
                    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                      <i className="ri-shield-check-line text-4xl text-emerald-300"></i>
                      <p className="mt-2 text-sm text-gray-500">Sin incidencias para esta reserva</p>
                    </div>
                  ) : (
                    detail.incidents.map((inc) => (
                      <IncidentCard key={inc.id} incident={inc} isDemo={detail.isDemo} />
                    ))
                  )}
                </div>
              )}

              {/* TAB: Technical */}
              {activeTab === 'technical' && (
                <ComplianceTechnicalContext context={detail.technicalContext} />
              )}

              {/* TAB: Audit */}
              {activeTab === 'audit' && (
                <ComplianceAuditLog events={detail.auditLog} />
              )}

              {/* TAB: State Flow */}
              {activeTab === 'stateflow' && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h4 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                    <i className="ri-git-branch-line text-teal-600"></i>
                    State Flow
                  </h4>
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    {['PENDING', 'CONFIRMED', 'ARRIVED_PENDING_UNLOAD', 'IN_PROGRESS', 'UNLOADING', 'DISCHARGED', 'DISPATCHED', 'DONE'].map((state, idx) => {
                      const isCurrent = state === detail.currentStatus || state === detail.previousStatus;
                      const isDemoState = ['CHECKING_IN', 'CHECKEDIN_PENDING_CLOSE', 'UNLOADED_PENDING_CHECKIN'].includes(state);
                      return (
                        <div key={state} className="flex items-center gap-1">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                            isDemoState ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            isCurrent ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {state}
                            {isDemoState && (
                              <span className="ml-1 text-[10px] text-amber-600 italic" title="Estado pendiente de clasificación">
                                *
                              </span>
                            )}
                          </span>
                          {idx < 7 && <i className="ri-arrow-right-line text-gray-300 text-xs"></i>}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-3">
                    * Estados CHECKING_IN, CHECKEDIN_PENDING_CLOSE y UNLOADED_PENDING_CHECKIN están pendientes de clasificación oficial en el STATE_MACHINE_SPEC.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Incident Card (dentro del drawer) ──────────────────────────────────

const incidentStatusConfig: Record<IncidentStatus, { label: string; classes: string }> = {
  OPEN: { label: 'Abierta', classes: 'bg-red-50 text-red-700 border-red-200' },
  IN_REVIEW: { label: 'En revisión', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  RESOLVED: { label: 'Resuelta', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  DISMISSED: { label: 'Descartada', classes: 'bg-gray-50 text-gray-500 border-gray-200' },
  VOIDED: { label: 'Anulada', classes: 'bg-gray-50 text-gray-400 border-gray-200' },
};

const incidentSeverityConfig: Record<IncidentSeverity, { label: string; classes: string }> = {
  INFO: { label: 'INFO', classes: 'bg-gray-100 text-gray-600' },
  LOW: { label: 'LOW', classes: 'bg-blue-50 text-blue-600' },
  MEDIUM: { label: 'MEDIUM', classes: 'bg-amber-50 text-amber-600' },
  HIGH: { label: 'HIGH', classes: 'bg-red-50 text-red-600' },
  CRITICAL: { label: 'CRITICAL', classes: 'bg-red-100 text-red-800' },
};

function IncidentCard({ incident, isDemo }: { incident: ComplianceIncident; isDemo?: boolean }) {
  const st = incidentStatusConfig[incident.status];
  const sev = incidentSeverityConfig[incident.severity];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-gray-500">{incident.code}</span>
          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${sev.classes}`}>{sev.label}</span>
          <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${st.classes}`}>{st.label}</span>
        </div>
        {isDemo && <span className="text-[10px] text-amber-500">Demo</span>}
      </div>
      <h5 className="text-sm font-semibold text-gray-800 mb-1">{incident.title}</h5>
      <p className="text-xs text-gray-500 mb-3">{incident.description}</p>
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
        <div><span className="text-gray-400">Regla:</span> <span className="text-teal-600 font-medium">{incident.ruleName || '—'}</span></div>
        <div><span className="text-gray-400">Warehouse:</span> <span>{incident.warehouseName || '—'}</span></div>
        <div><span className="text-gray-400">Responsable:</span> <span>{incident.assigneeName || 'Sin asignar'}</span></div>
        <div><span className="text-gray-400">Ocurrencias:</span> <span>{incident.occurrenceCount}</span></div>
        <div><span className="text-gray-400">Abierta:</span> <span>{incident.openDurationHours.toFixed(1)}h</span></div>
        <div><span className="text-gray-400">Resuelta:</span> <span>{incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleDateString('es-CR') : '—'}</span></div>
      </div>
    </div>
  );
}