import { memo, useMemo } from 'react';
import { MeshReflectorMaterial } from '@react-three/drei';
import { BUILDING_DEPTH, FLOOR_Y, type SiteLayout } from '../lib/layout';
import { tiledTexture } from '../lib/textures';

/**
 * Piso de concreto pulido con reflejo real (racks, camiones y luces se reflejan difusos), como el
 * piso de la bodega. Solo en la vista realista y sin techo: dibuja la escena una vez más por cuadro.
 */
function ReflectiveFloor({ layout }: { layout: SiteLayout }) {
  const length = layout.xEast - layout.xWest - 0.6;
  const midX = (layout.xWest + layout.xEast) / 2;
  const depth = BUILDING_DEPTH - 0.6;
  const map = useMemo(() => tiledTexture('floor', length, depth, 6), [length, depth]);
  return (
    <mesh position={[midX, FLOOR_Y + 0.004, -BUILDING_DEPTH / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[length, depth]} />
      <MeshReflectorMaterial
        map={map}
        color="#858a90"
        blur={[500, 140]}
        resolution={1024}
        mixBlur={1}
        mixStrength={1.25}
        mixContrast={1}
        roughness={0.45}
        metalness={0.05}
        depthScale={1}
        minDepthThreshold={0.35}
        maxDepthThreshold={1.3}
        mirror={0}
      />
    </mesh>
  );
}

export default memo(ReflectiveFloor);
