import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Pose, RoutePoint } from '../lib/layout';
import { tiledTexture } from '../lib/textures';
import AlertCloud from './AlertCloud';
import type { TruckAlert } from '../lib/alerts';

export interface TruckVisual {
  id: string;
  plate: string;
  statusColor: string;
  statusName: string;
  /** Pose de destino; null = el camión sale del sitio */
  pose: Pose | null;
  /** Ruta a recorrer para llegar a la pose (si viene vacía, aparece directamente) */
  route: RoutePoint[];
  /** Incrementa cada vez que se asigna una ruta nueva */
  routeVersion: number;
}

interface Truck3DProps {
  truck: TruckVisual;
  selected: boolean;
  showLabel: boolean;
  /** metros por segundo de simulación */
  speed: number;
  onSelect: (id: string) => void;
  onGone: (id: string) => void;
  /** Registro compartido de la posición real de cada camión (para trazar la siguiente ruta) */
  positions: Map<string, Pose>;
  /** Puertas traseras abiertas (acoplado en el andén) */
  doorsOpen?: boolean;
  /** Remolque translúcido para ver la carga (vista interior) */
  seeThrough?: boolean;
  /** Espera a vigilar: muestra la nube amarilla / roja con el contador */
  alert?: TruckAlert;
  /** null = tiempo real; número = hora simulada */
  alertClock?: number | null;
}

const TRAILER_COLOR = '#f1f5f9';
/** [z, x] de cada llanta: eje direccional, ejes de tracción y tándem del remolque */
const WHEELS: [number, number][] = [8.0, 4.9, 3.6, -5.6, -6.9].flatMap((z) =>
  (z === 8.0 ? [-1.1, 1.1] : [-1.1, -0.75, 0.75, 1.1]).map((x) => [z, x] as [number, number])
);

