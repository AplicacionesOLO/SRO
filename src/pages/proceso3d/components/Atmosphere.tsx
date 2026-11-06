import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer, Sky, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { FENCE_Z, FLOOR_Y, FRONT_Z, BLVD_Z, type SiteLayout } from '../lib/layout';
import { skyDirection, smoothstep, sunPosition } from '../lib/sky';
import type { WeatherHour } from '../lib/weather';

/**
 * Vista realista: sol según la hora y la ubicación del almacén, noche con luces encendidas,
 * nubes, lluvia, neblina y piso mojado según el clima de esa hora.
 */

export interface AtmosphereState {
  lat: number;
  lng: number;
  /** Hora que se está viendo (tiempo real o la del recorrido) */
  time: number;
  weather: WeatherHour | null;
}

export interface AtmosphereLook {
  /** 0 = de día, 1 = de noche */
  night: number;
  day: number;
  /** luz de amanecer / atardecer */
  golden: number;
  cloud: number;
  rain: number;
  wet: number;
  mist: number;
  storm: boolean;
  wind: number;
  sunDir: [number, number, number];
  elevationDeg: number;
}

export function computeLook(a: AtmosphereState): AtmosphereLook {
  const { elevation, azimuth } = sunPosition(a.time, a.lat, a.lng);
  const el = (elevation * 180) / Math.PI;
  const w = a.weather;
  const cloud = w ? w.cloud / 100 : 0.15;
  const rain = w ? Math.min(1, w.precip / 4) : 0;
  return {
    night: 1 - smoothstep(-9, 1, el),
    day: smoothstep(-3, 10, el),
    golden: smoothstep(-4, 3, el) * (1 - smoothstep(6, 22, el)),
    cloud,
    rain: w && w.precip >= 0.1 ? Math.max(0.15, rain) : 0,
    wet: w ? Math.min(1, (w.precip + w.recentPrecip * 0.5) / 1.5) : 0,
    mist: w && (w.code === 45 || w.code === 48) ? 1 : 0,
    storm: !!w && w.code >= 95,
    wind: w ? w.wind : 5,
    sunDir: skyDirection(elevation, azimuth),
    elevationDeg: el,
  };
}

const NightContext = createContext(0);
export const NightProvider = NightContext.Provider;
/** 0 = de día, 1 = de noche (siempre 0 con la vista realista apagada) */
export const useNight = () => useContext(NightContext);

/* ─────────────────────────────── Texturas ─────────────────────────────── */

let poolTex: THREE.Texture | null = null;
/** Mancha de luz suave para el piso (círculo con borde difuso). */
export function lightPoolTexture() {
  if (poolTex) return poolTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  poolTex = new THREE.CanvasTexture(c);
  poolTex.colorSpace = THREE.SRGBColorSpace;
  return poolTex;
}

let cloudTex: THREE.Texture | null = null;
function cloudTexture() {
  if (cloudTex) return cloudTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  // varias manchas superpuestas = nube esponjosa
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = 50 + rnd() * 156;
    const y = 90 + rnd() * 80;
    const r = 30 + rnd() * 45;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  }
  cloudTex = new THREE.CanvasTexture(c);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  return cloudTex;
}

