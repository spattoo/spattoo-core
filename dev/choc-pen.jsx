import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
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
      <Environment preset="studio" />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 2]} intensity={1.5} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[6, 6]} /><meshStandardMaterial color="#F6F2EA" />
      </mesh>
      <Rope medium="cream"     colour="#ffffff" z={-0.75} />
      <Rope medium="chocolate" colour="#4A2C1B" z={0.75} />
      <OrbitControls />
    </Canvas>
  </div>
);
