import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { accessControlRect, FLOOR_Y, frontInnerWallZ, MIRROR_X, type SiteLayout } from '../lib/layout';

/**
 * Control de acceso del personal, contra la fachada frontal donde los racks 11–13 son más
 * cortos. Modelado según el video del sitio:
 *  - pared blanca con la puerta «SALIDA», el reloj marcador (BIT2) en la pared a su izquierda,
 *    pizarras («Bien Informados», días sin accidentes), banca de madera, basurero y extintor;
 *  - tapete negro frente a la puerta y escuadra verde en el piso;
 *  - pasillo separado del piso de bodega por malla electrosoldada sobre postes azules de rack,
 *    con el arco detector de metales Garrett en la abertura;
 *  - el oficial de seguridad en un escritorio abierto junto al arco, dentro de un encierro de
 *    malla alta, con monitor y detector manual.
 * Coordenadas locales: fachada en z = 0, hacia el interior z+.
 */

const POST_BLUE = '#1e40af';
const WALL_WHITE = '#f1f5f4';
const FENCE_Z = 3.2;

/* ─────────────────────────────── Texturas ─────────────────────────────── */

const texCache = new Map<string, THREE.Texture>();

/** Malla electrosoldada: celdas de 5 × 20 cm, fondo transparente. */
function meshTexture() {
  const key = 'mesh';
  let t = texCache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 64;
    const g = c.getContext('2d')!;
    g.strokeStyle = '#d4d8dd';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(1, 0);
    g.lineTo(1, 64);
    g.moveTo(0, 1);
    g.lineTo(16, 1);
    g.stroke();
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(key, t);
  }
  return t;
}

/** Letrero o pizarra dibujado en un canvas. */
function canvasTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  let t = texCache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(key, t);
  }
  return t;
}

const signSalida = () =>
  canvasTexture('salida', 256, 80, (g) => {
    g.fillStyle = '#15803d';
    g.fillRect(0, 0, 256, 80);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4;
    g.strokeRect(5, 5, 246, 70);
    g.fillStyle = '#ffffff';
    g.font = 'bold 46px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SALIDA', 128, 42);
  });

const signEmergencia = () =>
  canvasTexture('emergencia', 256, 96, (g) => {
    g.fillStyle = '#15803d';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#ffffff';
    g.font = 'bold 26px system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('SALIDA DE', 14, 32);
    g.fillText('EMERGENCIA', 14, 66);
    g.beginPath();
    g.moveTo(200, 30);
    g.lineTo(236, 48);
    g.lineTo(200, 66);
    g.closePath();
    g.fill();
  });

const boardSeguridad = () =>
  canvasTexture('seguridad', 200, 340, (g) => {
    g.fillStyle = '#eef2f4';
    g.fillRect(0, 0, 200, 340);
    g.fillStyle = '#15803d';
    g.font = 'bold 30px system-ui, sans-serif';
    g.fillText('OLO', 20, 44);
    g.fillStyle = '#334155';
    g.font = '13px system-ui, sans-serif';
    g.fillText('Seguridad y Salud', 84, 30);
    g.fillText('Laboral', 84, 46);
    g.fillText('Accidentabilidad OLO', 20, 84);
    const cells: [number, number, string][] = [
      [24, 110, '01'],
      [110, 110, '01'],
      [24, 175, '015'],
      [110, 175, '231'],
    ];
    for (const [x, y, v] of cells) {
      g.fillStyle = '#ffffff';
      g.fillRect(x, y, 70, 46);
      g.strokeStyle = '#94a3b8';
      g.strokeRect(x, y, 70, 46);
      g.fillStyle = '#0f172a';
      g.font = 'bold 28px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(v, x + 35, y + 33);
      g.textAlign = 'left';
    }
    g.fillStyle = '#dc2626';
    g.fillRect(24, 245, 60, 60);
    g.fillStyle = '#16a34a';
    g.fillRect(110, 245, 60, 60);
  });

