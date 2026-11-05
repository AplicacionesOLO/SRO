import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CameraControls, Environment, Lightformer, Sky } from '@react-three/drei';
import CameraControlsImpl from 'camera-controls';
import * as THREE from 'three';
import WarehouseSite, { type DockVisual } from './WarehouseSite';
import Truck3D, { type TruckVisual } from './Truck3D';
import { UnloadingCell, type UnloadVisual } from './Workforce';
import { DispatchLoadCell, DispatchLotArea, PutawayCell, type DispatchLoadVisual, type PutawayVisual } from './AppoloOps';
import { lotGeometry, type LotStats } from '../lib/appolo';
import { DockHeatPads, GhostTrucks, type DockHeatVisual, type GhostVisual } from './Insights3D';
import { BLVD_Z, FRONT_Z, MIRROR_X, type Pose, type SiteLayout } from '../lib/layout';
import Workshop, { type WorkshopInfo } from './Workshop';
import Mezzanine from './Mezzanine';
import DispatchArea from './DispatchArea';
import AccessControl from './AccessControl';
import type { TruckAlert } from '../lib/alerts';

export type CameraPreset = 'general' | 'andenes' | 'despacho' | 'entrada' | 'frente' | 'interior' | 'descarga' | 'esperaDespacho';

export interface CameraRequest {
  name: CameraPreset;
  nonce: number;
  /** x lógico del andén a enfocar (vista "descarga") */
  focusX?: number;
}

interface WarehouseSceneProps {
  layout: SiteLayout;
  docks: DockVisual[];
  trucks: TruckVisual[];
  unloads: UnloadVisual[];
  selectedId: string | null;
  highlightDockId: string | null;
  showLabels: boolean;
  cutaway: boolean;
  truckSpeed: number;
  warehouseName?: string;
  cameraPreset: CameraRequest;
  onSelect: (id: string | null) => void;
  onGone: (id: string) => void;
  positions: Map<string, Pose>;
  /** Alertas de tiempo por camión (nube amarilla / roja con contador) */
  alerts: Map<string, TruckAlert>;
  /** Reloj de las alertas: null = tiempo real; número = hora simulada del recorrido */
  alertClock: number | null;
  /** AppOLO: cargas de despacho en andén y acomodo a racks (opcional) */
  loadings?: DispatchLoadVisual[];
  putaways?: PutawayVisual[];
  /** Patio de espera de salida de despachos (AppOLO); undefined = no se dibuja */
  dispatchLot?: LotStats;
  /** Mapa de calor de andenes (uso o permanencia); vacío = apagado */
  heatPads?: DockHeatVisual[];
  /** Próximas citas en andenes libres */
  ghosts?: GhostVisual[];
  /** Taller de equipos en mantenimiento (se ve en modo Interior) */
  workshop?: WorkshopInfo;
  /** Dibujar el mezzanine (con el techo quitado) */
  showMezzanine?: boolean;
  /** Texto del letrero del control de acceso (personal del reloj marcador) */
  accessInfo?: string | null;
}

const { ACTION } = CameraControlsImpl;
const NO_LOADINGS: DispatchLoadVisual[] = [];
const NO_PUTAWAYS: PutawayVisual[] = [];
const NO_HEAT: DockHeatVisual[] = [];
const NO_GHOSTS: GhostVisual[] = [];
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE']);

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  if (!t || !t.tagName) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName);
}

/**
 * Cámara con movimiento fluido (camera-controls):
 *  - Arrastrar: girar · clic derecho o ESPACIO + arrastrar: desplazarse · rueda: acercar hacia el cursor
 *  - Doble clic: volar al punto · W A S D / flechas: moverse · Q / E: girar
 *  - Los botones de vista hacen una transición suave.
 */
