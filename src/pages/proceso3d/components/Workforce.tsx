import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DOCKED_Z, FLOOR_Y, rackRun, type Pose } from '../lib/layout';
import type { CrewMix, DockStage } from '../lib/unloading';

/**
 * Descarga animada en un andén: personal, carretillas eléctricas y manuales,
 * apiladores y montacargas moviendo la carga del remolque a la zona de recepción
 * y de ahí a los racks. Coordenadas locales: x = 0 en el centro de la puerta,
 * z > 0 dentro del remolque, z < 0 dentro del almacén. y = 0 es el piso del almacén.
 */

export interface UnloadVisual {
  truckId: string;
  dockId: string;
  x: number;
  stage: DockStage;
  progress: number;
  mix: CrewMix;
  loose: boolean;
  /** Simulación pedida por el usuario: el avance se anima en ciclo */
  demo?: boolean;
  /** El acomodo a racks lo dibuja la capa de AppOLO (con sus tiempos reales) */
  putawayExternal?: boolean;
}

const VESTS = ['#f97316', '#a3e635', '#facc15', '#fb923c', '#bef264', '#fde047'];
const SKIN = ['#c68a5e', '#8d5a3b', '#e0b48a', '#a86b45'];
const LOAD_COLORS = ['#c89b62', '#d6b07a', '#b98a55', '#e2e8f0', '#cbd5e1'];

const TRAILER_SLOTS: [number, number][] = [];
for (let row = 0; row < 9; row++) for (const x of [-0.55, 0.55]) TRAILER_SLOTS.push([x, 1.9 + row * 1.3]);
const STAGING_SLOTS: [number, number][] = [];
for (let row = 0; row < 5; row++) for (const x of [-1.4, 0, 1.4]) STAGING_SLOTS.push([x, -3.4 - row * 1.6]);

/* ─────────────────────────────── Movimiento en circuito ─────────────────────────────── */

export interface Waypoint {
  x: number;
  z: number;
  /** Lleva carga en el tramo que SALE de este punto */
  carry?: boolean;
  /** Segundos de espera al llegar a este punto */
  wait?: number;
  /** Marca de acción al esperar aquí (p. ej. levantar horquillas) */
  lift?: boolean;
  /** El tramo que sale de este punto se hace en reversa */
  reverse?: boolean;
}

export interface MotionState {
  carry: boolean;
  moving: boolean;
  lift: boolean;
}

function useLoopMotion(group: RefObject<THREE.Group | null>, path: Waypoint[], speed: number, offset: number, active: boolean) {
  const state = useRef<MotionState>({ carry: false, moving: false, lift: false });
  const plan = useMemo(() => {
    const segs = path.map((a, i) => {
      const b = path[(i + 1) % path.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      return { a, b, move: len / speed, wait: b.wait ?? 0 };
    });
    const total = segs.reduce((acc, s) => acc + s.move + s.wait, 0) || 1;
    return { segs, total };
  }, [path, speed]);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g || !active || path.length < 2) return;
    let tt = (clock.elapsedTime + offset) % plan.total;
    for (const s of plan.segs) {
      if (tt < s.move) {
        const f = tt / s.move;
        g.position.x = s.a.x + (s.b.x - s.a.x) * f;
        g.position.z = s.a.z + (s.b.z - s.a.z) * f;
        const dx = s.b.x - s.a.x;
        const dz = s.b.z - s.a.z;
        if (Math.abs(dx) + Math.abs(dz) > 1e-3) {
          const target = s.a.reverse ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
          let d = target - g.rotation.y;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          g.rotation.y += d * 0.25;
        }
        state.current = { carry: !!s.a.carry, moving: true, lift: false };
        return;
      }
      tt -= s.move;
      if (tt < s.wait) {
        g.position.x = s.b.x;
        g.position.z = s.b.z;
        state.current = { carry: !!s.a.carry, moving: false, lift: !!s.b.lift };
        return;
      }
      tt -= s.wait;
    }
  });
  return state;
}

/* ─────────────────────────────── Modelos ─────────────────────────────── */

