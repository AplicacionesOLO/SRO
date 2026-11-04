import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { DOCK_SPACING, FLOOR_Y, MEZZ_FRONT_Z, MEZZ_LEVELS, MEZZ_WALL_Z, type SiteLayout } from '../lib/layout';

/**
 * Mezzanine de 3 niveles (piso + 2 entrepisos) a lo largo de los andenes, como en el sitio.
 *
 * Recorrido de las cajas (siempre en movimiento):
 *  1. Banda del último piso, pegada a la pared de los portones, hacia el andén 0101 (x−).
 *  2. Al final, un caracol (espiral) baja hasta la banda de distribución.
 *  3. Banda de distribución colgada debajo del primer piso (suspendida de su estructura), de
 *     regreso a lo largo de los portones (x+).
 *  4. Frente a cada portón sale una bajada hacia el lado contrario del portón (interior)
 *     hasta el piso. Las cajas se reparten entre las bajadas.
 *
 * Además: torre elevadora con contravientos, escalera en zigzag en el extremo y gabinetes
 * contra incendio. Entrepisos semitransparentes.
 */

const DECK_T = 0.25;
const RAIL_H = 1.1;
const STEEL = '#f1f5f9';
const BOX_COLORS = ['#c89b62', '#b98a55', '#d6b07a', '#e2e8f0'];
const BELT_Y = 0.9;
/** Banda del último piso: pegada a la pared de portones */
const BELT_Z = MEZZ_WALL_Z - 1.0;
const TOP_FLOOR = MEZZ_LEVELS[MEZZ_LEVELS.length - 1] + DECK_T / 2;
const BELT_TOP = TOP_FLOOR + BELT_Y;
/** Caracol: 2.5 vueltas; entra moviéndose en x− y sale en x+, dos radios más adentro */
const SPIRAL_R = 1.0;
const SPIRAL_TURNS = 2.5;
/** Banda de distribución colgada debajo del primer piso (sale del caracol, 2 radios más adentro) */
const HANG = 0.9;
const LOW_BELT_Y = MEZZ_LEVELS[0] - DECK_T / 2 - HANG;
const LOW_BELT_Z = BELT_Z - 2 * SPIRAL_R;
const SPIRAL_DROP = BELT_TOP - LOW_BELT_Y;
const SPIRAL_LEN = Math.hypot(2 * Math.PI * SPIRAL_R * SPIRAL_TURNS, SPIRAL_DROP);
/**
 * Las bajadas van AL LADO del carril amarillo de estiba de cada portón (en el pasillo entre
 * carriles) y terminan pasado el fondo del carril, para no interferir con la estiba.
 * Carril: puerta ± 2.0 m en x, de la pared hasta z = −14.6.
 */
const chuteX = (doorX: number) => doorX + DOCK_SPACING / 2;
const CHUTE_W = 0.45;
const CHUTE_END_Z = -15.6;
const CHUTE_END_Y = 0.9;
const CHUTE_START_Z = LOW_BELT_Z - 0.55;
/** Velocidad de las cajas (m/s) y cajas por bajada */
const BELT_SPEED = 1.1;
const BOXES_PER_CHUTE = 3;

interface Tinted {
  m: THREE.Matrix4;
  c: THREE.Color;
}

const q0 = new THREE.Quaternion();
const mat = (x: number, y: number, z: number, sx: number, sy: number, sz: number, q = q0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Geometría de una bajada (igual para todas): de la banda colgada al piso, hacia el interior */
const CHUTE = (() => {
  const run = CHUTE_START_Z - CHUTE_END_Z; // > 0, hacia z−
  const drop = LOW_BELT_Y - CHUTE_END_Y;
  const len = Math.hypot(run, drop);
  // el eje z local del bastidor apunta hacia abajo y hacia el interior
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.atan2(drop, -run), 0, 0));
  return { run, drop, len, q, cy: (LOW_BELT_Y + CHUTE_END_Y) / 2, cz: (CHUTE_START_Z + CHUTE_END_Z) / 2 };
})();

/** Centro del caracol: el punto de entrada (ángulo π/2) queda sobre la banda del último piso. */
const spiralCenter = (x0: number) => ({ x: x0 + 0.3, z: BELT_Z - SPIRAL_R });

