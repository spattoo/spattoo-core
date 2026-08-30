import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useMemo, useState } from 'react';
import { buildGarnishGeometry, garnishTransform } from '../src/designer/geometry/garnishPiece.js';
import { fillShape } from '../src/designer/geometry/pipingFill.js';
import { mediumOf } from '../src/designer/geometry/pipingMedia.js';
import Segmented from '../src/shared/Segmented.jsx';

/* A drawn garnish, on a cake, lying or standing. The question tests cannot answer: does it read as
 * a piece of set chocolate pushed into buttercream, or as a decal lying on top of it. */

const leaf = () => {
  const p = [];
  for (let i = 0; i <= 30; i++) { const t = i / 30; p.push([60 + t * 300, 210 - Math.sin(t * Math.PI) * 105]); }
  for (let i = 30; i >= 0; i--) { const t = i / 30; p.push([60 + t * 300, 210 + Math.sin(t * Math.PI) * 105]); }
  return p;
};

function Garnish({ mode, pattern }) {
  const outline = leaf();
  const { geometry, size, ropeWorld } = useMemo(() => {
    const paths = [outline, ...(pattern === 'none' ? []
      : fillShape(outline, { pattern, spacing: 26, inset: 9, ropeWidth: 12, seed: 5 }))];
    return buildGarnishGeometry(paths, { rope: 6, plateSize: 420, worldSize: 0.95 });
  }, [mode, pattern]);

  const TOP_Y = 1.0;
  const t = garnishTransform(mode, { height: size.h, rope: ropeWorld, surfaceY: TOP_Y });
  return (
    <mesh geometry={geometry} position={[0, t.y, 0]} rotation={t.rotation} castShadow>
      <meshPhysicalMaterial side={THREE.DoubleSide}
        {...mediumOf('chocolate').material({ softness: 0.85 }, '#4A2C1B')} />
    </mesh>
  );
}

function App() {
  const [mode, setMode] = useState('stand');
  const [pattern, setPattern] = useState('hatch');
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#EFEAE3' }}>
      <div style={{ display: 'flex', gap: 16, padding: 12, background: '#fff', alignItems: 'center' }}>
        <Segmented items={[{ id: 'stand', label: 'Standing' }, { id: 'lie', label: 'Lying' }]}
          value={mode} onChange={setMode} tone="#4A2C1B" label="How it sits" />
        <Segmented items={['none', 'hatch', 'scribble', 'solid'].map(id => ({ id, label: id }))}
          value={pattern} onChange={setPattern} tone="#4A2C1B" label="Fill" />
      </div>
      <div style={{ flex: 1 }}>
        <Canvas camera={{ position: [0, 1.9, 2.9], fov: 42 }} shadows>
          <Environment preset="studio" />
          <ambientLight intensity={0.55} />
          <directionalLight position={[3, 6, 3]} intensity={1.5} castShadow />
          {/* A tier to sit on, so "pushed in" and "floating" are distinguishable. */}
          <mesh position={[0, 0.5, 0]} receiveShadow>
            <cylinderGeometry args={[1.15, 1.15, 1.0, 64]} />
            <meshStandardMaterial color="#F6DCE2" roughness={0.85} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
            <circleGeometry args={[1.7, 64]} /><meshStandardMaterial color="#D9C48A" />
          </mesh>
          <Garnish mode={mode} pattern={pattern} />
          <OrbitControls target={[0, 0.9, 0]} />
        </Canvas>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
