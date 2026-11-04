/**
 * Geometría del sitio OLO (en metros), reconstruida de las tomas aéreas y
 * confirmada por operación:
 *
 *                  cerca + franja de tarimas
 *      ┌──→──→──── calle trasera (un solo sentido) ──→──→──┐
 *      │      ZF ZF ZF │ REC REC REC … │ DESP              │
 *   ▒  ↑   ┌───────────────────────────────────────────┐   ↓
 *   ▒  ↑   │                                           │   ↓
 *   ▒ fila │              ALMACÉN OLO                  │   ↓ salida
 *   ▒ de   │                                           │   ↓
 *   ▒ espera   [ parqueo carros · oficinas · CEDA ]    │   ↓
 *   talud  ▣ aguja despacho                             └───┘
 *   ══▣▣═══↑═════════════════ bulevar ←←←←←←←←←←←←←←←←←←←←←←←
 *  calle  entrada principal        almacén vecino (fachada negra)
 *  pública
 *
 * Circulación: calle pública → aguja principal → bulevar → aguja de despacho →
 * patio de espera (oeste) → calle trasera → andén (en reversa) → lado este →
 * bulevar → aguja de salida → calle pública.
 *
 * Ejes: x = lado de entrada → lado de salida, z = frente (−) → atrás (+). La cara de
 * andenes está en z = 0 y el frente del edificio en z = −BUILDING_DEPTH.
 * El dibujo de arriba está en coordenadas lógicas; la escena se REFLEJA en x
 * (MIRROR_X) para que, visto desde el frente, la entrada y la casetilla de
 * despacho queden a la izquierda, como en el sitio real.
 * Para ajustar la distribución basta con cambiar las constantes de este archivo.
 */

export const DOCK_SPACING = 4.6;
export const BUILDING_DEPTH = 80;
export const BUILDING_HEIGHT = 12;
export const CANOPY_DEPTH = 6;
export const TRUCK_LENGTH = 17;
const DOCKED_OFFSET = 0.6 + TRUCK_LENGTH / 2;
/** z del centro de un camión acoplado al andén */
export const DOCKED_Z = DOCKED_OFFSET;

/* Atrás: plataforma, calle trasera, tarimas y cerca */
export const APRON_DEPTH = 24;
export const ROAD_Z = 28;
export const ROAD_WIDTH = 9;
export const PALLET_Z0 = ROAD_Z + ROAD_WIDTH / 2 + 1;
export const FENCE_Z = PALLET_Z0 + 7;

/* Frente: parqueo, bulevar, almacén vecino */
export const FRONT_Z = -BUILDING_DEPTH;
export const CARPARK_DEPTH = 16;
export const BLVD_Z = FRONT_Z - CARPARK_DEPTH - 7;
export const BLVD_WIDTH = 11;
export const NEIGHBOR_Z1 = BLVD_Z - BLVD_WIDTH / 2 - 26; // fachada del vecino
export const NEIGHBOR_DEPTH = 70;

/* Patio de espera (lado oeste) y salida (lado este) */
const YARD_WIDTH = 46; // de la pared oeste al talud
const EAST_ROAD_GAP = 14; // de la pared este a la calle de salida
const MIN_LENGTH = 170;
const LANE = 2.5;

/** Reflejo en x aplicado al dibujar (ver WarehouseScene). −1 = entrada a la izquierda vista desde el frente. */
export const MIRROR_X = -1;
/**
 * Desplazamiento del carril "derecho" en coordenadas lógicas. Con la escena reflejada,
 * el carril derecho que se ve en pantalla es el izquierdo lógico.
 */
const DRIVE_LANE = LANE * MIRROR_X;

/* Interior del almacén: piso a la altura de la plataforma del remolque */
export const FLOOR_Y = 1.2;
export const DOOR_WIDTH = DOCK_SPACING - 1.2;
export const DOOR_HEIGHT = 3.6;
/** Zona de recepción (staging) detrás de cada puerta */
export const STAGING_DEPTH = 20;
/** Pasillo transversal entre recepción y racks */
export const CROSS_AISLE_Z = -STAGING_DEPTH - 3;
export const RACK_Z0 = -STAGING_DEPTH - 6.5;

