import { StrictMode, useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import FondantGuide from '../src/designer/canvas/FondantGuide.jsx';
import { SceneLights, SceneEnv } from '../src/designer/canvas/CakeCanvas.jsx';
import { PRESETS } from '../src/designer/geometry/fondantParts.js';
import { buildSteps } from '../src/designer/geometry/fondantSteps.js';
import { BENCH, ASSEMBLY } from '../src/designer/canvas/FondantGuide.jsx';

// Judging the MOTION before any chrome: does the ball read as being rolled, does the shaping read
// as shaping, and does the press land like soft fondant rather than a part clicking into a socket.
function App() {
  const parts = PRESETS.bear.parts();
  const COLOUR = '#8B5A2B';   // a real brown, so the colour step has something to describe
  const steps = buildSteps(parts, { color: COLOUR });
  const q = new URLSearchParams(location.search);
  const [step, setStep] = useState(Number(q.get('step') ?? 0));
  const [t, setT] = useState(q.has('t') ? Number(q.get('t')) : 0);
  const [playing, setPlaying] = useState(!q.has('t'));
  const raf = useRef();
  // Slow. This is a guide somebody is trying to FOLLOW at a bench, not a title sequence — the
  // forming phase alone is ~3s of it.
  const SECONDS_PER_STEP = Number(q.get('secs') ?? 5);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now;
      setT(prev => {
        const next = prev + dt / SECONDS_PER_STEP;
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
      <Canvas shadows camera={{ position: [0, 1.5, 4.9], fov: 36 }} style={{ flex: 1 }}>
        <color attach="background" args={['#EDEAE3']} />
        <SceneLights /><SceneEnv />
        <FondantGuide parts={parts} step={steps[step].partIndex} t={t} color={COLOUR} />
        {/* Two boards: the work surface on the left, the cake board on the right. Separate, so the
            split between making and assembling is stated by the scene and not only by the gap. */}
        <mesh position={[BENCH.x, 0, BENCH.z]} rotation={[-Math.PI/2,0,0]} receiveShadow>
          <circleGeometry args={[0.95, 48]} /><shadowMaterial opacity={0.26} />
        </mesh>
        <mesh position={[ASSEMBLY.x, 0, ASSEMBLY.z]} rotation={[-Math.PI/2,0,0]} receiveShadow>
          <circleGeometry args={[1.15, 48]} /><shadowMaterial opacity={0.26} />
        </mesh>
        <OrbitControls target={[0, 0.75, 0]} />
      </Canvas>
      <div style={{ padding: 14, background: '#fff', borderTop: '1px solid #e5e5e5' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#9a9a9a' }}>STEP {s.n} OF {s.of}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#2C4433', margin: '4px 0 4px' }}>{s.instruction}</div>
        {/* The two lines that stop the usual failure, shown only where they apply. */}
        {s.colour?.warn && <div style={{ fontSize: 12.5, color: '#8A4B00', marginBottom: 4 }}>⚠️ {s.colour.warn}</div>}
        {s.colour?.rest && <div style={{ fontSize: 12.5, color: '#666', marginBottom: 8 }}>{s.colour.rest}</div>}
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
