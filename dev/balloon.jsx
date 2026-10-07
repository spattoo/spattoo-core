import { useMemo, useState } from 'react';
import './scene.js';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { SceneEnv, SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
import { buildBalloon, BALLOON_DEFAULTS } from '../src/designer/geometry/balloon.js';

/* ── Do these read as fondant balloons? Open /balloon.html ───────────────────────────────────────
 *
 * Step 1 and deliberately the only step, for the reason dev/grass.jsx gives: the two procedural
 * studios that never shipped both got as far as a studio before anyone judged the look.
 *
 * ⚠️ NO STICK HERE, AND THAT IS NOT AN OMISSION. The pick is authored per element on the Manage
 * Elements row (elementStick.js), with its own bury depth, specifically so it does not live inside
 * individual studios. A stick drawn here would be a second answer to "how long is the stick". The
 * grey rod is a STAND-IN so the balloon can be judged at the height it will actually float at.
 *
 * WHAT TO JUDGE:
 *   1. Is it a balloon or an egg? The widest point sits ABOVE the middle — `belly` — and that one
 *      number is most of the difference.
 *   2. The neck and knot. A fondant balloon is pinched and has a nub; without it the pick looks
 *      like it is stabbed into a plum.
 *   3. The crown: blunt dome or teardrop point.
 *   4. In a group of three at different sizes and colours, does it still read, or does the repeat
 *      show?
 */
const COLOURS = ['#efe6d6', '#9fd6cc', '#f3b9bd', '#cdb9e6', '#f5d9a8'];

function Balloon({ p, colour, position, tilt, scale }) {
  const geom = useMemo(() => buildBalloon(p), [p]);
  return (
    <group position={position} rotation={[0, 0, tilt]} scale={scale}>
      <mesh geometry={geom} castShadow receiveShadow>
        {/* Fondant: matte, slightly waxy, no metal. Not a balloon's latex sheen — this is sugar
            paste rolled smooth, and the references have almost no specular at all. */}
        <meshStandardMaterial color={colour} roughness={0.78} metalness={0} />
      </mesh>
      {/* A STAND-IN for the real pick, which the element row owns. */}
      <mesh position={[0, -0.55, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 1.1, 12]} />
        <meshStandardMaterial color="#d8c9a6" roughness={0.6} />
      </mesh>
    </group>
  );
}

export default function Harness() {
  const [p, setP] = useState({ ...BALLOON_DEFAULTS });
  const [one, setOne] = useState(false);
  const set = (k) => (v) => setP(o => ({ ...o, [k]: v }));

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Quicksand',sans-serif" }}>
      <div style={{ width: 280, padding: 16, background: '#faf7f8', overflowY: 'auto', fontSize: 13 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>Fondant balloons — do they read?</h2>
        <img src="refs/ref-balloons.png" alt="reference"
             style={{ width: '100%', borderRadius: 8, margin: '0 0 10px', display: 'block' }} />
        <Row>
          <Btn on={!one} onClick={() => setOne(false)}>a group of three</Btn>
          <Btn on={one} onClick={() => setOne(true)}>one, close up</Btn>
        </Row>
        <Sl label="Width × height" v={p.width} min={0.4} max={1.1} step={0.02} on={set('width')} />
        <Sl label="Belly height"   v={p.belly} min={0.25} max={0.85} step={0.01} on={set('belly')}
            hint="Above 0.5 is a balloon; at 0.5 it is an egg." />
        <Sl label="Neck"           v={p.neck}  min={0.05} max={0.6} step={0.01} on={set('neck')} />
        <Sl label="Collar radius" v={p.knot}  min={0} max={0.18} step={0.005} on={set('knot')} />
        <Sl label="Collar height" v={p.collar} min={0} max={0.15} step={0.005} on={set('collar')}
            hint="The tied neck. A rim with two corners, not a bump — at 0 it is gone." />
        <Sl label="Crown"          v={p.crown} min={0} max={1} step={0.02} on={set('crown')}
            hint="0 is a teardrop, 1 is a dome." />
        <Sl label="Profile samples" v={p.segments} min={4} max={30} step={1} on={set('segments')} int />
        <pre style={{ marginTop: 12, padding: 8, background: '#fff', borderRadius: 6, fontSize: 10.5,
                      color: '#555', border: '1px solid #eee' }}>
{JSON.stringify({ width: p.width, belly: p.belly, neck: p.neck, knot: p.knot, crown: p.crown }, null, 1)}
        </pre>
      </div>
      <div style={{ flex: 1, position: 'relative', background: '#6d6a70' }}>
        <Canvas shadows camera={{ position: [0, 0.6, 4.2], fov: 38 }}
          gl={{ preserveDrawingBuffer: true }} style={{ position: 'absolute', inset: 0 }}>
          <color attach="background" args={['#6d6a70']} />
          {/* The shared rig — INVARIANTS #17. Fondant's whole character is how matte it is, which is
              a judgement about light. The backdrop is the reference's grey, not a cake ground: these
              float above the cake and are seen against the room. */}
          <SceneLights shadows />
          <SceneEnv />
          {one ? (
            <Balloon p={p} colour={COLOURS[0]} position={[0, -0.2, 0]} tilt={0.05} scale={1.6} />
          ) : (
            <>
              <Balloon p={p} colour={COLOURS[0]} position={[-0.95, -0.35, 0]} tilt={0.16} scale={1.0} />
              <Balloon p={p} colour={COLOURS[1]} position={[0.1, 0.1, -0.3]} tilt={-0.05} scale={1.25} />
              <Balloon p={p} colour={COLOURS[2]} position={[1.05, -0.25, 0.15]} tilt={-0.19} scale={1.1} />
            </>
          )}
          <OrbitControls target={[0, 0.1, 0]} />
        </Canvas>
      </div>
    </div>
  );
}
const Row = ({ children }) => (
  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '8px 0' }}>{children}</div>
);
const Btn = ({ on, children, ...r }) => (
  <button {...r} style={{ padding: '4px 9px', fontSize: 11.5, borderRadius: 6, cursor: 'pointer',
    border: on ? '1.5px solid #1a1a1a' : '1px solid #ccc', background: on ? '#1a1a1a' : '#fff',
    color: on ? '#fff' : '#333', fontFamily: 'inherit' }}>{children}</button>
);
const Sl = ({ label, v, min, max, step, on, int, hint }) => (
  <label style={{ display: 'block', margin: '7px 0' }}>
    <span style={{ fontSize: 11, color: '#666' }}>{label}{' '}
      <b style={{ color: '#1a1a1a' }}>{int ? v : Number(v).toFixed(2)}</b></span>
    <input type="range" min={min} max={max} step={step} value={v} style={{ width: '100%' }}
      onChange={e => on(int ? parseInt(e.target.value, 10) : parseFloat(e.target.value))} />
    {hint && <span style={{ fontSize: 10, color: '#9a9a9a', display: 'block' }}>{hint}</span>}
  </label>
);
createRoot(document.getElementById('root')).render(<Harness />);
