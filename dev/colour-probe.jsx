import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';
import { SafeEnvironment } from '../src/designer/canvas/TextureErrorBoundary.jsx';
import { envProps } from '../src/designer/canvas/envMap.js';
import { garnishMaterialProps } from '../src/designer/geometry/garnishMaterial.js';

/* ⚠️ MEASURE, DO NOT MODEL. Two rounds were spent deriving what the renderer does to a colour from
 * first principles, and both were wrong in ways only the cake showed. This renders flat plates of
 * known colours through the REAL material and environment so the transform can be read off the
 * pixels instead of reasoned about.
 *
 * ⚠️ WHAT IT HAS ALREADY RULED OUT. Sweeping `envMapIntensity` from 0 to 0.7 with the clearcoat off
 * changed the rendered pixel NOT AT ALL — five identical readings. Every compensation attempted so
 * far aimed at that term, so all of them were aimed at the wrong thing, which is why none of them
 * moved the colour. The lift comes from somewhere else: the scene's lights, the tone mapping, or
 * colour-space handling of the material colour. Whoever picks this up should sweep those next, with
 * this harness, before writing another correction. */
const COLOURS = ['#0d6e5e', '#C4626B', '#4A2C1B', '#EFE3CE', '#2b8fd6'];

createRoot(document.getElementById('root')).render(
  <Canvas orthographic camera={{ position: [0, 0, 5], zoom: 100 }} gl={{ preserveDrawingBuffer: true }}>
    <Suspense fallback={null}>
      <SafeEnvironment {...envProps()} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 3, 2]} intensity={1.1} />
      {COLOURS.map((c, i) => (
        <mesh key={c} position={[(i - 2) * 1.6, 0, 0]}>
          <planeGeometry args={[1.4, 1.4]} />
          <meshPhysicalMaterial side={THREE.DoubleSide} {...garnishMaterialProps({ color: c })} />
        </mesh>
      ))}
    </Suspense>
  </Canvas>,
);
