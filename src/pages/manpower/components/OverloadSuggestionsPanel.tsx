import type { CalendarSuggestion } from '@/types/manpowerForecast';

interface OverloadSuggestionsPanelProps {
  suggestions: CalendarSuggestion[];
}

function formatBultos(bultos: number | null | undefined): string {
  return bultos == null ? '—' : `${bultos}`;
}

export default function OverloadSuggestionsPanel({ suggestions }: OverloadSuggestionsPanelProps) {
  if (suggestions.length === 0) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-lg py-10 text-center">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <i className="ri-check-double-line text-2xl text-gray-400"></i>
        </div>
        <p className="text-gray-600">Sin sobrecargas detectadas en el rango seleccionado</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Motivo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Citas a mover</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destino sugerido</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {suggestions.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors align-top">
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm font-semibold text-gray-900">{s.warehouse_name}</div>
                  <div className="text-xs text-gray-500">{s.country_name}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 capitalize">{s.source_date_label}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 whitespace-nowrap">
                    {s.overload_type === 'appointment_limit' ? 'Tope de citas' : 'Falta de recursos'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 max-w-xs">{s.reason}</td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    {s.reservations_to_move.map((r) => (
                      <div key={r.reservation_id} className="flex items-center gap-2 text-sm">
                        <span className="font-semibold text-gray-900 w-12 shrink-0">{r.time}</span>
                        <span className="text-gray-600 flex-1">{r.cargo_type_name || '—'}</span>
                        <span className="text-gray-500 whitespace-nowrap">{formatBultos(r.bultos)} bultos</span>
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {s.target_date ? (
                    <span className="inline-flex items-center gap-1 text-sm text-teal-700">
                      <i className="ri-arrow-right-line w-4 h-4 flex items-center justify-center"></i>
                      <span className="capitalize">{s.target_date_label}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm text-red-600 whitespace-nowrap">
                      <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center"></i>
                      Sin día disponible
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}