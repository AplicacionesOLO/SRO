import type {
  AppoloDispatch,
  AppoloEquipmentFamily,
  AppoloReception,
  AppoloSlotType,
  AppoloSnapshot,
} from '../../../services/appoloOpsService';
import { dockPose, ROAD_Z, type Pose, type RoutePoint, type SiteLayout } from './layout';
import type { TruckAlert } from './alerts';
import type { StateEvent } from '../../../utils/stateTimes';

/**
 * Lógica pura de la capa AppOLO del 3D (despachos y acomodo).
 * No toca las citas de SRO: solo agrega camiones de despacho, puertas de despacho
 * que no existen en SRO y la animación de acomodo.
 */

const MIN = 60_000;
export const APPOLO_ID_PREFIX = 'appolo:';
export const isAppoloId = (id: string | null | undefined) => !!id && id.startsWith(APPOLO_ID_PREFIX);

/* ─────────────────────────────── Puertas de despacho ─────────────────────────────── */

export interface DockLike {
  id: string;
  name: string;
  categoryName?: string | null;
}

const DESPACHO_RE = /despacho|dispatch/i;
export const doorNumber = (s: string | null | undefined) => {
  const m = String(s ?? '').match(/\d+/);
  return m ? Number(m[0]) : NaN;
};

export interface DoorMap {
  /** Puertas de AppOLO que no existen en SRO y se dibujan como andenes de despacho */
  extraDocks: DockLike[];
  /** puerta de AppOLO (número) → id de andén en el 3D */
  byNumber: Map<number, string>;
}

/** Nombre del grupo de puertas de AppOLO en el 3D (queda entre Zona Franca y Recepción). */
export const APPOLO_DOOR_GROUP = 'Despacho AppOLO';

/**
 * Las puertas de AppOLO son DISTINTAS de los andenes de SRO (por ahora no se homologan):
 * cada una se dibuja como un andén propio del grupo "Despacho AppOLO", rotulado P<número>.
 * Solo se dibujan; no se crean en SRO.
 */
export function mapDispatchDoors(_sroDocks: DockLike[], snapshot: AppoloSnapshot | null): DoorMap {
  const byNumber = new Map<number, string>();
  const extraDocks: DockLike[] = [];
  if (!snapshot) return { extraDocks, byNumber };

  const doors = new Set<number>();
  for (const s of snapshot.doors ?? []) if (!Number.isNaN(doorNumber(s))) doors.add(doorNumber(s));
  for (const d of snapshot.dispatches) if (!Number.isNaN(doorNumber(d.puerta))) doors.add(doorNumber(d.puerta));

  for (const n of [...doors].sort((a, b) => a - b)) {
    const id = `appolo-door:${n}`;
    extraDocks.push({ id, name: `P${n}`, categoryName: APPOLO_DOOR_GROUP });
    byNumber.set(n, id);
  }
  return { extraDocks, byNumber };
}

/* ─────────────────────────────── Zona de espera de salida (despachos) ─────────────────────────────── */

/**
 * Patio propio de AppOLO, separado de la fila de salida de SRO, junto al retorno de la
 * calle trasera. Aquí quedan TODOS los despachos en "chofer pendiente", con su contador,
 * para ver lo atrasado tal como está.
 */
export const LOT_ROWS = 18;
export const LOT_COLS = 3;
const LOT_ROW_GAP = 4.8;
const LOT_COL_GAP = 22;
export const LOT_CAPACITY = LOT_ROWS * LOT_COLS;

export function lotGeometry(layout: SiteLayout) {
  // pasando la hilera de árboles del lado este (no se tapa nada existente)
  const x0 = layout.eastRoadX + 38;
  const zTop = ROAD_Z - 7;
  return {
    x0,
    x1: x0 + 6 + LOT_COLS * LOT_COL_GAP,
    zTop,
    zBottom: zTop - (LOT_ROWS - 1) * LOT_ROW_GAP - 4,
    /** carril de acceso (norte–sur) en el lado oeste del patio */
    laneX: x0 + 2.5,
  };
}

