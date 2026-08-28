import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import FondantBuild from '../src/designer/canvas/FondantBuild.jsx';
import { SceneLights, SceneEnv } from '../src/designer/canvas/CakeCanvas.jsx';
import { PRESETS } from '../src/designer/geometry/fondantParts.js';

// Judging the FIGURE before any studio chrome exists around it — the proportions are the whole
// risk here (a bear has "a precise familiar signature the eye can check"), and no amount of UI
// makes a badly-proportioned bear acceptable.
function App() {
  const [which, setWhich] = useState('bear');
  const parts = PRESETS[which].parts();
  return (
    <div style={{ height: '100%' }}>
      <div style={{ position: 'fixed', zIndex: 5, left: 12, top: 12, display: 'flex', gap: 6 }}>
        {Object.entries(PRESETS).map(([k, v]) => (
          <button key={k} onClick={() => setWhich(k)} style={{
            padding: '6px 12px', borderRadius: 8, fontFamily: 'inherit', fontWeight: 700,
            border: `1.5px solid ${which === k ? '#3A4F46' : '#ccc'}`,
            background: which === k ? '#3A4F46' : '#fff', color: which === k ? '#fff' : '#333',
            cursor: 'pointer',
          }}>{v.label}</button>
        ))}
      </div>
      <Canvas shadows camera={{ position: [0, 1.6, 4.2], fov: 34 }}>
        <color attach="background" args={['#EDEAE3']} />
        <SceneLights /><SceneEnv />
        <FondantBuild parts={parts} color="#C79A6B" />
        {/* The bench, so "does it stand on the board" is answerable by eye. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <circleGeometry args={[2.4, 64]} />
          <shadowMaterial opacity={0.28} />
        </mesh>
        <OrbitControls target={[0, 0.8, 0]} />
      </Canvas>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
