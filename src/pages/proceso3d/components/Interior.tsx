import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  CROSS_AISLE_Z,
  DOOR_WIDTH,
  FLOOR_Y,
  RACK_DEPTH,
  RACK_FLUE,
  RACK_PITCH,
  RACK_Z0,
  RACK_Z_END,
  SHORT_RACK_END_Z,
  SHORT_RACKS,
  STAGING_DEPTH,
  CANTILEVER_ROWS,
  rackGrid,
  rackK,
  workshopRect,
  type SiteLayout,
} from '../lib/layout';

/**
 * Interior del almacén (visible en modo "Interior", sin techo):
 * zona de recepción detrás de cada andén, pasillo transversal y racks selectivos
 * perpendiculares a la pared de andenes (pasillos de los racks en z).
 */

const BAY = 2.7;
const LEVELS = [0, 2.0, 4.0, 6.0, 8.0];
const UPRIGHT_H = 9.2;
/** Bahías por tramo antes del pasillo de cruce a media profundidad */
const BAYS_PER_BLOCK = 8;
const BLOCK_GAP = 4;
const LOAD_COLORS = ['#c89b62', '#d6b07a', '#b98a55', '#e2e8f0', '#cbd5e1', '#93c5fd', '#a7f3d0'];

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Separación entre columnas del cantilever y niveles de brazos (como en el sitio: ~7 niveles) */
const CANT_COL = BAY / 2;
const CANT_LEVELS = [0.35, 1.55, 2.75, 3.95, 5.15, 6.35, 7.55];
const CANT_H = 8.6;
const CANT_ARM = 1.15;
/** Materiales: madera, galvanizado / perfiles, PVC blanco, malla */
const LUMBER = ['#c8a06a', '#d9b98a', '#b98a55'];
const METAL = ['#9ca3af', '#cbd5e1', '#e5e7eb', '#6b7280'];
const PVC = ['#f8fafc', '#e2e8f0'];
const MESH = ['#94a3b8', '#4d7c0f'];

interface Tinted {
  m: THREE.Matrix4;
  c: THREE.Color;
}

interface RackData {
  uprights: THREE.Matrix4[];
  beams: THREE.Matrix4[];
  loads: Tinted[];
  cant: {
    columns: THREE.Matrix4[];
    feet: THREE.Matrix4[];
    arms: THREE.Matrix4[];
    /** paquetes rectangulares (madera, perfiles, láminas) */
    bundles: Tinted[];
    /** tubos a lo largo del rack (cilindros en z) */
    pipes: Tinted[];
    /** rollos de malla (cilindros en x) */
    coils: Tinted[];
  };
}

