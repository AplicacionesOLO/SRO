import { useState, Fragment } from 'react';
import type { DailyWarehouseAggregation, DailyTimeBlock } from '@/types/manpowerForecast';

function formatDuration(hours: number | null | undefined): string {
  if (hours == null || hours <= 0) return '—';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function TimeBlocksDetail({ blocks }: { blocks: DailyTimeBlock[] }) {
  if (!blocks || blocks.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <i className="ri-time-line w-4 h-4 flex items-center justify-center"></i>
        Sin citas en franjas horarias.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <i className="ri-time-line text-teal-600 w-4 h-4 flex items-center justify-center"></i>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Desglose por franja horaria
        </span>
      </div>

      {blocks.map((b) => (
        <div key={b.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          {/* Encabezado de la franja */}
          <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">{b.label}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700 whitespace-nowrap">
                {b.reservation_count} cita{b.reservation_count !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
              <span className="whitespace-nowrap">
                <strong className="text-gray-700">{b.total_bultos}</strong> bultos
              </span>
              <span className="whitespace-nowrap">
                Personas (pico): <strong className="text-gray-700">{b.peak_personas_min}</strong> / {b.peak_personas_rec}
              </span>
            </div>
          </div>

          {/* Recursos de la franja */}
          {b.categories.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">Sin recursos asignados (citas sin regla).</div>
          ) : (
            <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {b.categories.map((c) => {
                const noStock = !c.stock_loaded;
                const over = c.stock_loaded && c.deficit > 0;
                return (
                  <div
                    key={c.category_id}
                    className="flex items-center justify-between gap-3 rounded-md px-3 py-2 bg-gray-50"
                  >
                    <span className="text-sm font-medium text-gray-800 whitespace-nowrap">
                      {c.category_name}
                      {c.unit_label ? <span className="ml-1 text-xs text-gray-400">{c.unit_label}</span> : null}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        necesita {c.needed_min}–{c.needed_rec}
                      </span>
                      {noStock ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 whitespace-nowrap">
                          Sin stock
                        </span>
                      ) : over ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 whitespace-nowrap">
                          stock {c.stock} · -{c.deficit}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 whitespace-nowrap">
                          stock {c.stock} · OK
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {b.substitutions && b.substitutions.length > 0 && (
            <div className="px-4 py-2.5 border-t border-amber-200 bg-amber-50 space-y-1">
              {b.substitutions.map((s) => (
                <div key={`${s.from_category_id}-${s.to_category_name}`} className="flex items-start gap-2 text-sm text-amber-800">
                  <i className="ri-lightbulb-line w-4 h-4 flex items-center justify-center mt-0.5 text-amber-600"></i>
                  <span>
                    Faltan <strong>{s.quantity}</strong> {s.from_category_name} → se usan{' '}
                    <strong>{s.quantity}</strong> {s.to_category_name} como reemplazo (descontado del stock)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface DailyAggregationPanelProps {
  daily: DailyWarehouseAggregation[];
}

export default function DailyAggregationPanel({ daily }: DailyAggregationPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (daily.length === 0) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-lg py-12 text-center">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <i className="ri-bar-chart-grouped-line text-2xl text-gray-400"></i>
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">País</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Citas</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Bultos</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Duración</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" title="Pico de personas simultáneas dentro del horario laboral del almacén">Personas (pico)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" title="Total de participaciones: suma de personas en todas las citas del día">Participaciones</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recurso</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" title="Pico de unidades simultáneas en el momento más cargado del día">Mínimo (pico)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" title="Pico de unidades simultáneas con margen recomendado">Recomendado (pico)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Faltante</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alerta</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {daily.map((d) => {
              const dayKey = `${d.date}|${d.warehouse_id}`;
              const isOpen = expanded.has(dayKey);
              const rowCount = Math.max(1, d.categories.length);

              return (
                <Fragment key={dayKey}>
                  {d.categories.length === 0 ? (
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => toggle(dayKey)}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-teal-700 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <i
                            className={`${isOpen ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} text-base w-4 h-4 flex items-center justify-center text-gray-400`}
                          ></i>
                          <span className="capitalize">{d.date_label}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{d.warehouse_name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{d.country_name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900">{d.reservation_count}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900">{d.total_bultos}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-gray-900">{formatDuration(d.min_duration_hours)}</div>
                        <div className="text-xs text-gray-500">{formatDuration(d.recommended_duration_hours)}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-gray-900">{d.peak_personas_min}</div>
                        <div className="text-xs text-gray-500">{d.peak_personas_rec}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-gray-900">{d.participaciones_min}</div>
                        <div className="text-xs text-gray-500">{d.participaciones_rec}</div>
                      </td>
                      <td colSpan={7} className="px-4 py-3 text-sm text-gray-400">Sin recursos (citas sin regla)</td>
                    </tr>
                  ) : (
                    d.categories.map((c, idx) => (
                      <tr key={`${d.date}-${d.warehouse_id}-${c.category_id}`} className="hover:bg-gray-50 transition-colors">
                        {idx === 0 ? (
                          <>
                            <td rowSpan={rowCount} className="px-4 py-3 align-top whitespace-nowrap">
                              <button
                                onClick={() => toggle(dayKey)}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-teal-700 transition-colors whitespace-nowrap cursor-pointer"
                              >
                                <i
                                  className={`${isOpen ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} text-base w-4 h-4 flex items-center justify-center text-gray-400`}
                                ></i>
                                <span className="capitalize">{d.date_label}</span>
                              </button>
                            </td>
                            <td rowSpan={rowCount} className="px-4 py-3 align-top whitespace-nowrap text-sm text-gray-600">
                              {d.warehouse_name}
                            </td>
                            <td rowSpan={rowCount} className="px-4 py-3 align-top whitespace-nowrap text-sm text-gray-600">
                              {d.country_name}
                            </td>
                            <td rowSpan={rowCount} className="px-4 py-3 align-top whitespace-nowrap text-right text-sm font-medium text-gray-900">
                              {d.reservation_count}
                            </td>
                            <td rowSpan={rowCount} className="px-4 py-3 align-top whitespace-nowrap text-right text-sm font-medium text-gray-900">
                              {d.total_bultos}
                            </td>
                            <td rowSpan={rowCount} className="px-4 py-3 align-top whitespace-nowrap text-right">
                              <div className="text-sm font-medium text-gray-900">{formatDuration(d.min_duration_hours)}</div>
                              <div className="text-xs text-gray-500">{formatDuration(d.recommended_duration_hours)}</div>
                            </td>
                            <td rowSpan={rowCount} className="px-4 py-3 align-top whitespace-nowrap text-right">
                              <div className="text-sm font-semibold text-gray-900">{d.peak_personas_min}</div>
                              <div className="text-xs text-gray-500">{d.peak_personas_rec}</div>
                            </td>
                            <td rowSpan={rowCount} className="px-4 py-3 align-top whitespace-nowrap text-right">
                              <div className="text-sm font-semibold text-gray-900">{d.participaciones_min}</div>
                              <div className="text-xs text-gray-500">{d.participaciones_rec}</div>
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
                          <td rowSpan={rowCount} className="px-4 py-3 align-top whitespace-nowrap">
                            {d.requires_external ? (
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 whitespace-nowrap"
                                title={d.external_reasons.join(' · ')}
                              >
                                <i className="ri-alert-line text-sm w-4 h-4 flex items-center justify-center mr-1"></i>
                                Requiere externa
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}

                  {isOpen && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={14} className="px-6 py-4">
                        {d.substitutions && d.substitutions.length > 0 && (
                          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
                            {d.substitutions.map((s) => (
                              <div key={`${s.from_category_id}-${s.to_category_name}`} className="flex items-start gap-2 text-sm text-amber-800">
                                <i className="ri-lightbulb-line w-4 h-4 flex items-center justify-center mt-0.5 text-amber-600"></i>
                                <span>
                                  Faltan <strong>{s.quantity}</strong> {s.from_category_name} → se usan{' '}
                                  <strong>{s.quantity}</strong> {s.to_category_name} como reemplazo (descontado del stock)
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <TimeBlocksDetail blocks={d.blocks} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}