/**
 * Racks perpendiculares a la pared de andenes: cada fila doble (espalda con espalda) corre
 * en z, desde el pasillo transversal hacia el frente del edificio. Las filas se repiten en x
 * sobre una grilla fija, así cualquier andén sabe dónde queda el pasillo más cercano.
 */
export const RACK_DEPTH = 1.1;
export const RACK_FLUE = 0.2;
export const RACK_AISLE = 3.6;
/** Distancia en x entre filas dobles (fila doble + pasillo) */
export const RACK_PITCH = 2 * RACK_DEPTH + RACK_FLUE + RACK_AISLE;
/** Fondo útil de los racks (z) */
export const RACK_Z_END = -BUILDING_DEPTH + 6;

/** x lógico del centro del pasillo de racks más cercano a `x`. */
/**
 * Taller de equipos (mantenimiento / reparación): contra la fachada frontal, en el extremo de
 * Recepción (lado oeste lógico), separado unos metros de la pared lateral. Visto desde el lado
 * de andenes queda arriba a la derecha. Los racks no se dibujan sobre esta área.
 * Se dibuja en coordenadas locales: pared en z = 0 y el lado abierto hacia el interior (z+).
 */
export const WORKSHOP_W = 18;
export const WORKSHOP_D = 14;
const WORKSHOP_OFFSET = 9;
export function workshopPlacement(layout: { xWest: number }) {
  return { x: layout.xWest + WORKSHOP_OFFSET + WORKSHOP_W / 2, z: FRONT_Z + 0.6, rotationY: 0 };
}
/** Área del taller en coordenadas del mundo (para no dibujar racks encima) */
export function workshopRect(layout: { xWest: number }) {
  const x0 = layout.xWest + WORKSHOP_OFFSET;
  const z0 = FRONT_Z + 0.6;
  return { x0, x1: x0 + WORKSHOP_W, z0, z1: z0 + WORKSHOP_D };
}

/**
 * Despacho y escritorios: pegado a la pared de andenes, entre la pared lateral y el andén 0101,
 * con un portón grande a nivel de piso por donde entra y sale la mercadería pesada.
 */
export const DISPATCH_AREA_W = 16;
export const DISPATCH_AREA_D = 14;
export const HEAVY_GATE_W = 6;
export const HEAVY_GATE_H = 4.2;
export function dispatchAreaRect(layout: { xWest: number }) {
  const x0 = layout.xWest + 1;
  return { x0, x1: x0 + DISPATCH_AREA_W, z0: -DISPATCH_AREA_D, z1: -0.4, gateX: x0 + DISPATCH_AREA_W / 2 };
}

/**
 * Mezzanine de 3 niveles (piso + 2 entrepisos): franja angosta a lo largo de los andenes,
 * del andén 0110 al 0117. Arriba corre el sistema de bandas transportadoras, con bajadas
 * hacia cada portón.
 */
const MEZZ_FROM_DOCK = 110;
const MEZZ_TO_DOCK = 117;
export const MEZZ_LEVELS = [4.4, 8.0];
export const MEZZ_WALL_Z = -0.4;
export const MEZZ_FRONT_Z = -10.4;

export function rackAisleX(x: number) {
  return Math.round((x - RACK_PITCH / 2) / RACK_PITCH) * RACK_PITCH + RACK_PITCH / 2;
}

/**
 * Recorrido de un montacargas / apilador entre la zona de recepción de un andén y un rack:
 * pasillo transversal → pasillo del rack → giro hacia la cara del rack para subir la tarima.
 * Coordenadas relativas al andén (`dockX`). `toRack` = deja la tarima en el rack (acomodo);
 * si es false la toma del rack y la lleva a la zona de preparación (surtido).
 */
