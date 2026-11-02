import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  BUILDING_DEPTH,
  CROSS_AISLE_Z,
  DOOR_WIDTH,
  FLOOR_Y,
  RACK_Z0,
  STAGING_DEPTH,
  type SiteLayout,
} from '../lib/layout';

/**
 * Interior del almacén (visible en modo "Interior", sin techo):
 * zona de recepción detrás de cada andén, pasillo transversal y racks selectivos.
 */

const BAY = 2.7;
const RACK_DEPTH = 1.1;
const FLUE = 0.2;
const AISLE = 3.6;
const LEVELS = [0, 2.0, 4.0, 6.0, 8.0];
const UPRIGHT_H = 9.2;
const BAYS_PER_BLOCK = 14;
const BLOCK_GAP = 4;
const LOAD_COLORS = ['#c89b62', '#d6b07a', '#b98a55', '#e2e8f0', '#cbd5e1', '#93c5fd', '#a7f3d0'];

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

interface RackData {
  uprights: THREE.Matrix4[];
  beams: THREE.Matrix4[];
  loads: { m: THREE.Matrix4; c: THREE.Color }[];
}

function buildRacks(layout: SiteLayout): RackData {
  const uprights: THREE.Matrix4[] = [];
  const beams: THREE.Matrix4[] = [];
  const loads: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const rnd = seeded(23);
  const q = new THREE.Quaternion();
  const mat = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));

  // Bloques de racks a lo largo de x, con pasillos de cruce entre bloques
  const x0 = layout.xWest + 5;
  const x1 = layout.xEast - 5;
  const bayStarts: number[] = [];
  let x = x0;
  let inBlock = 0;
  while (x + BAY <= x1) {
    bayStarts.push(x);
    x += BAY;
    inBlock += 1;
    if (inBlock === BAYS_PER_BLOCK) {
      x += BLOCK_GAP;
      inBlock = 0;
    }
  }

  for (let front = RACK_Z0; front - 2 * RACK_DEPTH - FLUE > -BUILDING_DEPTH + 6; front -= 2 * RACK_DEPTH + FLUE + AISLE) {
    // dos racks espalda con espalda
    for (const zFace of [front, front - RACK_DEPTH - FLUE]) {
      const zA = zFace;
      const zB = zFace - RACK_DEPTH;
      const zc = (zA + zB) / 2;
      bayStarts.forEach((bx, i) => {
        const prevEnd = i > 0 ? bayStarts[i - 1] + BAY : -Infinity;
        // postes al inicio de cada bahía (y al final si la siguiente no es contigua)
        if (Math.abs(prevEnd - bx) > 0.01) {
          uprights.push(mat(bx, UPRIGHT_H / 2, zA), mat(bx, UPRIGHT_H / 2, zB));
        }
        const end = bx + BAY;
        uprights.push(mat(end, UPRIGHT_H / 2, zA), mat(end, UPRIGHT_H / 2, zB));
        for (const ly of LEVELS) {
          if (ly > 0) {
            beams.push(mat(bx + BAY / 2, ly - 0.08, zA), mat(bx + BAY / 2, ly - 0.08, zB));
          }
          // dos tarimas por bahía y nivel
          for (const px of [bx + BAY * 0.27, bx + BAY * 0.73]) {
            if (rnd() < 0.22) continue;
            const h = 1.0 + rnd() * 0.6;
            const m = mat(px, ly + h / 2 + 0.02, zc, 1, h, 1);
            loads.push({ m, c: new THREE.Color(LOAD_COLORS[Math.floor(rnd() * LOAD_COLORS.length)]) });
          }
        }
      });
    }
  }
  return { uprights, beams, loads };
}

function Instanced({ matrices, colors, geometry, color }: { matrices: THREE.Matrix4[]; colors?: THREE.Color[]; geometry: [number, number, number]; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      if (colors) mesh.setColorAt(i, colors[i]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices, colors]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, matrices.length]} castShadow receiveShadow key={matrices.length}>
      <boxGeometry args={geometry} />
      <meshStandardMaterial color={colors ? '#ffffff' : color} roughness={0.7} metalness={colors ? 0 : 0.3} />
    </instancedMesh>
  );
}

function Line({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  return (
    <mesh position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial color="#facc15" />
    </mesh>
  );
}

function Interior({ layout }: { layout: SiteLayout }) {
  const racks = useMemo(() => buildRacks(layout), [layout]);
  const loadMatrices = useMemo(() => racks.loads.map((l) => l.m), [racks]);
  const loadColors = useMemo(() => racks.loads.map((l) => l.c), [racks]);
  const midX = (layout.xWest + layout.xEast) / 2;
  const innerLen = layout.xEast - layout.xWest - 0.6;
  const stagingEnd = -STAGING_DEPTH + 6;

  return (
    <group position={[0, FLOOR_Y, 0]}>
      {/* racks */}
      <group>
        <Instanced matrices={racks.uprights} geometry={[0.09, UPRIGHT_H, 0.09]} color="#1d4ed8" />
        <Instanced matrices={racks.beams} geometry={[BAY, 0.12, 0.06]} color="#f97316" />
        <Instanced matrices={loadMatrices} colors={loadColors} geometry={[1.0, 1, 1.05]} color="#ffffff" />
      </group>

      {/* recepción: carril marcado detrás de cada puerta */}
      {[...layout.docks.values()].map((d, i) => (
        <group key={i} position={[d.x, 0, 0]}>
          <Line x={-DOOR_WIDTH / 2 - 0.3} z={(stagingEnd - 0.6) / 2} w={0.12} d={-stagingEnd} />
          <Line x={DOOR_WIDTH / 2 + 0.3} z={(stagingEnd - 0.6) / 2} w={0.12} d={-stagingEnd} />
          <Line x={0} z={stagingEnd - 0.6} w={DOOR_WIDTH + 0.72} d={0.12} />
          {/* franja peatonal junto a la puerta */}
          <mesh position={[0, 0.011, -0.8]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[DOOR_WIDTH, 0.9]} />
            <meshBasicMaterial color="#334155" />
          </mesh>
        </group>
      ))}

      {/* pasillo transversal entre recepción y racks */}
      <Line x={midX} z={-STAGING_DEPTH + 0.5} w={innerLen} d={0.15} />
      <Line x={midX} z={RACK_Z0 + 0.6} w={innerLen} d={0.15} />
      <mesh position={[midX, 0.011, CROSS_AISLE_Z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[innerLen, 1.4]} />
        <meshBasicMaterial color="#16a34a" transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

export default memo(Interior);