/** Cajón k: se llena primero la columna más lejana para que nadie pase sobre otro camión. */
export function lotPose(layout: SiteLayout, slot: number): Pose {
  const g = lotGeometry(layout);
  const row = slot % LOT_ROWS;
  const col = LOT_COLS - 1 - Math.floor(slot / LOT_ROWS);
  return { x: g.x0 + 6 + col * LOT_COL_GAP + LOT_COL_GAP / 2, z: g.zTop - row * LOT_ROW_GAP, heading: Math.PI / 2, park: 'forward' };
}

export interface LotStats {
  total: number;
  hoy: number;
  semana: number;
  antiguos: number;
}

/** Despachos esperando salida por antigüedad (para el rótulo del patio y el panel). */
export function lotStats(items: DispatchItem[], t: number): LotStats {
  const out: LotStats = { total: 0, hoy: 0, semana: 0, antiguos: 0 };
  for (const i of items) {
    if (!i.inLot) continue;
    out.total++;
    const age = t - i.since;
    if (age < 24 * 60 * MIN) out.hoy++;
    else if (age < 7 * 24 * 60 * MIN) out.semana++;
    else out.antiguos++;
  }
  return out;
}

/** Ruta del andén al patio de espera: calle trasera → retorno → carril de acceso → cajón. */
export function lotRoute(layout: SiteLayout, from: Pose | null, to: Pose): RoutePoint[] {
  const g = lotGeometry(layout);
  const pts: RoutePoint[] = [];
  if (from) {
    pts.push({ x: from.x, z: from.z });
    if (Math.abs(from.z - ROAD_Z) > 3 && from.x < layout.eastRoadX) pts.push({ x: from.x, z: ROAD_Z + 1 });
  }
  pts.push({ x: layout.eastRoadX, z: ROAD_Z + 1 });
  pts.push({ x: g.laneX, z: ROAD_Z + 1 });
  pts.push({ x: g.laneX, z: to.z });
  pts.push({ x: to.x, z: to.z });
  return pts;
}

/* ─────────────────────────────── Estados de despacho ─────────────────────────────── */

export type DispatchStage = 'PREPARANDO' | 'CARGANDO' | 'ESPERA_CHOFER' | 'VALIDACION' | 'RECHAZADO' | 'DESPACHADO' | 'OCULTO';

/** Estado de AppOLO (despacho_dev_estados.codigo) → lo que se ve en el 3D. */
const STAGE_BY_ESTADO: Record<string, DispatchStage> = {
  creado: 'PREPARANDO',
  'en proceso': 'CARGANDO',
  en_proceso: 'CARGANDO',
  chofer_pendiente: 'ESPERA_CHOFER',
  completo: 'VALIDACION',
  pendiente_validacion: 'VALIDACION',
  rechazado: 'RECHAZADO',
  despachado: 'DESPACHADO',
  finalizado: 'DESPACHADO',
  eliminado: 'OCULTO',
};

export const DISPATCH_STAGE_META: Record<DispatchStage, { label: string; color: string; icon: string }> = {
  PREPARANDO: { label: 'Preparando carga', color: '#64748b', icon: 'ri-stack-line' },
  CARGANDO: { label: 'Cargando', color: '#2563eb', icon: 'ri-truck-line' },
  ESPERA_CHOFER: { label: 'Esperando chofer', color: '#d97706', icon: 'ri-user-search-line' },
  VALIDACION: { label: 'Validando boleta', color: '#7c3aed', icon: 'ri-file-shield-2-line' },
  RECHAZADO: { label: 'Rechazado', color: '#dc2626', icon: 'ri-close-circle-line' },
  DESPACHADO: { label: 'Despachado', color: '#16a34a', icon: 'ri-checkbox-circle-line' },
  OCULTO: { label: 'Eliminado', color: '#94a3b8', icon: 'ri-delete-bin-line' },
};

export const stageOfEstado = (estado: string): DispatchStage => STAGE_BY_ESTADO[estado.trim().toLowerCase()] ?? 'PREPARANDO';