export function Pallet({ color = LOAD_COLORS[0], loose = false }: { color?: string; loose?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.07, 0]} castShadow>
        <boxGeometry args={[1.0, 0.14, 1.2]} />
        <meshStandardMaterial color="#a47148" roughness={0.9} />
      </mesh>
      <mesh position={[0, loose ? 0.75 : 0.62, 0]} castShadow>
        <boxGeometry args={[0.96, loose ? 1.2 : 0.95, 1.16]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Persona con chaleco reflectivo y casco. `motion` controla la caminata y lo que carga. */
export function Person({
  vest,
  skin,
  motion,
  pose = 'walk',
}: {
  vest: string;
  skin: string;
  motion?: RefObject<MotionState>;
  pose?: 'walk' | 'stand' | 'work' | 'ride';
}) {
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const box = useRef<THREE.Mesh>(null);
  const seed = useMemo(() => Math.random() * 10, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    const m = motion?.current;
    const moving = pose === 'walk' && (m ? m.moving : false);
    const carry = !!m?.carry && pose === 'walk';
    const swing = moving ? Math.sin(t * 7) * 0.55 : 0;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = carry ? -1.2 : pose === 'work' ? -0.6 + Math.sin(t * 3) * 0.5 : -swing * 0.8;
    if (armR.current) armR.current.rotation.x = carry ? -1.2 : pose === 'work' ? -0.6 - Math.sin(t * 3) * 0.5 : swing * 0.8;
    if (box.current) box.current.visible = carry;
  });

  return (
    <group>
      {[
        [legL, -0.1],
        [legR, 0.1],
      ].map(([ref, x], i) => (
        <group key={i} ref={ref as RefObject<THREE.Group>} position={[x as number, 0.85, 0]}>
          <mesh position={[0, -0.42, 0]} castShadow>
            <boxGeometry args={[0.15, 0.85, 0.17]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.15, 0]} castShadow>
        <boxGeometry args={[0.44, 0.62, 0.26]} />
        <meshStandardMaterial color={vest} emissive={vest} emissiveIntensity={0.15} />
      </mesh>
      {/* franjas reflectivas */}
      <mesh position={[0, 1.08, 0]}>
        <boxGeometry args={[0.45, 0.05, 0.27]} />
        <meshStandardMaterial color="#e5e7eb" emissive="#ffffff" emissiveIntensity={0.3} />
      </mesh>
      {[
        [armL, -0.28],
        [armR, 0.28],
      ].map(([ref, x], i) => (
        <group key={i} ref={ref as RefObject<THREE.Group>} position={[x as number, 1.42, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <boxGeometry args={[0.11, 0.6, 0.13]} />
            <meshStandardMaterial color={vest} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.12, 12, 10]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      <mesh position={[0, 1.66, 0]}>
        <sphereGeometry args={[0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={vest === '#a3e635' ? '#ffffff' : '#facc15'} />
      </mesh>
      <mesh ref={box} position={[0, 1.12, 0.36]} visible={false} castShadow>
        <boxGeometry args={[0.45, 0.32, 0.34]} />
        <meshStandardMaterial color="#c89b62" />
      </mesh>
    </group>
  );
}

function Forks({ length = 1.15 }: { length?: number }) {
  return (
    <>
      {[-0.27, 0.27].map((x) => (
        <mesh key={x} position={[x, 0.05, length / 2 + 0.05]}>
          <boxGeometry args={[0.17, 0.07, length]} />
          <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </>
  );
}

/** Carretilla eléctrica (transpaleta con plataforma para el operador). */
export function ElectricJack({ motion, vest, skin }: { motion: RefObject<MotionState>; vest: string; skin: string }) {
  const load = useRef<THREE.Group>(null);
  useFrame(() => {
    if (load.current) load.current.visible = motion.current.carry;
  });
  return (
    <group>
      <Forks />
      <mesh position={[0, 0.55, -0.35]} castShadow>
        <boxGeometry args={[0.8, 1.0, 0.6]} />
        <meshStandardMaterial color="#facc15" metalness={0.2} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.07, -0.35]}>
        <boxGeometry args={[0.82, 0.06, 0.62]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0, 1.15, -0.05]} rotation={[0.5, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.6, 8]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {/* plataforma y operador */}
      <mesh position={[0, 0.1, -0.95]}>
        <boxGeometry args={[0.7, 0.12, 0.6]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <group position={[0, 0.16, -0.95]}>
        <Person vest={vest} skin={skin} pose="ride" />
      </group>
      <group ref={load} position={[0, 0.1, 0.65]} visible={false}>
        <Pallet color={LOAD_COLORS[1]} />
      </group>
    </group>
  );
}

/** Carretilla manual (transpaleta) halada por una persona. */
export function ManualJack({ motion, vest, skin }: { motion: RefObject<MotionState>; vest: string; skin: string }) {
  const load = useRef<THREE.Group>(null);
  useFrame(() => {
    if (load.current) load.current.visible = motion.current.carry;
  });
  return (
    <group>
      {/* la persona va adelante halando; las horquillas atrás */}
      <group rotation={[0, Math.PI, 0]} position={[0, 0, -0.2]}>
        <Forks />
        <mesh position={[0, 0.22, -0.05]}>
          <boxGeometry args={[0.55, 0.3, 0.25]} />
          <meshStandardMaterial color="#dc2626" />
        </mesh>
        <mesh position={[0, 0.65, -0.35]} rotation={[-0.7, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 1.0, 8]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        <group ref={load} position={[0, 0.1, 0.65]} visible={false}>
          <Pallet color={LOAD_COLORS[0]} />
        </group>
      </group>
      <group position={[0, 0, 0.55]}>
        <Person vest={vest} skin={skin} motion={motion} />
      </group>
    </group>
  );
}

/** Montacargas de contrapeso (o apilador si `stacker`). Levanta las horquillas en el rack. */
export function Forklift({ motion, stacker = false }: { motion: RefObject<MotionState>; stacker?: boolean }) {
  const carriage = useRef<THREE.Group>(null);
  const load = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const m = motion.current;
    if (load.current) load.current.visible = m.carry;
    if (carriage.current) {
      const target = m.lift ? 2.4 : 0.15;
      carriage.current.position.y += (target - carriage.current.position.y) * Math.min(1, dt * 2);
    }
  });
  const mastH = stacker ? 3.2 : 3.0;
  return (
    <group>
      {stacker ? (
        <>
          <mesh position={[0, 0.6, -0.45]} castShadow>
            <boxGeometry args={[0.85, 1.1, 0.7]} />
            <meshStandardMaterial color="#2563eb" metalness={0.2} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.1, -1.05]}>
            <boxGeometry args={[0.7, 0.12, 0.55]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
          <group position={[0, 0.16, -1.05]}>
            <Person vest="#facc15" skin={SKIN[0]} pose="ride" />
          </group>
        </>
      ) : (
        <>
          <mesh position={[0, 0.75, -0.35]} castShadow>
            <boxGeometry args={[1.15, 0.9, 1.9]} />
            <meshStandardMaterial color="#f97316" metalness={0.2} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.75, -1.35]} castShadow>
            <boxGeometry args={[1.15, 1.0, 0.4]} />
            <meshStandardMaterial color="#374151" />
          </mesh>
          {/* techo protector */}
          {[
            [-0.5, 0.35],
            [0.5, 0.35],
            [-0.5, -1.0],
            [0.5, -1.0],
          ].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x, 1.75, z]}>
              <boxGeometry args={[0.06, 1.1, 0.06]} />
              <meshStandardMaterial color="#111827" />
            </mesh>
          ))}
          <mesh position={[0, 2.32, -0.32]}>
            <boxGeometry args={[1.1, 0.05, 1.45]} />
            <meshStandardMaterial color="#111827" />
          </mesh>
          {/* operador sentado */}
          <mesh position={[0, 1.55, -0.55]}>
            <boxGeometry args={[0.42, 0.55, 0.3]} />
            <meshStandardMaterial color="#f97316" />
          </mesh>
          <mesh position={[0, 1.95, -0.55]}>
            <sphereGeometry args={[0.13, 10, 8]} />
            <meshStandardMaterial color="#facc15" />
          </mesh>
          {[
            [-0.55, 0.35],
            [0.55, 0.35],
            [-0.55, -1.05],
            [0.55, -1.05],
          ].map(([x, z]) => (
            <mesh key={`w${x}${z}`} position={[x, 0.3, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.3, 0.3, 0.25, 14]} />
              <meshStandardMaterial color="#111827" />
            </mesh>
          ))}
        </>
      )}
      {/* mástil */}
      {[-0.36, 0.36].map((x) => (
        <mesh key={x} position={[x, mastH / 2, stacker ? 0.05 : 0.7]}>
          <boxGeometry args={[0.08, mastH, 0.12]} />
          <meshStandardMaterial color="#1f2937" metalness={0.5} />
        </mesh>
      ))}
      <group ref={carriage} position={[0, 0.15, stacker ? 0.1 : 0.75]}>
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[0.85, 0.7, 0.06]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        <Forks length={1.1} />
        <group ref={load} position={[0, 0.08, 0.65]} visible={false}>
          <Pallet color={LOAD_COLORS[3]} />
        </group>
      </group>
    </group>
  );
}

/* ─────────────────────────────── Agentes ─────────────────────────────── */

export function Mover({
  path,
  speed,
  offset,
  active,
  rest,
  children,
}: {
  path: Waypoint[];
  speed: number;
  offset: number;
  active: boolean;
  /** Dónde queda quieto cuando no hay descarga activa */
  rest: { x: number; z: number; heading: number };
  children: (motion: RefObject<MotionState>) => ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const motion = useLoopMotion(group, path, speed, offset, active);
  const restMotion = useRef<MotionState>({ carry: false, moving: false, lift: false });
  return (
    <group ref={group} position={[rest.x, 0, rest.z]} rotation={[0, rest.heading, 0]} key={active ? 'a' : 'r'}>
      {children(active ? motion : restMotion)}
    </group>
  );
}

const laneX = (i: number, n: number, width: number) => (n <= 1 ? 0 : -width / 2 + (width * i) / (n - 1));

/** Puesto donde el personal arma tarimas con las cajas que baja a mano. */
const BUILD_SPOT: [number, number] = [1.4, -3.4];
const STAGING_FREE = STAGING_SLOTS.filter(([x, z]) => !(x === BUILD_SPOT[0] && z === BUILD_SPOT[1]));
/** Donde las carretillas eléctricas dejan las tarimas armadas para que el montacargas las suba al rack */
const HANDOFF_Z = -14.5;

const BOX = 0.42;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

/** Cajas sueltas dentro del remolque (una sola malla instanciada). */
function TrailerBoxes({ slots }: { slots: [number, number][] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const perSlot = 2 * 3 * 4; // 2 × 3 cajas por capa, 4 capas
  const max = TRAILER_SLOTS.length * perSlot;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let n = 0;
    slots.forEach(([sx, sz], si) => {
      for (let layer = 0; layer < 4; layer++)
        for (let ix = 0; ix < 2; ix++)
          for (let iz = 0; iz < 3; iz++) {
            // la última capa del frente incompleta, como se ve una pared de cajas real
            if (si === 0 && layer === 3 && (ix + iz) % 2 === 0) continue;
            _p.set(sx - 0.23 + ix * 0.46, BOX / 2 + layer * (BOX + 0.01), sz - 0.46 + iz * 0.46);
            mesh.setMatrixAt(n, _m.compose(_p, _q, _s));
            mesh.setColorAt(n, new THREE.Color(LOAD_COLORS[(si + layer + ix + iz) % 3]));
            n++;
          }
    });
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [slots]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, max]} castShadow>
      <boxGeometry args={[BOX, BOX, BOX]} />
      <meshStandardMaterial color="#ffffff" roughness={0.85} />
    </instancedMesh>
  );
}

/** Tarima en armado: las cajas se van apilando con el tiempo. */
function BuildingPallet({ active }: { active: boolean }) {
  const boxes = useRef<(THREE.Mesh | null)[]>([]);
  const cells = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let layer = 0; layer < 3; layer++)
      for (let ix = 0; ix < 2; ix++) for (let iz = 0; iz < 2; iz++) out.push([-0.23 + ix * 0.46, 0.14 + BOX / 2 + layer * BOX, -0.25 + iz * 0.5]);
    return out;
  }, []);
  useFrame(({ clock }) => {
    const shown = active ? Math.floor(((clock.elapsedTime % 36) / 36) * (cells.length + 1)) : 4;
    boxes.current.forEach((b, i) => {
      if (b) b.visible = i < shown;
    });
  });
  return (
    <group>
      <mesh position={[0, 0.07, 0]} castShadow>
        <boxGeometry args={[1.0, 0.14, 1.2]} />
        <meshStandardMaterial color="#a47148" roughness={0.9} />
      </mesh>
      {cells.map((p, i) => (
        <mesh key={i} ref={(el) => (boxes.current[i] = el)} position={p} castShadow>
          <boxGeometry args={[BOX, BOX, BOX * 1.15]} />
          <meshStandardMaterial color={LOAD_COLORS[i % 3]} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

export function UnloadingCell({ u, positions }: { u: UnloadVisual; positions: Map<string, Pose> }) {
  const root = useRef<THREE.Group>(null);
  const active = u.stage === 'DESCARGANDO';

  // Simulación: el avance se repite en un ciclo de 90 s para ver el proceso completo
  const [demoProgress, setDemoProgress] = useState(0.1);
  useFrame(({ clock }) => {
    const g = root.current;
    if (!g) return;
    // Solo se dibuja cuando el camión ya está acoplado (no mientras maniobra)
    const p = positions.get(u.truckId);
    g.visible = !!p && Math.abs(p.x - u.x) < 0.8 && Math.abs(p.z - DOCKED_Z) < 0.8;
    if (u.demo) {
      const q = Math.round(((clock.elapsedTime % 90) / 90) * 20) / 20;
      if (q !== demoProgress) setDemoProgress(q);
    }
  });

  // Cuadrilla según la regla, limitada para que se pueda ver. Siempre al menos 2 personas y una carretilla.
  const personas = Math.max(2, Math.min(6, u.mix.personas));
  let electrica = Math.min(3, u.mix.electrica);
  const manual = Math.min(3, u.mix.manual);
  if (electrica + manual === 0) electrica = 1;
  const lifts = u.putawayExternal ? 0 : Math.min(2, u.mix.montacargas) + Math.min(2, u.mix.apilador);
  const stackerFrom = Math.min(2, u.mix.montacargas);

  const progress = u.demo ? demoProgress : u.stage === 'DESCARGADO' ? 1 : active ? u.progress : 0;
  const remaining = Math.ceil((1 - progress) * TRAILER_SLOTS.length);
  const staged = Math.round(progress * STAGING_FREE.length);
  const trailerSlots = useMemo(() => TRAILER_SLOTS.slice(TRAILER_SLOTS.length - remaining), [remaining]);
  const stagingSlots = STAGING_FREE.slice(0, staged);

  const agents = useMemo(() => {
    const out: ReactNode[] = [];
    const jacks = electrica + manual;

    // Carretillas eléctricas y manuales
    for (let i = 0; i < jacks; i++) {
      const electric = i < electrica;
      const lx = laneX(i, jacks, 1.6);
      const slot = STAGING_FREE[(i * 4) % STAGING_FREE.length];
      const depth = 4 + ((i * 3) % 7) * 1.2;
      // Carga suelta: la eléctrica lleva las tarimas armadas hacia el montacargas.
      // Carga paletizada: sacan las tarimas del remolque a recepción.
      const path: Waypoint[] =
        u.loose && electric
          ? [
              { x: BUILD_SPOT[0] - 0.2, z: BUILD_SPOT[1] + 1.4, wait: 2, carry: true, reverse: true },
              { x: lx, z: -6, carry: true },
              { x: lx * 0.6, z: HANDOFF_Z, wait: 1.5 },
              { x: lx, z: -6 },
            ]
          : [
              { x: slot[0], z: slot[1] + 0.9, wait: 1.2 },
              { x: lx, z: -1.2 },
              { x: lx * 0.5, z: depth, wait: 2.5, carry: true, reverse: true },
              { x: lx, z: -1.2, carry: true },
            ];
      const vest = VESTS[i % VESTS.length];
      const skin = SKIN[i % SKIN.length];
      out.push(
        <Mover
          key={`j${i}`}
          path={path}
          speed={electric ? 1.7 : 1.0}
          offset={i * 4.3}
          active={active}
          rest={{ x: -1.8 + i * 0.9, z: -2.3, heading: Math.PI }}
        >
          {(m) => (electric ? <ElectricJack motion={m} vest={vest} skin={skin} /> : <ManualJack motion={m} vest={vest} skin={skin} />)}
        </Mover>
      );
    }

    // Personal: la mayoría baja cajas a mano hasta la tarima en armado; uno o dos la arman
    const builders = personas >= 4 ? 2 : 1;
    const carriers = personas - builders;
    for (let i = 0; i < carriers; i++) {
      const vest = VESTS[(i + 2) % VESTS.length];
      const skin = SKIN[(i + 1) % SKIN.length];
      const lx = laneX(i, carriers, 1.2);
      const path: Waypoint[] = [
        { x: lx * 0.7, z: 1.6 + (i % 4) * 1.1, wait: 1.4, carry: true },
        { x: lx, z: -1.0, carry: true },
        { x: BUILD_SPOT[0] - 0.75, z: BUILD_SPOT[1] + 0.2 - (i % 2) * 0.5, wait: 1.0 },
        { x: lx, z: -1.0 },
      ];
      out.push(
        <Mover
          key={`p${i}`}
          path={path}
          speed={1.25}
          offset={i * 3.1 + 1}
          active={active}
          rest={{ x: -2.4 + i * 0.8, z: -1.6, heading: Math.PI }}
        >
          {(m) => <Person vest={vest} skin={skin} motion={m} />}
        </Mover>
      );
    }
    for (let i = 0; i < builders; i++) {
      out.push(
        <group key={`b${i}`} position={[BUILD_SPOT[0] + (i === 0 ? 0.85 : 0), 0, BUILD_SPOT[1] - (i === 0 ? 0 : 0.95)]} rotation={[0, i === 0 ? -Math.PI / 2 : 0, 0]}>
          <Person vest={VESTS[(i + 4) % VESTS.length]} skin={SKIN[(i + 3) % SKIN.length]} pose={active ? 'work' : 'stand'} />
        </group>
      );
    }

    // Montacargas / apiladores: recepción → racks
    for (let i = 0; i < lifts; i++) {
      const stacker = i >= stackerFrom;
      const side = i % 2 === 0 ? 1 : -1;
      const path: Waypoint[] = rackRun(u.x, i, HANDOFF_Z + 1.5, side, true);
      out.push(
        <Mover
          key={`f${i}`}
          path={path}
          speed={2.4}
          offset={i * 6}
          active={active || u.stage === 'DESCARGADO'}
          rest={{ x: side * 4, z: -13, heading: Math.PI }}
        >
          {(m) => <Forklift motion={m} stacker={stacker} />}
        </Mover>
      );
    }
    return out;
  }, [u.x, electrica, manual, personas, lifts, stackerFrom, u.loose, active, u.stage]);

  return (
    <group ref={root} position={[u.x, FLOOR_Y, 0]} visible={false}>
      {/* carga que queda en el remolque: cajas sueltas o tarimas */}
      {u.loose ? (
        <TrailerBoxes slots={trailerSlots} />
      ) : (
        trailerSlots.map(([x, z], i) => (
          <group key={`t${x}${z}`} position={[x, 0, z]}>
            <Pallet color={LOAD_COLORS[i % LOAD_COLORS.length]} />
          </group>
        ))
      )}
      {/* tarima que se está armando con cajas */}
      <group position={[BUILD_SPOT[0], 0, BUILD_SPOT[1]]}>
        <BuildingPallet active={active} />
      </group>
      {/* carga ya recibida en la zona de recepción */}
      {stagingSlots.map(([x, z], i) => (
        <group key={`s${x}${z}`} position={[x, 0, z]}>
          <Pallet color={LOAD_COLORS[(i + 2) % LOAD_COLORS.length]} />
        </group>
      ))}
      {agents}
      {u.stage === 'APERTURA' && (
        <>
          <group position={[0.9, 0, -0.9]}>
            <Person vest={VESTS[0]} skin={SKIN[0]} pose="work" />
          </group>
          <group position={[-0.6, 0, 1.6]} rotation={[0, Math.PI, 0]}>
            <Person vest={VESTS[2]} skin={SKIN[2]} pose="work" />
          </group>
        </>
      )}
    </group>
  );
}
