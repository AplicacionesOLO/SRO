import type { ReservationForecast, ForecastResourceAllocation } from '@/types/manpowerForecast';

interface ForecastReservationsTableProps {
  forecasts: ReservationForecast[];
  onCalculate: (forecast: ReservationForecast) => void;
  onOpenReservation: (forecast: ReservationForecast) => void;
}

function formatDuration(hours: number | null | undefined): string {
  if (hours == null) return '—';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function AllocationChips({ items }: { items: ForecastResourceAllocation[] }) {
  if (!items.length) return <span className="text-gray-400 text-sm">—</span>;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {items.map((a) => (
        <span
          key={a.category_id}
          className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-teal-50 text-teal-800 border border-teal-200"
        >
          {a.quantity}× {a.category_name}
        </span>
      ))}
    </div>
  );
}

export default function ForecastReservationsTable({
  forecasts,
  onCalculate,
  onOpenReservation,
}: ForecastReservationsTableProps) {
  if (forecasts.length === 0) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-lg py-12 text-center">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <i className="ri-calendar-todo-line text-2xl text-gray-400"></i>
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cita</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Almacén</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo de carga</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Bultos</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Regla</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mínimo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recomendado</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Tiempo cita</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Duración</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {forecasts.map((f) => (
              <tr key={f.reservation.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  <button
                    onClick={() => onOpenReservation(f)}
                    className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-900 hover:underline transition-colors cursor-pointer"
                    title="Ver la cita en el calendario"
                  >
                    <i className="ri-calendar-line text-sm w-4 h-4 flex items-center justify-center"></i>
                    #{f.reservation.id.slice(0, 8)}
                  </button>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{f.reservation.start_datetime.slice(0, 10)}</div>
                  <div className="text-xs text-gray-500">{f.reservation.start_datetime.slice(11, 16)}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {f.warehouse_name || '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {f.cargo_type_name || '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                  {f.provider_name || '—'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span className="text-sm font-semibold text-gray-900">{f.bultos ?? '—'}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {f.matched ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Aplica
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
                      title={f.match_reason || undefined}
                    >
                      Sin regla
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <AllocationChips items={f.min_resources} />
                </td>
                <td className="px-4 py-3">
                  <AllocationChips items={f.recommended_resources} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <div className="text-sm font-medium text-gray-700">{formatDuration(f.appointment_duration_hours)}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {f.duration_exceeds_appointment && (
                      <span
                        className="inline-flex items-center justify-center text-amber-600"
                        title="La duración calculada supera el tiempo real de la cita: puede haber un error de cálculo o de la regla."
                      >
                        <i className="ri-alert-line text-base w-4 h-4 flex items-center justify-center"></i>
                      </span>
                    )}
                    <div className="text-right">
                      <div className={`text-sm font-medium ${f.duration_exceeds_appointment ? 'text-amber-700' : 'text-gray-900'}`}>
                        {formatDuration(f.recommended_duration_hours)}
                      </div>
                      <div className="text-xs text-gray-500">{formatDuration(f.min_duration_hours)}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <button
                    onClick={() => onCalculate(f)}
                    className="w-8 h-8 inline-flex items-center justify-center text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                    title="Simular duración"
                  >
                    <i className="ri-calculator-line text-base"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}