function buildRacks(layout: SiteLayout): RackData {
  const uprights: THREE.Matrix4[] = [];
  const beams: THREE.Matrix4[] = [];
  const loads: Tinted[] = [];
  const cant: RackData['cant'] = { columns: [], feet: [], arms: [], bundles: [], pipes: [], coils: [] };
  const rnd = seeded(23);
  const pick = (list: string[]) => new THREE.Color(list[Math.floor(rnd() * list.length)]);
  const qAlongZ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const qAlongX = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  const rot = (rq: THREE.Quaternion, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), rq, new THREE.Vector3(sx, sy, sz));
  const q = new THREE.Quaternion();
  const mat = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));

  // Bahías a lo largo de z (desde el pasillo transversal hacia el frente), con un pasillo de cruce
  const bayStarts: number[] = [];
  let z = RACK_Z0;
  let inBlock = 0;
  while (z - BAY >= RACK_Z_END) {
    bayStarts.push(z);
    z -= BAY;
    inBlock += 1;
    if (inBlock === BAYS_PER_BLOCK) {
      z -= BLOCK_GAP;
      inBlock = 0;
    }
  }


  /**
   * Cantilever de doble cara: columnas al centro, brazos hacia los dos pasillos y material
   * largo apoyado sobre varios brazos (madera, perfiles, tubos y rollos de malla).
   */
  // El taller ocupa la esquina del frente: esas bahías no se dibujan (con 2 m de pasillo)
  const shop = workshopRect(layout);
  const clearOfShop = (xA: number, xB: number) =>
    xA < shop.x1 + 2 && xB > shop.x0 - 2 ? bayStarts.filter((bz) => bz - BAY > shop.z1 + 2) : bayStarts;

  function buildCantilever(cx: number, bays: number[]) {
    // tramos continuos (el pasillo de cruce corta el cantilever)
    const runs: [number, number][] = [];
    bays.forEach((bz, i) => {
      const last = runs[runs.length - 1];
      if (i > 0 && last && Math.abs(bays[i - 1] - BAY - bz) < 0.01) last[1] = bz - BAY;
      else runs.push([bz, bz - BAY]);
    });
    for (const [zA, zB] of runs) {
      const n = Math.round((zA - zB) / CANT_COL);
      for (let c = 0; c <= n; c++) {
        const cz = zA - c * CANT_COL;
        cant.columns.push(mat(cx, CANT_H / 2, cz));
        cant.feet.push(mat(cx, 0.12, cz));
        for (const ly of CANT_LEVELS) for (const s of [-1, 1]) cant.arms.push(mat(cx + s * (0.14 + CANT_ARM / 2), ly, cz));
      }
      // material: piezas largas que cubren varios brazos, con huecos
      for (const ly of CANT_LEVELS) {
        for (const s of [-1, 1]) {
          const xc = cx + s * (0.14 + CANT_ARM / 2);
          const top = ly + 0.07;
          let z = zA - 0.2;
          while (z > zB + 1.2) {
            const len = Math.min(z - zB - 0.2, 2.5 + rnd() * 5);
            if (len < 1.2) break;
            const zc = z - len / 2;
            const r = rnd();
            if (r < 0.14) {
              // espacio vacío
            } else if (r < 0.42) {
              const h = 0.3 + rnd() * 0.35;
              cant.bundles.push({ m: mat(xc, top + h / 2, zc, 1.0, h, len), c: pick(LUMBER) });
            } else if (r < 0.64) {
              const h = 0.2 + rnd() * 0.3;
              cant.bundles.push({ m: mat(xc, top + h / 2, zc, 0.95, h, len), c: pick(METAL) });
            } else if (r < 0.86) {
              const color = pick(rnd() < 0.5 ? PVC : METAL);
              const rad = 0.09 + rnd() * 0.08;
              for (let p = 0; p < 4; p++) {
                cant.pipes.push({ m: rot(qAlongZ, xc + (p - 1.5) * rad * 2.1, top + rad, zc, rad, len, rad), c: color });
              }
              cant.pipes.push({ m: rot(qAlongZ, xc, top + rad * 2.8, zc, rad, len, rad), c: color });
            } else {
              const color = pick(MESH);
              for (let zz = z - 0.45; zz > z - len + 0.3; zz -= 0.75) {
                cant.coils.push({ m: rot(qAlongX, xc, top + 0.34, zz, 0.34, 0.95, 0.34), c: color });
              }
            }
            z -= len + 0.25 + rnd() * 0.6;
          }
        }
      }
    }
  }
  // Filas dobles sobre la grilla fija en x (centro en k · RACK_PITCH), dentro del edificio
  const { half, kFrom, kTo } = rackGrid(layout);
  // Racks más cortos: dejan libre el control de acceso contra la fachada
  const shortKs = new Set(SHORT_RACKS.map((n) => rackK(layout, n)));
  for (let k = kFrom; k <= kTo; k++) {
    const cx = k * RACK_PITCH;
    // las primeras filas junto al taller son cantilever
    if (k - kFrom < CANTILEVER_ROWS) {
      buildCantilever(cx, clearOfShop(cx - half, cx + half));
      continue;
    }
    // dos racks espalda con espalda
    for (const xFace of [cx - half, cx + RACK_FLUE / 2]) {
      const xA = xFace;
      const xB = xFace + RACK_DEPTH;
      const xc = (xA + xB) / 2;
      const bays = shortKs.has(k) ? clearOfShop(xA, xB).filter((bz) => bz - BAY >= SHORT_RACK_END_Z) : clearOfShop(xA, xB);
      bays.forEach((bz, i) => {
        const prevEnd = i > 0 ? bays[i - 1] - BAY : Infinity;
        // postes al inicio de cada bahía (y al final si la siguiente no es contigua)
        if (Math.abs(prevEnd - bz) > 0.01) {
          uprights.push(mat(xA, UPRIGHT_H / 2, bz), mat(xB, UPRIGHT_H / 2, bz));
        }
        const end = bz - BAY;
        uprights.push(mat(xA, UPRIGHT_H / 2, end), mat(xB, UPRIGHT_H / 2, end));
        for (const ly of LEVELS) {
          if (ly > 0) {
            beams.push(mat(xA, ly - 0.08, bz - BAY / 2), mat(xB, ly - 0.08, bz - BAY / 2));
          }
          // dos tarimas por bahía y nivel
          for (const pz of [bz - BAY * 0.27, bz - BAY * 0.73]) {
            if (rnd() < 0.22) continue;
            const h = 1.0 + rnd() * 0.6;
            const m = mat(xc, ly + h / 2 + 0.02, pz, 1, h, 1);
            loads.push({ m, c: new THREE.Color(LOAD_COLORS[Math.floor(rnd() * LOAD_COLORS.length)]) });
          }
        }
      });
    }
  }
  return { uprights, beams, loads, cant };
}

