import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { DOCK_SPACING, DOCKED_Z, TRUCK_LENGTH } from '../lib/layout';

/** Mapa de calor: un tapete de color frente a cada andén. */
export interface DockHeatVisual {
  dockId: string;
  x: number;
  color: string;
  label: string;
  title: string;
}

export function DockHeatPads({ pads, showLabels }: { pads: DockHeatVisual[]; showLabels: boolean }) {
  return (
    <group>
      {pads.map((p) => (
        <group key={p.dockId} position={[p.x, 0, DOCKED_Z]}>
          <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[DOCK_SPACING - 0.5, TRUCK_LENGTH + 1.5]} />
            <meshBasicMaterial color={p.color} transparent opacity={0.85} depthWrite={false} />
          </mesh>
          {showLabels && (
            <Html position={[0, 0.3, TRUCK_LENGTH / 2 + 2.2]} center distanceFactor={70} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
              <div
                title={p.title}
                style={{
                  background: 'rgba(255,255,255,0.92)',
                  color: '#0b0b0b',
                  border: `2px solid ${p.color}`,
                  borderRadius: 4,
                  padding: '1px 4px',
                  font: '700 11px system-ui, sans-serif',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.label}
              </div>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}

/** Próxima cita de un andén libre: silueta translúcida del camión con su hora. */
export interface GhostVisual {
  id: string;
  x: number;
  label: string;
  late: boolean;
}

export function GhostTrucks({ ghosts, showLabels }: { ghosts: GhostVisual[]; showLabels: boolean }) {
  const box = useMemo(() => new THREE.BoxGeometry(2.6, 3.9, TRUCK_LENGTH - 0.6), []);
  const edges = useMemo(() => new THREE.EdgesGeometry(box), [box]);
  return (
    <group>
      {ghosts.map((g) => {
        const color = g.late ? '#d03b3b' : '#0ea5e9';
        return (
          <group key={g.id} position={[g.x, 0, DOCKED_Z]}>
            <mesh geometry={box} position={[0, 2.15, 0]}>
              <meshBasicMaterial color={color} transparent opacity={0.12} depthWrite={false} />
            </mesh>
            <lineSegments geometry={edges} position={[0, 2.15, 0]}>
              <lineBasicMaterial color={color} transparent opacity={0.7} />
            </lineSegments>
            {showLabels && (
              <Html position={[0, 5, 0]} center distanceFactor={70} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.9)',
                    color: '#0b0b0b',
                    border: `1.5px dashed ${color}`,
                    borderRadius: 4,
                    padding: '1px 5px',
                    font: '600 11px system-ui, sans-serif',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {g.late ? '⚠ ' : ''}
                  {g.label}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}
