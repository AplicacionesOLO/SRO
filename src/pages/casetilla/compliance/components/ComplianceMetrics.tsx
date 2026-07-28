import { useState, useMemo } from 'react';
import type { ComplianceMetric, ComplianceSummary, ComplianceResult, IncidentStatus } from '@/types/compliance';

interface ComplianceMetricsProps {
  summary: ComplianceSummary | null;
  loading?: boolean;
  onFilterByResult?: (result: ComplianceResult | null) => void;
  onNavigateToIncidents?: (incidentStatus?: IncidentStatus) => void;
  activeResultFilter?: ComplianceResult | null;
}

const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
  teal: { bg: 'bg-teal-50', text: 'text-teal-700', icon: 'text-teal-600' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'text-amber-600' },
  red: { bg: 'bg-red-50', text: 'text-red-700', icon: 'text-red-600' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-700', icon: 'text-violet-600' },
  cyan: { bg: 'bg-cyan-50', text: 'text-cyan-700', icon: 'text-cyan-600' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-500', icon: 'text-gray-400' },
};

/** Métricas que requieren Rule Engine para tener valores reales */
const REQUIRES_RULE_ENGINE = new Set([
  'Incidencias abiertas',
  'Transiciones bloqueadas',
  'Overrides realizados',
  'Tiempo promedio resolución',
]);

function formatValue(value: number, format?: string): string {
  if (format === 'duration') {
    const hours = Math.floor(value / 60);
    const mins = Math.round(value % 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }
  if (format === 'percent') return `${value}%`;
  return value.toLocaleString('es-CR');
}

export default function ComplianceMetrics({ summary, loading, onFilterByResult, onNavigateToIncidents, activeResultFilter }: ComplianceMetricsProps) {
  const metrics = summary?.metrics || [];

  const progressColor = useMemo(() => {
    const pct = summary?.compliancePercent || 0;
    if (pct >= 90) return 'bg-emerald-500';
    if (pct >= 75) return 'bg-amber-500';
    return 'bg-red-500';
  }, [summary?.compliancePercent]);

  const isHybrid = summary?.dataSource === 'hybrid';

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-16 mb-3"></div>
              <div className="h-7 bg-gray-200 rounded w-12 mb-2"></div>
              <div className="h-3 bg-gray-100 rounded w-10"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Fila de métricas interactivas */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map((metric) => {
          const colors = colorMap[metric.color] || colorMap.teal;
          const isClickable = !!(metric.filterResult || metric.filterView);
          const isActive = metric.filterResult ? activeResultFilter === metric.filterResult : false;

          return (
            <button
              key={metric.label}
              onClick={() => {
                if (isHybrid && REQUIRES_RULE_ENGINE.has(metric.label)) return;
                if (metric.filterView === 'incidents' && onNavigateToIncidents) {
                  onNavigateToIncidents(metric.filterIncidentStatus);
                } else if (metric.filterResult !== undefined && onFilterByResult) {
                  onFilterByResult(isActive ? null : metric.filterResult);
                }
              }}
              className={`bg-white rounded-xl border p-4 transition-all group relative text-left w-full ${
                (isHybrid && REQUIRES_RULE_ENGINE.has(metric.label))
                  ? 'cursor-default border-gray-200 opacity-70'
                  : isClickable
                    ? 'cursor-pointer hover:border-teal-300 hover:shadow-sm'
                    : 'cursor-default'
              } ${isActive ? 'border-teal-400 ring-1 ring-teal-300 bg-teal-50/50' : 'border-gray-200'}`}
              title={metric.tooltip}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center`}>
                  <i className={`${metric.icon} ${colors.icon} text-base`}></i>
                </div>
                <span className="text-xs text-gray-500 font-medium truncate">{metric.label}</span>
                {isHybrid && metric.label === 'Reservas del periodo' && (
                  <span className="inline-flex px-1 py-0 text-[9px] font-bold bg-green-50 text-green-600 border border-green-200 rounded whitespace-nowrap ml-auto" title="Dato proveniente de la base de datos real">REAL</span>
                )}
                {isHybrid && metric.label === 'Reservas evaluadas' && (
                  <span className="inline-flex px-1 py-0 text-[9px] font-medium bg-gray-100 text-gray-500 border border-gray-200 rounded whitespace-nowrap ml-auto" title="El motor de reglas aún no está conectado">PENDIENTE</span>
                )}
                {isHybrid && REQUIRES_RULE_ENGINE.has(metric.label) && (
                  <span className="inline-flex px-1 py-0 text-[9px] font-medium bg-gray-100 text-gray-400 border border-gray-200 rounded whitespace-nowrap ml-auto" title="Requiere Rule Engine conectado">NO DISPONIBLE</span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                {isHybrid && REQUIRES_RULE_ENGINE.has(metric.label) ? (
                  <span className="text-2xl font-bold text-gray-400">—</span>
                ) : (
                  <>
                    <span className="text-2xl font-bold text-gray-900">{formatValue(metric.value, metric.format)}</span>
                    {metric.changePercent !== undefined && metric.changePercent !== 0 && (
                      <span className={`text-xs font-medium ${metric.changePercent > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {metric.changePercent > 0 ? '+' : ''}{metric.changePercent}%
                      </span>
                    )}
                  </>
                )}
              </div>
              {/* Tooltip */}
              {(isHybrid && REQUIRES_RULE_ENGINE.has(metric.label)) ? (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  {metric.tooltip}
                  <span className="block text-gray-400 mt-0.5">Disponible en Fase 6.1 con Rule Engine</span>
                </div>
              ) : (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  {metric.tooltip}
                  {isClickable && <span className="block text-amber-300 mt-0.5">Click para filtrar</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Cumplimiento general — desglose completo */}
      {summary && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Cumplimiento general</h3>
            {isHybrid ? (
              <span className="text-sm font-bold text-gray-400">—</span>
            ) : (
              <span className="text-sm font-bold text-gray-900">{summary.compliancePercent}%</span>
            )}
          </div>

          {/* Barra de progreso con segmentos */}
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden flex">
            {isHybrid ? (
              <div
                className="h-full bg-gray-300 transition-all duration-700 ease-out"
                style={{ width: '100%' }}
                title="Sin evaluaciones de Compliance — el motor de reglas aún no está conectado"
              ></div>
            ) : (
              <>
                {summary.passed > 0 && (
                  <div
                    className="h-full bg-emerald-500 transition-all duration-700 ease-out cursor-pointer hover:opacity-80"
                    style={{ width: `${(summary.passed / summary.totalEvaluated) * 100}%` }}
                    onClick={() => onFilterByResult?.(activeResultFilter === 'PASS' ? null : 'PASS')}
                    title={`${summary.passed} correctas — Click para filtrar`}
                  ></div>
                )}
                {summary.warned > 0 && (
                  <div
                    className="h-full bg-amber-500 transition-all duration-700 ease-out cursor-pointer hover:opacity-80"
                    style={{ width: `${(summary.warned / summary.totalEvaluated) * 100}%` }}
                    onClick={() => onFilterByResult?.(activeResultFilter === 'WARN' ? null : 'WARN')}
                    title={`${summary.warned} advertencias — Click para filtrar`}
                  ></div>
                )}
                {summary.blocked > 0 && (
                  <div
                    className="h-full bg-red-500 transition-all duration-700 ease-out cursor-pointer hover:opacity-80"
                    style={{ width: `${(summary.blocked / summary.totalEvaluated) * 100}%` }}
                    onClick={() => onFilterByResult?.(activeResultFilter === 'BLOCK' ? null : 'BLOCK')}
                    title={`${summary.blocked} bloqueadas — Click para filtrar`}
                  ></div>
                )}
                {summary.errored > 0 && (
                  <div
                    className="h-full bg-red-700 transition-all duration-700 ease-out cursor-pointer hover:opacity-80"
                    style={{ width: `${(summary.errored / summary.totalEvaluated) * 100}%` }}
                    onClick={() => onFilterByResult?.(activeResultFilter === 'ERROR' ? null : 'ERROR')}
                    title={`${summary.errored} errores — Click para filtrar`}
                  ></div>
                )}
                {summary.notEvaluated > 0 && (
                  <div
                    className="h-full bg-gray-300 transition-all duration-700 ease-out cursor-pointer hover:opacity-80"
                    style={{ width: `${(summary.notEvaluated / summary.totalEvaluated) * 100}%` }}
                    onClick={() => onFilterByResult?.(activeResultFilter === 'NOT_EVALUATED' ? null : 'NOT_EVALUATED')}
                    title={`${summary.notEvaluated} no evaluadas — Click para filtrar`}
                  ></div>
                )}
              </>
            )}
          </div>

          {/* Leyenda con badges clickeables */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {isHybrid ? (
              <>
                <span className="flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 text-gray-500 whitespace-nowrap">
                  <span className="w-2.5 h-2.5 bg-gray-300 rounded-full inline-block"></span>
                  {summary.totalPeriod} pendientes
                </span>
                <span className="text-xs text-gray-400 italic">Sin evaluaciones de Compliance</span>
              </>
            ) : (
              <>
                <button
                  onClick={() => onFilterByResult?.(activeResultFilter === 'PASS' ? null : 'PASS')}
                  className={`flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 cursor-pointer transition-colors whitespace-nowrap ${
                    activeResultFilter === 'PASS' ? 'bg-emerald-100 text-emerald-800 font-semibold ring-1 ring-emerald-400' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full inline-block"></span>
                  {summary.passed} correctas
                </button>
                <button
                  onClick={() => onFilterByResult?.(activeResultFilter === 'WARN' ? null : 'WARN')}
                  className={`flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 cursor-pointer transition-colors whitespace-nowrap ${
                    activeResultFilter === 'WARN' ? 'bg-amber-100 text-amber-800 font-semibold ring-1 ring-amber-400' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className="w-2.5 h-2.5 bg-amber-500 rounded-full inline-block"></span>
                  {summary.warned} advertencias
                </button>
                <button
                  onClick={() => onFilterByResult?.(activeResultFilter === 'BLOCK' ? null : 'BLOCK')}
                  className={`flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 cursor-pointer transition-colors whitespace-nowrap ${
                    activeResultFilter === 'BLOCK' ? 'bg-red-100 text-red-800 font-semibold ring-1 ring-red-400' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full inline-block"></span>
                  {summary.blocked} bloqueadas
                </button>
                <button
                  onClick={() => onFilterByResult?.(activeResultFilter === 'ERROR' ? null : 'ERROR')}
                  className={`flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 cursor-pointer transition-colors whitespace-nowrap ${
                    activeResultFilter === 'ERROR' ? 'bg-red-100 text-red-800 font-semibold ring-1 ring-red-400' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className="w-2.5 h-2.5 bg-red-700 rounded-full inline-block"></span>
                  {summary.errored} errores
                </button>
                <button
                  onClick={() => onFilterByResult?.(activeResultFilter === 'NOT_EVALUATED' ? null : 'NOT_EVALUATED')}
                  className={`flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 cursor-pointer transition-colors whitespace-nowrap ${
                    activeResultFilter === 'NOT_EVALUATED' ? 'bg-gray-200 text-gray-700 font-semibold ring-1 ring-gray-400' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <span className="w-2.5 h-2.5 bg-gray-300 rounded-full inline-block"></span>
                  {summary.notEvaluated} no evaluadas
                </button>
              </>
            )}
          </div>

          {/* Reconciliación */}
          <p className="text-[10px] text-gray-400 mt-2">
            {isHybrid
              ? `Sin evaluaciones de Compliance — ${summary.totalPeriod} reservas operativas pendientes de evaluación`
              : `${summary.passed + summary.warned + summary.blocked + summary.errored + summary.notEvaluated} = ${summary.passed} correctas + ${summary.warned} advertencias + ${summary.blocked} bloqueadas + ${summary.errored} errores + ${summary.notEvaluated} no evaluadas = ${summary.totalEvaluated} total`
            }
          </p>
        </div>
      )}
    </div>
  );
}