function Instanced({
  matrices,
  colors,
  geometry,
  color,
  cylinder = false,
}: {
  matrices: THREE.Matrix4[];
  colors?: THREE.Color[];
  geometry: [number, number, number];
  color: string;
  /** Cilindro unitario (radio 1, alto 1) en lugar de caja */
  cylinder?: boolean;
}) {
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
      {cylinder ? <cylinderGeometry args={[1, 1, 1, 12]} /> : <boxGeometry args={geometry} />}
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
  const cant = useMemo(() => {
    const split = (list: Tinted[]) => ({ m: list.map((l) => l.m), c: list.map((l) => l.c) });
    return { bundles: split(racks.cant.bundles), pipes: split(racks.cant.pipes), coils: split(racks.cant.coils) };
  }, [racks]);
  const midX = (layout.xWest + layout.xEast) / 2;
  const innerLen = layout.xEast - layout.xWest - 0.6;
  const stagingEnd = -STAGING_DEPTH + 6;

  return (
    <group position={[0, FLOOR_Y, 0]}>
      {/* racks */}
      <group>
        <Instanced matrices={racks.uprights} geometry={[0.09, UPRIGHT_H, 0.09]} color="#1d4ed8" />
        <Instanced matrices={racks.beams} geometry={[0.06, 0.12, BAY]} color="#f97316" />
        <Instanced matrices={loadMatrices} colors={loadColors} geometry={[1.05, 1, 1.0]} color="#ffffff" />
      </group>

      {/* cantilever de material pesado: columnas azul marino, brazos naranja */}
      <group>
        <Instanced matrices={racks.cant.columns} geometry={[0.26, CANT_H, 0.3]} color="#1e2a5a" />
        <Instanced matrices={racks.cant.feet} geometry={[2.6, 0.24, 0.32]} color="#1e2a5a" />
        <Instanced matrices={racks.cant.arms} geometry={[CANT_ARM, 0.13, 0.14]} color="#e2501c" />
        <Instanced matrices={cant.bundles.m} colors={cant.bundles.c} geometry={[1, 1, 1]} color="#ffffff" />
        <Instanced matrices={cant.pipes.m} colors={cant.pipes.c} geometry={[1, 1, 1]} color="#ffffff" cylinder />
        <Instanced matrices={cant.coils.m} colors={cant.coils.c} geometry={[1, 1, 1]} color="#ffffff" cylinder />
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