const boardInformados = () =>
  canvasTexture('informados', 320, 300, (g) => {
    g.fillStyle = '#f4f6f7';
    g.fillRect(0, 0, 320, 300);
    g.fillStyle = '#1f2937';
    g.font = 'bold 28px Georgia, serif';
    g.fillText('Bien Informados', 26, 44);
    const colors = ['#cbd5e1', '#a7f3d0', '#fde68a', '#bfdbfe', '#fecaca', '#ddd6fe'];
    for (let i = 0; i < 6; i++) {
      const x = 30 + (i % 2) * 140;
      const y = 70 + Math.floor(i / 2) * 74;
      g.fillStyle = '#ffffff';
      g.fillRect(x, y, 120, 62);
      g.fillStyle = colors[i];
      g.fillRect(x + 8, y + 8, 104, 30);
      g.fillStyle = '#94a3b8';
      g.fillRect(x + 8, y + 44, 80, 5);
    }
  });

const posterEpp = () =>
  canvasTexture('epp', 160, 120, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 160, 120);
    g.fillStyle = '#334155';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
      g.fillStyle = (r + c) % 3 ? '#475569' : '#b91c1c';
      g.beginPath();
      g.arc(18 + c * 25, 22 + r * 25, 7, 0, Math.PI * 2);
      g.fill();
    }
  });

/* ─────────────────────────────── Piezas ─────────────────────────────── */

/** Cuadro plano pegado a la pared (letreros, pizarras). */
function WallPanel({ x, y, w, h, map, z = 0.03 }: { x: number; y: number; w: number; h: number; map: THREE.Texture; z?: number }) {
  return (
    <mesh position={[x, y, z]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={map} roughness={0.35} />
    </mesh>
  );
}

/** Poste de rack azul con su placa de anclaje. */
function BluePost({ x, z, h }: { x: number; z: number; h: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[0.08, h, 0.07]} />
        <meshStandardMaterial color={POST_BLUE} metalness={0.3} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[0.16, 0.02, 0.14]} />
        <meshStandardMaterial color={POST_BLUE} metalness={0.3} roughness={0.45} />
      </mesh>
    </group>
  );
}

/** Tramo de malla electrosoldada entre postes azules, a lo largo de x o de z. */
function Fence({ from, to, at, along, h }: { from: number; to: number; at: number; along: 'x' | 'z'; h: number }) {
  const len = Math.abs(to - from);
  const mid = (from + to) / 2;
  const tex = useMemo(() => {
    const t = meshTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(len / 0.05, h / 0.2);
    return t;
  }, [len, h]);
  const nPosts = Math.max(1, Math.round(len / 2.5));
  const posts = Array.from({ length: nPosts + 1 }, (_, i) => from + ((to - from) * i) / nPosts);
  return (
    <group>
      <mesh position={along === 'x' ? [mid, h / 2 + 0.04, at] : [at, h / 2 + 0.04, mid]} rotation={[0, along === 'x' ? 0 : Math.PI / 2, 0]}>
        <planeGeometry args={[len, h]} />
        <meshStandardMaterial map={tex} transparent alphaTest={0.25} side={THREE.DoubleSide} metalness={0.6} roughness={0.4} />
      </mesh>
      {posts.map((p, i) => (
        <BluePost key={i} x={along === 'x' ? p : at} z={along === 'x' ? at : p} h={h + 0.15} />
      ))}
    </group>
  );
}

