import { useEffect, useState } from 'react';
import { fmtClock, fmtDuration, segmentMs, type StateSegment } from '../../../utils/stateTimes';

const FALLBACK_COLOR = '#94a3b8';

/** Reloj que avanza cada segundo mientras `enabled`. */
function useNow(enabled: boolean, fixed: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return enabled ? now : fixed;
}

/**
 * Tiempos por estado: barra proporcional + lista de tramos. Cada tramo tiene su propio
 * contador que empieza en 0 cuando entra al estado; el tramo en curso avanza en vivo.
 */
export default function StateTimeline({
  segments,
  now,
  live = false,
  fmtTime,
  title = 'Tiempos por estado',
  emptyText = 'Aún no hay ingreso por casetilla ni cambios de estado para medir.',
  compact = false,
  openNote,
}: {
  segments: StateSegment[];
  /** Hora de referencia para el tramo en curso cuando no es en vivo (p. ej. recorrido) */
  now: number;
  /** El tramo en curso avanza cada segundo */
  live?: boolean;
  fmtTime: (ms: number) => string;
  title?: string;
  emptyText?: string;
  compact?: boolean;
  /** Aviso cuando el último tramo nunca se cerró (p. ej. sin salida registrada): no se cuenta en vivo */
  openNote?: string;
}) {
  const t = useNow(live && !openNote && segments.some((s) => s.to === null), now);
  if (!segments.length)
    return (
      <div className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-500">
        <p className="font-semibold text-gray-700">{title}</p>
        <p className="mt-0.5">{emptyText}</p>
      </div>
    );

  const durations = segments.map((s) => segmentMs(s, t));
  const total = durations.reduce((a, b) => a + b, 0);
  const closed = segments.map((s, i) => (s.to !== null ? durations[i] : -1));
  const longest = closed.length > 1 ? closed.indexOf(Math.max(...closed)) : -1;
  const ended = segments[segments.length - 1].to !== null;

  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${compact ? 'p-2.5' : 'p-3'}`}>
      <p className="text-sm font-semibold text-gray-900">{title}</p>

      {/* Contador general + contador del estado actual */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-gray-50 px-2.5 py-1.5">
          <p className="text-[10px] text-gray-500">{ended ? 'Tiempo total' : 'Total desde el ingreso'}</p>
          <p className="text-lg font-bold leading-tight tabular-nums text-gray-900">
            {ended ? fmtDuration(total) : fmtClock(total)}
          </p>
        </div>
        <div className={`rounded-md px-2.5 py-1.5 ${ended ? 'bg-gray-50' : 'bg-teal-50'}`}>
          <p className="truncate text-[10px] text-gray-500">
            {ended ? `${segments.length} estado${segments.length === 1 ? '' : 's'}` : `En ${segments[segments.length - 1].label}`}
          </p>
          <p className={`text-lg font-bold leading-tight tabular-nums ${ended ? 'text-gray-900' : 'text-teal-800'}`}>
            {ended ? 'Finalizado' : fmtClock(durations[durations.length - 1])}
          </p>
        </div>
      </div>

      {/* Barra proporcional: cada color es un estado */}
      <div className="mt-2 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-gray-100">
        {segments.map((s, i) => (
          <div
            key={`${s.key}-${s.from}`}
            title={`${s.label} · ${fmtDuration(durations[i])}`}
            className={s.to === null ? 'animate-pulse' : undefined}
            style={{
              width: `${total ? (durations[i] / total) * 100 : 100 / segments.length}%`,
              minWidth: 3,
              backgroundColor: s.color || FALLBACK_COLOR,
            }}
          ></div>
        ))}
      </div>

      <ol className="mt-2 space-y-1">
        {segments.map((s, i) => {
          const current = s.to === null;
          return (
            <li
              key={`${s.key}-${s.from}`}
              className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-xs ${current ? 'bg-teal-50 ring-1 ring-teal-200' : ''}`}
            >
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: s.color || FALLBACK_COLOR }}></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-gray-900">
                  {s.label}
                  {i === longest && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-800">
                      <i className="ri-error-warning-line"></i>Más largo
                    </span>
                  )}
                </span>
                <span className="block truncate text-[10px] text-gray-500">
                  {s.fromGate ? 'Ingreso casetilla ' : 'Desde '}
                  {fmtTime(s.from)}
                  {s.to !== null && ` → ${fmtTime(s.to)}${s.nextLabel ? ` · pasó a ${s.nextLabel}` : ''}`}
                </span>
              </span>
              <span className={`flex-shrink-0 tabular-nums ${current ? 'font-bold text-teal-800' : 'font-semibold text-gray-800'}`}>
                {current ? (
                  <>
                    <i className="ri-timer-line mr-0.5"></i>
                    {fmtClock(durations[i])}
                  </>
                ) : (
                  fmtDuration(durations[i])
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {openNote && !ended && (
        <p className="mt-1.5 flex items-start gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          <i className="ri-error-warning-line mt-px"></i>
          {openNote}
        </p>
      )}
    </div>
  );
}
