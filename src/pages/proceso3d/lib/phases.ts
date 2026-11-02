import type { Reservation } from '../../../services/calendarService';
import type { GateTimes, StatusChange } from '../../../services/proceso3dService';

/**
 * Fase física de un camión dentro del sitio. Define DÓNDE se dibuja,
 * mientras que el estado de la cita define el COLOR.
 */
export type TruckPhase =
  | 'PROGRAMADO' // cita futura, aún no se acerca
  | 'EN_CAMINO' // se acerca por la calle pública / fila en la entrada
  | 'PATIO' // ingresó por casetilla, esperando andén
  | 'EN_ANDEN' // en el andén asignado (apertura, descarga, carga…)
  | 'POR_SALIR' // descargado: liberó el andén y hace fila hacia la aguja de salida
  | 'SALIENDO' // despachado, circulando hacia la salida
  | 'FINALIZADO' // ya salió del sitio
  | 'NO_LLEGO' // no-show
  | 'CANCELADO';

export const PHASE_META: Record<TruckPhase, { label: string; icon: string; color: string; visible: boolean }> = {
  PROGRAMADO: { label: 'Programados', icon: 'ri-calendar-schedule-line', color: '#64748b', visible: false },
  EN_CAMINO: { label: 'En camino', icon: 'ri-road-map-line', color: '#0ea5e9', visible: true },
  PATIO: { label: 'En patio / espera', icon: 'ri-parking-box-line', color: '#f59e0b', visible: true },
  EN_ANDEN: { label: 'En andén', icon: 'ri-truck-line', color: '#14b8a6', visible: true },
  POR_SALIR: { label: 'Por salir', icon: 'ri-time-line', color: '#6366f1', visible: true },
  SALIENDO: { label: 'Saliendo', icon: 'ri-logout-box-r-line', color: '#8b5cf6', visible: true },
  FINALIZADO: { label: 'Finalizados', icon: 'ri-checkbox-circle-line', color: '#22c55e', visible: false },
  NO_LLEGO: { label: 'No llegó', icon: 'ri-close-circle-line', color: '#ef4444', visible: false },
  CANCELADO: { label: 'Cancelados', icon: 'ri-forbid-line', color: '#9ca3af', visible: false },
};

export const PHASE_ORDER: TruckPhase[] = [
  'EN_CAMINO',
  'PATIO',
  'EN_ANDEN',
  'POR_SALIR',
  'SALIENDO',
  'PROGRAMADO',
  'FINALIZADO',
  'NO_LLEGO',
  'CANCELADO',
];

export const PRE_ARRIVAL = new Set(['PENDING', 'CONFIRMED']);
export const ARRIVED = new Set(['ARRIVED_PENDING_UNLOAD', 'LLEGO_AL_ALMACEN', 'CHECKING_IN']);
export const AT_DOCK = new Set([
  'IN_PROGRESS',
  'PENDING_DISCHARGE',
  'START',
  'UNLOADING',
  'DISCHARGED',
  'CHECKEDIN_PENDING_CLOSE',
  'UNLOADED_PENDING_CHECKIN',
]);

/** Estados que indican que la descarga está ocurriendo en este momento. */
export const UNLOADING_NOW = new Set(['START', 'UNLOADING']);
/** Descarga terminada: el camión libera el andén y espera salir por la casetilla. */
export const UNLOADED = new Set(['DISCHARGED', 'UNLOADED_PENDING_CHECKIN', 'CHECKEDIN_PENDING_CLOSE']);

const MIN = 60_000;
/** Minutos antes de la cita en que un camión programado aparece en la fila de entrada. */
const APPROACH_WINDOW_MIN = 30;
/** Minutos que un camión despachado se dibuja circulando hacia la salida. */
const EXIT_VISIBLE_MIN = 10;