export function rackRun(dockX: number, i: number, fromZ: number, side: number, toRack: boolean) {
  const ax = rackAisleX(dockX + side * (5 + i * RACK_PITCH)) - dockX;
  const zDeep = RACK_Z0 - 3 - (i % 3) * 7;
  const face = i % 2 === 0 ? 1 : -1;
  const atRack = { x: ax + face * 0.8, z: zDeep, wait: 3, lift: true, reverse: true, carry: !toRack };
  const loaded = toRack;
  return [
    { x: side * 1.2, z: fromZ, wait: 2, reverse: true, carry: loaded },
    { x: side * 2.5, z: CROSS_AISLE_Z, carry: loaded },
    { x: ax, z: CROSS_AISLE_Z, carry: loaded },
    { x: ax, z: zDeep, carry: loaded },
    atRack,
    { x: ax, z: zDeep, carry: !loaded },
    { x: ax, z: CROSS_AISLE_Z, carry: !loaded },
    { x: side * 2.5, z: CROSS_AISLE_Z, carry: !loaded },
  ];
}

/**
 * Orden de los grupos de andenes en coordenadas lógicas (desde el lado de la entrada).
 * Visto desde ATRÁS, de izquierda a derecha, queda: Zona Franca · Despacho · Recepción
 * (la casetilla de despacho a la derecha). Las categorías no listadas van al final.
 */
const CATEGORY_ORDER: RegExp[] = [/recep/i, /despacho|dispatch/i, /zona\s*franca/i];

export interface Pose {
  x: number;
  z: number;
  /** Ángulo (rad) del frente de la cabina; 0 = mirando hacia +z */
  heading: number;
  /** Cómo se estaciona: en reversa (andén) o de frente (fila de espera) */
  park?: 'reverse' | 'forward';
  /** Distancia sobre el recorrido de salida, si la pose está en él */
  exitS?: number;
}

export interface RoutePoint {
  x: number;
  z: number;
  /** El tramo que TERMINA en este punto se recorre en reversa */
  reverse?: boolean;
}

export interface DockSlot {
  x: number;
  z: number;
}

export interface DockGroup {
  name: string;
  x0: number;
  x1: number;
}

type Pt = { x: number; z: number };

export interface SiteLayout {
  length: number;
  xWest: number;
  xEast: number;
  /** Calle del patio de espera (norte–sur, lado oeste) */
  yardRoadX: number;
  /** Fila de espera junto al talud */
  waitX: number;
  embankmentX: number;
  despachoGateZ: number;
  mainGateX: number;
  streetX: number;
  /** Calle de salida (norte–sur, lado este) */
  eastRoadX: number;
  officeX: number;
  docks: Map<string, DockSlot>;
  groups: DockGroup[];
  /** Entrada: calle pública → aguja principal → bulevar → aguja despacho → calle trasera */
  trunk: Pt[];
  /**
   * Salida (eje): calle trasera de vuelta hacia la casetilla → aguja de despacho (carril de salida)
   * → bulevar → aguja principal → calle pública. Se recorre por el carril derecho.
   */
  exit: Pt[];
  /** Distancia sobre `exit` donde está la aguja de la casetilla de despacho */
  exitGateS: number;
  /** Tramo en x del mezzanine (del andén 0110 al 0117); null = no aplica */
  mezzanine: { x0: number; x1: number } | null;
}

interface DockInput {
  id: string;
  name: string;
  categoryName?: string | null;
}

const numOf = (d: DockInput) => Number(d.name.match(/\d+/)?.[0] ?? NaN);

function groupRank(d: DockInput) {
  const i = CATEGORY_ORDER.findIndex((re) => re.test(d.categoryName ?? ''));
  return i === -1 ? CATEGORY_ORDER.length : i;
}

