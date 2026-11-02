import { memo, useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import Interior from './Interior';
import { tiledTexture, type TextureKind } from '../lib/textures';
import {
  APRON_DEPTH,
  BLVD_WIDTH,
  BLVD_Z,
  BUILDING_DEPTH,
  BUILDING_HEIGHT,
  CANOPY_DEPTH,
  CARPARK_DEPTH,
  DOCK_SPACING,
  DOOR_HEIGHT,
  DOOR_WIDTH,
  FENCE_Z,
  FLOOR_Y,
  FRONT_Z,
  NEIGHBOR_DEPTH,
  NEIGHBOR_Z1,
  PALLET_Z0,
  ROAD_WIDTH,
  ROAD_Z,
  type DockSlot,
  type SiteLayout,
} from '../lib/layout';

export interface DockVisual {
  id: string;
  name: string;
  categoryColor: string;
  categoryName: string;
  blocked: boolean;
  occupied: boolean;
}

interface WarehouseSiteProps {
  layout: SiteLayout;
  docks: DockVisual[];
  showDockLabels: boolean;
  warehouseName?: string;
  highlightDockId?: string | null;
  /** Vista interior: sin techo, con racks y zona de recepción */
  cutaway: boolean;
}

const ASPHALT = '#3f4448';
const CONCRETE = '#c9c6bf';
const PAVERS = '#b3aca0';
const GRASS = '#5f8d4e';
const WALL = '#eef0f2';
const CAR_COLORS = ['#e5e7eb', '#9ca3af', '#111827', '#1e3a8a', '#7f1d1d', '#d1d5db', '#374151', '#1d4ed8'];

/** Generador pseudoaleatorio determinista (la escena no cambia entre renders). */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Textura de lámina acanalada para las paredes (se genera en un canvas, sin archivos externos). */
function ribTexture(repeatX: number, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, '#e6e8eb');
  grad.addColorStop(0.42, '#f7f8f9');
  grad.addColorStop(0.5, '#c4c8ce');
  grad.addColorStop(0.58, '#eceef1');
  grad.addColorStop(1, '#e6e8eb');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Textura que corresponde a cada color de superficie, y cada cuántos metros se repite. */
const SURFACE_TEX: Record<string, [TextureKind, number]> = {
  [GRASS]: ['grass', 9],
  '#6b8f55': ['grass', 9],
  [ASPHALT]: ['asphalt', 4],
  [PAVERS]: ['pavers', 2.4],
  [CONCRETE]: ['concrete', 4],
  '#8a5a3c': ['dirt', 3],
};

function Flat({ x, z, w, d, color, y = 0.01 }: { x: number; z: number; w: number; d: number; color: string; y?: number }) {
  const spec = SURFACE_TEX[color];
  const map = useMemo(() => (spec ? tiledTexture(spec[0], w, d, spec[1]) : null), [spec, w, d]);
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={color} map={map} roughness={spec?.[0] === 'asphalt' ? 0.92 : 0.85} />
    </mesh>
  );
}

function Box({
  p,
  s,
  color,
  shadow = true,
  opacity,
}: {
  p: [number, number, number];
  s: [number, number, number];
  color: string;
  shadow?: boolean;
  opacity?: number;
}) {
  return (
    <mesh position={p} castShadow={shadow} receiveShadow={shadow}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={color} transparent={opacity !== undefined} opacity={opacity ?? 1} />
    </mesh>
  );
}

function Dashes({ from, to, at, along }: { from: number; to: number; at: number; along: 'x' | 'z' }) {
  const list = useMemo(() => {
    const out: number[] = [];
    for (let v = from; v < to; v += 7) out.push(v + 2);
    return out;
  }, [from, to]);
  return (
    <>
      {list.map((v) => (
        <mesh key={v} position={along === 'x' ? [v, 0.03, at] : [at, 0.03, v]} rotation={[-Math.PI / 2, 0, along === 'x' ? 0 : Math.PI / 2]}>
          <planeGeometry args={[3, 0.18]} />
          <meshBasicMaterial color="#f5f5f4" />
        </mesh>
      ))}
    </>
  );
}

