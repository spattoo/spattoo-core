import { useMemo, useState } from 'react';
import './scene.js';                       // light it the way production lights a cake
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { SceneEnv, SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
import SandBed from '../src/designer/canvas/SandBed.jsx';
import { SAND_DEFAULTS, sandTriangleCount, sandHeightAt, sandMoundOpts, sandSpan,
         ZONES_TOP, ZONES_BOARD } from '../src/designer/geometry/sand.js';
import { REGION_KINDS, REGION_DEFAULTS } from '../src/designer/geometry/region.js';

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
  /* Half a sheet, split corner to corner — sand one side, cream "water" the other. Sandeep's beach
     theme, and the question it asks of the generator: can a drift fill a chosen AREA rather than a
     ring round the cake? An outline is already a first-class shape (surface.js), so this costs
     nothing to try. */
  wedge: { kind: 'outline', halfW: 1.35, halfD: 0.95,
           outline: [{ x: -1.35, z: -0.95 }, { x: 1.35, z: 0.95 }, { x: 1.35, z: -0.95 }] },
  // An off-centre patch, to show where the radial reach stops being able to answer.
  corner: { kind: 'outline', halfW: 1.35, halfD: 0.95,
            outline: [{ x: 0.2, z: -0.8 }, { x: 1.3, z: -0.8 }, { x: 1.3, z: 0.1 }, { x: 0.2, z: 0.1 }] },
};
const PARAMS = new URLSearchParams(location.search);
const SHAPE = SHAPES[PARAMS.get('shape')] ?? SHAPES.round;
/* `?cam=top` looks down on the cake, which is the only way to judge a drift on the TOP. Dragging
   to get there is not repeatable — two shots of the same sand from two angles cannot be compared,
   and orbiting by synthetic pointer moves tilts the opposite way to the intuition every time. */
const CAM = PARAMS.get('cam') === 'top' ? [0, 3.5, 3.0] : [0, 1.9, 4.4];

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
      {/* Both at once, as the first reference does — a board ring AND sand on the top. */}
      {p.board && <SandBed shape={SHAPE} topY={BOARD_H} zone={ZONES_BOARD} size={p.width} {...p} region={null} />}
      {p.top && <SandBed shape={SHAPE} topY={BOARD_H + BOTTOM_H} zone={ZONES_TOP} size={p.topSize}
                  {...p} region={p.region} />}
      {/* ⚠️ PEBBLES SEATED THROUGH `sandHeightAt`, which is the only way to SEE whether the number a
          shell is seated on describes the sand it is seated in. A test can say the sampler agrees
          with the mesh to within the grain; only a picture says whether that reads as resting on it.
          `?pebbles=1`. */}
      {p.top && p.pebbles && (() => {
        const at = sandHeightAt(SHAPE, sandMoundOpts({
          span: sandSpan(ZONES_TOP, p.topSize), rise: p.rise, moundNoise: p.moundNoise,
          moundGrain: p.moundGrain, edgeBreak: p.edgeBreak, region: p.region, seed: p.seed }));
        const R = 0.075;
        return [[0, 0], [0.5, 0.25], [-0.45, 0.4], [0.25, -0.55], [-0.6, -0.3], [0.85, 0.1]].map(([x, z], k) => (
          <mesh key={k} position={[x, BOARD_H + BOTTOM_H + at(x, z) + R * 0.45, z]} castShadow receiveShadow>
            <sphereGeometry args={[R, 20, 14]} />
            <meshStandardMaterial color="#8d7f72" roughness={0.65} metalness={0} />
          </mesh>
        ));
      })()}
      <OrbitControls target={[0, PARAMS.get('cam') === 'top' ? BOARD_H + BOTTOM_H * 0.8 : BOARD_H + 0.3, 0]} />
    </>
  );
}

/* ⚠️ EVERY PARAMETER IS OVERRIDABLE FROM THE URL, so a shot is repeatable and two shots are
   comparable. Without this the only state a script could reach was the defaults: three renders went
   out labelled `topSize=1` that were all the default 0.62, because `?shape=` and `?cam=` were the
   only keys read and the rest silently fell back. A harness that cannot be addressed is a harness
   only its author can use. `board` and `top` take 0/1; everything else is a number. */