const ms = (iso?: string | null) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/** Estado del despacho en el instante `t` (usa el historial si existe). */
export function dispatchStateAt(d: AppoloDispatch, t: number): { estado: string; since: number } | null {
  const created = ms(d.created_at);
  if (created === null || created > t) return null;
  const history = (d.history ?? [])
    .map((h) => ({ estado: String(h.estado).toLowerCase(), at: ms(h.at) }))
    .filter((h): h is { estado: string; at: number } => h.at !== null)
    .sort((a, b) => a.at - b.at);
  let state = { estado: 'creado', since: created };
  if (history.length) {
    for (const h of history) {
      if (h.at > t) break;
      state = { estado: h.estado, since: h.at };
    }
    return state;
  }
  // Sin historial: el estado actual vale desde la última actualización
  const updated = ms(d.updated_at) ?? created;
  return updated <= t ? { estado: d.estado, since: updated } : state;
}

/** Tarimas totales del despacho (posiciones del contenedor). */
export function dispatchPallets(d: AppoloDispatch) {
  const fromLayout = (d.layout ?? []).filter((s) => s && s !== 'E').length;
  const fromCount = (d.tarimas_s ?? 0) + (d.tarimas_d ?? 0);
  return Math.max(fromLayout, fromCount) || 16;
}

/** Tiempo de referencia para estimar el avance de una carga sin distribución registrada. */
const LOAD_REF_MS = 45 * MIN;

/* ─────────────────────────────── Mapa del contenedor (igual que AppOLO) ─────────────────────────────── */

/** Posiciones del contenedor: 12 filas × 2 columnas (posición p ↔ índice p-1; impares a la izquierda). */
export const CONTAINER_SLOTS = 24;
/** Colores de AppOLO (CARGA_SLOT_COLORS) para que el mapa se lea igual en los dos sistemas. */
export const SLOT_COLORS: Record<AppoloSlotType, string> = { E: '#E5E7EB', S: '#60A5FA', D: '#F59E0B', T: '#8B5CF6', C: '#EF4444' };
export const SLOT_LABELS: Record<AppoloSlotType, string> = { E: 'Libre', S: 'Simple', D: 'Doble', T: 'Triple', C: 'Cuádruple' };

/** Normaliza la distribución a exactamente 24 posiciones (lo inválido o ausente = libre). */
export function normalizeCells(layout: readonly (AppoloSlotType | null | undefined)[] | null | undefined): AppoloSlotType[] {
  return Array.from({ length: CONTAINER_SLOTS }, (_, i) => {
    const c = layout?.[i];
    return c === 'S' || c === 'D' || c === 'T' || c === 'C' ? c : 'E';
  });
}

export const occupiedCells = (cells: readonly AppoloSlotType[]) => cells.filter((c) => c !== 'E').length;

/** ¿El despacho trae el mapa real del contenedor? */
export const hasRealLayout = (d: AppoloDispatch) => Array.isArray(d.layout) && d.layout.length > 0;

/**
 * Avance de carga. Con el mapa real de AppOLO es el mismo cálculo que AppOLO:
 * posiciones ocupadas / 24. Sin mapa (o en Demo) se estima por el tiempo en carga.
 */
export function loadProgress(d: AppoloDispatch, stage: DispatchStage, since: number, t: number, live: boolean) {
  if (stage === 'PREPARANDO' || stage === 'OCULTO') return live && hasRealLayout(d) ? occupiedCells(normalizeCells(d.layout)) / CONTAINER_SLOTS : 0;
  if (live && hasRealLayout(d)) return occupiedCells(normalizeCells(d.layout)) / CONTAINER_SLOTS;
  if (stage !== 'CARGANDO') return 1;
  return Math.max(0.05, Math.min(0.95, (t - since) / LOAD_REF_MS));
}

/**
 * Posiciones del contenedor que se ven en el 3D y en la tarjeta.
 * En vivo con mapa: exactamente lo que registró AppOLO. Si no: un plan que se va llenando
 * en orden (posición 1 primero) según el avance estimado.
 */