function Label({ p, text, color = 'bg-slate-700/90', size = 90 }: { p: [number, number, number]; text: string; color?: string; size?: number }) {
  return (
    <Html position={p} center distanceFactor={size} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold text-white ${color}`}>{text}</div>
    </Html>
  );
}

function Tree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.4, 3, 6]} />
        <meshStandardMaterial color="#6b4f2a" />
      </mesh>
      <mesh position={[0, 5, 0]} castShadow>
        <sphereGeometry args={[3, 10, 8]} />
        <meshStandardMaterial color="#3f6b34" />
      </mesh>
    </group>
  );
}

/** Aguja (barrera) con su poste, orientada a lo largo de z. */
function Barrier({ x, z, length, open = false }: { x: number; z: number; length: number; open?: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, 0.6, 0]} s={[0.5, 1.2, 0.5]} color="#facc15" />
      <group position={[0, 1.1, 0]} rotation={[open ? -Math.PI / 2.3 : 0, 0, 0]}>
        <mesh position={[0, 0, length / 2]}>
          <boxGeometry args={[0.12, 0.12, length]} />
          <meshStandardMaterial color="#dc2626" />
        </mesh>
      </group>
    </group>
  );
}

/** Casetilla con techo. */
function Booth({ x, z, w = 3, d = 3, roof = true }: { x: number; z: number; w?: number; d?: number; roof?: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, 1.5, 0]} s={[w, 3, d]} color="#9ca3af" />
      <Box p={[0, 1.9, d / 2 + 0.01]} s={[w * 0.7, 0.9, 0.04]} color="#1e293b" shadow={false} />
      {roof && <Box p={[0, 3.6, 0]} s={[w + 2.4, 0.25, d + 3]} color="#f8fafc" />}
    </group>
  );
}

function Car({ x, z, rot, color }: { x: number; z: number; rot: number; color: string }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <Box p={[0, 0.55, 0]} s={[1.8, 0.7, 4.3]} color={color} />
      <Box p={[0, 1.15, -0.2]} s={[1.6, 0.55, 2.3]} color="#1f2937" />
    </group>
  );
}

function DockDoor({
  slot,
  dock,
  highlighted,
  showLabel,
}: {
  slot: DockSlot;
  dock?: DockVisual;
  highlighted: boolean;
  showLabel: boolean;
}) {
  const lamp = !dock ? null : dock.blocked ? '#ef4444' : dock.occupied ? '#f59e0b' : '#22c55e';
  const open = !!dock?.occupied;
  const doorY = FLOOR_Y + DOOR_HEIGHT / 2;
  return (
    <group position={[slot.x, 0, slot.z]}>
      {/* portón seccional: cerrado, o enrollado arriba si hay camión */}
      {open ? (
        <mesh position={[0, FLOOR_Y + DOOR_HEIGHT - 0.3, -0.2]}>
          <boxGeometry args={[DOOR_WIDTH, 0.6, 0.4]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.4} roughness={0.5} />
        </mesh>
      ) : (
        <mesh position={[0, doorY, -0.05]}>
          <boxGeometry args={[DOOR_WIDTH, DOOR_HEIGHT, 0.1]} />
          <meshStandardMaterial
            color={dock ? '#cbd5e1' : '#d6d3d1'}
            metalness={0.35}
            roughness={0.45}
            emissive={highlighted ? '#facc15' : '#000000'}
            emissiveIntensity={highlighted ? 0.6 : 0}
          />
        </mesh>
      )}
      {open && highlighted && (
        <mesh position={[0, doorY, 0.02]}>
          <planeGeometry args={[DOOR_WIDTH + 0.4, DOOR_HEIGHT + 0.4]} />
          <meshBasicMaterial color="#facc15" transparent opacity={0.25} />
        </mesh>
      )}
      {/* sello de andén (lonas negras) */}
      {[-1, 1].map((sgn) => (
        <mesh key={sgn} position={[sgn * (DOOR_WIDTH / 2 + 0.2), doorY, 0.25]}>
          <boxGeometry args={[0.4, DOOR_HEIGHT + 0.2, 0.5]} />
          <meshStandardMaterial color="#111827" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, FLOOR_Y + DOOR_HEIGHT + 0.3, 0.25]}>
        <boxGeometry args={[DOOR_WIDTH + 0.8, 0.6, 0.5]} />
        <meshStandardMaterial color="#111827" roughness={0.95} />
      </mesh>
      {dock && (
        <>
          <mesh position={[0, FLOOR_Y + DOOR_HEIGHT + 0.9, 0.06]}>
            <planeGeometry args={[DOCK_SPACING - 1.0, 0.35]} />
            <meshBasicMaterial color={dock.categoryColor} />
          </mesh>
          {/* nivelador y topes */}
          <mesh position={[0, FLOOR_Y - 0.1, 0.5]} receiveShadow>
            <boxGeometry args={[DOOR_WIDTH - 0.4, 0.2, 1.0]} />
            <meshStandardMaterial color="#6b7280" metalness={0.5} roughness={0.5} />
          </mesh>
          {[-1, 1].map((sgn) => (
            <mesh key={sgn} position={[sgn * (DOOR_WIDTH / 2 - 0.1), 0.75, 0.15]}>
              <boxGeometry args={[0.3, 0.45, 0.3]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
          ))}
          <mesh position={[DOOR_WIDTH / 2 + 0.75, FLOOR_Y + DOOR_HEIGHT - 0.2, 0.15]}>
            <sphereGeometry args={[0.2, 12, 10]} />
            <meshStandardMaterial color={lamp!} emissive={lamp!} emissiveIntensity={1.2} />
          </mesh>
          <mesh position={[DOCK_SPACING / 2, 0.025, 9]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.15, 18]} />
            <meshBasicMaterial color="#facc15" />
          </mesh>
          {showLabel && (
            <Html position={[0, 7.6, 1]} center distanceFactor={70} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <div
                className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold text-white shadow"
                style={{ backgroundColor: dock.categoryColor }}
                title={dock.categoryName}
              >
                {dock.name}
              </div>
            </Html>
          )}
        </>
      )}
    </group>
  );
}

/** Edificio: losa a nivel de andén, paredes de lámina y techo (desmontable en vista interior). */
function Building({ layout, cutaway }: { layout: SiteLayout; cutaway: boolean }) {
  const { length, xWest, xEast } = layout;
  const midX = (xWest + xEast) / 2;
  const H = BUILDING_HEIGHT;
  const T = 0.3;

  const tex = useMemo(
    () => ({
      long: ribTexture(length / 1.2),
      side: ribTexture(BUILDING_DEPTH / 1.2),
      header: ribTexture(length / 1.2),
      pier: ribTexture(1),
      floor: tiledTexture('floor', length, BUILDING_DEPTH, 6),
      roof: tiledTexture('roof', length, BUILDING_DEPTH, 1.6),
    }),
    [length]
  );

  // Tramos de pared entre puertas (cara de andenes)
  const piers = useMemo(() => {
    const xs = [...layout.docks.values()].map((d) => d.x).sort((a, b) => a - b);
    const out: { x: number; w: number }[] = [];
    let from = xWest;
    for (const x of xs) {
      const a = x - DOOR_WIDTH / 2;
      if (a - from > 0.05) out.push({ x: (from + a) / 2, w: a - from });
      from = x + DOOR_WIDTH / 2;
    }
    if (xEast - from > 0.05) out.push({ x: (from + xEast) / 2, w: xEast - from });
    return out;
  }, [layout.docks, xWest, xEast]);

  const solarRows = useMemo(() => {
    const out: { x: number; z: number; w: number }[] = [];
    const usable = length - 24;
    const cols = Math.max(2, Math.floor(usable / 40));
    const w = usable / cols - 3;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < 3; r++) {
        out.push({ x: xWest + 12 + c * (w + 3) + w / 2, z: -BUILDING_DEPTH + 14 + r * 20, w });
      }
    }
    return out;
  }, [length, xWest]);

  const doorTop = FLOOR_Y + DOOR_HEIGHT;
  // Vista sin techo: las paredes se cortan justo arriba de las puertas para ver el remolque y la recepción
  const wallH = cutaway ? doorTop + 0.7 : H;
  const wallMat = (map: THREE.Texture) => <meshStandardMaterial map={map} color={WALL} roughness={0.55} metalness={0.15} />;

  return (
    <group>
      {/* losa / piso interior a la altura del remolque */}
      <mesh position={[midX, FLOOR_Y / 2, -BUILDING_DEPTH / 2]} receiveShadow>
        <boxGeometry args={[length, FLOOR_Y, BUILDING_DEPTH]} />
        <meshStandardMaterial color="#d4d7dc" map={tex.floor} roughness={0.35} metalness={0.05} />
      </mesh>
      {/* frente y laterales */}
      <mesh position={[midX, wallH / 2, -BUILDING_DEPTH + T / 2]} castShadow receiveShadow>
        <boxGeometry args={[length, wallH, T]} />
        {wallMat(tex.long)}
      </mesh>
      {[xWest + T / 2, xEast - T / 2].map((x) => (
        <mesh key={x} position={[x, wallH / 2, -BUILDING_DEPTH / 2]} castShadow receiveShadow>
          <boxGeometry args={[T, wallH, BUILDING_DEPTH]} />
          {wallMat(tex.side)}
        </mesh>
      ))}
      {/* cara de andenes: dintel, zócalo y pilares entre puertas */}
      <mesh position={[midX, (doorTop + wallH) / 2, -T / 2]} castShadow receiveShadow>
        <boxGeometry args={[length, wallH - doorTop, T]} />
        {wallMat(tex.header)}
      </mesh>
      <mesh position={[midX, FLOOR_Y / 2, -T / 2]} receiveShadow>
        <boxGeometry args={[length, FLOOR_Y, T]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.8} />
      </mesh>
      {piers.map((p) => (
        <mesh key={p.x} position={[p.x, (FLOOR_Y + doorTop) / 2, -T / 2]} castShadow receiveShadow>
          <boxGeometry args={[p.w, DOOR_HEIGHT, T]} />
          {wallMat(tex.pier)}
        </mesh>
      ))}

      {cutaway ? (
        <Interior layout={layout} />
      ) : (
        <>
          {/* parapeto y techo */}
          <mesh position={[midX, H - 0.6, -BUILDING_DEPTH / 2]}>
            <boxGeometry args={[length + 0.1, 1.2, BUILDING_DEPTH + 0.1]} />
            <meshStandardMaterial color="#334155" roughness={0.6} />
          </mesh>
          <mesh position={[midX, H + 0.05, -BUILDING_DEPTH / 2]} receiveShadow>
            <boxGeometry args={[length + 0.4, 0.1, BUILDING_DEPTH + 0.4]} />
            <meshStandardMaterial color="#eef0f3" map={tex.roof} roughness={0.5} metalness={0.3} />
          </mesh>
          {solarRows.map((r, i) => (
            <mesh key={i} position={[r.x, H + 0.25, r.z]} rotation={[-Math.PI / 2 + 0.12, 0, 0]}>
              <planeGeometry args={[r.w, 16]} />
              <meshStandardMaterial color="#1e3a5f" metalness={0.6} roughness={0.25} />
            </mesh>
          ))}
          {/* tragaluces */}
          {Array.from({ length: Math.floor(length / 18) }, (_, i) => (
            <mesh key={`s${i}`} position={[xWest + 9 + i * 18, H + 0.12, -6]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[2, 6]} />
              <meshStandardMaterial color="#e0f2fe" emissive="#bae6fd" emissiveIntensity={0.2} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

/** Poste de alumbrado. */
function LightPole({ x, z, rot = 0 }: { x: number; z: number; rot?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 4.5, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.13, 9, 8]} />
        <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 9, 0.6]}>
        <boxGeometry args={[0.35, 0.15, 1.4]} />
        <meshStandardMaterial color="#374151" emissive="#fef9c3" emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

function WarehouseSite({ layout, docks, showDockLabels, warehouseName, highlightDockId, cutaway }: WarehouseSiteProps) {
  const { length, xWest, xEast, yardRoadX, waitX, embankmentX, despachoGateZ, mainGateX, streetX, eastRoadX, officeX } = layout;
  const turnX = eastRoadX;
  const midX = (xWest + xEast) / 2;
  const dockById = useMemo(() => new Map(docks.map((d) => [d.id, d])), [docks]);
  // Bloque de oficinas: son dos módulos iguales unidos; el segundo queda a la izquierda visto desde el frente
  const OFFICE_W = 76;
  const officeCenter = officeX - OFFICE_W / 4;

  const pallets = useMemo(() => {
    const rnd = seeded(7);
    const out: { x: number; h: number; c: string }[] = [];
    for (let x = xWest + 6; x < xEast - 4; x += 7) {
      if (rnd() < 0.25) continue;
      out.push({ x, h: 1 + rnd() * 2.2, c: rnd() < 0.8 ? '#9a6b3f' : '#2f3b45' });
    }
    return out;
  }, [xWest, xEast]);

  const cars = useMemo(() => {
    const rnd = seeded(11);
    const out: { x: number; z: number; rot: number; c: string }[] = [];
    const rows = [FRONT_Z - 3.5, FRONT_Z - CARPARK_DEPTH + 3.5];
    for (const z of rows) {
      for (let x = xWest + 8; x < xEast - 6; x += 2.8) {
        if (Math.abs(x - officeCenter) < OFFICE_W / 2 + 5 && z > FRONT_Z - 8) continue; // frente de oficinas
        if (Math.abs(x - officeX) < 5) continue; // entrada CEDA
        if (rnd() < 0.3) continue;
        out.push({ x, z, rot: rnd() < 0.5 ? 0 : Math.PI, c: CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)] });
      }
    }
    return out;
  }, [xWest, xEast, officeX, officeCenter]);

  const trees = useMemo(() => {
    const out: { x: number; z: number; s: number }[] = [];
    for (let x = embankmentX - 10; x < turnX + 40; x += 11) {
      out.push({ x, z: FENCE_Z + 8 + ((x * 13) % 7), s: 0.9 + ((x * 7) % 5) / 10 });
      out.push({ x: x + 5, z: FENCE_Z + 20 + ((x * 3) % 9), s: 1 + ((x * 11) % 4) / 10 });
    }
    for (let z = FRONT_Z; z < FENCE_Z; z += 13) out.push({ x: turnX + 26 + ((z * 5) % 6), z, s: 1 });
    return out;
  }, [embankmentX, turnX]);

  const yardZ0 = despachoGateZ;
  const yardZ1 = ROAD_Z + ROAD_WIDTH / 2;
  const neighborX0 = embankmentX + 4;
  const neighborX1 = xWest + length * 0.55;

  return (
    <group>
      {/* Terreno */}
      <Flat x={midX} z={-40} w={turnX - streetX + 320} d={520} color={GRASS} y={0} />

      {/* ─── Calle pública y entrada principal ─── */}
      <Flat x={streetX} z={BLVD_Z} w={14} d={520} color={ASPHALT} />
      <Dashes from={BLVD_Z - 260} to={BLVD_Z + 260} at={streetX} along="z" />
      <Flat x={(streetX + turnX) / 2} z={BLVD_Z} w={turnX - streetX} d={BLVD_WIDTH} color={ASPHALT} y={0.015} />
      <Dashes from={mainGateX + 6} to={turnX} at={BLVD_Z} along="x" />
      {/* isla central con casetilla y agujas de entrada / salida */}
      <Box p={[mainGateX, 0.15, BLVD_Z]} s={[14, 0.3, 1.6]} color="#d6d3d1" />
      <Booth x={mainGateX - 3} z={BLVD_Z} w={2.8} d={1.4} />
      <Booth x={mainGateX - 3} z={BLVD_Z + BLVD_WIDTH / 2 + 3} w={3.2} d={3} />
      <Barrier x={mainGateX + 1.5} z={BLVD_Z + 0.8} length={BLVD_WIDTH / 2 - 1} />
      <Barrier x={mainGateX + 1.5} z={BLVD_Z - 0.8 - (BLVD_WIDTH / 2 - 1)} length={BLVD_WIDTH / 2 - 1} />
      <mesh position={[mainGateX + 5, 0.03, BLVD_Z + BLVD_WIDTH / 4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.4, BLVD_WIDTH / 2 - 1]} />
        <meshBasicMaterial color="#f5f5f4" />
      </mesh>
      {showDockLabels && <Label p={[mainGateX, 8, BLVD_Z]} text="Entrada principal (agujas)" />}

      {/* ─── Frente: parqueo de carros, oficinas y aguja CEDA ─── */}
      <Flat x={midX} z={FRONT_Z - CARPARK_DEPTH / 2} w={length} d={CARPARK_DEPTH} color={PAVERS} y={0.012} />
      {cars.map((c, i) => (
        <Car key={i} x={c.x} z={c.z} rot={c.rot} color={c.c} />
      ))}
      {[FRONT_Z - 3.5, FRONT_Z - CARPARK_DEPTH + 3.5].map((z) =>
        Array.from({ length: Math.floor((xEast - xWest - 12) / 2.8) }, (_, i) => (
          <mesh key={`${z}-${i}`} position={[xWest + 6.6 + i * 2.8, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.1, 5]} />
            <meshBasicMaterial color="#f8fafc" />
          </mesh>
        ))
      )}
      <Barrier x={officeX - 2} z={FRONT_Z - CARPARK_DEPTH + 0.3} length={0.1} />
      <group position={[officeX + 2.5, 1.1, FRONT_Z - CARPARK_DEPTH + 0.3]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh position={[0, 0, 2.2]}>
          <boxGeometry args={[0.12, 0.12, 4.4]} />
          <meshStandardMaterial color="#dc2626" />
        </mesh>
      </group>
      {/* alero frontal */}
      <Box p={[midX, 6.4, FRONT_Z - 3]} s={[length, 0.25, 6]} color="#f8fafc" />
      {/* edificio de oficinas de 3 pisos */}
      <group position={[officeCenter, 0, FRONT_Z - 2]}>
        <Box p={[0, 7, 0]} s={[OFFICE_W, 14, 12]} color="#f1f5f9" />
        {[3.5, 7.5, 11.5].map((y) => (
          <group key={y}>
            {[-OFFICE_W / 4, OFFICE_W / 4].map((dx) => (
              <Box key={dx} p={[dx, y, -6.05]} s={[OFFICE_W / 2 - 8, 1.8, 0.1]} color="#0f766e" shadow={false} />
            ))}
            <Box p={[0, y + 1.6, -6.8]} s={[OFFICE_W + 2, 0.25, 1.6]} color="#ffffff" />
          </group>
        ))}
      </group>
      {showDockLabels && <Label p={[officeCenter, 18, FRONT_Z - 2]} text={warehouseName ? `${warehouseName} · Oficinas` : 'Oficinas'} color="bg-gray-900/85" size={110} />}

      {/* ─── Almacén ─── */}
      <Building layout={layout} cutaway={cutaway} />

      {/* ─── Atrás: andenes de recepción, calle trasera y tarimas ─── */}
      <Flat x={midX} z={APRON_DEPTH / 2} w={length} d={APRON_DEPTH} color={CONCRETE} />
      {!cutaway && <Box p={[midX, 6.6, CANOPY_DEPTH / 2]} s={[length, 0.25, CANOPY_DEPTH]} color="#f8fafc" />}
      {/* alumbrado de la calle trasera */}
      {Array.from({ length: Math.floor((turnX - xWest) / 30) }, (_, i) => (
        <LightPole key={`lp${i}`} x={xWest + 10 + i * 30} z={PALLET_Z0 - 0.2} rot={Math.PI} />
      ))}
      <Flat x={(yardRoadX - 6 + turnX) / 2} z={ROAD_Z} w={turnX - yardRoadX + 6} d={ROAD_WIDTH} color={ASPHALT} y={0.015} />
      <Dashes from={xWest} to={turnX - 14} at={ROAD_Z} along="x" />
      {pallets.map((p, i) => (
        <Box key={i} p={[p.x, p.h / 2, PALLET_Z0 + 2.5]} s={[5, p.h, 4]} color={p.c} />
      ))}
      <Box p={[(embankmentX + turnX) / 2, 1.1, FENCE_Z]} s={[turnX - embankmentX, 2.2, 0.08]} color="#1f2937" opacity={0.55} />
      {/* retorno con isla verde, montacargas y tarimas */}
      <mesh position={[turnX, 0.02, ROAD_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[ROAD_WIDTH, 40]} />
        <meshStandardMaterial color={ASPHALT} />
      </mesh>
      <mesh position={[xEast + 5, 0.25, ROAD_Z - 14]} receiveShadow>
        <cylinderGeometry args={[5, 5, 0.5, 32]} />
        <meshStandardMaterial color="#6fa35a" />
      </mesh>
      {[-3, 0, 3].map((dx) => (
        <group key={dx} position={[xEast + 5 + dx, 0.5, ROAD_Z - 22]}>
          <Box p={[0, 0.7, 0]} s={[1.2, 1.4, 2]} color="#ea580c" />
          <Box p={[0, 2.2, -0.6]} s={[0.15, 3, 0.15]} color="#111827" />
        </group>
      ))}
      {showDockLabels &&
        layout.groups.map((g) => (
          <Label key={g.name + g.x0} p={[(g.x0 + g.x1) / 2, 10.5, 2]} text={`Andenes ${g.name}`} color="bg-slate-800/85" />
        ))}

      {/* ─── Extremo de la calle trasera ─── */}
      {showDockLabels && <Label p={[eastRoadX, 6, ROAD_Z]} text="Retorno" color="bg-slate-700/90" />}

      {/* ─── Patio de espera (lado oeste) ─── */}
      <Flat x={(embankmentX + xWest) / 2} z={(yardZ0 + yardZ1) / 2} w={xWest - embankmentX} d={yardZ1 - yardZ0} color={ASPHALT} y={0.013} />
      {/* línea que separa la plataforma de andenes de la calle del patio */}
      <mesh position={[yardRoadX + 5, 0.03, (yardZ0 + yardZ1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.3, yardZ1 - yardZ0 - 10]} />
        <meshBasicMaterial color="#f5f5f4" />
      </mesh>
      {/* fila de espera junto al talud (tierra rojiza) */}
      <Flat x={waitX} z={(yardZ0 + 10 + ROAD_Z - 8) / 2} w={5} d={ROAD_Z - 8 - yardZ0 - 10} color="#8a5a3c" y={0.02} />
      {/* talud con edificios vecinos arriba */}
      <mesh position={[embankmentX - 6, 2.5, (yardZ0 + FENCE_Z) / 2]} rotation={[0, 0, -0.45]} receiveShadow>
        <boxGeometry args={[12, 5, FENCE_Z - yardZ0]} />
        <meshStandardMaterial color="#7a6a4f" />
      </mesh>
      <Flat x={embankmentX - 40} z={(yardZ0 + FENCE_Z) / 2} w={60} d={FENCE_Z - yardZ0} color="#6b8f55" y={4.6} />
      {[0, 1, 2].map((i) => (
        <Box key={i} p={[embankmentX - 26 - i * 16, 7.6, yardZ0 + 20 + i * 24]} s={[13, 6, 20]} color={i === 1 ? '#9ca3af' : '#d1d5db'} />
      ))}
      {/* casetilla de despacho: aguja + portones */}
      <Booth x={yardRoadX + 9} z={despachoGateZ + 1} w={4} d={4} roof={false} />
      {/* dos agujas: carril de ingreso y carril de salida, con isla al centro */}
      <Box p={[yardRoadX, 0.15, despachoGateZ]} s={[0.9, 0.3, 5]} color="#d6d3d1" />
      {[-1, 1].map((sgn) => (
        <group key={`ag${sgn}`}>
          <Barrier x={yardRoadX + sgn * 5.6} z={despachoGateZ} length={0.1} />
          <group position={[yardRoadX + sgn * 5.6, 1.1, despachoGateZ]} rotation={[0, (-sgn * Math.PI) / 2, 0]}>
            <mesh position={[0, 0, 2.6]}>
              <boxGeometry args={[0.12, 0.12, 5.2]} />
              <meshStandardMaterial color="#dc2626" />
            </mesh>
          </group>
        </group>
      ))}
      {/* línea central: la calle del patio y la trasera son de doble sentido */}
      <Dashes from={despachoGateZ + 4} to={ROAD_Z - 6} at={yardRoadX} along="z" />
      <Dashes from={BLVD_Z + 7} to={despachoGateZ - 4} at={yardRoadX} along="z" />
      <Flat x={yardRoadX} z={(BLVD_Z + despachoGateZ) / 2} w={ROAD_WIDTH + 3} d={despachoGateZ - BLVD_Z} color={ASPHALT} y={0.014} />
      {[-1, 1].map((sgn) => (
        <mesh key={sgn} position={[yardRoadX + sgn * 7.5, 1.4, despachoGateZ - 2 - 2.5]} rotation={[0, sgn * 0.4, 0]}>
          <boxGeometry args={[0.1, 2.8, 5]} />
          <meshStandardMaterial color="#1f2937" transparent opacity={0.6} />
        </mesh>
      ))}
      <Box p={[(embankmentX + yardRoadX - 8) / 2, 1.1, despachoGateZ]} s={[yardRoadX - 8 - embankmentX, 2.2, 0.08]} color="#1f2937" opacity={0.55} />
      <Box p={[(yardRoadX + 12 + xWest) / 2, 1.1, despachoGateZ]} s={[xWest - yardRoadX - 12, 2.2, 0.08]} color="#1f2937" opacity={0.55} />
      {showDockLabels && (
        <>
          <Label p={[yardRoadX, 8, despachoGateZ]} text="Casetilla despacho (agujas)" />
          <Label p={[yardRoadX - 2.5, 5, despachoGateZ + 22]} text="Fila de salida" color="bg-indigo-500/90" size={70} />
          <Label p={[waitX, 6, (yardZ0 + ROAD_Z) / 2]} text="Patio de espera" color="bg-amber-500/90" />
        </>
      )}

      {/* ─── Andenes ─── */}
      {[...layout.docks.entries()].map(([id, slot]) => (
        <DockDoor key={id} slot={slot} dock={dockById.get(id)} highlighted={highlightDockId === id} showLabel={showDockLabels} />
      ))}

      {/* ─── Almacén vecino (al otro lado del bulevar) ─── */}
      <Flat x={(neighborX0 + neighborX1) / 2} z={NEIGHBOR_Z1 + 11} w={neighborX1 - neighborX0} d={20} color={CONCRETE} />
      <Box
        p={[(neighborX0 + neighborX1) / 2, 6, NEIGHBOR_Z1 - NEIGHBOR_DEPTH / 2]}
        s={[neighborX1 - neighborX0, 12, NEIGHBOR_DEPTH]}
        color="#e7e5e4"
      />
      <Box p={[neighborX0 + 7, 6.3, NEIGHBOR_Z1 - NEIGHBOR_DEPTH / 2]} s={[14.2, 12.6, NEIGHBOR_DEPTH + 0.4]} color="#1f2328" />
      {[0, 1].map((i) => (
        <Box key={i} p={[neighborX0 + 20 + i * 18, 1.4, NEIGHBOR_Z1 + 6]} s={[14, 2.8, 2.6]} color="#1e3a8a" />
      ))}

      {trees.map((t, i) => (
        <Tree key={i} x={t.x} z={t.z} s={t.s} />
      ))}
    </group>
  );
}

export default memo(WarehouseSite);