export function buildLayout(docks: DockInput[]): SiteLayout {
  const ordered = [...docks].sort((a, b) => {
    const g = groupRank(a) - groupRank(b);
    if (g !== 0) return g;
    const na = numOf(a);
    const nb = numOf(b);
    // números ascendentes en x lógico: dentro de cada grupo se numera desde el lado de
    // Recepción (0101) hacia Zona Franca, sin mover los grupos
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  // Un espacio de una puerta entre grupos de categoría
  const positions: number[] = [];
  let door = 0;
  ordered.forEach((d, i) => {
    const prev = ordered[i - 1];
    if (i > 0 && (groupRank(d) !== groupRank(prev) || (d.categoryName ?? '') !== (prev.categoryName ?? ''))) door += 1;
    positions.push(door);
    door += 1;
  });
  const doors = Math.max(door, 1);

  const length = Math.max(MIN_LENGTH, doors * DOCK_SPACING + 50);
  const xWest = -length / 2;
  const xEast = length / 2;
  const firstX = xWest + 20;

  const slots = new Map<string, DockSlot>();
  const groups: DockGroup[] = [];
  ordered.forEach((d, i) => {
    const x = firstX + positions[i] * DOCK_SPACING;
    slots.set(d.id, { x, z: 0 });
    const name = d.categoryName || 'Sin categoría';
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.x1 = x;
    else groups.push({ name, x0: x, x1: x });
  });

  const yardRoadX = xWest - 27;
  const waitX = xWest - 40;
  const embankmentX = xWest - YARD_WIDTH;
  const despachoGateZ = FRONT_Z - 6;
  const mainGateX = embankmentX - 30;
  const streetX = mainGateX - 30;
  const eastRoadX = xEast + EAST_ROAD_GAP;

  const trunk: Pt[] = [
    { x: streetX, z: BLVD_Z - 230 },
    { x: streetX, z: BLVD_Z },
    { x: mainGateX, z: BLVD_Z },
    { x: yardRoadX, z: BLVD_Z },
    { x: yardRoadX, z: despachoGateZ },
    { x: yardRoadX, z: ROAD_Z },
    { x: eastRoadX, z: ROAD_Z },
  ];
  // La calle trasera es de doble sentido: se sale de vuelta por la casetilla de despacho,
  // en el carril opuesto al de ingreso (que queda libre para los camiones con cita).
  const exit: Pt[] = [
    { x: eastRoadX, z: ROAD_Z },
    { x: yardRoadX, z: ROAD_Z },
    { x: yardRoadX, z: BLVD_Z },
    { x: streetX, z: BLVD_Z },
    { x: streetX, z: BLVD_Z + 230 },
  ];
  const exitGateS = project(exit, { x: yardRoadX, z: despachoGateZ }).s;

  // Mezzanine: del andén 0110 al 0117 (según donde se dibuja cada uno)
  const mezzEnds = [MEZZ_FROM_DOCK, MEZZ_TO_DOCK].map((n) => ordered.find((d) => numOf(d) === n));
  const mezzXs = mezzEnds.filter((d): d is DockInput => !!d).map((d) => slots.get(d.id)!.x);
  const mezzanine =
    mezzXs.length === 2 && mezzXs[0] !== mezzXs[1]
      ? { x0: Math.min(...mezzXs) - DOCK_SPACING / 2, x1: Math.max(...mezzXs) + DOCK_SPACING / 2 }
      : null;

  return {
    length,
    xWest,
    xEast,
    yardRoadX,
    waitX,
    embankmentX,
    despachoGateZ,
    mainGateX,
    streetX,
    eastRoadX,
    officeX: (xWest + xEast) / 2,
    docks: slots,
    groups,
    trunk,
    exit,
    exitGateS,
    mezzanine,
  };
}

/* ─────────────────────────────── Utilidades de polilínea ─────────────────────────────── */

function cumulative(path: Pt[]) {
  const acc = [0];
  for (let i = 1; i < path.length; i++) {
    acc.push(acc[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  }
  return acc;
}

function pointAt(path: Pt[], s: number) {
  const acc = cumulative(path);
  const ss = Math.max(0, Math.min(acc[acc.length - 1], s));
  for (let i = 1; i < path.length; i++) {
    if (ss <= acc[i] + 1e-9) {
      const t = (ss - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
      return {
        x: path[i - 1].x + (path[i].x - path[i - 1].x) * t,
        z: path[i - 1].z + (path[i].z - path[i - 1].z) * t,
        seg: i,
      };
    }
  }
  return { ...path[path.length - 1], seg: path.length - 1 };
}

function project(path: Pt[], p: Pt) {
  const acc = cumulative(path);
  let best = { s: 0, x: path[0].x, z: path[0].z, dist: Infinity };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
    const x = a.x + dx * t;
    const z = a.z + dz * t;
    const dist = Math.hypot(p.x - x, p.z - z);
    if (dist < best.dist) best = { s: acc[i - 1] + Math.sqrt(len2) * t, x, z, dist };
  }
  return best;
}

function headingAt(path: Pt[], s: number) {
  const p = pointAt(path, s);
  const a = path[p.seg - 1] ?? path[0];
  const b = path[p.seg];
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/** Recorre una polilínea entre s0 y s1, desplazado `lane` metros a la derecha (lógica) del eje. */
function travel(path: Pt[], s0: number, s1: number, lane = DRIVE_LANE): RoutePoint[] {
  const acc = cumulative(path);
  const dir = s1 >= s0 ? 1 : -1;
  const stops = [s0];
  for (let i = 1; i < acc.length - 1; i++) {
    if ((acc[i] - s0) * dir > 0.5 && (s1 - acc[i]) * dir > 0.5) stops.push(acc[i]);
  }
  stops.push(s1);
  return stops.map((s) => {
    const p = pointAt(path, s);
    const a = path[Math.max(0, p.seg - 1)];
    const b = path[p.seg];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const fx = ((b.x - a.x) / len) * dir;
    const fz = ((b.z - a.z) / len) * dir;
    return { x: p.x - fz * lane, z: p.z + fx * lane };
  });
}

/* ─────────────────────────────── Poses por fase ─────────────────────────────── */

export function dockPose(layout: SiteLayout, dockId: string): Pose | null {
  const s = layout.docks.get(dockId);
  if (!s) return null;
  return { x: s.x, z: DOCKED_OFFSET, heading: 0, park: 'reverse' };
}

/** Fila de espera junto al talud del lado oeste (y, si se llena, a lo largo de la calle trasera). */
export function yardPose(layout: SiteLayout, index: number): Pose {
  const first = FRONT_Z + 16;
  const perLane = Math.floor((ROAD_Z - 14 - first) / (TRUCK_LENGTH + 3)) + 1;
  if (index < perLane) {
    return { x: layout.waitX, z: first + index * (TRUCK_LENGTH + 3), heading: 0, park: 'forward' };
  }
  // segunda fila de espera, junto al talud (la calle trasera ahora es de doble sentido)
  const row = Math.min(index - perLane, perLane - 1);
  return { x: layout.waitX - 4.2, z: first + row * (TRUCK_LENGTH + 3), heading: 0, park: 'forward' };
}

/** Fila en la calle pública, esperando turno para entrar por la aguja principal. */
export function approachPose(layout: SiteLayout, index: number): Pose {
  return { x: layout.streetX - DRIVE_LANE, z: BLVD_Z - 18 - index * (TRUCK_LENGTH + 4), heading: 0 };
}

function exitPoint(layout: SiteLayout, s: number): Pose {
  const p = travel(layout.exit, s, s + 0.01)[0];
  return { x: p.x, z: p.z, heading: headingAt(layout.exit, s), exitS: s };
}

/**
 * Descargados esperando salida: fila en el carril de salida hacia la aguja de la casetilla
 * (el primero junto a la aguja; si la fila crece, sigue por la calle trasera).
 */
export function exitQueuePose(layout: SiteLayout, index: number): Pose {
  return exitPoint(layout, Math.max(1, layout.exitGateS - 9 - index * (TRUCK_LENGTH + 3)));
}

/** Despachados que ya pasaron la aguja, camino a la salida principal. */
export function exitPose(layout: SiteLayout, index: number): Pose {
  return exitPoint(layout, layout.exitGateS + 14 + index * (TRUCK_LENGTH + 5));
}

/* ─────────────────────────────── Rutas ─────────────────────────────── */

/**
 * Ruta que sigue un camión desde su pose actual hasta la nueva.
 * `from = null` → aparece desde la calle pública. `toGone = true` → sale del sitio.
 */
export function buildRoute(layout: SiteLayout, from: Pose | null, to: Pose | null, toGone = false): RoutePoint[] {
  const { trunk, exit } = layout;
  const trunkAcc = cumulative(trunk);
  const trunkEnd = trunkAcc[trunkAcc.length - 1];
  const exitAcc = cumulative(exit);
  const exitEnd = exitAcc[exitAcc.length - 1];
  const pts: RoutePoint[] = [];

  // Ya va saliendo: sigue por el recorrido de salida
  if (from?.exitS !== undefined) {
    pts.push({ x: from.x, z: from.z });
    const target = toGone || !to ? exitEnd : to.exitS ?? exitEnd;
    pts.push(...travel(exit, from.exitS, Math.max(from.exitS, target)));
    return dedupe(pts);
  }

  // Hacia la salida: sale del andén / patio directo al carril de salida (calle de doble sentido)
  if (toGone || !to || to.exitS !== undefined) {
    const target = toGone || !to ? exitEnd : to.exitS!;
    let s0x = 0;
    if (from) {
      pts.push({ x: from.x, z: from.z });
      const pe = project(exit, from);
      s0x = Math.min(target, pe.s + (pe.dist > 3 ? 4 : 0));
      const p = travel(exit, s0x, s0x + 0.01)[0];
      pts.push(p);
    }
    pts.push(...travel(exit, s0x, Math.max(s0x, target)));
    return dedupe(pts);
  }

  // Punto de partida sobre el eje de entrada
  let s0 = 0;
  if (from) {
    pts.push({ x: from.x, z: from.z });
    const pr = project(trunk, from);
    s0 = pr.s;
    if (pr.dist > 3) {
      // sale de frente del andén / cajón hasta la calle (un poco hacia adelante)
      s0 = Math.min(trunkEnd, pr.s + (from.park === 'forward' ? 12 : 0));
      const p = pointAt(trunk, s0);
      pts.push({ x: p.x, z: p.z });
    }
  }

  const pt = project(trunk, to);
  const offTrunk = pt.dist > 3;

  if (!offTrunk) {
    pts.push(...travel(trunk, s0, Math.max(s0, pt.s)));
    pts.push({ x: to.x, z: to.z });
  } else if (to.park === 'reverse') {
    // calle de un solo sentido: pasa de largo y entra en reversa
    if (pt.s + 14 < s0) {
      // ya pasó su andén: sigue hasta el retorno y vuelve por el otro carril, pasa de largo y entra en reversa
      pts.push(...travel(trunk, s0, trunkEnd));
      const de = project(exit, to).s;
      pts.push(...travel(exit, 0, de + 14));
      pts.push({ x: to.x, z: to.z, reverse: true });
      return dedupe(pts);
    }
    pts.push(...travel(trunk, s0, Math.min(trunkEnd, pt.s + 14)));
    pts.push({ x: to.x, z: to.z, reverse: true });
  } else {
    // fila de espera: entra de frente
    pts.push(...travel(trunk, s0, Math.max(s0, pt.s - 14)));
    pts.push({ x: to.x, z: to.z });
  }
  return dedupe(pts);
}

function dedupe(pts: RoutePoint[]): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - p.x, last.z - p.z) < 0.3) {
      if (p.reverse) last.reverse = true;
      continue;
    }
    out.push(p);
  }
  return out;
}
