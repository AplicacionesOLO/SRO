import type { Reservation } from '../../../services/calendarService';
import type { GateTimes, StatusChange } from '../../../services/proceso3dService';
import { ARRIVED, UNLOADED, type TruckPhase } from './phases';
import type { DockStage } from './unloading';
import type { StateSegment } from '../../../utils/stateTimes';

/** Minutos de espera a partir de los cuales aparece la nube amarilla / roja. */
export const ALERT_YELLOW_MIN = 10;
export const ALERT_RED_MIN = 15;

export interface TruckAlert {
  /** Qué está esperando el camión */
  label: string;
  /** Desde cuándo está en el estado actual (epoch ms): el contador arranca en 0 en cada cambio */
  since: number;
  /** true = es una espera (patio, cuadrilla, salida…): se pinta amarilla / roja según el tiempo */
  alerting: boolean;
  /** Inicio del recorrido completo (ingreso por casetilla / creación del despacho): contador general */
  totalSince?: number;
}

export type AlertLevel = 'yellow' | 'red' | null;

export function alertLevel(elapsedMs: number): AlertLevel {
  const min = elapsedMs / 60_000;
  if (min >= ALERT_RED_MIN) return 'red';
  if (min >= ALERT_YELLOW_MIN) return 'yellow';
  return null;
}

export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const HOUR = 3_600_000;

function ms(iso?: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Último cambio de estado (hasta `t`) que cumple la condición. */
function lastChange(history: StatusChange[] | undefined, t: number, test: (code: string) => boolean) {
  if (!history) return null;
  let at: number | null = null;
  for (const h of history) {
    if (h.at > t) break;
    if (test(h.to)) at = h.at;
  }
  return at;
}

/**
 * Contador del camión: tiempo en el ESTADO ACTUAL (tramo en curso). Cada cambio de estado
 * lo reinicia en 0; el primer tramo arranca con el ingreso por casetilla.
 * Las esperas (patio, cuadrilla, salida) se marcan como alerta a los 10 / 15 min.
 * Sin historial de estados se usan las marcas conocidas (casetilla, fin de descarga).
 */
export function truckAlert(
  r: Reservation,
  phase: TruckPhase,
  stage: DockStage | undefined,
  gate: GateTimes | undefined,
  history: StatusChange[] | undefined,
  t: number,
  segment: StateSegment | null = null
): TruckAlert | null {
  if (phase !== 'PATIO' && phase !== 'EN_ANDEN' && phase !== 'POR_SALIR') return null;
  const hasHistory = !!history?.length;
  // Sin historial, el tramo solo es confiable mientras está en patio (empieza en la casetilla)
  const seg = segment && segment.from <= t && (hasHistory || phase === 'PATIO') ? segment : null;

  if (phase === 'POR_SALIR') {
    const since = seg?.from ?? lastChange(history, t, (c) => UNLOADED.has(c)) ?? ms(r.actual_end_datetime);
    return since !== null && since <= t ? { label: seg?.label ?? 'Descargado · por salir', since, alerting: true } : null;
  }
  if (phase === 'PATIO') {
    const start = ms(r.start_datetime)!;
    const ingreso = ms(gate?.ingresoAt);
    const valid = ingreso !== null && ingreso >= start - 12 * HOUR && ingreso <= t ? ingreso : null;
    const since = seg?.from ?? valid ?? lastChange(history, t, (c) => ARRIVED.has(c));
    return since !== null ? { label: seg && seg.key !== 'INGRESO' ? seg.label : 'Esperando andén', since, alerting: true } : null;
  }
  const waiting = stage === 'ESPERA';
  const since = seg?.from ?? lastChange(history, t, () => true) ?? ms(gate?.ingresoAt);
  if (since === null || since > t) return null;
  return { label: seg?.label ?? (waiting ? 'Esperando cuadrilla' : 'En andén'), since, alerting: waiting };
}
