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
    <div style={{ height: '100%', position: 'relative' }}>
      <Canvas shadows camera={{ position: [0, 1.5, 4.9], fov: 36 }} style={{ height: "100%" }}>
        <color attach="background" args={['#EDEAE3']} />
        <SceneLights /><SceneEnv />
        <FondantGuide parts={parts} step={steps[step].partIndex} t={t} color={COLOUR}
                      hands={q.get('hands') === '1'} />
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
      {/* ⚠️ THE TEXT SITS BESIDE THE MAKING AREA, not under the whole scene. Below the canvas it
          was a caption to a picture: the eye had to leave the action, read, and come back, and by
          then the action had moved on. Words and the thing they describe have to be in one glance.
          Upper-left, because the bench is the left half and the figure never reaches over here. */}
      <div style={{
        position: 'absolute', left: 26, top: 24, width: 330, zIndex: 4,
        background: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: '14px 16px',
        boxShadow: '0 6px 22px rgba(20,24,21,0.10)',
      }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, color: '#9a9a9a' }}>
          STEP {s.n} OF {s.of}
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: '#2C4433', margin: '5px 0 6px', lineHeight: 1.45 }}>
          {s.instruction}
        </div>
        {s.colour?.warn && <div style={{ fontSize: 12, color: '#8A4B00', marginBottom: 5, lineHeight: 1.45 }}>⚠️ {s.colour.warn}</div>}
        {s.colour?.rest && <div style={{ fontSize: 12, color: '#777', marginBottom: 6, lineHeight: 1.45 }}>{s.colour.rest}</div>}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
          <button onClick={() => setPlaying(p => !p)} style={btn}>{playing ? 'Pause' : 'Play'}</button>
          <button onClick={() => { setStep(x => Math.max(0, x-1)); setT(0); }} style={btn}>Prev</button>
          <button onClick={() => { setStep(x => Math.min(steps.length-1, x+1)); setT(0); }} style={btn}>Next</button>
          <input type="range" min={0} max={1} step={0.01} value={t}
                 onChange={e => { setPlaying(false); setT(parseFloat(e.target.value)); }}
                 style={{ flex: 1, minWidth: 0 }} />
        </div>
      </div>
    </div>
  );
}

const btn = {
  padding: '5px 10px', borderRadius: 8, border: '1px solid #ddd', background: '#fff',
  fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', color: '#333',
};

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