/** Punto del caracol en la fracción f (0 = entrada arriba, 1 = salida en la banda colgada). */
function spiralPoint(cx: number, cz: number, f: number, out: THREE.Vector3) {
  const a = Math.PI / 2 + f * SPIRAL_TURNS * 2 * Math.PI;
  return out.set(cx + Math.cos(a) * SPIRAL_R, BELT_TOP - f * SPIRAL_DROP, cz + Math.sin(a) * SPIRAL_R);
}

/** Cajas instanciadas de tamaño unitario (la escala va en cada matriz). */
function Boxes({ items, color, colors }: { items: THREE.Matrix4[]; color?: string; colors?: THREE.Color[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      if (colors) mesh.setColorAt(i, colors[i]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, colors]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} key={items.length} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={colors ? '#ffffff' : color} roughness={0.7} metalness={colors ? 0 : 0.25} />
    </instancedMesh>
  );
}

function buildMezzanine(x0: number, x1: number, doorXs: number[]) {
  const rnd = seeded(41);
  const frame: THREE.Matrix4[] = []; // estructura, barandas, bastidores (blanco)
  const belt: THREE.Matrix4[] = []; // superficie de rodillos, escalones, monitores (gris oscuro)
  const red: THREE.Matrix4[] = []; // gabinetes contra incendio
  const panels: THREE.Matrix4[] = []; // tableros eléctricos
  const goods: Tinted[] = [];
  const zW = MEZZ_WALL_Z;
  const zF = MEZZ_FRONT_Z;
  const len = x1 - x0;
  const depth = zW - zF;
  const top = MEZZ_LEVELS[MEZZ_LEVELS.length - 1];
  const box = () => new THREE.Color(BOX_COLORS[Math.floor(rnd() * BOX_COLORS.length)]);
  // puntos medios entre portones (lugares libres de bajadas)
  const mids = doorXs.slice(1).map((x, i) => (x + doorXs[i]) / 2);

  // Columnas en el borde del frente, entre portones (cada 2), y en los extremos
  const colXs = [x0 + 0.3, ...doorXs.filter((_, i) => i % 2 === 1).map((x) => x + DOCK_SPACING / 2), x1 - 0.3].filter(
    (x, i, arr) => i === 0 || x - arr[i - 1] > 1.5
  );
  for (const x of colXs) frame.push(mat(x, top / 2, zF + 0.3, 0.32, top, 0.32));

  MEZZ_LEVELS.forEach((ly, li) => {
    const floor = ly + DECK_T / 2;
    const isTop = li === MEZZ_LEVELS.length - 1;
    // vigas de borde y transversales
    frame.push(mat((x0 + x1) / 2, ly - 0.3, zF, len, 0.5, 0.18));
    for (const x of [x0, x1]) frame.push(mat(x, ly - 0.3, (zW + zF) / 2, 0.18, 0.5, depth));
    for (const x of colXs) frame.push(mat(x, ly - 0.32, (zW + zF) / 2, 0.22, 0.4, depth));
    // barandas: frente y costados
    frame.push(mat((x0 + x1) / 2, floor + RAIL_H, zF + 0.1, len, 0.06, 0.06));
    frame.push(mat((x0 + x1) / 2, floor + RAIL_H / 2, zF + 0.1, len, 0.04, 0.04));
    for (let x = x0 + 0.1; x <= x1; x += 1.6) frame.push(mat(x, floor + RAIL_H / 2, zF + 0.1, 0.05, RAIL_H, 0.05));
    for (const x of [x0 + 0.1, x1 - 0.1]) {
      frame.push(mat(x, floor + RAIL_H, (zW + zF) / 2, 0.06, 0.06, depth));
      for (let z = zF; z <= zW; z += 1.6) frame.push(mat(x, floor + RAIL_H / 2, z, 0.05, RAIL_H, 0.05));
    }
    // gabinetes contra incendio en las columnas
    for (let i = 1; i < colXs.length - 1; i += 2) red.push(mat(colXs[i], floor + 1.5, zF + 0.6, 0.8, 1.0, 0.25));

    if (isTop) {
      // banda pegada a la pared de portones, desde el extremo final hasta el caracol (lado 0101)
      const a = spiralCenter(x0).x;
      const b = x1 - 0.8;
      frame.push(mat((a + b) / 2, BELT_TOP - 0.06, BELT_Z, b - a, 0.1, 0.95));
      belt.push(mat((a + b) / 2, BELT_TOP, BELT_Z, b - a, 0.03, 0.8));
      for (const dz of [-0.45, 0.45]) frame.push(mat((a + b) / 2, BELT_TOP + 0.14, BELT_Z + dz, b - a, 0.05, 0.04));
      for (let x = a; x <= b; x += 2.2) for (const dz of [-0.4, 0.4]) frame.push(mat(x, floor + BELT_Y / 2, BELT_Z + dz, 0.06, BELT_Y, 0.06));
      // estaciones de trabajo junto al frente, entre bajadas
      mids.forEach((x, i) => {
        if (i % 2) return;
        frame.push(mat(x, floor + 0.75, zF + 2, 1.6, 0.06, 0.8));
        belt.push(mat(x, floor + 1.05, zF + 1.75, 0.55, 0.35, 0.05));
      });
    } else {
      // banda de distribución colgada debajo del primer piso: del caracol hasta la última bajada
      const a = spiralCenter(x0).x;
      const b = x1 + 0.3;
      frame.push(mat((a + b) / 2, LOW_BELT_Y - 0.06, LOW_BELT_Z, b - a, 0.1, 0.95));
      belt.push(mat((a + b) / 2, LOW_BELT_Y, LOW_BELT_Z, b - a, 0.03, 0.8));
      for (const dz of [-0.45, 0.45]) frame.push(mat((a + b) / 2, LOW_BELT_Y + 0.14, LOW_BELT_Z + dz, b - a, 0.05, 0.04));
      // colgantes desde la estructura del primer piso
      for (let x = a; x <= b; x += 2.2)
        for (const dz of [-0.45, 0.45]) frame.push(mat(x, LOW_BELT_Y + HANG / 2, LOW_BELT_Z + dz, 0.04, HANG, 0.04));
      // primer nivel: tableros eléctricos y tarimas entre bajadas
      mids.forEach((x, i) => {
        if (i % 3 === 0) panels.push(mat(x, floor + 1.0, zW - 0.5, 1.4, 2.0, 0.45));
        else {
          goods.push({ m: mat(x, floor + 0.08, zF + 3, 1.2, 0.15, 1.0), c: new THREE.Color('#a16207') });
          const h = 0.5 + rnd() * 0.9;
          goods.push({ m: mat(x, floor + 0.15 + h / 2, zF + 3, 1.1, h, 0.95), c: box() });
        }
      });
    }
  });

  // Bajadas: de la banda colgada hacia el interior, una por portón, al lado de su carril
  for (const door of doorXs) {
    const dx = chuteX(door);
    frame.push(mat(dx, CHUTE.cy - 0.08, CHUTE.cz, CHUTE_W + 0.1, 0.1, CHUTE.len, CHUTE.q));
    belt.push(mat(dx, CHUTE.cy, CHUTE.cz, CHUTE_W, 0.03, CHUTE.len, CHUTE.q));
    for (const s of [-1, 1]) frame.push(mat(dx + (s * (CHUTE_W + 0.08)) / 2, CHUTE.cy + 0.14, CHUTE.cz, 0.04, 0.05, CHUTE.len, CHUTE.q));
    // apoyo y mesa de recibo al pie, pasado el fondo del carril
    frame.push(mat(dx, CHUTE_END_Y / 2, CHUTE_END_Z + 0.3, CHUTE_W, CHUTE_END_Y, 0.08));
    frame.push(mat(dx, CHUTE_END_Y - 0.05, CHUTE_END_Z - 0.5, 1.0, 0.08, 1.2));
  }

  // Torre elevadora con contravientos en X: en el espacio libre después del último portón
  // (separación con el grupo siguiente), para no quedar dentro de un carril de estiba
  const tx = x1 + 3.7;
  const tz = zF + 2;
  const tw = 2.2;
  const th = top + 2.2;
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) frame.push(mat(tx + (dx * tw) / 2, th / 2, tz + (dz * tw) / 2, 0.14, th, 0.14));
  const seg = th / 4;
  for (let i = 0; i <= 4; i++) {
    const y = i * seg;
    for (const dz of [-1, 1]) frame.push(mat(tx, y, tz + (dz * tw) / 2, tw, 0.1, 0.1));
    for (const dx of [-1, 1]) frame.push(mat(tx + (dx * tw) / 2, y, tz, 0.1, 0.1, tw));
  }
  const diag = Math.hypot(tw, seg);
  const ang = Math.atan2(seg, tw);
  for (let i = 0; i < 4; i++) {
    const y = (i + 0.5) * seg;
    for (const s of [-1, 1]) {
      const qz = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, s * ang));
      const qx = new THREE.Quaternion().setFromEuler(new THREE.Euler(s * ang, 0, 0));
      for (const dz of [-1, 1]) frame.push(mat(tx, y, tz + (dz * tw) / 2, diag, 0.07, 0.07, qz));
      for (const dx of [-1, 1]) frame.push(mat(tx + (dx * tw) / 2, y, tz, 0.07, 0.07, diag, qx));
    }
  }

  // Escalera en zigzag en el costado final, perpendicular a los andenes (piso → 1 → 2),
  // también en el espacio libre después del último portón
  const flight = (fromY: number, toY: number, za: number, zb: number, x: number) => {
    const runZ = zb - za;
    const rise = toY - fromY;
    const l = Math.hypot(runZ, rise);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(rise, runZ), 0, 0));
    frame.push(mat(x, (fromY + toY) / 2, (za + zb) / 2, 1.1, 0.18, l, q));
    frame.push(mat(x + 0.55, (fromY + toY) / 2 + 1.0, (za + zb) / 2, 0.05, 0.05, l, q));
    for (let i = 1; i < 10; i++) belt.push(mat(x, fromY + (rise * i) / 10 + 0.1, za + (runZ * i) / 10, 1.1, 0.04, 0.25));
  };
  const sx = x1 + 0.8;
  flight(0, MEZZ_LEVELS[0], zF + 1, zW - 2, sx);
  frame.push(mat(sx + 0.6, MEZZ_LEVELS[0], zW - 1.3, 2.4, 0.18, 1.4));
  flight(MEZZ_LEVELS[0], MEZZ_LEVELS[1], zW - 2, zF + 1.5, sx + 1.2);

  return { frame, belt, red, panels, goods, tower: { x: tx, z: tz } };
}

