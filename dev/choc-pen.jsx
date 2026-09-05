import { createRoot } from 'react-dom/client';
import './scene.js';
import { SceneEnv, SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
/* ⚠️ LIT BY `SceneEnv`, THE COMPONENT PRODUCTION MOUNTS — not a rig of its own. This harness used to
 * build its own environment, and every harness that did was lighting its subject differently from the
 * product it exists to judge. A metal shows nothing but the reflected environment, so a `studio` or
 * `city` preset does not merely look different, it makes any reading about shine or colour describe a
 * scene no customer sees. The gold topper's glare was invisible here for exactly that reason.
 * `./scene.js` supplies the assets base so `SceneEnv` resolves the real map. */
import { Canvas } from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import * as THREE from 'three';
import { buildPipingStroke } from '../src/designer/geometry/creamPen.js';
import { mediumOf } from '../src/designer/geometry/pipingMedia.js';

/* The one thing unit tests cannot answer: does chocolate LOOK like chocolate. Same stroke, same
 * light, same nozzle — only the medium differs. If these two read the same, the medium table is
 * wired up wrong however green the suite is. */

function Rope({ medium, colour, z }) {
  const style = mediumOf(medium).defaults;
  const pts = Array.from({ length: 60 }, (_, i) => {
    const t = (i / 59) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(t) * 0.8, 0.02 + Math.sin(t * 3) * 0.03, Math.sin(t) * 0.45 + z);
  });
  // ⚠️ A KEY, not the resolved nozzle object — buildPipingStroke looks the key up and silently
  // falls back to the default STAR tip when handed anything it cannot find. Passing the object made
  // both ropes render ribbed, which looked exactly like the medium not being wired up.
  const geo = buildPipingStroke(pts, style.nozzle, style.thickness ?? 0.03);
  if (!geo) return null;
  return (
    <mesh geometry={geo}>
      <meshPhysicalMaterial side={THREE.DoubleSide}
        {...mediumOf(medium).material({ softness: style.softness }, colour)} />
    </mesh>
  );
}

createRoot(document.getElementById('root')).render(
  <div style={{ height: '100%', background: '#EFEAE3' }}>
    <Canvas camera={{ position: [0, 2.1, 2.6], fov: 40 }} shadows>
      <SceneEnv />
      {/* ⚠️ `SceneLights` — THE shared rig, not a local one. Every page here used to build its own,
          and they had drifted to ambient 0.5–0.55 with a key of 1.5: precisely the values
          `SceneLights` was SOFTENED AWAY FROM (to 0.45 / 1.1) because they overexposed the cake top
          and camera-facing wall and washed the diffuse colour toward white head-on. A harness lit by
          a rig the product deliberately rejected cannot judge the product's colour. */}
      <SceneLights />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[6, 6]} /><meshStandardMaterial color="#F6F2EA" />
      </mesh>
      <Rope medium="cream"     colour="#ffffff" z={-0.75} />
      <Rope medium="chocolate" colour="#4A2C1B" z={0.75} />
      <OrbitControls />
    </Canvas>
  </div>
);
