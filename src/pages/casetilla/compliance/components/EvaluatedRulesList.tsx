import { useState } from 'react';
import type { EvaluatedRule, RuleResult } from '@/types/compliance';

interface EvaluatedRulesListProps {
  rules: EvaluatedRule[];
}

const resultConfig: Record<RuleResult, { label: string; classes: string; icon: string }> = {
  PASSED: { label: 'APROBADA', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'ri-check-line' },
  FAILED: { label: 'FALLIDA', classes: 'bg-red-50 text-red-700 border-red-200', icon: 'ri-close-line' },
  SKIPPED: { label: 'OMITIDA', classes: 'bg-gray-50 text-gray-500 border-gray-200', icon: 'ri-subtract-line' },
  NOT_APPLICABLE: { label: 'NO APLICA', classes: 'bg-gray-50 text-gray-400 border-gray-200', icon: 'ri-forbid-line' },
  ERROR: { label: 'ERROR', classes: 'bg-red-100 text-red-800 border-red-300', icon: 'ri-error-warning-line' },
};

const categoryLabels: Record<string, string> = {
  state_validation: 'Validación de estado',
  warehouse_check: 'Verificación de warehouse',
  client_check: 'Verificación de cliente',
  temporal_check: 'Verificación temporal',
  concurrency_check: 'Control de concurrencia',
  authorization_check: 'Autorización',
  system: 'Sistema',
};

const severityColors: Record<string, string> = {
  CRITICAL: 'text-red-600 font-bold',
  HIGH: 'text-red-500',
  MEDIUM: 'text-amber-500',
  LOW: 'text-blue-500',
  INFO: 'text-gray-400',
};

type ResultFilter = 'all' | 'failed' | 'passed' | 'skipped';

export default function EvaluatedRulesList({ rules }: EvaluatedRulesListProps) {
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  const filtered = filter === 'all'
    ? rules
    : filter === 'failed'
      ? rules.filter((r) => r.result === 'FAILED' || r.result === 'ERROR')
      : filter === 'passed'
        ? rules.filter((r) => r.result === 'PASSED')
        : rules.filter((r) => r.result === 'SKIPPED' || r.result === 'NOT_APPLICABLE');

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h4 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
        <i className="ri-scales-line text-teal-600"></i>
        Reglas Evaluadas
        <span className="text-gray-400 font-normal">({rules.length})</span>
      </h4>

      {/* Filtros rápidos */}
      <div className="flex items-center gap-1.5 mb-3">
        {([
          { key: 'all' as ResultFilter, label: 'Todas' },
          { key: 'failed' as ResultFilter, label: 'Fallidas' },
          { key: 'passed' as ResultFilter, label: 'Aprobadas' },
          { key: 'skipped' as ResultFilter, label: 'Omitidas' },
        ]).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2 py-1 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
              filter === f.key ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((rule) => {
          const resConf = resultConfig[rule.result];
          const isExpanded = expandedRule === rule.code;
          return (
            <div key={rule.code} className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedRule(isExpanded ? null : rule.code)}
                className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left cursor-pointer"
              >
                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${resConf.classes} flex-shrink-0`}>
                  {resConf.label}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-800">{rule.code} — {rule.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{categoryLabels[rule.category] || rule.category}</span>
                </div>
                <span className={`text-xs ${severityColors[rule.severity] || 'text-gray-500'}`}>{rule.severity}</span>
                <i className={`ri-${isExpanded ? 'arrow-up-s' : 'arrow-down-s'}-line text-gray-400`}></i>
              </button>
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2 border-t border-gray-50 pt-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-400">Prioridad:</span>
                      <span className="text-gray-700 ml-1">{rule.priority}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Tiempo:</span>
                      <span className="text-gray-700 ml-1">{rule.evaluationTimeMs} ms</span>
                    </div>
                  </div>
                  {rule.reason && (
                    <div>
                      <span className="text-xs text-gray-400">Motivo:</span>
                      <p className="text-xs text-gray-700 mt-0.5">{rule.reason}</p>
                    </div>
                  )}
                  {rule.conditions && (
                    <div>
                      <span className="text-xs text-gray-400">Condiciones:</span>
                      <p className="text-xs text-gray-600 font-mono mt-0.5 bg-gray-50 p-1.5 rounded">{rule.conditions}</p>
                    </div>
                  )}
                  {rule.action && (
                    <div>
                      <span className="text-xs text-gray-400">Acción:</span>
                      <span className="ml-1 inline-flex px-1.5 py-0.5 rounded text-xs font-bold bg-red-50 text-red-700">{rule.action}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}