/**
 * Cajas en movimiento: banda del último piso hacia 0101 → caracol → banda colgada debajo del
 * primer piso, de regreso → cada caja se desvía por la bajada de su portón hasta el piso.
 */
function ConveyorFlow({ x0, x1, doorXs }: { x0: number; x1: number; doorXs: number[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const boxes = useMemo(() => {
    const rnd = seeded(7);
    const c = spiralCenter(x0);
    const topLen = x1 - 0.9 - c.x;
    const out: { door: number; lowLen: number; total: number; offset: number; color: THREE.Color }[] = [];
    doorXs.forEach((dx) => {
      const cx = chuteX(dx);
      const lowLen = Math.max(0.1, cx - c.x);
      const total = topLen + SPIRAL_LEN + lowLen + CHUTE.len + 3; // + espera al pie antes de reaparecer
      for (let k = 0; k < BOXES_PER_CHUTE; k++) {
        out.push({
          door: cx,
          lowLen,
          total,
          offset: (k / BOXES_PER_CHUTE) * total + rnd() * 2,
          color: new THREE.Color(BOX_COLORS[Math.floor(rnd() * BOX_COLORS.length)]),
        });
      }
    });
    return { list: out, c, topLen, start: x1 - 0.9 };
  }, [x0, x1, doorXs]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    boxes.list.forEach((b, i) => mesh.setColorAt(i, b.color));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [boxes]);

  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(0.42, 0.34, 0.42) }),
    []
  );
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime * BELT_SPEED;
    const { c, topLen, start } = boxes;
    boxes.list.forEach((b, i) => {
      let d = (t + b.offset) % b.total;
      let q = q0;
      if (d < topLen) {
        tmp.p.set(start - d, BELT_TOP + 0.22, BELT_Z);
      } else if ((d -= topLen) < SPIRAL_LEN) {
        const f = d / SPIRAL_LEN;
        spiralPoint(c.x, c.z, f, tmp.p).y += 0.22;
        tmp.e.set(0, -(Math.PI / 2 + f * SPIRAL_TURNS * 2 * Math.PI), 0);
        q = tmp.q.setFromEuler(tmp.e);
      } else if ((d -= SPIRAL_LEN) < b.lowLen) {
        tmp.p.set(c.x + d, LOW_BELT_Y + 0.22, LOW_BELT_Z);
      } else {
        const f = Math.min(1, (d - b.lowLen) / CHUTE.len);
        tmp.p.set(b.door, LOW_BELT_Y + 0.22 - CHUTE.drop * f, CHUTE_START_Z - CHUTE.run * f);
        q = CHUTE.q;
      }
      tmp.m.compose(tmp.p, q, tmp.s);
      mesh.setMatrixAt(i, tmp.m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, boxes.list.length]} key={boxes.list.length} castShadow frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#ffffff" roughness={0.8} />
    </instancedMesh>
  );
}

