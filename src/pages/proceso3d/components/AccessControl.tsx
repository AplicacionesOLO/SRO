import { memo } from 'react';
import { Html } from '@react-three/drei';
import { accessControlRect, FLOOR_Y, type SiteLayout } from '../lib/layout';
import { Person } from './Workforce';

/**
 * Control de acceso del personal, contra la fachada frontal donde los racks 11–13 son más
 * cortos: puerta peatonal, caseta del oficial de seguridad con detector manual, arco detector
 * de metales y el reloj marcador (BIT2) al lado.
 * Coordenadas locales: fachada en z = 0, hacia el interior z+.
 */

/** Caseta con ventanales, escritorio y el oficial. */
function GuardBooth({ x, z }: { x: number; z: number }) {
  const W = 2.6;
  const D = 2.4;
  const H = 2.6;
  return (
    <group position={[x, 0, z]}>
      {/* base y techo */}
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[W, 0.12, D]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[0, H + 0.06, 0]} castShadow>
        <boxGeometry args={[W + 0.2, 0.12, D + 0.2]} />
        <meshStandardMaterial color="#1e3a5f" />
      </mesh>
      {/* zócalo opaco y ventanales */}
      {(
        [
          [0, D / 2, W, 0],
          [0, -D / 2, W, 0],
          [W / 2, 0, D, Math.PI / 2],
          [-W / 2, 0, D, Math.PI / 2],
        ] as [number, number, number, number][]
      ).map(([px, pz, len, ry], i) => (
        <group key={i} position={[px, 0, pz]} rotation={[0, ry, 0]}>
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[len, 1.0, 0.08]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
          <mesh position={[0, 1.6, 0]}>
            <boxGeometry args={[len, 1.1, 0.04]} />
            <meshStandardMaterial color="#93c5fd" transparent opacity={0.35} />
          </mesh>
        </group>
      ))}
      {/* esquineros */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[(sx * W) / 2, H / 2, (sz * D) / 2]}>
            <boxGeometry args={[0.08, H, 0.08]} />
            <meshStandardMaterial color="#1e3a5f" />
          </mesh>
        ))
      )}
      {/* escritorio con monitor y detector manual */}
      <mesh position={[0, 0.8, D / 2 - 0.45]}>
        <boxGeometry args={[W - 0.4, 0.06, 0.6]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[-0.5, 1.05, D / 2 - 0.55]}>
        <boxGeometry args={[0.5, 0.32, 0.04]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <HandWand x={0.6} y={0.86} z={D / 2 - 0.4} />
      <group position={[0.3, 0, -0.1]} rotation={[0, Math.PI / 2, 0]}>
        <Person vest="#111827" skin="#8d5524" pose="stand" />
      </group>
    </group>
  );
}

/** Detector manual (paleta) acostado sobre el escritorio. */
function HandWand({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]} rotation={[0, 0.5, Math.PI / 2]}>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.2, 8]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[0.09, 0.22, 0.03]} />
        <meshStandardMaterial color="#facc15" />
      </mesh>
    </group>
  );
}

/** Arco detector de metales: dos paneles, cabezal con luces y paso marcado. */
function MetalArch({ x, z }: { x: number; z: number }) {
  const GAP = 0.8;
  const H = 2.2;
  return (
    <group position={[x, 0, z]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (GAP + 0.12)) / 2, H / 2, 0]} castShadow>
          <boxGeometry args={[0.12, H, 0.6]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.3} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, H + 0.1, 0]} castShadow>
        <boxGeometry args={[GAP + 0.36, 0.22, 0.62]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {/* luces verde / roja del cabezal */}
      {[-0.18, 0.18].map((dx, i) => (
        <mesh key={dx} position={[dx, H + 0.1, 0.32]}>
          <boxGeometry args={[0.12, 0.06, 0.02]} />
          <meshBasicMaterial color={i ? '#ef4444' : '#22c55e'} />
        </mesh>
      ))}
      {/* tapete del paso */}
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GAP, 1.6]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
    </group>
  );
}

/** Reloj marcador en su poste, con pantalla y lector. */
function TimeClock({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[0.12, 1.4, 0.12]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh position={[0, 1.55, 0.02]} castShadow>
        <boxGeometry args={[0.32, 0.42, 0.14]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0, 1.62, 0.1]}>
        <boxGeometry args={[0.22, 0.13, 0.01]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <mesh position={[0, 1.44, 0.1]}>
        <boxGeometry args={[0.1, 0.08, 0.01]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
    </group>
  );
}

function AccessControl({ layout, showLabel, info }: { layout: SiteLayout; showLabel: boolean; info?: string | null }) {
  const r = accessControlRect(layout);
  if (!r) return null;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const cx = (r.x0 + r.x1) / 2;
  // Recorrido: puerta peatonal → arco → reloj marcador; la caseta controla el paso
  const doorX = cx;
  const archZ = 3.4;

  return (
    <group position={[0, FLOOR_Y, r.z0]}>
      {/* piso demarcado del control de acceso */}
      <mesh position={[cx, 0.013, d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#e0f2fe" roughness={0.9} />
      </mesh>
      {[
        { x: cx, z: d - 0.08, sw: w, sd: 0.15 },
        { x: r.x0 + 0.08, z: d / 2, sw: 0.15, sd: d },
        { x: r.x1 - 0.08, z: d / 2, sw: 0.15, sd: d },
      ].map((b, i) => (
        <mesh key={i} position={[b.x, 0.02, b.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[b.sw, b.sd]} />
          <meshBasicMaterial color="#facc15" />
        </mesh>
      ))}
      {/* paso peatonal verde desde la puerta */}
      <mesh position={[doorX, 0.018, (d - 0.3) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.4, d - 0.3]} />
        <meshStandardMaterial color="#16a34a" transparent opacity={0.45} />
      </mesh>
      {/* puerta peatonal en la fachada */}
      <mesh position={[doorX, 1.1, 0.05]}>
        <boxGeometry args={[1.2, 2.2, 0.08]} />
        <meshStandardMaterial color="#64748b" metalness={0.4} />
      </mesh>
      <mesh position={[doorX, 2.35, 0.08]}>
        <boxGeometry args={[1.4, 0.18, 0.04]} />
        <meshBasicMaterial color="#16a34a" />
      </mesh>

      <MetalArch x={doorX} z={archZ} />
      <GuardBooth x={doorX - 3.2} z={archZ - 0.6} />
      <TimeClock x={doorX + 1.6} z={archZ + 2.2} />
      {/* fila de personas marcando */}
      <group position={[doorX + 1.6, 0, archZ + 2.9]} rotation={[0, Math.PI, 0]}>
        <Person vest="#facc15" skin="#c68642" pose="stand" />
      </group>

      {showLabel && (
        <Html position={[doorX, 4.6, archZ]} center distanceFactor={90} zIndexRange={[30, 10]} style={{ pointerEvents: 'none' }}>
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
            🛡️ Control de acceso · reloj marcador
            {info && <div style={{ fontWeight: 500, fontSize: 11, opacity: 0.85 }}>{info}</div>}
          </div>
        </Html>
      )}
    </group>
  );
}

export default memo(AccessControl);
