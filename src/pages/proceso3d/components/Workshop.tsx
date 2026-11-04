import { memo, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { FLOOR_Y, WORKSHOP_D, WORKSHOP_W, workshopPlacement, type SiteLayout } from '../lib/layout';
import { Forklift, Person, type MotionState } from './Workforce';

/** Equipo en el taller (uno por unidad en mantenimiento según AppOLO). */
export type WorkshopKind = 'montacargas' | 'apilador' | 'carretilla';

export interface WorkshopInfo {
  /** Unidades en mantenimiento por tipo */
  units: WorkshopKind[];
  /** null = AppOLO no envía equipos; texto = motivo para mostrar en la etiqueta */
  note: string | null;
}

const KIND_LABEL: Record<WorkshopKind, string> = { montacargas: 'Montacargas', apilador: 'Apilador', carretilla: 'Carretilla' };
const BAY_W = 4.2;
const BAY_D = 5.2;
const COLS = 3;
const ROWS = 2;
const CAPACITY = COLS * ROWS;

/** Carretilla eléctrica estacionada (sin operador). */
function ParkedJack() {
  return (
    <group>
      {[-0.27, 0.27].map((x) => (
        <mesh key={x} position={[x, 0.05, 0.62]}>
          <boxGeometry args={[0.17, 0.07, 1.15]} />
          <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, 0.55, -0.35]} castShadow>
        <boxGeometry args={[0.8, 1.0, 0.6]} />
        <meshStandardMaterial color="#facc15" metalness={0.2} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.15, -0.05]} rotation={[0.5, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.6, 8]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0, 0.1, -0.95]}>
        <boxGeometry args={[0.7, 0.12, 0.6]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
    </group>
  );
}

/** Cono de seguridad. */
function Cone({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.35, 0]}>
        <coneGeometry args={[0.2, 0.7, 12]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.13, 0.15, 0.12, 12]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
    </group>
  );
}