function CameraRig({
  layout,
  preset,
  flyRef,
}: {
  layout: SiteLayout;
  preset: CameraRequest;
  flyRef: MutableRefObject<((p: THREE.Vector3) => void) | null>;
}) {
  const controls = useRef<CameraControlsImpl>(null);
  const keys = useRef(new Set<string>());
  const first = useRef(true);
  const gl = useThree((st) => st.gl);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const midX = (layout.xWest + layout.xEast) / 2;
    const span = layout.eastRoadX - layout.streetX;
    // Todo en coordenadas lógicas; al final se refleja x igual que la escena
    let pos: [number, number, number];
    let target: [number, number, number];
    switch (preset.name) {
      case 'andenes':
        target = [midX, 0, 10];
        pos = [midX, 45, 85];
        break;
      case 'despacho':
        target = [layout.yardRoadX, 0, -30];
        pos = [layout.yardRoadX - 70, 55, -10];
        break;
      case 'entrada':
        target = [layout.mainGateX + 10, 0, BLVD_Z];
        pos = [layout.mainGateX - 30, 32, BLVD_Z - 45];
        break;
      case 'frente':
        target = [layout.officeX - 19, 0, FRONT_Z - 10];
        pos = [layout.officeX - 19, 50, FRONT_Z - 95];
        break;
      case 'esperaDespacho': {
        const g = lotGeometry(layout);
        const cx = (g.x0 + g.x1) / 2;
        const cz = (g.zTop + g.zBottom) / 2;
        target = [cx, 0, cz];
        pos = [cx - 70, 70, cz + 60];
        break;
      }
      case 'interior':
        target = [midX, 0, -25];
        pos = [midX, 95, 45];
        break;
      case 'descarga': {
        const fx = preset.focusX ?? midX;
        // desde arriba y de lado: se ve el remolque (afuera) y la recepción (adentro) a la vez
        target = [fx, 1.5, -1];
        pos = [fx + 7, 22, -19];
        break;
      }
      default:
        target = [(layout.streetX + layout.eastRoadX) / 2, 0, -40];
        pos = [layout.streetX - span * 0.05, span * 0.45, span * 0.55];
    }
    pos[0] *= MIRROR_X;
    target[0] *= MIRROR_X;
    c.setLookAt(...pos, ...target, !first.current);
    first.current = false;
  }, [preset.nonce, preset.name, preset.focusX, layout]);

  // Doble clic: volar al punto manteniendo la distancia y el ángulo
  useEffect(() => {
    flyRef.current = (p) => {
      controls.current?.moveTo(p.x, Math.max(0, p.y), p.z, true);
    };
    return () => {
      flyRef.current = null;
    };
  }, [flyRef]);

  // Teclado: ESPACIO = modo desplazamiento; WASD / flechas = moverse; Q / E = girar
  useEffect(() => {
    const el = gl.domElement;
    const setPanMode = (on: boolean) => {
      const c = controls.current;
      if (!c) return;
      c.mouseButtons.left = on ? ACTION.TRUCK : ACTION.ROTATE;
      el.style.cursor = on ? 'grab' : '';
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPanMode(true);
      } else if (MOVE_KEYS.has(e.code)) {
        e.preventDefault();
        keys.current.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setPanMode(false);
      keys.current.delete(e.code);
    };
    const blur = () => {
      keys.current.clear();
      setPanMode(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [gl]);

  useFrame((_, dt) => {
    const c = controls.current;
    const k = keys.current;
    if (!c || k.size === 0) return;
    // velocidad proporcional a la distancia: fino de cerca, rápido de lejos
    const step = Math.min(dt, 0.05);
    const v = Math.max(8, c.distance * 0.9) * step;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const turn = (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);
    if (fwd) c.forward(fwd * v, true);
    if (side) c.truck(side * v, 0, true);
    if (turn) c.rotate(-turn * step * 1.6, 0, true);
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      smoothTime={0.35}
      draggingSmoothTime={0.12}
      dollyToCursor
      dollySpeed={0.6}
      truckSpeed={1.6}
      verticalDragToForward
      maxPolarAngle={Math.PI / 2.1}
      minDistance={4}
      maxDistance={750}
    />
  );
}

export default function WarehouseScene({
  layout,
  docks,
  trucks,
  unloads,
  selectedId,
  highlightDockId,
  showLabels,
  cutaway,
  truckSpeed,
  warehouseName,
  cameraPreset,
  onSelect,
  onGone,
  positions,
  alerts,
  alertClock,
  loadings = NO_LOADINGS,
  putaways = NO_PUTAWAYS,
  dispatchLot,
  heatPads = NO_HEAT,
  ghosts = NO_GHOSTS,
  workshop,
  showMezzanine = true,
  accessInfo,
}: WarehouseSceneProps) {
  const flyRef = useRef<((p: THREE.Vector3) => void) | null>(null);
  const span = layout.eastRoadX - layout.streetX;
  const unloadByTruck = useMemo(() => new Map(unloads.map((u) => [u.truckId, u])), [unloads]);
  const loadingByTruck = useMemo(() => new Map(loadings.map((l) => [l.truckId, l])), [loadings]);

  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      camera={{ fov: 42, near: 0.5, far: 3000, position: [0, 150, 200] }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#cfe3f1']} />
      <fog attach="fog" args={['#d8e7f2', span * 1.5, span * 4.5]} />
      <Sky distance={4500} sunPosition={[-120, 80, 60]} turbidity={5} rayleigh={1.1} mieCoefficient={0.004} />
      {/* reflejos suaves generados localmente (sin descargar mapas HDR) */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 60, 0]} rotation-x={Math.PI / 2} scale={[200, 200, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#bfdbfe" position={[-100, 30, 0]} rotation-y={Math.PI / 2} scale={[200, 60, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#fde68a" position={[100, 30, 0]} rotation-y={-Math.PI / 2} scale={[200, 60, 1]} />
      </Environment>
      <hemisphereLight args={['#f8fafc', '#6b8f55', 0.55]} />
      <directionalLight
        position={[-120, 170, 90]}
        intensity={2.1}
        color="#fff7ed"
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
      <Suspense fallback={null}>
        {/* Reflejo en x: visto desde el frente, la entrada queda a la izquierda */}
        <group
          scale={[MIRROR_X, 1, 1]}
          onDoubleClick={(e) => {
            e.stopPropagation();
            flyRef.current?.(e.point);
          }}
        >
          <WarehouseSite
            layout={layout}
            docks={docks}
            showDockLabels={showLabels}
            warehouseName={warehouseName}
            highlightDockId={highlightDockId}
            cutaway={cutaway}
          />
          {trucks.map((t) => {
            const u = unloadByTruck.get(t.id);
            const l = loadingByTruck.get(t.id);
            const loadingOpen = !!l && (l.stage === 'CARGANDO' || l.stage === 'PREPARANDO');
            return (
              <Truck3D
                key={t.id}
                truck={t}
                selected={selectedId === t.id}
                showLabel={showLabels}
                speed={truckSpeed}
                onSelect={onSelect}
                onGone={onGone}
                positions={positions}
                doorsOpen={(!!u && u.stage !== 'ESPERA') || loadingOpen}
                alert={alerts.get(t.id)}
                alertClock={alertClock}
                seeThrough={cutaway && (!!u || loadingOpen)}
              />
            );
          })}
          {cutaway && unloads.map((u) => <UnloadingCell key={u.truckId} u={u} positions={positions} />)}
          {cutaway && loadings.map((l) => <DispatchLoadCell key={l.truckId} v={l} positions={positions} />)}
          {cutaway && putaways.map((p) => <PutawayCell key={p.id} v={p} />)}
          {heatPads.length > 0 && <DockHeatPads pads={heatPads} showLabels={showLabels} />}
          {ghosts.length > 0 && <GhostTrucks ghosts={ghosts} showLabels={showLabels} />}
          {cutaway && workshop && <Workshop layout={layout} info={workshop} showLabel={showLabels} />}
          {cutaway && showMezzanine && <Mezzanine layout={layout} showLabel={showLabels} />}
          {cutaway && <AccessControl layout={layout} showLabel={showLabels} info={accessInfo} />}
          <DispatchArea layout={layout} cutaway={cutaway} showLabel={showLabels} />
          {dispatchLot !== undefined && <DispatchLotArea layout={layout} stats={dispatchLot} showLabel={showLabels} />}
        </group>
      </Suspense>
      <CameraRig layout={layout} preset={cameraPreset} flyRef={flyRef} />
    </Canvas>
  );
}
