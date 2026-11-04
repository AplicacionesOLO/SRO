import type { Reservation } from '../../../services/calendarService';
import type { GateTimes, StatusChange } from '../../../services/proceso3dService';
import { replayPhase, type TruckPhase } from './phases';

/**
 * Indicadores del día a partir de los datos que ya carga el 3D (citas, casetilla e
 * historial de estados). Se reconstruye la fase de cada cita cada SAMPLE_MIN minutos con
 * la misma lógica del recorrido; de ahí salen el mapa de calor de andenes, la demanda de
 * personal por hora, los indicadores y los próximos camiones. Nada se escribe.
 */

const MIN = 60_000;
export const SAMPLE_MIN = 5;
const SAMPLE_MS = SAMPLE_MIN * MIN;
/** Llega a tiempo si ingresa por casetilla hasta este margen después de la hora de la cita. */
export const ON_TIME_MARGIN_MIN = 15;

export interface DayTimeline {
  dayStart: number;
  samples: number;
  /** Fase de cada cita en cada muestra (centro del intervalo) */
  phases: Map<string, TruckPhase[]>;
}

export function sampleTime(tl: DayTimeline, i: number) {
  return tl.dayStart + i * SAMPLE_MS + SAMPLE_MS / 2;
}

/** Índice de la última muestra completa antes de `t` (−1 si ninguna). */
export function sampleIndexBefore(tl: DayTimeline, t: number) {
  return Math.min(tl.samples - 1, Math.floor((t - tl.dayStart) / SAMPLE_MS) - 1);
}

export function buildTimeline(
  reservations: Reservation[],
  gateTimes: Map<string, GateTimes>,
  statusHistory: Map<string, StatusChange[]>,
  dayStart: number,
  now: number
): DayTimeline {
  const samples = (24 * 60) / SAMPLE_MIN;
  const phases = new Map<string, TruckPhase[]>();
  for (const r of reservations) {
    if (r.is_cancelled) continue;
    const gate = gateTimes.get(r.id);
    const history = statusHistory.get(r.id);
    const arr: TruckPhase[] = new Array(samples);
    for (let i = 0; i < samples; i++) arr[i] = replayPhase(r, gate, dayStart + i * SAMPLE_MS + SAMPLE_MS / 2, now, history);
    phases.set(r.id, arr);
  }
  return { dayStart, samples, phases };
}

/* ─────────────────────────────── Mapa de calor de andenes ─────────────────────────────── */

export type HeatMetric = 'uso' | 'permanencia';

export interface DockStat {
  /** Minutos con camión en el andén */
  busyMin: number;
  /** % de uso sobre la jornada transcurrida */
  usePct: number;
  trucks: number;
  /** Minutos promedio por camión en el andén (null sin camiones) */
  avgDwellMin: number | null;
}

/**
 * Uso de cada andén hasta `until`. La jornada empieza con la primera llegada del día
 * al sitio (patio o andén), para no castigar las horas de madrugada sin operación.
 */
export function dockStats(tl: DayTimeline, dockOf: Map<string, string>, until: number) {
  const last = sampleIndexBefore(tl, until);
  const out = new Map<string, DockStat>();
  if (last < 0) return { stats: out, jornadaMin: 0 };

  let first = -1;
  for (const arr of tl.phases.values()) {
    for (let i = 0; i <= last; i++) {
      if (arr[i] === 'PATIO' || arr[i] === 'EN_ANDEN') {
        if (first === -1 || i < first) first = i;
        break;
      }
    }
  }
  if (first === -1) return { stats: out, jornadaMin: 0 };
  const jornada = last - first + 1;

  const busy = new Map<string, Set<number>>();
  const dwell = new Map<string, number[]>();
  for (const [id, arr] of tl.phases) {
    const dock = dockOf.get(id);
    if (!dock) continue;
    let n = 0;
    for (let i = first; i <= last; i++) {
      if (arr[i] !== 'EN_ANDEN') continue;
      n++;
      let s = busy.get(dock);
      if (!s) busy.set(dock, (s = new Set()));
      s.add(i);
    }
    if (n > 0) {
      const list = dwell.get(dock) ?? [];
      list.push(n * SAMPLE_MIN);
      dwell.set(dock, list);
    }
  }
  for (const [dock, s] of busy) {
    const d = dwell.get(dock) ?? [];
    out.set(dock, {
      busyMin: s.size * SAMPLE_MIN,
      usePct: Math.round((s.size / jornada) * 100),
      trucks: d.length,
      avgDwellMin: d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null,
    });
  }
  return { stats: out, jornadaMin: jornada * SAMPLE_MIN };
}

/** Rampa secuencial (un solo tono, claro → oscuro) para el mapa de calor. */
const HEAT_RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

export function heatColor(f: number) {
  const k = Math.max(0, Math.min(HEAT_RAMP.length - 1, Math.round(f * (HEAT_RAMP.length - 1))));
  return HEAT_RAMP[k];
}
export const HEAT_GRADIENT = `linear-gradient(90deg, ${HEAT_RAMP.join(', ')})`;

/* ─────────────────────────────── Personal por hora (Manpower) ─────────────────────────────── */

export interface StaffHour {
  hour: number;
  /** Pico de personas necesarias en simultáneo durante la hora */
  needed: number;
  /** true si la hora ya pasó (dato), false = proyección por agenda */
  past: boolean;
}

