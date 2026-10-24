import { useState } from 'react';
import './scene.js';                       // light it the way production lights a cake
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { SceneEnv, SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
import SandBed from '../src/designer/canvas/SandBed.jsx';
import { SAND_DEFAULTS, sandTriangleCount } from '../src/designer/geometry/sand.js';

/* ── Sand on the board, the tight loop ───────────────────────────────────────────────────────────
 *
 *   /sand.html            round cake
 *   /sand.html?shape=sheet
 *
 * The admin Sand Studio is the door anyone can find tomorrow; this is the thing you keep open while
 * changing the generator. CLAUDE.md asks for both, and for the reason this file exists at all: the
 * studio sits behind a sign-in with a captcha in front of it, so it cannot be looked at from a
 * script, and a POC judged only by its author on their own screen is how three sweeps got reported
 * against the wrong environment.
 *
 * ⚠️ IT LIGHTS ITSELF FROM `scene.js` AND THE DESIGNER'S OWN RIG — no lamps of its own, which
 * `check:harness-scene` enforces. Sand is judged almost entirely on how its facets catch the key
 * light; lit any other way this screen would be tuning a colour nobody ever sees.
 */

const R = 1.2, BOTTOM_H = 1.45, BOARD_H = 0.1, BOARD_R = 1.95;
const SHAPES = {
  round: { kind: 'round', radius: R },
  sheet: { kind: 'rect', halfW: 1.35, halfD: 0.95, cornerR: 0.18 },
};
const PARAMS = new URLSearchParams(location.search);
const SHAPE = SHAPES[PARAMS.get('shape')] ?? SHAPES.round;

function Scene({ p }) {
  const s = SHAPES.sheet;
  return (
    <>
      <SceneLights shadows />
      <SceneEnv />
      {/* A white plate, as in the reference — sand on a gold drum hides the thinning this exists to judge. */}
      <mesh position={[0, BOARD_H / 2, 0]} receiveShadow>
        <cylinderGeometry args={[BOARD_R, BOARD_R, BOARD_H, 96]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.75} metalness={0} />
      </mesh>
      <mesh position={[0, BOARD_H + BOTTOM_H / 2, 0]} castShadow receiveShadow>
        {SHAPE.kind === 'round'
          ? <cylinderGeometry args={[R, R, BOTTOM_H, 96, 1]} />
          : <boxGeometry args={[s.halfW * 2, BOTTOM_H, s.halfD * 2]} />}
        <meshStandardMaterial color="#8fd3e8" roughness={0.9} metalness={0} />
      </mesh>
      <SandBed shape={SHAPE} topY={BOARD_H} {...p} />
      <OrbitControls target={[0, BOARD_H + 0.3, 0]} />
    </>
  );
}

function App() {
  const [p, setP] = useState({ ...SAND_DEFAULTS });
  const set = k => e => setP(q => ({ ...q, [k]: +e.target.value }));
  const sl = (k, min, max, step) => (
    <label key={k} style={{ display: 'block', fontSize: 11, color: '#555', marginBottom: 7 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{k}</span><span>{Number(p[k]).toFixed(3)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={p[k]} onChange={set(k)} style={{ width: '100%' }} />
    </label>
  );
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 250, padding: 16, overflowY: 'auto', borderRight: '1px solid #eee' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Sand</h3>
        {sl('width', 0.08, 0.9, 0.01)}
        {sl('spacing', 0.018, 0.08, 0.001)}
        {sl('grainSize', 0.008, 0.055, 0.001)}
        {sl('sizeVary', 0, 1.2, 0.01)}
        {sl('rise', 0, 0.14, 0.002)}
        {sl('moundNoise', 0, 1, 0.01)}
        {sl('falloff', 0, 1, 0.01)}
        {sl('shadeVary', 0, 0.6, 0.01)}
        {sl('roughness', 0.3, 1, 0.01)}
        {sl('seed', 1, 99, 1)}
        <label style={{ fontSize: 11, color: '#555' }}>
          colour <input type="color" value={p.colour}
            onChange={e => setP(q => ({ ...q, colour: e.target.value }))} />
        </label>
        <p style={{ fontSize: 10.5, color: '#999', marginTop: 12, lineHeight: 1.5 }}>
          One draw call however many grains. {sandTriangleCount(1).toLocaleString()} triangles each.
        </p>
      </div>
      <div style={{ flex: 1 }}>
        <Canvas shadows camera={{ position: [0, 1.9, 4.4], fov: 42 }}>
          <color attach="background" args={['#efeae2']} />
          <Scene p={p} />
        </Canvas>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
