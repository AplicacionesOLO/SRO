/**
 * Tiempos por estado ("cronómetro por tramo").
 *
 * El recorrido de un camión se parte en tramos: cada tramo empieza cuando entra a un estado
 * y termina cuando pasa al siguiente. El contador de cada tramo arranca en 0.
 *  - Citas de SRO: arranca en el ingreso por casetilla, sigue con cada cambio de estado
 *    (activity_log) y termina en la salida por casetilla (o en un estado final).
 *  - Despachos de AppOLO: arranca al crear el despacho y sigue con su historial de estados.
 *
 * No se guarda nada nuevo: los tiempos salen de las horas que ya quedan registradas
 * (activity_log, casetilla_ingresos / casetilla_salidas, despacho_dev_actividad).
 */

export interface StateEvent {
  /** epoch ms */
  at: number;
  /** Identificador del estado (código o id) */
  key: string;
  label: string;
  color?: string;
  /** Estado final: aquí termina el recorrido (no abre un tramo) */
  terminal?: boolean;
  /** Marca de casetilla (ingreso / salida) en vez de un cambio de estado */
  gate?: 'ingreso' | 'salida';
  /** Estado previo a la llegada (Pendiente, Confirmada): no nombra el tiempo en patio */
  preArrival?: boolean;
}

export interface StateSegment {
  key: string;
  label: string;
  color?: string;
  /** epoch ms */
  from: number;
  /** epoch ms; null = tramo en curso */
  to: number | null;
  /** El tramo empezó con el ingreso por casetilla */
  fromGate?: boolean;
  /** Evento que cerró el tramo (para mostrar "pasó a …") */
  nextLabel?: string;
}

/**
 * Arma los tramos a partir de los eventos (en cualquier orden). Solo se usan los eventos
 * hasta `t`. Si hay ingreso por casetilla, los cambios previos se ignoran, pero el estado
 * vigente en ese momento da nombre al primer tramo.
 */
export function buildSegments(events: StateEvent[], t: number): StateSegment[] {
  const sorted = events.filter((e) => Number.isFinite(e.at) && e.at <= t).sort((a, b) => a.at - b.at);
  if (!sorted.length) return [];

  const ingreso = sorted.find((e) => e.gate === 'ingreso');
  let list = sorted;
  let current: StateEvent | undefined;
  if (ingreso) {
    // estado vigente al ingresar (último cambio de estado antes del ingreso)
    for (const e of sorted) {
      if (e.at > ingreso.at) break;
      if (!e.gate) current = e;
    }
    list = sorted.filter((e) => e.at >= ingreso.at && e !== ingreso);
  }

  const segments: StateSegment[] = [];
  let open: StateSegment | null = ingreso
    ? {
        key: current && !current.terminal && !current.preArrival ? current.key : 'INGRESO',
        label: current && !current.terminal && !current.preArrival ? current.label : 'En patio',
        color: current && !current.preArrival ? current.color : undefined,
        from: ingreso.at,
        to: null,
        fromGate: true,
      }
    : null;

  for (const e of list) {
    if (e.gate === 'ingreso') continue;
    if (open) {
      // Un "cambio" al mismo estado no reinicia el contador
      if (!e.gate && e.key === open.key && !e.terminal) continue;
      open.to = e.at;
      open.nextLabel = e.gate === 'salida' ? 'Salida por casetilla' : e.label;
      segments.push(open);
      open = null;
    }
    if (e.gate === 'salida') break;
    if (e.terminal) {
      // Un estado final solo abre tramo si después se registra la salida (p. ej. despachado → salida)
      const salida = list.find((x) => x.gate === 'salida' && x.at >= e.at);
      if (!salida) break;
    }
    open = { key: e.key, label: e.label, color: e.color, from: e.at, to: null };
  }
  if (open) segments.push(open);
  return segments;
}

/** Duración de un tramo (los tramos en curso se miden hasta `now`). */
export const segmentMs = (s: StateSegment, now: number) => Math.max(0, (s.to ?? now) - s.from);

/** Tramo en curso (el último sin fin), si existe. */
export const currentSegment = (segs: StateSegment[]) => {
  const last = segs[segs.length - 1];
  return last && last.to === null ? last : null;
};

/** Tiempo total por estado (un estado puede repetirse), en el orden en que aparece. */
export function totalsByState(segs: StateSegment[], now: number) {
  const out = new Map<string, { label: string; color?: string; ms: number; count: number }>();
  for (const s of segs) {
    const hit = out.get(s.key) ?? { label: s.label, color: s.color, ms: 0, count: 0 };
    hit.ms += segmentMs(s, now);
    hit.count++;
    out.set(s.key, hit);
  }
  return out;
}

/** "1 h 05 min", "12 min", "45 s" */
export function fmtDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total} s`;
  const min = Math.floor(total / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

/** Contador tipo reloj: "05:12" o "1:05:12" */
export function fmtClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Estados finales de una cita de SRO (por código). */
export const TERMINAL_CODES = new Set(['DISPATCHED', 'DONE', 'CANCELLED', 'NO_SHOW']);
/** Estados previos a la llegada: no cuentan como tiempo en sitio. */
export const PRE_ARRIVAL_CODES = new Set(['PENDING', 'CONFIRMED']);

const msOf = (iso?: string | null) => {
  if (!iso) return NaN;
  return new Date(iso).getTime();
};

/**
 * Eventos de una cita de SRO: cambios de estado (con su código) + casetilla.
 * `statusInfo` resuelve el código → nombre y color que ve el usuario.
 */
export function reservationEvents(
  changes: { to: string; at: number }[],
  gate: { ingresoAt?: string | null; salidaAt?: string | null } | undefined,
  statusInfo: (code: string) => { name: string; color?: string } | undefined,
  opts: { startIso?: string | null } = {}
): StateEvent[] {
  const events: StateEvent[] = changes.map((c) => {
    const code = c.to.toUpperCase();
    const info = statusInfo(code);
    return { at: c.at, key: code, label: info?.name ?? code, color: info?.color, terminal: TERMINAL_CODES.has(code), preArrival: PRE_ARRIVAL_CODES.has(code) };
  });
  const ingreso = msOf(gate?.ingresoAt);
  // Un ingreso muy anterior a la cita suele ser de una cita reprogramada
  const start = msOf(opts.startIso);
  if (Number.isFinite(ingreso) && (!Number.isFinite(start) || ingreso >= start - 12 * 3_600_000))
    events.push({ at: ingreso, key: 'INGRESO', label: 'Ingreso por casetilla', gate: 'ingreso' });
  const salida = msOf(gate?.salidaAt);
  if (Number.isFinite(salida)) events.push({ at: salida, key: 'SALIDA', label: 'Salida por casetilla', gate: 'salida' });

  // Sin ingreso registrado: el recorrido arranca en el primer estado "en sitio"
  if (!events.some((e) => e.gate === 'ingreso')) {
    const first = events.filter((e) => !e.gate && !PRE_ARRIVAL_CODES.has(e.key)).sort((a, b) => a.at - b.at)[0];
    return first ? events.filter((e) => e.at >= first.at) : [];
  }
  return events;
}