/** Charco de luz en el piso (de noche); se usa en postes, andenes e interior. */
export function LightPool({
  position,
  radius,
  intensity,
  color = '#ffd59a',
}: {
  position: [number, number, number];
  radius: number;
  intensity: number;
  color?: string;
}) {
  if (intensity <= 0.02) return null;
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <meshBasicMaterial
        map={lightPoolTexture()}
        color={color}
        transparent
        opacity={intensity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ─────────────────────────────── Cielo y luces (coordenadas del mundo) ─────────────────────────────── */

const C = (hex: string) => new THREE.Color(hex);
const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.min(1, Math.max(0, t)));

export function AtmosphereSky({ look, span }: { look: AtmosphereLook; span: number }) {
  const hemi = useRef<THREE.HemisphereLight>(null);
  const { night, day, golden, cloud, rain, mist, storm, sunDir } = look;

  const colors = useMemo(() => {
    let bg = mix(C('#cfe3f1'), C('#a7b2bd'), cloud * 0.9);
    bg = mix(bg, C('#f3b98c'), golden * 0.55 * (1 - cloud * 0.6));
    bg = mix(bg, C('#0b1426'), night);
    let fog = mix(C('#d8e7f2'), C('#b4bcc4'), Math.max(cloud * 0.8, rain));
    fog = mix(fog, C('#f1c7a1'), golden * 0.4);
    fog = mix(fog, C('#0e1729'), night);
    const sun = mix(C('#fff7ed'), C('#ffad66'), golden);
    const sky = mix(mix(C('#f8fafc'), C('#cbd5e1'), cloud), C('#33456b'), night);
    const ground = mix(C('#6b8f55'), C('#1c2433'), night);
    return { bg: `#${bg.getHexString()}`, fog: `#${fog.getHexString()}`, sun: `#${sun.getHexString()}`, sky, ground };
  }, [night, golden, cloud, rain]);

  // Luz principal: el sol de día, la luna de noche (una sola luz con sombra)
  const isSun = day > 0.12;
  const keyDir: [number, number, number] = isSun
    ? sunDir
    : (() => {
        // luna: opuesta al sol, siempre arriba del horizonte
        const v = new THREE.Vector3(-sunDir[0], Math.max(0.55, -sunDir[1]), -sunDir[2]).normalize();
        return [v.x, v.y, v.z];
      })();
  const keyIntensity = isSun ? 2.3 * day * (1 - 0.72 * cloud) * (1 - 0.3 * rain) : 0.45 * night * (1 - 0.6 * cloud);
  const hemiIntensity = 0.22 + 0.22 * day + 0.1 * cloud;
  const far = span * 4.5 * (1 - 0.45 * rain) * (1 - 0.65 * mist);
  const near = span * (mist ? 0.25 : 1.5 * (1 - 0.5 * rain));

  // Relámpagos en tormenta
  const flash = useRef(0);
  useFrame((_, dt) => {
    const h = hemi.current;
    if (!h) return;
    if (storm && Math.random() < dt * 0.12) flash.current = 1;
    flash.current = Math.max(0, flash.current - dt * 3.5);
    h.intensity = hemiIntensity + flash.current * 4 * (0.6 + Math.random() * 0.4);
  });

  const showSky = cloud < 0.9 && look.elevationDeg > -8;
  const sunPos = sunDir.map((v) => v * 4000) as [number, number, number];

  return (
    <>
      <color attach="background" args={[colors.bg]} />
      <fog attach="fog" args={[colors.fog, near, far]} />
      {showSky && (
        <Sky
          distance={4500}
          sunPosition={sunPos}
          turbidity={4 + 10 * cloud}
          rayleigh={0.6 + 2.2 * golden + 0.6 * (1 - day)}
          mieCoefficient={0.004 + 0.01 * cloud}
          mieDirectionalG={0.8}
        />
      )}
      {night > 0.55 && cloud < 0.85 && <Stars radius={900} depth={250} count={4000} factor={7} saturation={0} fade speed={0.2} />}
      {night > 0.4 && cloud < 0.9 && (
        <mesh position={keyDir.map((v) => v * 1400) as [number, number, number]}>
          <sphereGeometry args={[22, 24, 16]} />
          <meshBasicMaterial color="#f1f5f9" fog={false} toneMapped={false} />
        </mesh>
      )}
      <Environment resolution={128} frames={1} environmentIntensity={0.15 + 0.55 * day}>
        <Lightformer form="rect" intensity={2} position={[0, 60, 0]} rotation-x={Math.PI / 2} scale={[200, 200, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#bfdbfe" position={[-100, 30, 0]} rotation-y={Math.PI / 2} scale={[200, 60, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#fde68a" position={[100, 30, 0]} rotation-y={-Math.PI / 2} scale={[200, 60, 1]} />
      </Environment>
      <hemisphereLight ref={hemi} args={[colors.sky, colors.ground, hemiIntensity]} />
      <directionalLight
        position={keyDir.map((v) => v * 250) as [number, number, number]}
        intensity={keyIntensity}
        color={isSun ? colors.sun : '#b8c8ff'}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-span * 0.7}
        shadow-camera-right={span * 0.7}
        shadow-camera-top={span * 0.7}
        shadow-camera-bottom={-span * 0.7}
        shadow-camera-near={10}
        shadow-camera-far={650}
      />
      {cloud > 0.08 && <Clouds look={look} span={span} />}
    </>
  );
}

function Clouds({ look, span }: { look: AtmosphereLook; span: number }) {
  const group = useRef<THREE.Group>(null);
  const count = Math.round(6 + look.cloud * 38);
  const items = useMemo(() => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 44 }, () => ({
      x: (rnd() - 0.5) * span * 3.2,
      z: (rnd() - 0.5) * span * 3.2,
      y: 150 + rnd() * 90,
      s: 90 + rnd() * 120,
    }));
  }, [span]);
  const color = useMemo(() => {
    let c = mix(C('#ffffff'), C('#8e98a3'), look.cloud * 0.8 + look.rain * 0.3);
    c = mix(c, C('#f6c39b'), look.golden * 0.5);
    c = mix(c, C('#1b2333'), look.night);
    return c;
  }, [look.cloud, look.rain, look.golden, look.night]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const v = (2 + look.wind * 0.35) * Math.min(dt, 0.1);
    const lim = span * 1.6;
    for (const s of g.children) {
      s.position.x += v;
      if (s.position.x > lim) s.position.x -= lim * 2;
    }
  });

  return (
    <group ref={group}>
      {items.slice(0, count).map((c, i) => (
        <sprite key={i} position={[c.x, c.y, c.z]} scale={[c.s, c.s * 0.5, 1]}>
          <spriteMaterial map={cloudTexture()} color={color} transparent opacity={0.5 + 0.4 * look.cloud} depthWrite={false} fog={false} />
        </sprite>
      ))}
    </group>
  );
}

