import { Fragment } from 'react';
import type { WeeklyWarehouseAggregation } from '@/types/manpowerForecast';

interface WeeklyAggregationPanelProps {
  weekly: WeeklyWarehouseAggregation[];
}

function formatDuration(hours: number | null | undefined): string {
  if (hours == null || hours <= 0) return '—';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function WeeklyAggregationPanel({ weekly }: WeeklyAggregationPanelProps) {
  if (weekly.length === 0) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-lg py-12 text-center">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <i className="ri-calendar-line text-2xl text-gray-400"></i>
        </div>
        <p className="text-gray-600">No hay reservas en el rango seleccionado</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Semana</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">País</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Citas</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Bultos</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Duración</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" title="Pico de personas simultáneas (el día más cargado de la semana)">Personas (pico)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" title="Total de participaciones: suma de personas en todas las citas de la semana">Participaciones</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recurso</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" title="Pico de unidades simultáneas en el día más cargado de la semana">Mínimo (pico)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" title="Pico de unidades simultáneas con margen recomendado">Recomendado (pico)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Faltante</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alerta</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {weekly.map((w) => (
              <Fragment key={`${w.week_start}-${w.warehouse_id}`}>
                {w.categories.map((c, idx) => (
                  <tr key={`${w.week_start}-${w.warehouse_id}-${c.category_id}`} className="hover:bg-gray-50 transition-colors">
                  {idx === 0 ? (
                    <>
                      <td rowSpan={w.categories.length} className="px-4 py-3 align-top whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 capitalize">{w.week_label}</div>
                      </td>
                      <td rowSpan={w.categories.length} className="px-4 py-3 align-top whitespace-nowrap text-sm text-gray-600">
                        {w.warehouse_name}
                      </td>
                      <td rowSpan={w.categories.length} className="px-4 py-3 align-top whitespace-nowrap text-sm text-gray-600">
                        {w.country_name}
                      </td>
                      <td rowSpan={w.categories.length} className="px-4 py-3 align-top whitespace-nowrap text-right text-sm font-medium text-gray-900">
                        {w.reservation_count}
                      </td>
                      <td rowSpan={w.categories.length} className="px-4 py-3 align-top whitespace-nowrap text-right text-sm font-medium text-gray-900">
                        {w.total_bultos}
                      </td>
                      <td rowSpan={w.categories.length} className="px-4 py-3 align-top whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-gray-900">{formatDuration(w.min_duration_hours)}</div>
                        <div className="text-xs text-gray-500">{formatDuration(w.recommended_duration_hours)}</div>
                      </td>
                      <td rowSpan={w.categories.length} className="px-4 py-3 align-top whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-gray-900">{w.peak_personas_min}</div>
                        <div className="text-xs text-gray-500">{w.peak_personas_rec}</div>
                      </td>
                      <td rowSpan={w.categories.length} className="px-4 py-3 align-top whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-gray-900">{w.participaciones_min}</div>
                        <div className="text-xs text-gray-500">{w.participaciones_rec}</div>
                      </td>
                    </>
                  ) : null}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">{c.category_name}</span>
                    <span className="ml-1 text-xs text-gray-400">{c.unit_label}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-700">{c.needed_min}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900">{c.needed_rec}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-700">
                    {c.stock_loaded ? c.stock : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {!c.stock_loaded ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 whitespace-nowrap">
                        Sin stock
                      </span>
                    ) : c.deficit > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                        -{c.deficit}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        OK
                      </span>
                    )}
                  </td>
                  {idx === 0 ? (
                    <td rowSpan={w.categories.length} className="px-4 py-3 align-top whitespace-nowrap">
                      {w.requires_external ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 whitespace-nowrap">
                          <i className="ri-alert-line text-sm w-4 h-4 flex items-center justify-center mr-1"></i>
                          Requiere externa
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  ) : null}
                  </tr>
                ))}
                {w.substitutions && w.substitutions.length > 0 && (
                  <tr className="bg-amber-50/60">
                    <td colSpan={14} className="px-4 py-2.5">
                      {w.substitutions.map((s) => (
                        <div key={`${s.from_category_id}-${s.to_category_name}`} className="flex items-start gap-2 text-sm text-amber-800">
                          <i className="ri-lightbulb-line w-4 h-4 flex items-center justify-center mt-0.5 text-amber-600"></i>
                          <span>
                            Faltan <strong>{s.quantity}</strong> {s.from_category_name} → se usan{' '}
                            <strong>{s.quantity}</strong> {s.to_category_name} como reemplazo (descontado del stock)
                          </span>
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}