function ms(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function effectiveEnd(r: Reservation): number {
  const end = ms(r.end_datetime)!;
  const actual = ms(r.actual_end_datetime);
  return actual !== null ? Math.min(end, actual) : end;
}

/** Minutos después del fin de la cita en que un camión sin salida registrada se considera fuera del sitio. */
const STALE_AFTER_MIN = 90;

/**
 * Muchas citas quedan en "Descargado" / "Arribó" sin que se registre la salida en casetilla.
 * Pasado un margen después del fin de la cita, se asume que el camión ya no está en el sitio
 * (si no, ocuparía el andén indefinidamente).
 */
export function isStaleWithoutExit(r: Reservation, gate: GateTimes | undefined, now: number): boolean {
  if (gate?.salidaAt) return false;
  const code = (r.status?.code ?? '').toUpperCase();
  if (!AT_DOCK.has(code) && !ARRIVED.has(code)) return false;
  // Una descarga en curso es un dato explícito: no se da por terminada por vencimiento
  if (UNLOADING_NOW.has(code)) return false;
  return now > effectiveEnd(r) + STALE_AFTER_MIN * MIN;
}

/**
 * Modo EN VIVO: la fase sale del estado actual de la cita (dato real del sistema).
 */
export function livePhase(r: Reservation, gate: GateTimes | undefined, now: number): TruckPhase {
  if (r.is_cancelled) return 'CANCELADO';
  const code = (r.status?.code ?? '').toUpperCase();
  const start = ms(r.start_datetime)!;

  if (code === 'CANCELLED') return 'CANCELADO';
  if (code === 'NO_SHOW') return 'NO_LLEGO';
  if (code === 'DONE') return 'FINALIZADO';
  if (code === 'DISPATCHED') {
    const exitAt = ms(gate?.salidaAt) ?? ms(r.actual_end_datetime) ?? effectiveEnd(r);
    return now - exitAt < EXIT_VISIBLE_MIN * MIN ? 'SALIENDO' : 'FINALIZADO';
  }
  if ((AT_DOCK.has(code) || ARRIVED.has(code)) && isStaleWithoutExit(r, gate, now)) return 'FINALIZADO';
  if (UNLOADED.has(code)) return 'POR_SALIR';
  if (AT_DOCK.has(code)) return 'EN_ANDEN';
  if (ARRIVED.has(code)) return 'PATIO';
  if (PRE_ARRIVAL.has(code) || !code) {
    // Sin estado operativo: si tiene ingreso en casetilla, ya está en el patio
    if (gate?.ingresoAt) return 'PATIO';
    return start - now <= APPROACH_WINDOW_MIN * MIN ? 'EN_CAMINO' : 'PROGRAMADO';
  }
  // Código desconocido (estado propio de la organización): usar el horario
  if (now >= start && now < effectiveEnd(r)) return 'EN_ANDEN';
  return now < start ? 'PROGRAMADO' : 'FINALIZADO';
}

/** Estado (código) que tenía la cita en el instante `t`, según su historial. */
export function statusAt(history: StatusChange[] | undefined, t: number): string | null {
  if (!history || history.length === 0) return null;
  let code: string | null = history[0].from;
  for (const h of history) {
    if (h.at > t) break;
    code = h.to;
  }
  return code;
}

/** Un ingreso muy anterior a la cita suele ser de una cita reprogramada: se ignora. */
function validIngreso(r: Reservation, gate: GateTimes | undefined): number | null {
  const start = ms(r.start_datetime)!;
  const raw = ms(gate?.ingresoAt);
  return raw !== null && raw >= start - 12 * 60 * MIN ? raw : null;
}

/**
 * Fase en el instante `t` usando el historial REAL de estados (activity_log) y la casetilla.
 * Devuelve null si la cita no tiene historial útil (nunca pasó de Confirmada).
 */
function historyPhase(r: Reservation, gate: GateTimes | undefined, history: StatusChange[] | undefined, t: number): TruckPhase | null {
  if (!history || history.length === 0) return null;
  const reachedSite = history.some((h) => ARRIVED.has(h.to) || AT_DOCK.has(h.to) || h.to === 'DISPATCHED' || h.to === 'DONE');
  if (!reachedSite) return null;
  const code = statusAt(history, t) ?? '';
  const ingreso = validIngreso(r, gate);
  const salida = ms(gate?.salidaAt);
  const gateAt: GateTimes = {
    ingresoAt: ingreso !== null && ingreso <= t ? gate!.ingresoAt : undefined,
    salidaAt: salida !== null && salida <= t ? gate!.salidaAt : undefined,
  };
  const asOfT = { ...r, is_cancelled: false, status: { ...(r.status ?? { name: code, color: '' }), code } } as Reservation;
  const phase = livePhase(asOfT, gateAt, t);
  // La regla de "sin salida registrada" no aplica si la casetilla registró la salida más tarde
  if (phase === 'FINALIZADO' && salida !== null && salida > t) {
    if (UNLOADED.has(code)) return 'POR_SALIR';
    if (AT_DOCK.has(code)) return 'EN_ANDEN';
    if (ARRIVED.has(code)) return 'PATIO';
  }
  return phase;
}

/**
 * Ventana estimada en que el camión estuvo en el andén, cuando no hay historial de estados.
 * Se usa la casetilla y el horario de la cita.
 */
export function estimatedDockWindow(r: Reservation, gate: GateTimes | undefined, now: number) {
  const code = (r.status?.code ?? '').toUpperCase();
  const start = ms(r.start_datetime)!;
  const end = effectiveEnd(r);
  const ingreso = validIngreso(r, gate);
  const salida = ms(gate?.salidaAt) ?? (code === 'DISPATCHED' || code === 'DONE' ? ms(r.actual_end_datetime) : null);
  const arrival = ingreso ?? start - 10 * MIN;
  const stale = isStaleWithoutExit(r, gate, now);
  let dockStart = Math.max(arrival + 5 * MIN, start);
  // Si hoy sigue esperando en patio, no adelantarlo al andén
  if (ARRIVED.has(code) && !salida && !stale) dockStart = Math.max(dockStart, now + MIN);
  return { ingreso, salida, arrival, stale, dockStart, end };
}

/**
 * Modo RECORRIDO: reconstruye dónde estaba cada camión en el instante `t`.
 * 1) Si la cita tiene historial de estados, se usa (horas reales de cada cambio).
 * 2) Si no, se estima con la casetilla (ingreso / salida) y el horario de la cita.
 */
export function replayPhase(
  r: Reservation,
  gate: GateTimes | undefined,
  t: number,
  now: number,
  history?: StatusChange[]
): TruckPhase {
  if (r.is_cancelled) return 'CANCELADO';
  if (t <= now) {
    const hp = historyPhase(r, gate, history, t);
    if (hp) return hp;
  }
  const code = (r.status?.code ?? '').toUpperCase();
  const start = ms(r.start_datetime)!;
  const { ingreso, salida, arrival, stale, dockStart, end } = estimatedDockWindow(r, gate, now);

  const neverArrived =
    !ingreso && (code === 'NO_SHOW' || code === 'CANCELLED' || ((PRE_ARRIVAL.has(code) || !code) && start < now));
  if (neverArrived) {
    if (t < start - APPROACH_WINDOW_MIN * MIN) return 'PROGRAMADO';
    if (t < start) return 'EN_CAMINO';
    return code === 'CANCELLED' ? 'CANCELADO' : 'NO_LLEGO';
  }

  // Sin salida registrada: sigue en sitio hasta ahora, salvo que la cita esté vencida
  const leave = salida ?? (t > now || stale ? end : Math.max(end, now + MIN));
  const dockEnd = Math.max(dockStart, leave - 5 * MIN);

  if (t < arrival - APPROACH_WINDOW_MIN * MIN) return 'PROGRAMADO';
  if (t < arrival) return 'EN_CAMINO';
  if (t < dockStart) return 'PATIO';
  // sin historial: el último 10 % del tiempo en sitio se asume descargado, esperando salir
  if (t < dockStart + (dockEnd - dockStart) * 0.9) return 'EN_ANDEN';
  if (t < dockEnd) return 'POR_SALIR';
  if (t < leave + 2 * MIN) return 'SALIENDO';
  return 'FINALIZADO';
}