export function containerCells(d: AppoloDispatch, stage: DispatchStage, progress: number, live: boolean): AppoloSlotType[] {
  if (live && hasRealLayout(d)) return normalizeCells(d.layout);
  const plan = occupiedCells(normalizeCells(d.layout))
    ? normalizeCells(d.layout)
    : normalizeCells(Array.from({ length: Math.min(CONTAINER_SLOTS, dispatchPallets(d)) }, (_, i) => (i % 5 === 4 ? 'D' : 'S')));
  if (stage === 'PREPARANDO') return normalizeCells(null);
  if (stage !== 'CARGANDO') return plan;
  let keep = Math.round(Math.max(0, Math.min(1, progress)) * occupiedCells(plan));
  return plan.map((c) => (c !== 'E' && keep-- > 0 ? c : 'E'));
}

/* ─────────────────────────────── Plan de despachos ─────────────────────────────── */

export interface DispatchItem {
  /** id del camión en el 3D (con prefijo) */
  id: string;
  dispatch: AppoloDispatch;
  stage: DispatchStage;
  since: number;
  /** Andén donde se dibuja (null = sin puerta reconocida o puerta ocupada) */
  dockId: string | null;
  pose: Pose | null;
  /** Va saliendo del sitio (recién despachado) */
  leaving: boolean;
  progress: number;
  /** Mapa del contenedor (24 posiciones) */
  cells: AppoloSlotType[];
  /** true = el mapa viene de AppOLO; false = estimado */
  cellsReal: boolean;
  /** Motivo por el que no se dibuja en un andén */
  note?: string;
  /** Está en el patio de espera de salida de despachos */
  inLot?: boolean;
}

const STAGE_PRIORITY: Record<DispatchStage, number> = {
  CARGANDO: 0,
  ESPERA_CHOFER: 1,
  VALIDACION: 2,
  RECHAZADO: 3,
  PREPARANDO: 4,
  DESPACHADO: 9,
  OCULTO: 9,
};
/** Minutos que se ve salir un camión recién despachado */
const LEAVING_MIN = 12;

export function buildDispatchPlan(
  snapshot: AppoloSnapshot | null,
  doors: DoorMap,
  layout: SiteLayout,
  occupiedBySro: Set<string>,
  t: number,
  live: boolean,
  /** Registro persistente id → cajón del patio de espera (para que nadie cambie de lugar) */
  lotSlots: Map<string, number> = new Map()
): DispatchItem[] {
  if (!snapshot) return [];
  const items: DispatchItem[] = [];
  for (const d of snapshot.dispatches) {
    const st = dispatchStateAt(d, t);
    if (!st) continue;
    const stage = stageOfEstado(st.estado);
    if (stage === 'OCULTO') continue;
    if (stage === 'DESPACHADO' && t - st.since > LEAVING_MIN * MIN) continue;
    const n = doorNumber(d.puerta);
    const dockId = Number.isNaN(n) ? null : doors.byNumber.get(n) ?? null;
    const progress = loadProgress(d, stage, st.since, t, live);
    items.push({
      id: APPOLO_ID_PREFIX + d.id,
      dispatch: d,
      stage,
      since: st.since,
      dockId,
      pose: null,
      leaving: stage === 'DESPACHADO',
      progress,
      cells: containerCells(d, stage, progress, live),
      cellsReal: live && hasRealLayout(d),
      note: dockId ? undefined : 'Puerta no reconocida',
    });
  }

  // Esperando chofer → patio de espera de salida. Se cuentan TODOS; se dibujan los más recientes
  // (los que todavía se pueden atender) hasta llenar el patio; el resto queda en la lista.
  const allWaiting = items.filter((i) => i.stage === 'ESPERA_CHOFER').sort((a, b) => b.since - a.since);
  for (const it of allWaiting) {
    it.inLot = true;
    it.note = 'En espera de salida (fuera de vista: patio lleno)';
  }
  const waiting = allWaiting.slice(0, LOT_CAPACITY);
  const waitingIds = new Set(waiting.map((i) => i.id));
  for (const id of [...lotSlots.keys()]) if (!waitingIds.has(id)) lotSlots.delete(id);
  const usedSlots = new Set(lotSlots.values());
  for (const it of waiting) {
    if (!lotSlots.has(it.id)) {
      let k = 0;
      while (usedSlots.has(k)) k++;
      lotSlots.set(it.id, k);
      usedSlots.add(k);
    }
    it.pose = lotPose(layout, lotSlots.get(it.id)!);
    it.note = 'En espera de salida';
  }

  // Un camión por puerta: gana el más avanzado; SRO tiene prioridad sobre su andén
  const taken = new Set(occupiedBySro);
  const ordered = items
    .filter((i) => !i.leaving && i.dockId && !i.inLot)
    .sort((a, b) => STAGE_PRIORITY[a.stage] - STAGE_PRIORITY[b.stage] || b.since - a.since);
  for (const it of ordered) {
    if (taken.has(it.dockId!)) {
      it.note = occupiedBySro.has(it.dockId!) ? 'Andén ocupado por una cita de SRO' : 'Puerta ocupada por otro despacho';
      continue;
    }
    const pose = dockPose(layout, it.dockId!);
    if (!pose) continue;
    it.pose = pose;
    taken.add(it.dockId!);
  }
  return items;
}

