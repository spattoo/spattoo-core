import { StrictMode, useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import FondantGuide from '../src/designer/canvas/FondantGuide.jsx';
import { SceneLights, SceneEnv } from '../src/designer/canvas/CakeCanvas.jsx';
import { PRESETS } from '../src/designer/geometry/fondantParts.js';
import { buildSteps } from '../src/designer/geometry/fondantSteps.js';

// Judging the MOTION before any chrome: does the ball read as being rolled, does the shaping read
// as shaping, and does the press land like soft fondant rather than a part clicking into a socket.
function App() {
  const parts = PRESETS.bear.parts();
  const steps = buildSteps(parts);
  const q = new URLSearchParams(location.search);
  const [step, setStep] = useState(Number(q.get('step') ?? 0));
  const [t, setT] = useState(q.has('t') ? Number(q.get('t')) : 0);
  const [playing, setPlaying] = useState(!q.has('t'));
  const raf = useRef();

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now;
      setT(prev => {
        const next = prev + dt / 2.2;                 // ~2.2s a step
        if (next >= 1) { setStep(s => (s + 1) % steps.length); return 0; }
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, steps.length]);

  const s = steps[step];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Canvas shadows camera={{ position: [0, 1.5, 4.6], fov: 34 }} style={{ flex: 1 }}>
        <color attach="background" args={['#EDEAE3']} />
        <SceneLights /><SceneEnv />
        <FondantGuide parts={parts} step={step} t={t} color="#C79A6B" />
        <mesh rotation={[-Math.PI/2,0,0]} receiveShadow>
          <circleGeometry args={[2.6, 64]} /><shadowMaterial opacity={0.26} />
        </mesh>
        <OrbitControls target={[0, 0.8, 0]} />
      </Canvas>
      <div style={{ padding: 14, background: '#fff', borderTop: '1px solid #e5e5e5' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#9a9a9a' }}>STEP {s.n} OF {s.of}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#2C4433', margin: '4px 0 8px' }}>{s.instruction}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setPlaying(p => !p)}>{playing ? 'Pause' : 'Play'}</button>
          <button onClick={() => { setStep(x => Math.max(0, x-1)); setT(0); }}>Prev</button>
          <button onClick={() => { setStep(x => Math.min(steps.length-1, x+1)); setT(0); }}>Next</button>
          <input type="range" min={0} max={1} step={0.01} value={t}
                 onChange={e => { setPlaying(false); setT(parseFloat(e.target.value)); }} style={{ flex: 1 }} />
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
