import { useEffect, useMemo } from 'react';
import {
  RecurrenceConfig,
  DEFAULT_RECURRENCE_CONFIG,
  generatePreviewDates,
  countOccurrences,
  formatPreviewDate,
} from '../../../utils/recurrenceUtils';

interface RecurrenceFormProps {
  value: RecurrenceConfig;
  onChange: (config: RecurrenceConfig) => void;
  startDatetime: string; // ISO — fecha de inicio de la reserva original
  endDatetime: string;   // ISO — fecha de fin de la reserva original
  disabled?: boolean;
}

const DAY_LABELS: { value: number; short: string; label: string }[] = [
  { value: 1, short: 'L', label: 'Lunes' },
  { value: 2, short: 'M', label: 'Martes' },
  { value: 3, short: 'K', label: 'Miércoles' },
  { value: 4, short: 'J', label: 'Jueves' },
  { value: 5, short: 'V', label: 'Viernes' },
  { value: 6, short: 'S', label: 'Sábado' },
  { value: 0, short: 'D', label: 'Domingo' },
];

export function RecurrenceForm({ value, onChange, startDatetime, endDatetime, disabled = false }: RecurrenceFormProps) {
  const set = (partial: Partial<RecurrenceConfig>) => onChange({ ...value, ...partial });

  // Cuando se activa el modo semanal, pre-seleccionar el día de la semana de startDatetime
  useEffect(() => {
    if (value.enabled && value.type === 'weekly' && value.weekdays.length === 0 && startDatetime) {
      const dayOfWeek = new Date(startDatetime).getDay();
      set({ weekdays: [dayOfWeek] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.enabled, value.type, startDatetime]);

  const isValidStart = !!startDatetime && !!endDatetime && new Date(endDatetime) > new Date(startDatetime);

  const previewDates = useMemo(() => {
    if (!isValidStart || !value.enabled) return [];
    return generatePreviewDates(startDatetime, endDatetime, value, 10);
  }, [value, startDatetime, endDatetime, isValidStart]);

  const totalCount = useMemo(() => {
    if (!isValidStart || !value.enabled) return 0;
    return countOccurrences(startDatetime, endDatetime, value);
  }, [value, startDatetime, endDatetime, isValidStart]);

  const toggleWeekday = (day: number) => {
    const current = value.weekdays;
    if (current.includes(day)) {
      // No dejar sin ningún día seleccionado
      if (current.length === 1) return;
      set({ weekdays: current.filter((d) => d !== day) });
    } else {
      set({ weekdays: [...current, day] });
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed';
  const selectCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed cursor-pointer';
  const labelCls = 'block text-xs font-medium text-gray-700 mb-1.5';

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header / toggle */}
      <div
        className={`flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 ${disabled ? 'opacity-60' : ''}`}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 flex items-center justify-center text-gray-600">
            <i className="ri-repeat-line text-base"></i>
          </div>
          <span className="text-sm font-semibold text-gray-900">Recurrencia</span>
          {value.enabled && totalCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-teal-100 text-teal-800 rounded-full">
              {totalCount} reserva{totalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Switch */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const next = !value.enabled;
            const base = { ...DEFAULT_RECURRENCE_CONFIG, ...value, enabled: next };
            if (next && base.weekdays.length === 0 && startDatetime) {
              base.weekdays = [new Date(startDatetime).getDay()];
            }
            onChange(base);
          }}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
            value.enabled ? 'bg-teal-600' : 'bg-gray-300'
          } ${disabled ? 'cursor-not-allowed' : ''}`}
          role="switch"
          aria-checked={value.enabled}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
              value.enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Body — solo visible cuando está activo */}
      {value.enabled && (
        <div className="p-4 space-y-4">
          {/* Tipo + Intervalo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Tipo</label>
              <select
                value={value.type}
                onChange={(e) => set({ type: e.target.value as RecurrenceConfig['type'], weekdays: [] })}
                className={selectCls}
                disabled={disabled}
              >
                <option value="daily">Diario</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>
                {value.type === 'daily' && 'Cada N días'}
                {value.type === 'weekly' && 'Cada N semanas'}
                {value.type === 'monthly' && 'Cada N meses'}
              </label>
              <input
                type="number"
                min={1}
                max={52}
                value={value.interval}
                onChange={(e) => set({ interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                className={inputCls}
                disabled={disabled}
              />
            </div>
          </div>

          {/* Días de la semana (solo weekly) */}
          {value.type === 'weekly' && (
            <div>
              <label className={labelCls}>Días de la semana</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_LABELS.map(({ value: day, short, label }) => {
                  const selected = value.weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={disabled}
                      title={label}
                      onClick={() => toggleWeekday(day)}
                      className={`w-8 h-8 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                        selected
                          ? 'bg-teal-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                    >
                      {short}
                    </button>
                  );
                })}
              </div>
              {value.weekdays.length === 0 && (
                <p className="text-xs text-amber-600 mt-1.5">Seleccioná al menos un día.</p>
              )}
            </div>
          )}

          {/* Fin de la recurrencia */}
          <div className="space-y-2.5">
            <label className={labelCls}>Fin de la recurrencia</label>

            <div className="space-y-2">
              {/* Nunca */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  checked={value.endType === 'never'}
                  onChange={() => set({ endType: 'never' })}
                  disabled={disabled}
                  className="text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">Nunca (máx. 100 ocurrencias)</span>
              </label>

              {/* Hasta fecha */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  checked={value.endType === 'until'}
                  onChange={() => set({ endType: 'until' })}
                  disabled={disabled}
                  className="text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">Hasta fecha</span>
              </label>

              {value.endType === 'until' && (
                <div className="ml-6">
                  <input
                    type="date"
                    value={value.endDate}
                    min={startDatetime ? startDatetime.slice(0, 10) : undefined}
                    onChange={(e) => set({ endDate: e.target.value })}
                    className={inputCls}
                    disabled={disabled}
                  />
                </div>
              )}

              {/* Número de ocurrencias */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  checked={value.endType === 'count'}
                  onChange={() => set({ endType: 'count' })}
                  disabled={disabled}
                  className="text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">Número de ocurrencias</span>
              </label>

              {value.endType === 'count' && (
                <div className="ml-6 flex items-center gap-2">
                  <input
                    type="number"
                    min={2}
                    max={100}
                    value={value.count}
                    onChange={(e) => set({ count: Math.max(2, parseInt(e.target.value, 10) || 2) })}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={disabled}
                  />
                  <span className="text-sm text-gray-500">reservas en total</span>
                </div>
              )}
            </div>
          </div>

          {/* Vista previa */}
          {isValidStart && previewDates.length > 0 && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <i className="ri-calendar-check-line text-teal-700 text-sm w-4 h-4 flex items-center justify-center"></i>
                  <span className="text-xs font-semibold text-teal-900">Vista previa</span>
                </div>
                <span className="text-xs font-medium text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                  {totalCount} reserva{totalCount !== 1 ? 's' : ''} en total
                </span>
              </div>

              <div className="space-y-1">
                {previewDates.map((date, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span
                      className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                        idx === 0
                          ? 'bg-teal-600 text-white'
                          : 'bg-white border border-teal-300 text-teal-700'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className={`text-xs ${idx === 0 ? 'text-teal-900 font-medium' : 'text-teal-800'}`}>
                      {formatPreviewDate(date)}
                      {idx === 0 && (
                        <span className="ml-1.5 text-xs text-teal-600 font-normal">(esta reserva)</span>
                      )}
                    </span>
                  </div>
                ))}

                {totalCount > 10 && (
                  <p className="text-xs text-teal-600 mt-1.5 pl-6">
                    ...y {totalCount - 10} más
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Warning si los datos del formulario no son válidos para preview */}
          {!isValidStart && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <i className="ri-alert-line w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5"></i>
              Completá las fechas de inicio y fin para ver la vista previa.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