const INITIAL = (() => {
  /* The region is flattened into `rg*` keys so each one is a plain number a slider and a URL can
     both carry — `?rgKind=triangle&rgSize=0.8`. It is reassembled on the way into SandBed. */
  const out = {
    ...SAND_DEFAULTS, board: true, top: true, rgOn: false, pebbles: false,
    rgKind: REGION_DEFAULTS.kind, rgSize: REGION_DEFAULTS.size, rgAspect: REGION_DEFAULTS.aspect,
    rgRotation: REGION_DEFAULTS.rotation, rgX: REGION_DEFAULTS.x, rgZ: REGION_DEFAULTS.z,
  };
  for (const [k, v] of PARAMS) {
    if (k === 'shape' || k === 'cam') continue;
    if (!(k in out)) { console.warn(`sand harness: no parameter "${k}"`); continue; }
    out[k] = k === 'board' || k === 'top' || k === 'rgOn' || k === 'pebbles' ? v !== '0' && v !== 'false'
           : k === 'colour' || k === 'rgKind' ? v : Number(v);
  }
  return out;
})();

function App() {
  const [p, setP] = useState(INITIAL);
  // Memoised, or SandBed rebuilds the whole lattice on every render — see SandStudio for the why.
  const region = useMemo(
    () => (p.rgOn ? { kind: p.rgKind, size: p.rgSize, aspect: p.rgAspect,
                      rotation: p.rgRotation, x: p.rgX, z: p.rgZ } : null),
    [p.rgOn, p.rgKind, p.rgSize, p.rgAspect, p.rgRotation, p.rgX, p.rgZ]);
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
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {['board', 'top'].map(k => (
            <button key={k} onClick={() => setP(q => ({ ...q, [k]: !q[k] }))} style={{
              flex: 1, padding: '5px 0', fontSize: 11.5, borderRadius: 6, cursor: 'pointer',
              border: '1.5px solid #1a1a1a', background: p[k] ? '#1a1a1a' : '#fff',
              color: p[k] ? '#fff' : '#1a1a1a', fontWeight: 600, fontFamily: 'inherit',
            }}>{k === 'board' ? 'Board' : 'Top'}</button>
          ))}
        </div>
        {sl('width', 0.08, 0.9, 0.01)}
        {sl('topSize', 0.15, 1, 0.01)}
        {sl('spacing', 0.018, 0.08, 0.001)}
        {sl('grainSize', 0.008, 0.055, 0.001)}
        {sl('sizeVary', 0, 1.2, 0.01)}
        {sl('rise', 0, 0.14, 0.002)}
        {sl('moundNoise', 0, 1, 0.01)}
        {sl('moundGrain', 0, 1.5, 0.01)}
        {sl('edgeBreak', 0, 1, 0.01)}
        {sl('falloff', 0, 1, 0.01)}
        {sl('shadeVary', 0, 0.6, 0.01)}
        {sl('roughness', 0.3, 1, 0.01)}
        {sl('moundStep', 0.006, 0.04, 0.001)}
        <div style={{ margin: '12px 0 6px', fontSize: 11.5, fontWeight: 600 }}>Area (top only)</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button onClick={() => setP(q => ({ ...q, rgOn: !q.rgOn }))} style={{
            flex: 1, padding: '5px 0', fontSize: 11.5, borderRadius: 6, cursor: 'pointer',
            border: '1.5px solid #1a1a1a', background: p.rgOn ? '#1a1a1a' : '#fff',
            color: p.rgOn ? '#fff' : '#1a1a1a', fontWeight: 600, fontFamily: 'inherit',
          }}>{p.rgOn ? 'On' : 'Off'}</button>
          {Object.keys(REGION_KINDS).map(k => (
            <button key={k} onClick={() => setP(q => ({ ...q, rgKind: k, rgOn: true }))} style={{
              flex: 1, padding: '5px 0', fontSize: 11.5, borderRadius: 6, cursor: 'pointer',
              border: '1.5px solid #1a1a1a', background: p.rgKind === k ? '#1a1a1a' : '#fff',
              color: p.rgKind === k ? '#fff' : '#1a1a1a', fontWeight: 600, fontFamily: 'inherit',
            }}>{k}</button>
          ))}
        </div>
        {sl('rgSize', 0.1, 1.2, 0.01)}
        {sl('rgAspect', 0.25, 4, 0.05)}
        {sl('rgRotation', 0, 6.28, 0.02)}
        {sl('rgX', -1, 1, 0.02)}
        {sl('rgZ', -1, 1, 0.02)}
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
        <Canvas shadows camera={{ position: CAM, fov: 42 }}>
          <color attach="background" args={['#efeae2']} />
          <Scene p={{ ...p, region }} />
        </Canvas>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