/** Persona sin casco (personal de oficina / operación) con camisa y pantalón. */
function Staff({
  shirt,
  pants = '#1f2937',
  skin = '#a5714b',
  hair = '#1c1917',
  seated = false,
  armUp = false,
}: {
  shirt: string;
  pants?: string;
  skin?: string;
  hair?: string;
  seated?: boolean;
  armUp?: boolean;
}) {
  const hip = seated ? 0.5 : 0.88;
  return (
    <group>
      {[-0.1, 0.1].map((x) =>
        seated ? (
          <group key={x}>
            <mesh position={[x, hip, 0.22]} castShadow>
              <boxGeometry args={[0.15, 0.15, 0.45]} />
              <meshStandardMaterial color={pants} />
            </mesh>
            <mesh position={[x, 0.25, 0.42]} castShadow>
              <boxGeometry args={[0.14, 0.5, 0.15]} />
              <meshStandardMaterial color={pants} />
            </mesh>
          </group>
        ) : (
          <mesh key={x} position={[x, hip / 2, 0]} castShadow>
            <boxGeometry args={[0.15, hip, 0.17]} />
            <meshStandardMaterial color={pants} />
          </mesh>
        )
      )}
      <mesh position={[0, hip + 0.3, 0]} castShadow>
        <boxGeometry args={[0.44, 0.6, 0.25]} />
        <meshStandardMaterial color={shirt} roughness={0.85} />
      </mesh>
      {[-0.28, 0.28].map((x) => (
        <mesh
          key={x}
          position={[x, hip + (armUp && x > 0 ? 0.42 : 0.28), armUp && x > 0 ? 0.2 : seated ? 0.15 : 0]}
          rotation={[armUp && x > 0 ? -1.3 : seated ? -0.9 : 0, 0, 0]}
          castShadow
        >
          <boxGeometry args={[0.11, 0.56, 0.12]} />
          <meshStandardMaterial color={shirt} roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, hip + 0.74, 0]} castShadow>
        <sphereGeometry args={[0.12, 14, 12]} />
        <meshStandardMaterial color={skin} roughness={0.7} />
      </mesh>
      <mesh position={[0, hip + 0.79, -0.01]}>
        <sphereGeometry args={[0.125, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={hair} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Arco detector de metales Garrett: paneles gris claro, travesaño y franjas de luz verde. */
function MetalArch({ x, z }: { x: number; z: number }) {
  const GAP = 0.76;
  const H = 2.25;
  const T = 0.12;
  const DEPTH = 0.58;
  const body = <meshStandardMaterial color="#b9bec4" metalness={0.25} roughness={0.45} />;
  return (
    <group position={[x, 0, z]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[(s * (GAP + T)) / 2, 0, 0]}>
          <mesh position={[0, H / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[T, H, DEPTH]} />
            {body}
          </mesh>
          {/* zonas de detección (LED verdes) en el canto interior */}
          {[0.35, 0.95, 1.55].map((y) => (
            <mesh key={y} position={[-s * (T / 2 + 0.002), y, DEPTH / 2 - 0.06]} rotation={[0, (-s * Math.PI) / 2, 0]}>
              <planeGeometry args={[0.03, 0.18]} />
              <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2.2} />
            </mesh>
          ))}
          <mesh position={[0, 0.015, 0]}>
            <boxGeometry args={[T + 0.06, 0.03, DEPTH + 0.04]} />
            <meshStandardMaterial color="#6b7280" />
          </mesh>
        </group>
      ))}
      {/* travesaño con el tablero */}
      <mesh position={[0, H + 0.07, 0]} castShadow>
        <boxGeometry args={[GAP + 2 * T + 0.04, 0.14, DEPTH + 0.04]} />
        {body}
      </mesh>
      <mesh position={[0, H + 0.07, DEPTH / 2 + 0.03]}>
        <planeGeometry args={[0.5, 0.08]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0.18, H + 0.07, DEPTH / 2 + 0.032]}>
        <planeGeometry args={[0.08, 0.04]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

/** Detector manual (paleta negra) sobre el escritorio. */
function HandWand({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]} rotation={[0, 0.4, Math.PI / 2]}>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.18, 8]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.08, 0.22, 0.025]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
    </group>
  );
}

/** Escritorio abierto del oficial: mesa blanca, monitor, teclado, paleta y papeles. */
function GuardDesk({ x, z }: { x: number; z: number }) {
  const W = 1.7;
  const D = 0.75;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[W, 0.04, D]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.5} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[(sx * (W - 0.1)) / 2, 0.37, (sz * (D - 0.1)) / 2]}>
            <boxGeometry args={[0.04, 0.74, 0.04]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.5} />
          </mesh>
        ))
      )}
      {/* monitor mirando al oficial (hacia la pared) */}
      <mesh position={[0.45, 1.02, 0.2]} castShadow>
        <boxGeometry args={[0.5, 0.32, 0.03]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0.45, 1.02, 0.183]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.46, 0.28]} />
        <meshStandardMaterial color="#1d4ed8" emissive="#3b82f6" emissiveIntensity={0.9} />
      </mesh>
      <mesh position={[0.45, 0.83, 0.22]}>
        <boxGeometry args={[0.04, 0.14, 0.04]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0.4, 0.78, -0.02]}>
        <boxGeometry args={[0.42, 0.02, 0.14]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {/* caja negra, bandeja con papeles y la paleta */}
      <mesh position={[-0.55, 0.81, 0.15]} castShadow>
        <boxGeometry args={[0.32, 0.08, 0.24]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[-0.15, 0.79, 0.18]}>
        <boxGeometry args={[0.3, 0.04, 0.22]} />
        <meshStandardMaterial color="#d97706" />
      </mesh>
      <mesh position={[-0.15, 0.815, 0.18]}>
        <boxGeometry args={[0.26, 0.01, 0.2]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <HandWand x={0.05} y={0.79} z={-0.15} />
    </group>
  );
}

