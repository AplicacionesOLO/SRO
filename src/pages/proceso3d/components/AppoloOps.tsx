import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { CROSS_AISLE_Z, DOCKED_Z, FLOOR_Y, RACK_Z0, ROAD_WIDTH, ROAD_Z, type Pose, type SiteLayout } from '../lib/layout';
import type { AppoloSlotType } from '../../../services/appoloOpsService';
import { LOT_CAPACITY, LOT_ROWS, SLOT_COLORS, lotGeometry, lotPose, occupiedCells, type DispatchStage, type EquipmentUse, type LotStats } from '../lib/appolo';
import { ElectricJack, Forklift, Mover, Pallet, Person, type Waypoint } from './Workforce';

/**
 * Operaciones de AppOLO dentro del almacén:
 *  - Carga de despachos: tarimas de la zona de preparación al contenedor.
 *  - Acomodo (putaway): tarimas recibidas de la zona de recepción a los racks.
 * Coordenadas locales iguales a las de la descarga: x = 0 en la puerta, z > 0 dentro
 * del remolque, z < 0 dentro del almacén; y = 0 es el piso del almacén.
 */

export interface DispatchLoadVisual {
  truckId: string;
  x: number;
  stage: DispatchStage;
  progress: number;
  /** Tarimas totales del despacho */
  total: number;
  /** Mapa del contenedor: 24 posiciones (real de AppOLO o estimado) */
  cells: AppoloSlotType[];
  equip: EquipmentUse;
}

export interface PutawayVisual {
  id: string;
  x: number;
  progress: number;
  pallets: number;
  equip: EquipmentUse;
}

const VESTS = ['#38bdf8', '#a3e635', '#facc15', '#f97316'];
const SKIN = ['#c68a5e', '#8d5a3b', '#e0b48a', '#a86b45'];
const LOAD = ['#c89b62', '#d6b07a', '#b98a55', '#e2e8f0'];

/** 24 posiciones del contenedor como en AppOLO: 12 filas × 2, posición 1–2 al fondo, impares a la izquierda. */
const CONTAINER: [number, number][] = [];
for (let row = 0; row < 12; row++) for (const x of [-0.55, 0.55]) CONTAINER.push([x, 12.6 - row * 0.95]);
/** Zona de preparación / recepción detrás de la puerta */
const STAGE: [number, number][] = [];
for (let row = 0; row < 5; row++) for (const x of [-1.4, 0, 1.4]) STAGE.push([x, -3.4 - row * 1.6]);

const laneX = (i: number, n: number, width: number) => (n <= 1 ? 0 : -width / 2 + (width * i) / (n - 1));

function rackLoop(i: number, fromZ: number, side: number): Waypoint[] {
  const rackX = side * (6 + i * 3.2);
  return [
    { x: side * 1.2, z: fromZ, wait: 2, carry: true, reverse: true },
    { x: side * 2.5, z: CROSS_AISLE_Z, carry: true },
    { x: rackX, z: CROSS_AISLE_Z, carry: true },
    { x: rackX, z: RACK_Z0 + 2.2, wait: 3, lift: true, reverse: true },
    { x: rackX, z: CROSS_AISLE_Z },
    { x: side * 2.5, z: CROSS_AISLE_Z },
  ];
}

/** Al revés: del rack a la zona de preparación (surtido para el despacho). */
function pickLoop(i: number, toZ: number, side: number): Waypoint[] {
  const rackX = side * (6 + i * 3.2);
  return [
    { x: rackX, z: RACK_Z0 + 2.2, wait: 3, lift: true, carry: true, reverse: true },
    { x: rackX, z: CROSS_AISLE_Z, carry: true },
    { x: side * 2.5, z: CROSS_AISLE_Z, carry: true },
    { x: side * 1.2, z: toZ, wait: 2 },
    { x: side * 2.5, z: CROSS_AISLE_Z, reverse: true },
    { x: rackX, z: CROSS_AISLE_Z },
  ];
}

