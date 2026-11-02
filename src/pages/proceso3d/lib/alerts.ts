import type { Reservation } from '../../../services/calendarService';
import type { GateTimes, StatusChange } from '../../../services/proceso3dService';
import { ARRIVED, UNLOADED, type TruckPhase } from './phases';
import type { DockStage } from './unloading';

/** Minutos de espera a partir de los cuales aparece la nube amarilla / roja. */
export const ALERT_YELLOW_MIN = 10;
export const ALERT_RED_MIN = 15;

export interface TruckAlert {
  /** Qué está esperando el camión */
  label: string;
  /** Desde cuándo espera (epoch ms) */
  since: number;
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
 * Espera que se mide para la nube de alerta, según dónde está el camión:
 *  - Por salir: desde que quedó descargado.
 *  - En patio: desde que ingresó por la casetilla.
 *  - En andén esperando cuadrilla: desde que pasó al estado actual.
 */
export function truckAlert(
  r: Reservation,
  phase: TruckPhase,
  stage: DockStage | undefined,
  gate: GateTimes | undefined,
  history: StatusChange[] | undefined,
  t: number
): TruckAlert | null {
  if (phase === 'POR_SALIR') {
    const since = lastChange(history, t, (c) => UNLOADED.has(c)) ?? ms(r.actual_end_datetime);
    return since !== null && since <= t ? { label: 'Descargado · por salir', since } : null;
  }
  if (phase === 'PATIO') {
    const start = ms(r.start_datetime)!;
    const ingreso = ms(gate?.ingresoAt);
    const valid = ingreso !== null && ingreso >= start - 12 * HOUR && ingreso <= t ? ingreso : null;
    const since = valid ?? lastChange(history, t, (c) => ARRIVED.has(c));
    return since !== null ? { label: 'Esperando andén', since } : null;
  }
  if (phase === 'EN_ANDEN' && stage === 'ESPERA') {
    const since = lastChange(history, t, () => true) ?? ms(gate?.ingresoAt);
    return since !== null && since <= t ? { label: 'Esperando cuadrilla', since } : null;
  }
  return null;
}