function OfficeChair({ x, z, rot = 0 }: { x: number; z: number; rot?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh position={[0, 0.46, 0]}>
        <boxGeometry args={[0.46, 0.07, 0.46]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0, 0.8, -0.22]}>
        <boxGeometry args={[0.44, 0.55, 0.06]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.42, 8]} />
        <meshStandardMaterial color="#4b5563" metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.04, 5]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
    </group>
  );
}

/** Banca de reglas de madera con patas negras. */
function Bench({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 0.45, -0.15 + i * 0.1]} castShadow>
          <boxGeometry args={[1.4, 0.035, 0.08]} />
          <meshStandardMaterial color="#b45309" roughness={0.6} />
        </mesh>
      ))}
      {[-0.6, 0.6].map((dx) => (
        <mesh key={dx} position={[dx, 0.22, 0]}>
          <boxGeometry args={[0.05, 0.44, 0.36]} />
          <meshStandardMaterial color="#9a3412" />
        </mesh>
      ))}
    </group>
  );
}

/** Reloj marcador BIT2 montado en la pared, con pantalla y lector de huella. */
function TimeClock({ x }: { x: number }) {
  return (
    <group position={[x, 1.35, 0.06]}>
      <mesh castShadow>
        <boxGeometry args={[0.2, 0.26, 0.07]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      <mesh position={[0, 0.04, 0.036]}>
        <planeGeometry args={[0.13, 0.1]} />
        <meshStandardMaterial color="#0ea5e9" emissive="#38bdf8" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, -0.08, 0.037]}>
        <planeGeometry args={[0.05, 0.04]} />
        <meshStandardMaterial color="#16a34a" emissive="#22c55e" emissiveIntensity={1.2} />
      </mesh>
      {/* cable hacia arriba */}
      <mesh position={[0.07, 0.3, -0.01]}>
        <boxGeometry args={[0.015, 0.36, 0.015]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
    </group>
  );
}

/** Puerta peatonal blanca con marco, ventanilla y el letrero «SALIDA» encima. */
function ExitDoor({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 1.1, 0.04]}>
        <boxGeometry args={[1.12, 2.24, 0.06]} />
        <meshStandardMaterial color="#d1d5db" />
      </mesh>
      <mesh position={[0, 1.08, 0.07]}>
        <boxGeometry args={[0.98, 2.14, 0.04]} />
        <meshStandardMaterial color="#f3f4f6" roughness={0.6} />
      </mesh>
      <mesh position={[-0.12, 1.55, 0.095]}>
        <planeGeometry args={[0.12, 0.42]} />
        <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.15} />
      </mesh>
      <mesh position={[0.36, 1.0, 0.11]}>
        <boxGeometry args={[0.14, 0.03, 0.04]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
      </mesh>
      <WallPanel x={-0.1} y={2.55} w={0.5} h={0.16} map={signSalida()} z={0.05} />
    </group>
  );
}

/* ─────────────────────────────── Letrero ─────────────────────────────── */

const LABEL_KEY = 'p3d.accessLabel.v1';
/** Cuánto se puede alejar el letrero de la zona (px) */
const MAX_DX = 220;
const MAX_UP = 240;
const MAX_DOWN = 80;

interface LabelPrefs {
  x: number;
  y: number;
  collapsed: boolean;
}

function loadLabelPrefs(): LabelPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(LABEL_KEY) ?? 'null') as LabelPrefs | null;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y, collapsed: !!p.collapsed };
  } catch {
    /* sin almacenamiento */
  }
  return { x: 0, y: -90, collapsed: false };
}

/**
 * Letrero del control de acceso: tamaño fijo en pantalla, unido a la zona con una línea.
 * Se arrastra para moverlo (sin alejarse demasiado) y con un clic se achica a un ícono.
 * Doble clic: vuelve a su lugar.
 */