export function dispatchAlert(it: DispatchItem): TruckAlert | null {
  if (!it.pose || it.leaving || it.stage === 'DESPACHADO' || it.stage === 'OCULTO') return null;
  const alerting = it.stage === 'ESPERA_CHOFER' || it.stage === 'VALIDACION';
  const created = ms(it.dispatch.created_at);
  return { label: DISPATCH_STAGE_META[it.stage].label, since: it.since, alerting, totalSince: created ?? undefined };
}

/**
 * Eventos del despacho para los tiempos por estado: creación + historial de AppOLO
 * (despacho_dev_actividad). Despachado / eliminado cierran el recorrido.
 */
export function dispatchEvents(d: AppoloDispatch): StateEvent[] {
  const created = ms(d.created_at);
  if (created === null) return [];
  const ev = (estado: string, at: number): StateEvent => {
    const stage = stageOfEstado(estado);
    const meta = DISPATCH_STAGE_META[stage];
    return { at, key: stage, label: meta.label, color: meta.color, terminal: stage === 'DESPACHADO' || stage === 'OCULTO' };
  };
  const events: StateEvent[] = [ev('creado', created)];
  const history = (d.history ?? []).map((h) => ({ estado: String(h.estado), at: ms(h.at) }));
  if (history.length) {
    for (const h of history) if (h.at !== null) events.push(ev(h.estado, h.at));
  } else {
    const updated = ms(d.updated_at);
    if (updated !== null && updated > created) events.push(ev(d.estado, updated));
  }
  const fin = ms(d.finalized_at);
  if (fin !== null && !events.some((e) => e.terminal)) events.push(ev('finalizado', fin));
  return events;
}

/* ─────────────────────────────── Equipos ─────────────────────────────── */

export interface EquipmentUse {
  montacargas: number;
  apilador: number;
  carretilla: number;
}

type Pool = EquipmentUse;

function poolFrom(equipment: AppoloEquipmentFamily[] | null | undefined): Pool | null {
  if (!equipment || !equipment.length) return null;
  const pool: Pool = { montacargas: 0, apilador: 0, carretilla: 0 };
  for (const f of equipment) {
    const n = Math.max(0, Number(f.activos) || 0);
    if (/montacarg|forklift/i.test(f.familia)) pool.montacargas += n;
    else if (/apilad|stacker/i.test(f.familia)) pool.apilador += n;
    else if (/carretilla|pallet/i.test(f.familia)) pool.carretilla += n;
  }
  return pool;
}

/**
 * Reparte los equipos ACTIVOS de AppOLO entre las operaciones visibles, en orden.
 * Sin catálogo de equipos se usa una dotación por defecto.
 */
