import { memo } from 'react';
import { Html } from '@react-three/drei';
import { dispatchAreaRect, FLOOR_Y, HEAVY_GATE_H, HEAVY_GATE_W, heavyGatePlacement, type SiteLayout } from '../lib/layout';

/**
 * Extremo de Recepción: área de despacho con escritorios junto a la pared de andenes y, en la
 * pared lateral frente a los cantilever, el portón grande a nivel de piso (con rampa afuera)
 * por donde entra y sale la mercadería pesada. El portón se ve siempre; el interior, sin techo.
 */

function Desk({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[1.6, 0.05, 0.8]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      {[-0.75, 0.75].map((dx) => (
        <mesh key={dx} position={[dx, 0.37, 0]}>
          <boxGeometry args={[0.05, 0.74, 0.7]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      ))}
      {/* monitor */}
      <mesh position={[0, 1.02, -0.25]}>
        <boxGeometry args={[0.55, 0.34, 0.04]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {/* silla */}
      <mesh position={[0, 0.48, 0.65]}>
        <boxGeometry args={[0.5, 0.08, 0.5]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0, 0.8, 0.88]}>
        <boxGeometry args={[0.5, 0.6, 0.06]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
    </group>
  );
}

function StagedPallet({ x, z, color, h }: { x: number; z: number; color: string; h: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[1.2, 0.15, 1.0]} />
        <meshStandardMaterial color="#a16207" />
      </mesh>
      <mesh position={[0, 0.15 + h / 2, 0]} castShadow>
        <boxGeometry args={[1.12, h, 0.95]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

/** Portón seccional: panel con franjas, marco amarillo y topes de protección. */
function HeavyGate({ x, z, outside }: { x: number; z: number; outside: boolean }) {
  const slats = Math.floor(HEAVY_GATE_H / 0.6);
  return (
    <group position={[x, FLOOR_Y, z]}>
      <mesh position={[0, HEAVY_GATE_H / 2, 0]}>
        <boxGeometry args={[HEAVY_GATE_W, HEAVY_GATE_H, 0.08]} />
        <meshStandardMaterial color="#9aa5b1" metalness={0.4} roughness={0.5} />
      </mesh>
      {Array.from({ length: slats }, (_, i) => (
        <mesh key={i} position={[0, (i + 1) * 0.6, outside ? 0.05 : -0.05]}>
          <boxGeometry args={[HEAVY_GATE_W, 0.04, 0.02]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (HEAVY_GATE_W + 0.3)) / 2, HEAVY_GATE_H / 2, outside ? 0.08 : -0.08]}>
          <boxGeometry args={[0.3, HEAVY_GATE_H, 0.1]} />
          <meshStandardMaterial color="#facc15" />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`b${s}`} position={[(s * (HEAVY_GATE_W + 1.2)) / 2, 0.5, outside ? 0.5 : -0.5]}>
          <cylinderGeometry args={[0.12, 0.12, 1.0, 10]} />
          <meshStandardMaterial color="#facc15" />
        </mesh>
      ))}
    </group>
  );
}

function DispatchArea({ layout, cutaway, showLabel }: { layout: SiteLayout; cutaway: boolean; showLabel: boolean }) {
  const r = dispatchAreaRect(layout);
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const rampLen = 8;
  const gate = heavyGatePlacement(layout);

  return (
    <group>
      {/* Portón en la pared lateral. Coordenadas locales: z+ = afuera (x− del mundo) */}
      <group position={[gate.x, 0, gate.z]} rotation={[0, -Math.PI / 2, 0]}>
        <HeavyGate x={0} z={0.06} outside />
        {/* rampa desde el patio hasta el nivel del piso */}
        <mesh position={[0, FLOOR_Y / 2, rampLen / 2]} rotation={[Math.atan2(FLOOR_Y, rampLen), 0, 0]} receiveShadow>
          <boxGeometry args={[HEAVY_GATE_W + 1, 0.2, Math.hypot(rampLen, FLOOR_Y)]} />
          <meshStandardMaterial color="#9ca3af" roughness={0.9} />
        </mesh>
        {cutaway && (
          <>
            <HeavyGate x={0} z={-0.36} outside={false} />
            {/* paso libre hacia el pasillo de los cantilever */}
            <mesh position={[0, FLOOR_Y + 0.018, -2.6]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[HEAVY_GATE_W, 4.4]} />
              <meshStandardMaterial color="#e5e7eb" roughness={0.9} />
            </mesh>
          </>
        )}
        {showLabel && (
          <Html position={[0, FLOOR_Y + HEAVY_GATE_H + 1.2, 1]} center distanceFactor={90} zIndexRange={[30, 10]} style={{ pointerEvents: 'none' }}>
            <div
              style={{
                background: 'rgba(15,23,42,0.9)',
                color: '#fff',
                padding: '3px 8px',
                borderRadius: 6,
                font: '600 12px system-ui, sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              Portón de carga pesada
            </div>
          </Html>
        )}
      </group>

      {cutaway && (
        <group>
          <group position={[0, FLOOR_Y, 0]}>
            {/* piso demarcado */}
            <mesh position={[cx, 0.013, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[w, d]} />
              <meshStandardMaterial color="#dbeafe" roughness={0.9} />
            </mesh>
            {[
              { x: cx, z: r.z0 + 0.1, sw: w, sd: 0.15 },
              { x: r.x1 - 0.1, z: cz, sw: 0.15, sd: d },
            ].map((b, i) => (
              <mesh key={i} position={[b.x, 0.02, b.z]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[b.sw, b.sd]} />
                <meshBasicMaterial color="#facc15" />
              </mesh>
            ))}
            {/* escritorios contra la pared lateral */}
            {[0, 1, 2, 3].map((i) => (
              <group key={i} rotation={[0, 0, 0]}>
                <Desk x={r.x0 + 1.6} z={r.z0 + 2 + i * 2.3} />
              </group>
            ))}
            {/* mercadería de despacho en piso */}
            {[0, 1, 2].map((c) =>
              [0, 1].map((rw) => (
                <StagedPallet
                  key={`${c}-${rw}`}
                  x={r.x1 - 2 - c * 1.6}
                  z={r.z0 + 2 + rw * 1.5}
                  color={(c + rw) % 2 ? '#c89b62' : '#cbd5e1'}
                  h={0.8 + ((c * 3 + rw) % 4) * 0.25}
                />
              ))
            )}
          </group>
          {showLabel && (
            <Html position={[cx, FLOOR_Y + 5.5, cz]} center distanceFactor={90} zIndexRange={[30, 10]} style={{ pointerEvents: 'none' }}>
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
                Despacho y escritorios
              </div>
            </Html>
          )}
        </group>
      )}
    </group>
  );
}

export default memo(DispatchArea);