function headingOf(dx: number, dz: number, reverse?: boolean) {
  return reverse ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export default function Truck3D({
  truck,
  selected,
  showLabel,
  speed,
  onSelect,
  onGone,
  positions,
  doorsOpen = false,
  seeThrough = false,
  alert,
  alertClock = null,
}: Truck3DProps) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const state = useRef({ seg: 1, t: 0, route: [] as RoutePoint[], version: -1, moving: false });

  // Nueva ruta asignada
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const s = state.current;
    if (s.version === truck.routeVersion) return;
    s.version = truck.routeVersion;

    // Con la pestaña oculta no se dibuja: al volver no se repite el recorrido, se coloca directo
    if (truck.route.length < 2 || document.hidden) {
      // Aparecer directamente en la pose (carga inicial, salto en el tiempo o pestaña oculta)
      s.route = [];
      s.moving = false;
      if (truck.pose) {
        g.position.set(truck.pose.x, 0, truck.pose.z);
        g.rotation.y = truck.pose.heading;
        g.visible = true;
        positions.set(truck.id, { ...truck.pose });
      } else {
        g.visible = false;
        onGone(truck.id);
      }
      return;
    }

    s.route = truck.route;
    s.seg = 1;
    s.t = 0;
    s.moving = true;
    g.visible = true;
    const p0 = truck.route[0];
    g.position.set(p0.x, 0, p0.z);
    const p1 = truck.route[1];
    g.rotation.y = headingOf(p1.x - p0.x, p1.z - p0.z, p1.reverse);
  }, [truck.routeVersion, truck.route, truck.pose, truck.id, onGone, positions]);

  useEffect(() => () => {
    positions.delete(truck.id);
  }, [positions, truck.id]);

  useFrame((_, delta) => {
    const g = group.current;
    const s = state.current;
    if (!g) return;
    if (!s.moving) {
      // Mantener registrada la pose de un camión detenido (en desarrollo, StrictMode
      // monta los efectos dos veces y la limpieza borra el registro)
      if (truck.pose && g.visible && !positions.has(truck.id)) {
        positions.set(truck.id, { x: g.position.x, z: g.position.z, heading: g.rotation.y });
      }
      return;
    }

    let remaining = Math.min(delta, 0.1) * speed;
    while (remaining > 0 && s.seg < s.route.length) {
      const a = s.route[s.seg - 1];
      const b = s.route[s.seg];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 0.0001;
      // en reversa y al maniobrar, más lento
      const segFactor = b.reverse ? 0.45 : 1;
      const desired = headingOf(b.x - a.x, b.z - a.z, b.reverse);
      const segLeft = (1 - s.t) * len;
      const advance = remaining * segFactor;
      let t: number;
      if (advance < segLeft) {
        s.t += advance / len;
        t = s.t;
        remaining = 0;
      } else {
        remaining -= segLeft / segFactor;
        s.t = 0;
        s.seg += 1;
        t = 1;
      }
      g.position.x = a.x + (b.x - a.x) * t;
      g.position.z = a.z + (b.z - a.z) * t;
      g.rotation.y = lerpAngle(g.rotation.y, desired, Math.min(1, delta * 6));
    }

    positions.set(truck.id, { x: g.position.x, z: g.position.z, heading: g.rotation.y });

    if (s.seg >= s.route.length) {
      s.moving = false;
      if (truck.pose) {
        g.position.set(truck.pose.x, 0, truck.pose.z);
        g.rotation.y = truck.pose.heading;
        positions.set(truck.id, { ...truck.pose });
      } else {
        g.visible = false;
        onGone(truck.id);
      }
    }
  });

  const trailerTex = useMemo(() => tiledTexture('trailer', 13.5, 1, 0.9), []);
  const cabColor = useMemo(() => new THREE.Color(truck.statusColor || '#64748b'), [truck.statusColor]);
  const emissive = selected ? '#facc15' : hovered ? '#ffffff' : '#000000';
  const emissiveIntensity = selected ? 0.55 : hovered ? 0.15 : 0;

  return (
    <group
      ref={group}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(truck.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = '';
      }}
    >
      {/* ── Remolque (trasera hacia -z local, cabina hacia +z) ── */}
      <mesh position={[0, 2.65, -1.75]} castShadow={!seeThrough} receiveShadow>
        <boxGeometry args={[2.6, 2.9, 13.5]} />
        <meshStandardMaterial
          color={TRAILER_COLOR}
          map={trailerTex}
          roughness={0.35}
          metalness={0.25}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          transparent={seeThrough}
          opacity={seeThrough ? 0.16 : 1}
          depthWrite={!seeThrough}
        />
      </mesh>
      {/* aristas del remolque (se ven aun en modo translúcido) */}
      {[
        [-1.3, 4.1],
        [1.3, 4.1],
        [-1.3, 1.2],
        [1.3, 1.2],
      ].map(([x, y]) => (
        <mesh key={`e${x}${y}`} position={[x, y, -1.75]}>
          <boxGeometry args={[0.07, 0.07, 13.55]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      {/* franjas con el color del estado */}
      <mesh position={[0, 4.13, -1.75]}>
        <boxGeometry args={[2.62, 0.06, 13.5]} />
        <meshStandardMaterial color={cabColor} />
      </mesh>
      {[-1.315, 1.315].map((x) => (
        <mesh key={x} position={[x, 1.75, -1.75]}>
          <boxGeometry args={[0.02, 0.35, 13.5]} />
          <meshStandardMaterial color={cabColor} />
        </mesh>
      ))}
      {/* puertas traseras */}
      {[-1, 1].map((sgn) =>
        doorsOpen ? (
          <mesh key={sgn} position={[sgn * 1.34, 2.65, -7.85]}>
            <boxGeometry args={[0.05, 2.8, 1.28]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.3} roughness={0.4} />
          </mesh>
        ) : (
          <mesh key={sgn} position={[sgn * 0.65, 2.65, -8.52]}>
            <boxGeometry args={[1.27, 2.8, 0.05]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.3} roughness={0.4} />
          </mesh>
        )
      )}
      {/* luces traseras */}
      {[-1.15, 1.15].map((x) => (
        <mesh key={`tl${x}`} position={[x, 1.05, -8.55]}>
          <boxGeometry args={[0.25, 0.12, 0.04]} />
          <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.8} />
        </mesh>
      ))}
      {/* chasis, patas de apoyo y defensa trasera */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[1.9, 0.35, 16.6]} />
        <meshStandardMaterial color="#1f2937" metalness={0.4} roughness={0.6} />
      </mesh>
      {[-0.9, 0.9].map((x) => (
        <mesh key={`lg${x}`} position={[x, 0.55, 2.6]}>
          <boxGeometry args={[0.12, 1.0, 0.12]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
      ))}
      <mesh position={[0, 0.6, -8.3]}>
        <boxGeometry args={[2.3, 0.15, 0.15]} />
        <meshStandardMaterial color="#111827" />
      </mesh>

      {/* ── Tractor ── */}
      <mesh position={[0, 2.35, 6.6]} castShadow>
        <boxGeometry args={[2.5, 2.7, 2.4]} />
        <meshStandardMaterial color={cabColor} emissive={emissive} emissiveIntensity={emissiveIntensity} metalness={0.35} roughness={0.35} />
      </mesh>
      <mesh position={[0, 3.85, 6.2]} castShadow>
        <boxGeometry args={[2.4, 0.4, 1.6]} />
        <meshStandardMaterial color={cabColor} metalness={0.35} roughness={0.35} />
      </mesh>
      <mesh position={[0, 1.55, 8.15]} castShadow>
        <boxGeometry args={[2.3, 1.2, 0.7]} />
        <meshStandardMaterial color={cabColor} metalness={0.35} roughness={0.35} />
      </mesh>
      {/* parabrisas y ventanas laterales */}
      <mesh position={[0, 2.95, 7.81]}>
        <boxGeometry args={[2.2, 1.0, 0.04]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.15} />
      </mesh>
      {[-1.26, 1.26].map((x) => (
        <mesh key={`sw${x}`} position={[x, 2.95, 7.1]}>
          <boxGeometry args={[0.03, 0.8, 1.0]} />
          <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.15} />
        </mesh>
      ))}
      {/* parrilla, defensa y focos */}
      <mesh position={[0, 1.55, 8.51]}>
        <boxGeometry args={[1.3, 0.9, 0.03]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.8, 8.5]}>
        <boxGeometry args={[2.4, 0.35, 0.25]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.9} roughness={0.25} />
      </mesh>
      {[-0.95, 0.95].map((x) => (
        <mesh key={`hl${x}`} position={[x, 1.4, 8.52]}>
          <boxGeometry args={[0.35, 0.2, 0.03]} />
          <meshStandardMaterial color="#fefce8" emissive="#fef9c3" emissiveIntensity={0.9} />
        </mesh>
      ))}
      {/* espejos */}
      {[-1.45, 1.45].map((x) => (
        <mesh key={`m${x}`} position={[x, 3.0, 7.75]}>
          <boxGeometry args={[0.08, 0.5, 0.2]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
      {/* tanques y escape */}
      {[-1.1, 1.1].map((x) => (
        <mesh key={`ft${x}`} position={[x, 0.9, 5.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.32, 0.32, 1.1, 14]} />
          <meshStandardMaterial color="#e5e7eb" metalness={0.9} roughness={0.2} />
        </mesh>
      ))}
      <mesh position={[1.05, 3.6, 5.3]}>
        <cylinderGeometry args={[0.08, 0.08, 2.2, 8]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* llantas con rin */}
      {WHEELS.map(([z, x]) => (
        <group key={`${z}-${x}`} position={[x, 0.52, z]} rotation={[0, 0, Math.PI / 2]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.52, 0.52, 0.34, 18]} />
            <meshStandardMaterial color="#111827" roughness={0.9} />
          </mesh>
          <mesh position={[0, x > 0 ? 0.175 : -0.175, 0]}>
            <cylinderGeometry args={[0.28, 0.28, 0.02, 14]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {alert && <AlertCloud alert={alert} clock={alertClock} showTimer={showLabel || selected || hovered} />}

      {(showLabel || selected || hovered) && (
        <Html position={[0, 5.2, 0]} center distanceFactor={60} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold shadow ${
              selected ? 'bg-yellow-300 text-gray-900' : 'bg-white/90 text-gray-800'
            }`}
            style={{ borderLeft: `4px solid ${truck.statusColor}` }}
          >
            {truck.plate}
            {(selected || hovered) && <span className="ml-1 font-normal text-gray-600">· {truck.statusName}</span>}
          </div>
        </Html>
      )}
    </group>
  );
}