export function allocateEquipment(
  equipment: AppoloEquipmentFamily[] | null | undefined,
  needs: { id: string; want: EquipmentUse }[]
): Map<string, EquipmentUse> {
  const pool = poolFrom(equipment);
  const out = new Map<string, EquipmentUse>();
  for (const n of needs) {
    if (!pool) {
      out.set(n.id, n.want);
      continue;
    }
    const take = (k: keyof Pool) => {
      const v = Math.min(n.want[k], pool[k]);
      pool[k] -= v;
      return v;
    };
    out.set(n.id, { montacargas: take('montacargas'), apilador: take('apilador'), carretilla: take('carretilla') });
  }
  return out;
}

export function equipmentTotals(equipment: AppoloEquipmentFamily[] | null | undefined) {
  if (!equipment) return null;
  const sum = (re: RegExp, k: 'activos' | 'mantenimiento') =>
    equipment.filter((f) => re.test(f.familia)).reduce((a, f) => a + (Number(f[k]) || 0), 0);
  return [
    { label: 'Montacargas', activos: sum(/montacarg/i, 'activos'), mantenimiento: sum(/montacarg/i, 'mantenimiento') },
    { label: 'Apiladores', activos: sum(/apilad/i, 'activos'), mantenimiento: sum(/apilad/i, 'mantenimiento') },
    { label: 'Carretillas', activos: sum(/carretilla/i, 'activos'), mantenimiento: sum(/carretilla/i, 'mantenimiento') },
  ];
}

/* ─────────────────────────────── Acomodo (putaway) ─────────────────────────────── */

export interface PutawayItem {
  id: string;
  reception: AppoloReception;
  dockId: string;
  x: number;
  progress: number;
  /** Tarimas estimadas a acomodar */
  pallets: number;
  /** La duración es real (hay hora de fin) o estimada */
  estimated: boolean;
}

const PUTAWAY_REF_MS = 40 * MIN;

/** Tarimas a acomodar, estimadas a partir de los bultos de la descarga. */
export function putawayPallets(r: AppoloReception) {
  const bultos = Number(r.bultos) || 0;
  if (!bultos) return 8;
  const perPallet = /granel/i.test(r.tipo_descarga ?? '') ? 40 : 30;
  return Math.max(3, Math.min(12, Math.ceil(bultos / perPallet)));
}

export function buildPutaways(
  snapshot: AppoloSnapshot | null,
  layout: SiteLayout,
  dockOfReservation: (reservaId: string) => string | null,
  sroDocks: DockLike[],
  t: number
): PutawayItem[] {
  if (!snapshot) return [];
  const out: PutawayItem[] = [];
  const usedDocks = new Set<string>();
  for (const r of snapshot.receptions) {
    const start = ms(r.started_at);
    if (start === null || start > t) continue;
    const end = ms(r.completed_at);
    if (end !== null && end <= t) continue;
    let dockId = r.reserva_id ? dockOfReservation(r.reserva_id) : null;
    if (!dockId && r.puerta) {
      const n = doorNumber(r.puerta);
      dockId = sroDocks.find((d) => !DESPACHO_RE.test(d.categoryName ?? '') && doorNumber(d.name) % 100 === n % 100)?.id ?? null;
    }
    const slot = dockId ? layout.docks.get(dockId) : undefined;
    if (!dockId || !slot || usedDocks.has(dockId)) continue;
    usedDocks.add(dockId);
    const progress =
      end !== null ? (t - start) / Math.max(MIN, end - start) : Math.min(0.95, (t - start) / PUTAWAY_REF_MS);
    out.push({
      id: r.id,
      reception: r,
      dockId,
      x: slot.x,
      progress: Math.max(0, Math.min(1, progress)),
      pallets: putawayPallets(r),
      estimated: end === null,
    });
  }
  return out;
}

/* ─────────────────────────────── Datos de demostración ─────────────────────────────── */