function AccessLabel({ position, info }: { position: [number, number, number]; info?: string | null }) {
  const [prefs, setPrefs] = useState<LabelPrefs>(loadLabelPrefs);
  const drag = useRef<{ sx: number; sy: number; x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LABEL_KEY, JSON.stringify(prefs));
    } catch {
      /* sin almacenamiento */
    }
  }, [prefs]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, x: prefs.x, y: prefs.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    setPrefs((p) => ({
      ...p,
      x: Math.max(-MAX_DX, Math.min(MAX_DX, d.x + dx)),
      y: Math.max(-MAX_UP, Math.min(MAX_DOWN, d.y + dy)),
    }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (d && !d.moved) setPrefs((p) => ({ ...p, collapsed: !p.collapsed }));
  };

  const { x, y, collapsed } = prefs;
  return (
    <Html position={position} zIndexRange={[30, 10]} style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'relative', width: 0, height: 0 }}>
        <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} width="1" height="1">
          <line x1={0} y1={0} x2={x} y2={y} stroke="rgba(15,23,42,0.75)" strokeWidth={1.5} strokeDasharray="3 3" />
          <circle cx={0} cy={0} r={4} fill="#22c55e" stroke="#fff" strokeWidth={1.5} />
        </svg>
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setPrefs({ x: 0, y: -90, collapsed: false });
          }}
          title={collapsed ? 'Control de acceso · clic para ver el detalle' : 'Arrastrá para mover · clic para achicar · doble clic: volver a su lugar'}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto',
            cursor: drag.current?.moved ? 'grabbing' : 'grab',
            userSelect: 'none',
            touchAction: 'none',
            background: 'rgba(15,23,42,0.88)',
            color: '#fff',
            padding: collapsed ? '3px 7px' : '4px 10px',
            borderRadius: collapsed ? 999 : 8,
            font: '600 12px system-ui, sans-serif',
            whiteSpace: 'nowrap',
            textAlign: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          }}
        >
          {collapsed ? (
            '🛡️'
          ) : (
            <>
              🛡️ Control de acceso · reloj marcador
              {info && <div style={{ fontWeight: 500, fontSize: 11, opacity: 0.85 }}>{info}</div>}
            </>
          )}
        </div>
      </div>
    </Html>
  );
}

/* ─────────────────────────────── Conjunto ─────────────────────────────── */

