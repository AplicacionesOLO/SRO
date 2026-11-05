import { fmtMinutes, HEAT_GRADIENT, ON_TIME_MARGIN_MIN, type DayKpis, type HeatMetric, type StaffHour } from '../lib/insights';

/* ─────────────────────────────── Indicadores del día ─────────────────────────────── */

interface KpiTile {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}

export function KpiStrip({
  kpis,
  lateDispatches,
  compact = false,
}: {
  kpis: DayKpis;
  /** Despachos de AppOLO esperando salida (undefined = AppOLO apagado) */
  lateDispatches?: number;
  compact?: boolean;
}) {
  const tiles: KpiTile[] = [
    { label: 'Atendidos', value: String(kpis.atendidos), hint: 'Camiones que ya pasaron por un andén hoy' },
    { label: 'En patio ahora', value: String(kpis.enPatio), hint: 'Camiones dentro del sitio esperando andén' },
    {
      label: 'Espera en patio',
      value: fmtMinutes(kpis.patioAvgMin),
      hint: 'Promedio desde que entra al sitio hasta que pasa al andén',
      warn: (kpis.patioAvgMin ?? 0) >= 60,
    },
    { label: 'Tiempo en andén', value: fmtMinutes(kpis.andenAvgMin), hint: 'Promedio de los camiones que ya liberaron el andén' },
    {
      label: 'Puntualidad',
      value: kpis.puntualPct === null ? '—' : `${kpis.puntualPct}%`,
      hint: `Llegadas por casetilla hasta ${ON_TIME_MARGIN_MIN} min después de la hora de la cita (${kpis.llegadas} llegadas)`,
      warn: kpis.puntualPct !== null && kpis.puntualPct < 70,
    },
  ];
  if (lateDispatches !== undefined)
    tiles.push({
      label: 'Despachos sin salida',
      value: String(lateDispatches),
      hint: 'Despachos de AppOLO en espera de salida (chofer pendiente)',
      warn: lateDispatches > 0,
    });

  if (compact)
    return (
      <div className="flex flex-wrap gap-1">
        {tiles.map((t) => (
          <span key={t.label} title={t.hint} className="flex items-baseline gap-1 rounded-md bg-white/90 px-2 py-1 text-[11px] text-gray-600 shadow">
            {t.warn && <i className="ri-error-warning-fill text-[#d03b3b]" aria-label="Atención"></i>}
            {t.label}
            <b className="text-sm tabular-nums text-gray-900">{t.value}</b>
          </span>
        ))}
      </div>
    );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
      {tiles.map((t) => (
        <div key={t.label} title={t.hint} className="rounded-lg border border-gray-200 bg-white px-3 py-2 cursor-help">
          <p className="flex items-center gap-1 text-[11px] text-gray-500">
            {t.label}
            {t.warn && (
              <span className="flex items-center gap-0.5 font-medium text-[#d03b3b]">
                <i className="ri-error-warning-fill"></i>Atención
              </span>
            )}
          </p>
          <p className="text-xl font-bold tabular-nums leading-tight text-gray-900">{t.value}</p>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────── Personal por hora ─────────────────────────────── */

/**
 * Pico de personas necesarias por hora (cuadrilla de las reglas de Recursos × camiones en
 * andén) contra el personal disponible registrado en Recursos. Una sola escala: barras =
 * necesarias, línea = disponibles.
 */
export function StaffChart({
  hours,
  available,
  currentHour,
  byGroup,
  present,
}: {
  hours: StaffHour[];
  available: number | null;
  currentHour: number;
  byGroup: [string, number][];
  /** Personas marcadas en el reloj BIT2 en cada hora (24 valores); null = sin dato */
  present?: number[] | null;
}) {
  const active = hours.filter((h) => h.needed > 0).map((h) => h.hour);
  const from = Math.min(6, ...(active.length ? [Math.max(0, Math.min(...active) - 1)] : [6]));
  const to = Math.max(20, ...(active.length ? [Math.min(23, Math.max(...active) + 1)] : [20]));
  const shown = hours.filter((h) => h.hour >= from && h.hour <= to);
  const hasPresent = !!present && present.length === 24;
  const max = Math.max(1, available ?? 0, ...shown.map((h) => h.needed), ...(hasPresent ? shown.map((h) => present![h.hour]) : []));
  const H = 96;
  const now = hours[currentHour];
  const short = available !== null && now ? now.needed - available : 0;
  const deficitHours = available === null ? 0 : shown.filter((h) => h.needed > available).length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Personal por hora</h2>
          <p className="text-[11px] text-gray-500">Pico de personas necesarias en andenes · reglas de Recursos</p>
        </div>
        {now && (
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums leading-none text-gray-900">
              {now.needed}
              {available !== null && <span className="text-sm font-medium text-gray-500"> / {available}</span>}
            </p>
            <p className="text-[10px] text-gray-500">ahora {available !== null ? '(necesarias / disponibles)' : '(necesarias)'}</p>
          </div>
        )}
      </div>
      {short > 0 && (
        <p className="mt-1.5 flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-[#b42318]">
          <i className="ri-error-warning-fill"></i>Faltan {short} persona{short === 1 ? '' : 's'} en esta hora
        </p>
      )}

      <div className="relative mt-3" style={{ height: H }}>
        {available !== null && (
          <div
            className="absolute left-0 right-0 z-10 border-t-2 border-dashed border-gray-700"
            style={{ bottom: (available / max) * H }}
            title={`Disponibles: ${available}`}
          >
            <span className="absolute -top-4 right-0 bg-white/80 px-1 text-[10px] text-gray-700">disponibles {available}</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-[#c3c2b7]">
          {shown.map((h) => {
            const over = available !== null && h.needed > available;
            const isNow = h.hour === currentHour;
            return (
              <div
                key={h.hour}
                className="group relative flex h-full flex-1 items-end justify-center"
                title={`${String(h.hour).padStart(2, '0')}:00 · ${h.needed} necesarias${
                  available !== null ? ` · ${available} disponibles${over ? ` · faltan ${h.needed - available}` : ''}` : ''
                }${h.past ? '' : ' · proyección por agenda'}`}
              >
                <div
                  className="w-full max-w-[14px] rounded-t-[4px] transition-opacity group-hover:opacity-80"
                  style={{
                    height: h.needed ? Math.max(2, (h.needed / max) * H) : 0,
                    backgroundColor: over ? '#d03b3b' : '#3987e5',
                    opacity: h.past || isNow ? 1 : 0.45,
                    outline: isNow ? '2px solid #0b0b0b' : undefined,
                    outlineOffset: 1,
                  }}
                ></div>
                {hasPresent && h.hour <= currentHour && present![h.hour] > 0 && (
                  <span
                    className="absolute z-20 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-white bg-[#0b0b0b]"
                    style={{ bottom: (present![h.hour] / max) * H - 5 }}
                    title={`${String(h.hour).padStart(2, '0')}:00 · ${present![h.hour]} marcados en el reloj`}
                  ></span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex gap-[2px]">
        {shown.map((h) => (
          <span key={h.hour} className={`flex-1 text-center text-[9px] tabular-nums ${h.hour === currentHour ? 'font-bold text-gray-900' : 'text-gray-400'}`}>
            {h.hour % 2 === 0 ? h.hour : ''}
          </span>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-600">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#3987e5]"></span>Necesarias</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#3987e5] opacity-45"></span>Proyección</span>
        {hasPresent && (
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#0b0b0b]"></span>Marcados en reloj (BIT2)</span>
        )}
        {available !== null && (
          <>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#d03b3b]"></span>Faltan personas</span>
            <span className="flex items-center gap-1"><span className="w-3 border-t-2 border-dashed border-gray-700"></span>Disponibles</span>
          </>
        )}
      </div>
      {available === null && (
        <p className="mt-1.5 text-[11px] text-gray-500">Sin personal registrado en Recursos para este almacén: solo se muestra la demanda.</p>
      )}
      {deficitHours > 0 && <p className="mt-1 text-[11px] text-gray-600">{deficitHours} hora{deficitHours === 1 ? '' : 's'} del día con faltante.</p>}

      {byGroup.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <p className="mb-1 text-[11px] font-medium text-gray-700">Ahora por zona</p>
          <div className="flex flex-wrap gap-1.5">
            {byGroup.map(([g, n]) => (
              <span key={g} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                {g}: <b className="tabular-nums">{n}</b>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── Leyenda del mapa de calor ─────────────────────────────── */

export function HeatLegend({ metric, maxLabel, jornada }: { metric: HeatMetric; maxLabel: string; jornada: string }) {
  return (
    <div className="rounded-md bg-white/95 px-3 py-2 text-[11px] text-gray-700 shadow">
      <p className="font-semibold text-gray-900">{metric === 'uso' ? 'Uso de andenes' : 'Tiempo promedio por camión'}</p>
      <div className="mt-1 h-2.5 w-44 rounded-sm" style={{ background: HEAT_GRADIENT }}></div>
      <div className="mt-0.5 flex w-44 justify-between tabular-nums text-gray-500">
        <span>{metric === 'uso' ? '0%' : '0 min'}</span>
        <span>{maxLabel}</span>
      </div>
      <p className="mt-1 text-[10px] text-gray-500">Jornada analizada: {jornada}</p>
    </div>
  );
}