/* ─────────────────────────────── Lluvia, piso mojado y luces de noche (coordenadas lógicas) ─────────────────────────────── */

/** Rectángulos del sitio fuera del edificio (en x lógico), para lluvia y piso mojado. */
function outdoorRects(layout: SiteLayout) {
  const x0 = layout.streetX;
  const x1 = layout.eastRoadX;
  const zBack = FENCE_Z + 4;
  const zFront = BLVD_Z - 8;
  return [
    { x0, x1, z0: 0, z1: zBack },
    { x0, x1, z0: zFront, z1: FRONT_Z },
    { x0, x1: layout.xWest, z0: FRONT_Z, z1: 0 },
    { x0: layout.xEast, x1, z0: FRONT_Z, z1: 0 },
  ].filter((r) => r.x1 - r.x0 > 0.5 && Math.abs(r.z1 - r.z0) > 0.5);
}

function WetGround({ layout, wet }: { layout: SiteLayout; wet: number }) {
  const rects = useMemo(() => outdoorRects(layout), [layout]);
  return (
    <>
      {rects.map((r, i) => (
        <mesh key={i} position={[(r.x0 + r.x1) / 2, 0.035, (r.z0 + r.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[r.x1 - r.x0, Math.abs(r.z1 - r.z0)]} />
          <meshStandardMaterial
            color="#1e293b"
            transparent
            opacity={0.28 * wet}
            roughness={0.06}
            metalness={0.2}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>
      ))}
    </>
  );
}

function Rain({ layout, rain, wind }: { layout: SiteLayout; rain: number; wind: number }) {
  const HEIGHT = 70;
  const count = Math.round(1500 + rain * 5500);
  const { geom, drops } = useMemo(() => {
    const rects = outdoorRects(layout);
    const areas = rects.map((r) => (r.x1 - r.x0) * Math.abs(r.z1 - r.z0));
    const total = areas.reduce((a, b) => a + b, 0);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const d = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      let pick = rnd() * total;
      let k = 0;
      while (k < rects.length - 1 && pick > areas[k]) pick -= areas[k++];
      const r = rects[k];
      d[i * 3] = r.x0 + rnd() * (r.x1 - r.x0);
      d[i * 3 + 1] = rnd() * HEIGHT;
      d[i * 3 + 2] = Math.min(r.z0, r.z1) + rnd() * Math.abs(r.z1 - r.z0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
    return { geom: g, drops: d };
  }, [layout, count]);
  useEffect(() => () => geom.dispose(), [geom]);

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.1);
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const slant = Math.min(0.5, wind / 60);
    for (let i = 0; i < count; i++) {
      let y = drops[i * 3 + 1] - 32 * step;
      if (y < 0) y += HEIGHT;
      drops[i * 3 + 1] = y;
      const x = drops[i * 3];
      const z = drops[i * 3 + 2];
      arr[i * 6] = x;
      arr[i * 6 + 1] = y;
      arr[i * 6 + 2] = z;
      arr[i * 6 + 3] = x + slant;
      arr[i * 6 + 4] = y + 1.3;
      arr[i * 6 + 5] = z;
    }
    pos.needsUpdate = true;
    geom.computeBoundingSphere();
  });

  return (
    <lineSegments geometry={geom} frustumCulled={false}>
      <lineBasicMaterial color="#cbd5e1" transparent opacity={0.35 + 0.25 * rain} depthWrite={false} />
    </lineSegments>
  );
}

/** Luces de los andenes y del interior (sin techo) cuando oscurece. */
function NightLights({ layout, night, cutaway }: { layout: SiteLayout; night: number; cutaway: boolean }) {
  const docks = useMemo(() => [...layout.docks.values()], [layout]);
  const bays = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = layout.xWest + 8; x < layout.xEast - 4; x += 16) for (let z = -8; z > FRONT_Z + 4; z -= 16) out.push([x, z]);
    return out;
  }, [layout]);
  return (
    <>
      {docks.map((d, i) => (
        <LightPool key={`d${i}`} position={[d.x, 0.05, 3.2]} radius={4.2} intensity={0.55 * night} color="#ffe2ad" />
      ))}
      {cutaway &&
        bays.map(([x, z], i) => <LightPool key={`b${i}`} position={[x, FLOOR_Y + 0.04, z]} radius={9} intensity={0.32 * night} color="#e8f1ff" />)}
    </>
  );
}

/** Todo lo que va pegado al sitio: se dibuja dentro del grupo reflejado de la escena. */
export function AtmosphereGround({ layout, look, cutaway }: { layout: SiteLayout; look: AtmosphereLook; cutaway: boolean }) {
  return (
    <>
      {look.wet > 0.05 && <WetGround layout={layout} wet={look.wet} />}
      {look.rain > 0 && <Rain layout={layout} rain={look.rain} wind={look.wind} />}
      {look.night > 0.05 && <NightLights layout={layout} night={look.night} cutaway={cutaway} />}
    </>
  );
}