function AccessControl({ layout, showLabel, info }: { layout: SiteLayout; showLabel: boolean; info?: string | null }) {
  const r = accessControlRect(layout);
  if (!r) return null;
  const cx = (r.x0 + r.x1) / 2;
  // La escena está reflejada en x; este grupo lo deshace para que la zona se vea como en el sitio
  // (mirando la pared desde adentro: reloj a la izquierda de la puerta, oficial a la derecha) y los
  // letreros se lean bien. Posiciones a lo largo de la pared, tomando la puerta como referencia.
  const D = MIRROR_X * cx - 1.5;
  const archX = D + 3.25;

  return (
    // apoyado en la pared del frente: la cara de las oficinas (la puerta «SALIDA» da a ellas) o la fachada
    <group position={[0, FLOOR_Y, frontInnerWallZ(layout, cx) + 0.01]} scale={[MIRROR_X, 1, 1]}>
      {/* ── Pared: puerta, reloj, pizarras y letreros ── */}
      <mesh position={[D + 1.5, 1.6, 0.01]} receiveShadow>
        <planeGeometry args={[11, 3.2]} />
        <meshStandardMaterial color={WALL_WHITE} roughness={0.9} />
      </mesh>
      <ExitDoor x={D} />
      <TimeClock x={D - 1.35} />
      <WallPanel x={D - 3.0} y={1.6} w={1.25} h={1.15} map={boardInformados()} />
      <WallPanel x={D + 1.25} y={1.75} w={0.62} h={1.05} map={boardSeguridad()} />
      <WallPanel x={D + 2.15} y={1.85} w={0.62} h={0.46} map={posterEpp()} />
      {/* lector de tarjeta y botón rojo junto a la puerta */}
      <mesh position={[D + 0.72, 1.45, 0.04]}>
        <boxGeometry args={[0.09, 0.12, 0.03]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[D + 0.72, 1.22, 0.04]}>
        <boxGeometry args={[0.07, 0.07, 0.03]} />
        <meshStandardMaterial color="#b91c1c" />
      </mesh>
      {/* gabinete del extintor y salida de emergencia (dentro del encierro del oficial) */}
      <mesh position={[D + 3.95, 1.3, 0.12]} castShadow>
        <boxGeometry args={[0.36, 0.62, 0.2]} />
        <meshStandardMaterial color="#dc2626" roughness={0.4} />
      </mesh>
      <WallPanel x={D + 3.95} y={1.95} w={0.5} h={0.19} map={signEmergencia()} />

      {/* ── Piso: tapete negro y escuadra verde ── */}
      <mesh position={[D + 1.1, 0.012, 1.75]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3.0, 2.3]} />
        <meshStandardMaterial color="#26292d" roughness={0.98} />
      </mesh>
      {(
        [
          [D - 1.6, 2.0, 0.1, 2.0],
          [D - 2.5, 3.0, 1.9, 0.1],
        ] as [number, number, number, number][]
      ).map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.022, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color="#22c55e" roughness={0.6} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}

      {/* ── Mobiliario junto a la pared ── */}
      <Bench x={D + 2.35} z={0.32} />
      <mesh position={[D + 1.05, 0.33, 0.28]} castShadow>
        <cylinderGeometry args={[0.2, 0.17, 0.66, 14]} />
        <meshStandardMaterial color="#6b7280" roughness={0.5} />
      </mesh>
      <mesh position={[D + 0.65, 0.22, 0.3]} castShadow>
        <boxGeometry args={[0.36, 0.44, 0.34]} />
        <meshStandardMaterial color="#c08a52" roughness={0.9} />
      </mesh>

      {/* ── Pasillo: malla baja con postes azules y el arco en la abertura ── */}
      <Fence from={D - 3.6} to={archX - 0.55} at={FENCE_Z} along="x" h={1.25} />
      <MetalArch x={archX} z={FENCE_Z} />

      {/* ── Encierro del oficial: malla alta, escritorio abierto junto al arco ── */}
      <Fence from={archX + 0.55} to={D + 6.6} at={FENCE_Z} along="x" h={2.6} />
      <Fence from={0.05} to={FENCE_Z} at={D + 6.6} along="z" h={2.6} />
      {/* equipo colgado en la malla (arneses y chalecos) */}
      {(
        [
          [D + 6.55, 1.9, 1.0, '#dc2626'],
          [D + 6.55, 1.75, 1.45, '#facc15'],
          [D + 6.55, 1.95, 1.9, '#dc2626'],
        ] as [number, number, number, string][]
      ).map(([x, y, z, c], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, Math.PI / 2, 0]} castShadow>
          <boxGeometry args={[0.32, 0.55, 0.06]} />
          <meshStandardMaterial color={c} roughness={0.7} />
        </mesh>
      ))}
      <GuardDesk x={D + 5.0} z={2.1} />
      <OfficeChair x={D + 5.0} z={1.25} />
      <group position={[D + 5.0, 0, 1.3]}>
        <Staff shirt="#f8fafc" pants="#1e293b" skin="#a5714b" seated />
      </group>
      {/* chaqueta colgada en el respaldo */}
      <mesh position={[D + 4.55, 0.85, 1.05]} castShadow>
        <boxGeometry args={[0.3, 0.55, 0.12]} />
        <meshStandardMaterial color="#1e3a5f" roughness={0.9} />
      </mesh>

      {/* ── Personal: uno marcando en el reloj y otro cruzando el arco ── */}
      <group position={[D - 0.95, 0, 0.6]} rotation={[0, Math.PI - 0.5, 0]}>
        <Staff shirt="#3ecf9a" pants="#64748b" armUp />
      </group>
      <group position={[archX, 0, FENCE_Z + 0.9]} rotation={[0, Math.PI, 0]}>
        <Staff shirt="#1f3b2d" pants="#1e3a8a" skin="#c68642" hair="#3f2a1d" />
      </group>

      {showLabel && <AccessLabel position={[archX, 2.6, FENCE_Z]} info={info} />}
    </group>
  );
}

export default memo(AccessControl);