/** Personas necesarias en cada muestra = suma de la cuadrilla de los camiones en andén. */
export function staffNeeds(tl: DayTimeline, crewOf: (id: string) => number, now: number) {
  const perSample = new Array<number>(tl.samples).fill(0);
  for (const [id, arr] of tl.phases) {
    const p = crewOf(id);
    if (!p) continue;
    for (let i = 0; i < tl.samples; i++) if (arr[i] === 'EN_ANDEN') perSample[i] += p;
  }
  const perHour = 60 / SAMPLE_MIN;
  const hours: StaffHour[] = [];
  for (let h = 0; h < 24; h++) {
    let needed = 0;
    for (let k = 0; k < perHour; k++) needed = Math.max(needed, perSample[h * perHour + k]);
    hours.push({ hour: h, needed, past: tl.dayStart + (h + 1) * 60 * MIN <= now });
  }
  return { perSample, hours };
}

/** Personas necesarias ahora por grupo de andenes (Recepción, Despacho, Zona Franca…). */
export function staffByGroup(
  tl: DayTimeline,
  t: number,
  crewOf: (id: string) => number,
  groupOf: (id: string) => string | undefined
) {
  const i = Math.max(0, Math.min(tl.samples - 1, Math.floor((t - tl.dayStart) / SAMPLE_MS)));
  const out = new Map<string, number>();
  for (const [id, arr] of tl.phases) {
    if (arr[i] !== 'EN_ANDEN') continue;
    const g = groupOf(id);
    if (!g) continue;
    out.set(g, (out.get(g) ?? 0) + crewOf(id));
  }
  return out;
}

/* ─────────────────────────────── Indicadores del día ─────────────────────────────── */

export interface DayKpis {
  /** Camiones que ya pasaron por un andén */
  atendidos: number;
  /** Minutos promedio en patio antes de pasar al andén */
  patioAvgMin: number | null;
  /** Minutos promedio en andén (solo camiones que ya lo liberaron) */
  andenAvgMin: number | null;
  /** % de llegadas a tiempo (ingreso por casetilla ≤ cita + margen) */
  puntualPct: number | null;
  llegadas: number;
  /** Camiones esperando en patio en este momento */
  enPatio: number;
}

export function dayKpis(
  tl: DayTimeline,
  reservations: Reservation[],
  gateTimes: Map<string, GateTimes>,
  until: number
): DayKpis {
  const last = sampleIndexBefore(tl, until);
  let atendidos = 0;
  const patio: number[] = [];
  const anden: number[] = [];
  let enPatio = 0;
  if (last >= 0) {
    for (const arr of tl.phases.values()) {
      let p = 0;
      let a = 0;
      let firstDock = -1;
      for (let i = 0; i <= last; i++) {
        if (arr[i] === 'EN_ANDEN') {
          a++;
          if (firstDock === -1) firstDock = i;
        } else if (arr[i] === 'PATIO' && firstDock === -1) p++;
      }
      if (arr[last] === 'PATIO') enPatio++;
      if (a === 0) continue;
      atendidos++;
      patio.push(p * SAMPLE_MIN);
      if (arr[last] !== 'EN_ANDEN') anden.push(a * SAMPLE_MIN);
    }
  }
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

  let llegadas = 0;
  let aTiempo = 0;
  for (const r of reservations) {
    if (r.is_cancelled) continue;
    const start = new Date(r.start_datetime).getTime();
    if (start < tl.dayStart) continue;
    const ing = gateTimes.get(r.id)?.ingresoAt;
    if (!ing) continue;
    const t = new Date(ing).getTime();
    if (Number.isNaN(t) || t > until || t < start - 12 * 60 * MIN) continue;
    llegadas++;
    if (t <= start + ON_TIME_MARGIN_MIN * MIN) aTiempo++;
  }
  return {
    atendidos,
    patioAvgMin: avg(patio),
    andenAvgMin: avg(anden),
    puntualPct: llegadas ? Math.round((aTiempo / llegadas) * 100) : null,
    llegadas,
    enPatio,
  };
}

export function fmtMinutes(m: number | null) {
  if (m === null) return '—';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/* ─────────────────────────────── Próximos camiones ─────────────────────────────── */

export interface Upcoming {
  reservationId: string;
  dockId: string;
  start: number;
  plate: string;
}

/** Por andén, la próxima cita que aún no llega, dentro del horizonte. */
export function upcomingByDock(
  reservations: Reservation[],
  phaseNow: (r: Reservation) => TruckPhase,
  t: number,
  horizonMin: number
): Upcoming[] {
  const best = new Map<string, Upcoming>();
  for (const r of reservations) {
    if (r.is_cancelled) continue;
    const start = new Date(r.start_datetime).getTime();
    if (start < t - 30 * MIN || start > t + horizonMin * MIN) continue;
    const ph = phaseNow(r);
    if (ph !== 'PROGRAMADO' && ph !== 'EN_CAMINO') continue;
    const cur = best.get(r.dock_id);
    if (!cur || start < cur.start) best.set(r.dock_id, { reservationId: r.id, dockId: r.dock_id, start, plate: r.truck_plate || 'Sin placa' });
  }
  return [...best.values()];
}