function StagedPallets({ count, colorOffset = 0 }: { count: number; colorOffset?: number }) {
  return (
    <>
      {STAGE.slice(0, Math.max(0, Math.min(STAGE.length, count))).map(([x, z], i) => (
        <group key={`${x}:${z}`} position={[x, 0, z]}>
          <Pallet color={LOAD[(i + colorOffset) % LOAD.length]} />
        </group>
      ))}
    </>
  );
}

/** Carga de un despacho en su andén. Solo se dibuja con el camión ya acoplado. */
export function DispatchLoadCell({ v, positions }: { v: DispatchLoadVisual; positions: Map<string, Pose> }) {
  const root = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = root.current;
    if (!g) return;
    const p = positions.get(v.truckId);
    g.visible = !!p && Math.abs(p.x - v.x) < 0.8 && Math.abs(p.z - DOCKED_Z) < 0.8;
  });

  const loading = v.stage === 'CARGANDO';
  const preparing = v.stage === 'PREPARANDO';
  const total = Math.max(1, v.total);
  const loaded = occupiedCells(v.cells);

  const agents = useMemo(() => {
    const out: ReactNode[] = [];
    if (loading) {
      const jacks = Math.max(1, Math.min(2, v.equip.carretilla));
      for (let i = 0; i < jacks; i++) {
        const lx = laneX(i, jacks, 1.4);
        const slot = STAGE[(i * 4 + 1) % STAGE.length];
        const depth = 3 + ((i * 5) % 8) * 1.1;
        const path: Waypoint[] = [
          { x: lx, z: -1.2 },
          { x: slot[0], z: slot[1] + 0.9, wait: 1.2, carry: true },
          { x: lx, z: -1.2, carry: true },
          { x: lx * 0.5, z: depth, wait: 2, reverse: true },
        ];
        out.push(
          <Mover key={`j${i}`} path={path} speed={1.7} offset={i * 4.7} active rest={{ x: lx, z: -2.2, heading: Math.PI }}>
            {(m) => <ElectricJack motion={m} vest={VESTS[i % VESTS.length]} skin={SKIN[i % SKIN.length]} />}
          </Mover>
        );
      }
    }
    if (loading || preparing) {
      // Surtido desde racks a la zona de preparación
      const lifts = Math.min(1, v.equip.montacargas) + Math.min(1, v.equip.apilador);
      for (let i = 0; i < lifts; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        out.push(
          <Mover key={`f${i}`} path={pickLoop(i, -9.5, side)} speed={2.4} offset={i * 5} active rest={{ x: side * 4, z: -13, heading: Math.PI }}>
            {(m) => <Forklift motion={m} stacker={i >= Math.min(1, v.equip.montacargas)} />}
          </Mover>
        );
      }
    }
    return out;
  }, [loading, preparing, v.equip.carretilla, v.equip.montacargas, v.equip.apilador]);

  const remaining = preparing ? total : loading ? Math.max(0, total - loaded) : 0;

  return (
    <group ref={root} position={[v.x, FLOOR_Y, 0]} visible={false}>
      {/* contenedor: las 24 posiciones de AppOLO; libres marcadas en el piso, ocupadas con su tarima
          del color del tipo (S azul, D ámbar, T violeta, C rojo) */}
      {v.cells.map((t, i) => {
        const [x, z] = CONTAINER[i];
        return (
          <group key={i} position={[x, 0, z]}>
            <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[1, 0.85]} />
              <meshBasicMaterial color={SLOT_COLORS[t]} transparent opacity={t === 'E' ? 0.35 : 0.9} />
            </mesh>
            {t !== 'E' && <Pallet color={SLOT_COLORS[t]} />}
          </group>
        );
      })}
      <StagedPallets count={remaining} colorOffset={1} />
      {agents}
      {/* verificador en la puerta */}
      <group position={[1.6, 0, -1.0]} rotation={[0, -Math.PI / 2, 0]}>
        <Person vest={VESTS[0]} skin={SKIN[1]} pose={loading ? 'work' : 'stand'} />
      </group>
    </group>
  );
}