/** Banco de trabajo con gabinete de herramientas. */
function Bench({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[2.6, 0.08, 0.8]} />
        <meshStandardMaterial color="#78716c" />
      </mesh>
      {[-1.2, 1.2].map((dx) => (
        <mesh key={dx} position={[dx, 0.45, 0]}>
          <boxGeometry args={[0.08, 0.9, 0.7]} />
          <meshStandardMaterial color="#44403c" />
        </mesh>
      ))}
      <mesh position={[0, 1.6, -0.35]}>
        <boxGeometry args={[2.6, 1.2, 0.06]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[1.8, 0.7, 0]} castShadow>
        <boxGeometry args={[0.8, 1.4, 0.6]} />
        <meshStandardMaterial color="#dc2626" metalness={0.3} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Workshop({ layout, info, showLabel }: { layout: SiteLayout; info: WorkshopInfo; showLabel: boolean }) {
  // Coordenadas locales: pared de andenes en z = 0, lado abierto hacia el interior (z+)
  const place = workshopPlacement(layout);
  const r = { x0: -WORKSHOP_W / 2, x1: WORKSHOP_W / 2, z0: 0, z1: WORKSHOP_D };
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  // Equipos detenidos: el montacargas no levanta ni lleva carga
  const still = useRef<MotionState>({ carry: false, moving: false, lift: false });

  // Puestos de servicio: 2 filas × 3, el frente de cada puesto mira al pasillo (z+ local)
  const bays = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    const gx = (w - COLS * BAY_W) / (COLS + 1);
    for (let row = 0; row < ROWS; row++)
      for (let c = 0; c < COLS; c++)
        out.push({ x: r.x0 + gx + BAY_W / 2 + c * (BAY_W + gx), z: r.z0 + 2.6 + BAY_D / 2 + row * (BAY_D + 0.6) });
    return out;
  }, [r.x0, r.z0, w]);

  const shown = info.units.slice(0, CAPACITY);
  const extra = info.units.length - shown.length;
  const counts = (['montacargas', 'apilador', 'carretilla'] as const)
    .map((k) => [k, info.units.filter((u) => u === k).length] as const)
    .filter(([, n]) => n > 0);

  return (
    <group position={[place.x, FLOOR_Y, place.z]} rotation={[0, place.rotationY, 0]}>
      {/* piso del taller */}
      <mesh position={[cx, 0.014, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.9} />
      </mesh>
      {/* borde de seguridad amarillo/negro (abierto hacia el pasillo, z+) */}
      {[
        { x: cx, z: r.z0 + 0.15, sw: w, sd: 0.3 },
        { x: r.x0 + 0.15, z: cz, sw: 0.3, sd: d },
        { x: r.x1 - 0.15, z: cz, sw: 0.3, sd: d },
      ].map((b, i) => (
        <mesh key={i} position={[b.x, 0.02, b.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[b.sw, b.sd]} />
          <meshBasicMaterial color="#facc15" />
        </mesh>
      ))}
      {/* barrera hacia el pasillo, con entrada al centro */}
      {Array.from({ length: Math.floor(w / 2.4) }, (_, i) => r.x0 + 1.2 + i * 2.4)
        .filter((x) => Math.abs(x - cx) > 3)
        .map((x, i) => (
          <mesh key={x} position={[x, 0.5, r.z1]} castShadow>
            <boxGeometry args={[1.2, 1.0, 0.15]} />
            <meshStandardMaterial color={i % 2 ? '#111827' : '#facc15'} />
          </mesh>
        ))}
      {/* malla y bancos de trabajo contra la fachada */}
      <mesh position={[cx, 1.6, r.z0 + 0.05]}>
        <boxGeometry args={[w, 3.2, 0.06]} />
        <meshStandardMaterial color="#94a3b8" transparent opacity={0.45} />
      </mesh>
      {[0.2, 0.5, 0.8].map((f) => (
        <Bench key={f} x={r.x0 + w * f} z={r.z0 + 0.9} />
      ))}

      {/* puestos de servicio */}
      {bays.map((b, i) => {
        const kind = shown[i];
        return (
          <group key={i} position={[b.x, 0, b.z]}>
            {[-BAY_W / 2, BAY_W / 2].map((dx) => (
              <mesh key={dx} position={[dx, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.1, BAY_D]} />
                <meshBasicMaterial color="#f8fafc" />
              </mesh>
            ))}
            {kind && (
              <>
                <group rotation={[0, Math.PI, 0]}>
                  {kind === 'carretilla' ? <ParkedJack /> : <Forklift motion={still} stacker={kind === 'apilador'} />}
                </group>
                <Cone x={-1.6} z={2.2} />
                <Cone x={1.6} z={2.2} />
                <group position={[1.5, 0, -0.4]} rotation={[0, -Math.PI / 2, 0]}>
                  <Person vest="#475569" skin={i % 2 ? '#c68642' : '#8d5524'} pose="work" />
                </group>
              </>
            )}
          </group>
        );
      })}

      {showLabel && (
        <Html position={[cx, 7, cz]} center distanceFactor={90} zIndexRange={[30, 10]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              background: 'rgba(15,23,42,0.9)',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: 6,
              font: '600 13px system-ui, sans-serif',
              whiteSpace: 'nowrap',
              textAlign: 'center',
            }}
          >
            🔧 Taller de equipos
            {info.note ? (
              <div style={{ fontWeight: 500, fontSize: 11, opacity: 0.85 }}>{info.note}</div>
            ) : (
              <>
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {info.units.length} en mantenimiento
                </div>
                {counts.length > 0 && (
                  <div style={{ fontWeight: 500, fontSize: 11 }}>
                    {counts.map(([k, n]) => `${KIND_LABEL[k]}: ${n}`).join(' · ')}
                  </div>
                )}
                {extra > 0 && <div style={{ fontWeight: 500, fontSize: 11, opacity: 0.85 }}>Se dibujan {CAPACITY}; hay {extra} más</div>}
              </>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

export default memo(Workshop);
