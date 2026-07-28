import { useState } from 'react';
import type { RuleEngineStage, PipelineNodeStatus, ComplianceResult, IncidentSeverity } from '@/types/compliance';

interface RuleEnginePipelineProps {
  stages: RuleEngineStage[];
  isDemo?: boolean;
  finalResult?: ComplianceResult;
  finalSeverity?: IncidentSeverity | null;
  decisiveRule?: string | null;
  decisiveRuleName?: string | null;
  applicableRulesCount?: number;
  passedRulesCount?: number;
  failedRulesCount?: number;
  skippedRulesCount?: number;
  totalRulesCount?: number;
  totalDurationMs?: number;
  /** Cuando true, muestra "Motor de reglas pendiente de conexión" en vez de resultados */
  isNotEvaluated?: boolean;
}

const statusConfig: Record<PipelineNodeStatus, { label: string; bg: string; text: string; border: string; icon: string }> = {
  pending: { label: 'Pendiente', bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-300', icon: 'ri-time-line' },
  processing: { label: 'Procesando', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-300', icon: 'ri-loader-4-line animate-spin' },
  success: { label: 'Correcto', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300', icon: 'ri-check-line' },
  warning: { label: 'Advertencia', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300', icon: 'ri-error-warning-line' },
  blocked: { label: 'Bloqueado', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300', icon: 'ri-forbid-line' },
  error: { label: 'Error', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-400', icon: 'ri-close-circle-line' },
  skipped: { label: 'Omitido', bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-200', icon: 'ri-subtract-line' },
};

const resultConfig: Record<ComplianceResult, { label: string; classes: string; icon: string }> = {
  PASS: { label: 'PASS', classes: 'bg-emerald-50 text-emerald-700 border-emerald-300', icon: 'ri-check-double-line' },
  WARN: { label: 'WARN', classes: 'bg-amber-50 text-amber-700 border-amber-300', icon: 'ri-error-warning-line' },
  BLOCK: { label: 'BLOCK', classes: 'bg-red-50 text-red-700 border-red-300', icon: 'ri-forbid-line' },
  ERROR: { label: 'ERROR', classes: 'bg-red-100 text-red-800 border-red-400', icon: 'ri-close-circle-line' },
  NOT_EVALUATED: { label: 'NO EVAL', classes: 'bg-gray-50 text-gray-500 border-gray-200', icon: 'ri-subtract-line' },
};

export default function RuleEnginePipeline({ stages, isDemo, finalResult, finalSeverity, decisiveRule, decisiveRuleName, applicableRulesCount, passedRulesCount, failedRulesCount, skippedRulesCount, totalRulesCount, totalDurationMs, isNotEvaluated }: RuleEnginePipelineProps) {
  const [selectedStage, setSelectedStage] = useState<RuleEngineStage | null>(null);

  const resultConf = finalResult ? resultConfig[finalResult] : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Pipeline del Rule Engine</h3>
          <p className="text-xs text-gray-500 mt-0.5">Flujo de evaluación de transiciones</p>
        </div>
      </div>

      {/* Bloque de RESUMEN FINAL — visible e importante */}
      {isNotEvaluated ? (
        <div className="mb-5 p-4 rounded-lg border-2 border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <i className="ri-subtract-line text-xl text-gray-400"></i>
              <span className="text-lg font-bold text-gray-700">Resultado final:</span>
              <span className="inline-flex px-3 py-1 rounded-full text-sm font-bold border bg-gray-100 text-gray-500 border-gray-300">
                NO EVALUADO
              </span>
            </div>
          </div>
          <div className="mt-3 text-sm text-gray-600">
            <i className="ri-information-line mr-1 w-4 h-4 inline-flex items-center justify-center text-amber-500"></i>
            <span className="font-medium">Motor de reglas pendiente de conexión.</span>
            <span className="text-gray-500 ml-1">Las reservas operativas se muestran con sus datos reales, pero la evaluación de compliance aún no está disponible.</span>
          </div>
        </div>
      ) : finalResult ? (
        <div className={`mb-5 p-4 rounded-lg border-2 ${resultConf?.classes || 'border-gray-200'}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <i className={`${resultConf?.icon || 'ri-question-line'} text-xl`}></i>
              <span className="text-lg font-bold">Resultado final:</span>
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold border ${resultConf?.classes}`}>
                {resultConf?.label || finalResult}
              </span>
            </div>
            {finalSeverity && (
              <span className="text-sm text-gray-600">
                Severidad: <span className="font-semibold text-gray-800">{finalSeverity}</span>
              </span>
            )}
            {decisiveRule && (
              <span className="text-sm text-gray-600">
                Regla determinante: <span className="font-semibold text-teal-700">{decisiveRule}</span>
                {decisiveRuleName && <span className="text-gray-500"> — {decisiveRuleName}</span>}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3 text-xs text-gray-600">
            <div><span className="text-gray-400">Reglas cargadas:</span> <span className="font-semibold">{totalRulesCount ?? '—'}</span></div>
            <div><span className="text-gray-400">Reglas aplicables:</span> <span className="font-semibold">{applicableRulesCount ?? '—'}</span></div>
            <div><span className="text-gray-400">Reglas aprobadas:</span> <span className="font-semibold text-emerald-600">{passedRulesCount ?? '—'}</span></div>
            <div><span className="text-gray-400">Reglas fallidas:</span> <span className={`font-semibold ${(failedRulesCount ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{failedRulesCount ?? 0}</span></div>
            <div><span className="text-gray-400">Reglas omitidas:</span> <span className="font-semibold text-gray-500">{skippedRulesCount ?? '—'}</span></div>
            <div><span className="text-gray-400">Tiempo total:</span> <span className="font-semibold">{totalDurationMs ?? '—'} ms</span></div>
          </div>
          {/* Reconciliación matemática */}
          {(totalRulesCount && applicableRulesCount && passedRulesCount !== undefined && failedRulesCount !== undefined) && (
            <div className="mt-2 text-[10px] text-gray-400">
              {totalRulesCount} = {applicableRulesCount} aplicables ({passedRulesCount} aprobadas + {failedRulesCount} fallidas) + {(skippedRulesCount ?? 0)} omitidas
              {' · '}
              {(passedRulesCount + failedRulesCount) === applicableRulesCount ? (
                <span className="text-emerald-600">✓ Reconciliación correcta</span>
              ) : (
                <span className="text-red-600">✗ Inconsistente: {passedRulesCount + failedRulesCount} ≠ {applicableRulesCount}</span>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Pipeline horizontal (desktop) */}
      <div className="hidden lg:flex items-start gap-0">
        {stages.map((stage, idx) => {
          const effectiveStatus = isNotEvaluated ? 'pending' : stage.status;
          const conf = statusConfig[effectiveStatus];
          const isSelected = selectedStage?.id === stage.id;
          return (
            <div key={stage.id} className="flex items-start flex-1 min-w-0">
              <button
                onClick={() => setSelectedStage(isSelected ? null : stage)}
                className={`flex-1 flex flex-col items-center text-center p-3 rounded-xl border-2 transition-all cursor-pointer ${
                  isSelected ? `${conf.border} ${conf.bg} shadow-sm` : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg ${conf.bg} ${conf.text} flex items-center justify-center mb-2`}>
                  <i className={`${conf.icon} text-lg`}></i>
                </div>
                <span className="text-xs font-semibold text-gray-800 mb-1">{stage.name}</span>
                <span className="text-[10px] text-gray-500">{isNotEvaluated ? '—' : `${stage.processedCount}`} proc.</span>
                <span className="text-[10px] text-gray-400">{isNotEvaluated ? '—' : `${stage.durationMs}`} ms</span>
              </button>
              {idx < stages.length - 1 && (
                <div className="flex items-center pt-7 px-0.5">
                  <div className="w-6 h-px bg-gray-300"></div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pipeline vertical (mobile/tablet) */}
      <div className="lg:hidden space-y-2">
        {stages.map((stage) => {
          const effectiveStatus = isNotEvaluated ? 'pending' : stage.status;
          const conf = statusConfig[effectiveStatus];
          const isSelected = selectedStage?.id === stage.id;
          return (
            <div key={stage.id}>
              <button
                onClick={() => setSelectedStage(isSelected ? null : stage)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${
                  isSelected ? `${conf.border} ${conf.bg}` : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg ${conf.bg} ${conf.text} flex items-center justify-center flex-shrink-0`}>
                  <i className={`${conf.icon} text-lg`}></i>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800">{stage.name}</span>
                    <span className="text-[10px] font-medium text-gray-400">{isNotEvaluated ? '—' : `${stage.durationMs} ms`}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{isNotEvaluated ? 'Motor no conectado' : stage.summary}</p>
                </div>
                <i className="ri-arrow-right-s-line text-gray-400"></i>
              </button>
            </div>
          );
        })}
      </div>

      {/* Panel de detalle de etapa seleccionada — enriquecido */}
      {selectedStage && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg ${statusConfig[isNotEvaluated ? 'pending' : selectedStage.status].bg} ${statusConfig[isNotEvaluated ? 'pending' : selectedStage.status].text} flex items-center justify-center`}>
                <i className={`${statusConfig[isNotEvaluated ? 'pending' : selectedStage.status].icon} text-sm`}></i>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-800">{selectedStage.name}</h4>
                <p className="text-xs text-gray-500">
                  Estado: <span className={`font-medium ${statusConfig[isNotEvaluated ? 'pending' : selectedStage.status].text}`}>{statusConfig[isNotEvaluated ? 'pending' : selectedStage.status].label}</span>
                  {' · '}{isNotEvaluated ? '—' : `${selectedStage.processedCount}`} procesados · {isNotEvaluated ? '—' : `${selectedStage.durationMs}`} ms
                </p>
              </div>
            </div>
            <button onClick={() => setSelectedStage(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
              <i className="ri-close-line"></i>
            </button>
          </div>

          {/* Descripción */}
          <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">
            {isNotEvaluated ? 'Motor de reglas no conectado. La evaluación estará disponible cuando se implemente la Fase 6.1.' : selectedStage.summary}
          </p>

          {/* Detalles técnicos */}
          {!isNotEvaluated && selectedStage.details && (
            <div className="text-xs text-gray-600 bg-white rounded p-3 border border-gray-200 whitespace-pre-wrap leading-relaxed">
              {selectedStage.details}
            </div>
          )}
        </div>
      )}

      {/* Badge demo sutil */}
      {isDemo && !finalResult && (
        <p className="text-[10px] text-amber-600/70 mt-3 text-right">Datos simulados — Modo demostración</p>
      )}
    </div>
  );
}