/** Acomodo en racks de lo recibido en un andén (tiempos reales de AppOLO). */
export function PutawayCell({ v }: { v: PutawayVisual }) {
  const remaining = Math.ceil((1 - Math.max(0, Math.min(1, v.progress))) * v.pallets);
  const agents = useMemo(() => {
    const out: ReactNode[] = [];
    const forklifts = Math.min(2, v.equip.montacargas);
    const stackers = Math.min(2, v.equip.apilador);
    const n = forklifts + stackers;
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      out.push(
        <Mover key={i} path={rackLoop(i, -9.5, side)} speed={2.3} offset={i * 5.5} active rest={{ x: side * 4, z: -13, heading: Math.PI }}>
          {(m) => <Forklift motion={m} stacker={i >= forklifts} />}
        </Mover>
      );
    }
    return out;
  }, [v.equip.montacargas, v.equip.apilador]);

  return (
    <group position={[v.x, FLOOR_Y, 0]}>
      <StagedPallets count={remaining} colorOffset={2} />
      {agents}
    </group>
  );
}

/**
 * Patio de espera de salida de despachos (AppOLO), separado de la fila de salida de SRO.
 * Asfalto, cajones numerados y rótulo con la cantidad de camiones esperando.
 */
export function DispatchLotArea({ layout, stats, showLabel }: { layout: SiteLayout; stats: LotStats; showLabel: boolean }) {
  const count = stats.total;
  const g = lotGeometry(layout);
  const w = g.x1 - g.x0;
  const zTop = ROAD_Z + ROAD_WIDTH / 2;
  const d = zTop - g.zBottom;
  const stripes = useMemo(() => {
    const out: { x: number; z: number; w: number }[] = [];
    for (let k = 0; k < LOT_CAPACITY; k++) {
      const p = lotPose(layout, k);
      out.push({ x: p.x, z: p.z + 2.4, w: 19 });
      if (k % LOT_ROWS === LOT_ROWS - 1) out.push({ x: p.x, z: p.z - 2.4, w: 19 });
    }
    return out;
  }, [layout]);
  return (
    <group>
      <mesh position={[(g.x0 + g.x1) / 2, 0.016, (zTop + g.zBottom) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#3a3f44" roughness={0.95} />
      </mesh>
      {/* acceso desde el retorno de la calle trasera */}
      <mesh position={[(layout.eastRoadX + g.x0) / 2, 0.016, ROAD_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[g.x0 - layout.eastRoadX, ROAD_WIDTH]} />
        <meshStandardMaterial color="#3a3f44" roughness={0.95} />
      </mesh>
      {/* borde del patio, color de despacho */}
      <mesh position={[(g.x0 + g.x1) / 2, 0.02, g.zBottom + 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, 0.6]} />
        <meshBasicMaterial color="#2563eb" />
      </mesh>
      {stripes.map((s, i) => (
        <mesh key={i} position={[s.x, 0.022, s.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[s.w, 0.15]} />
          <meshBasicMaterial color="#f8fafc" />
        </mesh>
      ))}
      {showLabel && (
        <Html position={[(g.x0 + g.x1) / 2, 9, g.zTop + 4]} center distanceFactor={90} zIndexRange={[30, 10]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              background: 'rgba(30,64,175,0.92)',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: 6,
              font: '600 13px system-ui, sans-serif',
              whiteSpace: 'nowrap',
              textAlign: 'center',
            }}
          >
            Espera de salida · Despachos AppOLO
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              {count} {count === 1 ? 'camión' : 'camiones'}
            </div>
            {count > 0 && (
              <div style={{ fontWeight: 500, fontSize: 11 }}>
                Últimas 24 h: {stats.hoy} · 1–7 días: {stats.semana} · más de 7 días: {stats.antiguos}
              </div>
            )}
            {count > LOT_CAPACITY && (
              <div style={{ fontWeight: 500, fontSize: 11, opacity: 0.85 }}>
                Se dibujan los {LOT_CAPACITY} más recientes; el resto está en la lista
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