/**
 * Foto de ejemplo con la misma forma del contrato, para ver la integración funcionando
 * antes de que AppOLO publique su API. Se marca claramente como demostración en pantalla.
 */
export function demoSnapshot(
  sroDocks: DockLike[],
  discharged: { reservaId: string; bultos: number | null }[],
  anchor: number
): AppoloSnapshot {
  const iso = (t: number) => new Date(t).toISOString();
  void sroDocks;
  const doors = [11, 12, 13, 14, 15, 16].map((n) => `Puerta ${n}`);
  const full = (n: number, kind: AppoloSlotType = 'S'): AppoloSlotType[] =>
    Array.from({ length: 24 }, (_, i) => (i < n ? (i % 5 === 4 ? 'D' : kind) : 'E'));
  const mk = (
    i: number,
    puerta: string,
    steps: [string, number][],
    extra: Partial<AppoloDispatch> = {}
  ): AppoloDispatch => {
    const created = anchor - steps[0][1] * MIN;
    const history = steps.map(([estado, ago]) => ({ estado, at: iso(anchor - ago * MIN) }));
    const last = steps[steps.length - 1];
    return {
      id: `demo-${i}`,
      estado: last[0],
      puerta,
      placa: ['C-148203', 'CL-302118', 'C-171544', 'CL-288901', 'C-160077', 'CL-311420', 'C-155903'][i % 7],
      chofer: ['J. Mora', 'L. Vargas', 'A. Solís', 'M. Rojas', 'D. Castro', 'R. Jiménez', 'K. Araya'][i % 7],
      transportista: ['Transportes Herrera', 'Logística del Valle', 'Fletes CR'][i % 3],
      tienda: ['Tienda Escazú', 'Tienda Heredia', 'Tienda Cartago', 'Tienda Alajuela', 'CEDI Liberia'][i % 5],
      referencia: `DSP-${2400 + i}`,
      tipo: 'Distribución',
      tarimas_s: 18,
      tarimas_d: 2,
      created_at: iso(created),
      updated_at: iso(anchor - last[1] * MIN),
      history,
      ...extra,
    };
  };
  const dispatches: AppoloDispatch[] = [
    mk(0, doors[0], [['creado', 60], ['en proceso', 22]], { layout: full(11) }),
    mk(1, doors[1], [['creado', 40], ['en proceso', 8]], { layout: full(4) }),
    mk(2, doors[2], [['creado', 35], ['en proceso', 18]], { layout: full(14) }),
    mk(3, doors[3], [['creado', 95], ['en proceso', 70], ['completo', 30], ['pendiente_validacion', 24]], { layout: full(20) }),
    mk(4, doors[4], [['creado', 12]]),
    mk(5, doors[5], [['creado', 120], ['en proceso', 90], ['completo', 50], ['despachado', 4]], { layout: full(20) }),
    // Esperando chofer: desde pocos minutos hasta varias horas (lo atrasado se ve tal cual)
    ...[6, 13, 21, 38, 75, 140, 230, 365].map((ago, k) =>
      mk(6 + k, doors[k % doors.length], [['creado', ago + 90], ['en proceso', ago + 60], ['chofer_pendiente', ago]], { layout: full(20) })
    ),
  ];
  const receptions: AppoloReception[] = discharged.slice(0, 3).map((d, i) => ({
    id: `demo-rec-${i}`,
    reserva_id: d.reservaId,
    tipo_descarga: i % 2 ? 'A granel' : 'Entarimado',
    bultos: d.bultos ?? 240,
    started_at: iso(anchor - (6 + i * 9) * MIN),
    completed_at: null,
  }));
  return {
    version: 1,
    generated_at: iso(anchor),
    bodega: { id: 'demo', nombre: 'Demostración' },
    doors,
    dispatches,
    receptions,
    equipment: [
      { familia: 'Montacargas', activos: 3, mantenimiento: 1 },
      { familia: 'Apilador', activos: 3, mantenimiento: 0 },
      { familia: 'Carretilla', activos: 5, mantenimiento: 1 },
    ],
    realtime: null,
  };
}