/** Caracol: baja las cajas de la banda del último piso a la banda colgada debajo del primer piso. */
function Spiral({ x0 }: { x0: number }) {
  const c = spiralCenter(x0);
  const items = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    const n = 90;
    const p = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const a = Math.PI / 2 + f * SPIRAL_TURNS * 2 * Math.PI;
      spiralPoint(c.x, c.z, f, p);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0));
      out.push(mat(p.x, p.y - 0.06, p.z, 0.6, 0.08, 0.32, q));
    }
    return out;
  }, [c.x, c.z]);
  return (
    <group>
      <Boxes items={items} color="#e2e8f0" />
      <mesh position={[c.x, (LOW_BELT_Y + BELT_TOP) / 2, c.z]}>
        <cylinderGeometry args={[0.14, 0.14, BELT_TOP - LOW_BELT_Y + 0.6, 10]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
    </group>
  );
}

function Mezzanine({ layout, showLabel }: { layout: SiteLayout; showLabel: boolean }) {
  const m = layout.mezzanine;
  const doorXs = useMemo(
    () =>
      m
        ? [...layout.docks.values()]
            .map((d) => d.x)
            .filter((x) => x > m.x0 && x < m.x1)
            .sort((a, b) => a - b)
        : [],
    [layout.docks, m]
  );
  const data = useMemo(() => (m ? buildMezzanine(m.x0, m.x1, doorXs) : null), [m, doorXs]);
  const goods = useMemo(() => (data ? { m: data.goods.map((g) => g.m), c: data.goods.map((g) => g.c) } : null), [data]);
  if (!m || !data || !goods) return null;
  const len = m.x1 - m.x0;
  const depth = MEZZ_WALL_Z - MEZZ_FRONT_Z;
  const cx = (m.x0 + m.x1) / 2;
  const cz = (MEZZ_WALL_Z + MEZZ_FRONT_Z) / 2;

  return (
    <group position={[0, FLOOR_Y, 0]}>
      {/* entrepisos (semitransparentes para ver la descarga debajo) */}
      {MEZZ_LEVELS.map((ly) => (
        <mesh key={ly} position={[cx, ly, cz]} receiveShadow>
          <boxGeometry args={[len, DECK_T, depth]} />
          <meshStandardMaterial color="#cbd5e1" transparent opacity={0.55} depthWrite={false} roughness={0.85} />
        </mesh>
      ))}
      {/* malla de la torre elevadora */}
      <mesh position={[data.tower.x, (MEZZ_LEVELS[1] + 2.2) / 2, data.tower.z]}>
        <boxGeometry args={[2.1, MEZZ_LEVELS[1] + 2.2, 2.1]} />
        <meshStandardMaterial color="#94a3b8" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <Boxes items={data.frame} color={STEEL} />
      <Boxes items={data.belt} color="#475569" />
      <Boxes items={data.red} color="#dc2626" />
      <Boxes items={data.panels} color="#f8fafc" />
      <Boxes items={goods.m} colors={goods.c} />
      <Spiral x0={m.x0} />
      {doorXs.length > 0 && <ConveyorFlow x0={m.x0} x1={m.x1} doorXs={doorXs} />}

      {showLabel && (
        <Html position={[cx, MEZZ_LEVELS[1] + 3.2, MEZZ_FRONT_Z]} center distanceFactor={90} zIndexRange={[30, 10]} style={{ pointerEvents: 'none' }}>
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
            Mezzanine · 3 niveles
            <div style={{ fontWeight: 500, fontSize: 11, opacity: 0.85 }}>Banda en movimiento hacia 0101 · bajada en cada portón</div>
          </div>
        </Html>
      )}
    </group>
  );
}

export default memo(Mezzanine);
