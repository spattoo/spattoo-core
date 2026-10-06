import { useMemo, useState } from 'react';
/* ⚠️ `?env=fallback` DELIBERATELY BREAKS THE LIGHTING, so the two can be told apart.
 *
 * Sandeep: "i think the environment HDR settings are very different in admin… so much exposure."
 * The file is the same — both servers hand out the same 97886-byte lebombo_256.hdr — but a browser
 * that fails to LOAD it falls back to drei's indoor `apartment` preset, silently, and that would
 * look exactly like too much exposure. Serving the bytes does not prove the loader took them.
 *
 * So this renders the fallback on purpose. Compare it with the normal page: if admin looks like the
 * fallback, admin is falling back and the console says so ("[spattoo/env] No assets base
 * configured"). If admin looks like the normal page, the lighting is not the difference. */
import './scene.js';
import { configureEnvMap } from '../src/designer/canvas/envMap.js';
if (new URLSearchParams(location.search).get('env') === 'fallback') configureEnvMap(null);
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { SceneEnv, SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
import { buildWaferSkirt, WAFER_DEFAULTS } from '../src/designer/geometry/waferPaper.js';
import { WAFER_PAPER_MATERIAL, waferFibreTexture } from '../src/designer/geometry/waferPaperMaterial.js';

/* ── Does it read as wafer paper? Open /wafer-paper.html ─────────────────────────────────────────
 *
 * Step 1, and deliberately the only step until the look is judged. The grass harness next door
 * states the reason and it has already been paid for twice: "the two procedural studios that never
 * shipped (isomalt, palette knife) both got as far as a studio before anyone judged the look."
 *
 * The references are ON THIS PAGE, beside the render, because a comparison nobody can make side by
 * side is a comparison nobody makes. They live in dev/refs/ and are gitignored — they are other
 * people's cakes.
 *
 * WHAT TO JUDGE, roughly in the order it is likely to be wrong:
 *   1. SILHOUETTE. The references are sold by their ragged top edge and the gaps between panels.
 *      A continuous skirt with no sky between the panels is the failure mode.
 *   2. Does light come THROUGH it? Wafer paper is 0.3mm of starch. If it reads as painted card,
 *      the material is wrong and no amount of geometry will fix it.
 *   3. Do the panels overlap like paper, or intersect like two planes? Look where they cross.
 *   4. The hem: cut (straight/zigzag) in every reference, never rounded.
 *   5. Variation. If the eye finds a repeat, `jitter` is too low or the seed is unlucky.
 */

const TIER = { radius: 1.5, height: 1.15, baseY: 0.1 };
const TOP_Y = TIER.baseY + TIER.height;
const SHAPES = {
  round: { kind: 'round', radius: TIER.radius },
  sheet: { kind: 'rect', halfW: 1.7, halfD: 1.15, cornerR: 0.2 },
};

/* Four looks taken off the four photographs, so the page opens on something arguable rather than on
   a default nobody chose. Each is a claim about what that cake IS, and is wrong until it looks right. */
const PRESETS = {
  'pink notched': { count: 30, width: 2.0, height: 0.80, rise: 0.22, taper: 0.02, ripple: 0.14, ripples: 1.6, sway: 0.05, sways: 0.5, curl: 0.10, splay: 0.10, lean: 0.03, jitter: 0.30,
                    hem: 'notch', notch: 0.18, colour: '#f2766d', opacity: 0.93 },
  'white waves':  { count: 34, width: 2.3, height: 0.95, rise: 0.04, taper: 0.18, ripple: 0.30, ripples: 3.0, sway: 0.10, sways: 1.0, curl: 0.35, splay: 0.26, lean: 0.05, jitter: 0.45,
                    hem: 'straight', notch: 0.10, colour: '#fbf7f2', opacity: 0.88 },
  'white ripple': { count: 44, width: 2.0, height: 0.92, rise: 0.02, taper: 0.22, ripple: 0.26, ripples: 4.2, sway: 0.12, sways: 1.2, curl: 0.22, splay: 0.18, lean: 0.03, jitter: 0.50,
                    hem: 'torn', notch: 0.12, colour: '#fdfbf7', opacity: 0.86 },
  'white panels': { count: 20, width: 2.4, height: 0.98, rise: 0.06, taper: 0.06, ripple: 0.22, ripples: 1.4, sway: 0.06, sways: 0.6, curl: 0.45, splay: 0.12, lean: 0.02, jitter: 0.35,
                    hem: 'straight', notch: 0.10, colour: '#ffffff', opacity: 0.82 },
};

const REFS = {
  'pink notched': 'refs/ref1-pink-notched.jpg',
  'white waves':  'refs/ref2-white-waves.png',
  'white ripple': 'refs/ref3-white-ripple.png',
  'white panels': 'refs/ref4-white-panels.png',
};

function Skirt({ shape, p }) {
  // One texture for the whole skirt, rebuilt only when the grain strength changes.
  const fibre = useMemo(() => waferFibreTexture({ strength: p.fibre }), [p.fibre]);
  const geom = useMemo(() => buildWaferSkirt({
    shape, tierHeight: TIER.height, radius: TIER.radius,
    count: p.count, width: p.width, height: p.height, rise: p.rise, taper: p.taper,
    ripple: p.ripple, ripples: p.ripples, sway: p.sway, sways: p.sways,
    curl: p.curl, splay: p.splay, lean: p.lean,
    jitter: p.jitter, hem: p.hem, notch: p.notch, seed: p.seed,
    shingle: p.shingle, nest: p.nest,
    meander: p.meander, meanders: p.meanders, skew: p.skew, meanderLaps: p.meanderLaps,
  }), [shape, p]);
  if (!geom) return null;
  return (
    <mesh geometry={geom} position={[0, TOP_Y, 0]} castShadow receiveShadow>
      {/* ⚠️ DoubleSide, because a sheet of paper has no back. A single-sided panel disappears the
          moment the cake turns and you are looking at its inside face — which is half of every
          panel on the far side of the cake. */}
      {/* ⚠️ NO `transparent` / `opacity` HERE WHILE TRANSMISSION IS ON. That pair puts the mesh on
          the alpha-blended path and throws the transmission away — which is why the first render
          had two overlapping panels the same flat pink instead of getting denser where they cross.
          `alpha` is kept as a SEPARATE mode so the two can be compared rather than argued about. */}
      {p.alpha ? (
        <meshStandardMaterial color={p.colour} side={THREE.DoubleSide} roughness={p.roughness}
          transparent opacity={p.opacity} />
      ) : (
        <meshPhysicalMaterial
          color={p.colour} side={THREE.DoubleSide}
          roughness={p.roughness} transmission={p.transmission}
          thickness={p.thickness} ior={WAFER_PAPER_MATERIAL.ior}
          sheen={p.sheen} sheenRoughness={WAFER_PAPER_MATERIAL.sheenRoughness}
          sheenColor="#ffffff" specularIntensity={p.specular}
          roughnessMap={p.fibre > 0 ? fibre : null}
          metalness={0} />
      )}
    </mesh>
  );
}

/* Any knob can be set in the URL: ?count=24&width=2.1&ripples=6&splay=0.1 … so a sweep is a list of
   addresses rather than a hand on a slider, and a render that looked right can be reproduced
   exactly. Numbers only; anything absent falls through to the preset. */
function fromUrl() {
  const q = new URLSearchParams(location.search);
  const out = {};
  for (const [k, v] of q) {
    if (k === 'hem' || k === 'colour' || k === 'bg' || k === 'cake') { out[k] = v; continue; }
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export default function Harness() {
  const [preset, setPreset] = useState(new URLSearchParams(location.search).get('preset') || 'white waves');
  const [shapeKey, setShapeKey] = useState('round');
  const [p, setP] = useState(() => {
    const base = PRESETS[new URLSearchParams(location.search).get('preset') || 'white waves'];
    return { ...WAFER_DEFAULTS, ...base, seed: 7, roughness: 0.92, transmission: 0.35,
             physical: true, ...fromUrl() };
  });
  const set = (k) => (v) => setP(o => ({ ...o, [k]: v }));
  const pick = (name) => { setPreset(name); setP(o => ({ ...o, ...PRESETS[name] })); };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Quicksand',sans-serif" }}>
      <div style={{ width: 290, padding: 16, background: '#faf7f8', overflowY: 'auto', fontSize: 13 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>Wafer paper — does it read?</h2>

        <Row label="Reference">
          {Object.keys(PRESETS).map(k => (
            <Btn key={k} on={preset === k} onClick={() => pick(k)}>{k}</Btn>
          ))}
        </Row>
        <img src={REFS[preset]} alt={preset}
             style={{ width: '100%', borderRadius: 8, margin: '6px 0 10px', display: 'block' }} />

        <Row label="Tier">
          {Object.keys(SHAPES).map(k => (
            <Btn key={k} on={shapeKey === k} onClick={() => setShapeKey(k)}>{k}</Btn>
          ))}
        </Row>

        <Sl label="Panels"        v={p.count}  min={8}  max={110} step={1}    on={set('count')} int />
        <Sl label="Width × gap"   v={p.width}  min={0.5} max={2.6} step={0.05} on={set('width')} />
        <Sl label="Height × tier" v={p.height} min={0.3} max={1.3} step={0.02} on={set('height')} />
        <Sl label="Rise above rim" v={p.rise}  min={-0.1} max={0.4} step={0.01} on={set('rise')} />
        <Sl label="Taper"         v={p.taper}  min={0}   max={0.7} step={0.02} on={set('taper')} />
        <Sl label="Fold depth"    v={p.ripple}  min={0} max={0.8} step={0.02} on={set('ripple')} />
        <Sl label="Folds across"  v={p.ripples} min={0.5} max={8}  step={0.1}  on={set('ripples')} />
        <Sl label="Drift"         v={p.sway}    min={0} max={0.5} step={0.02} on={set('sway')} />
        <Sl label="Curl (bow)"    v={p.curl}   min={0}   max={1}   step={0.02} on={set('curl')} />
        <Sl label="Splay"         v={p.splay}  min={0}   max={0.6} step={0.02} on={set('splay')} />
        <Sl label="Lean"          v={p.lean}   min={-0.2} max={0.35} step={0.01} on={set('lean')} />
        <Sl label="Meander"       v={p.meander} min={0} max={0.9} step={0.02} on={set('meander')} />
        <Sl label="Meanders"      v={p.meanders} min={0.3} max={5} step={0.1} on={set('meanders')} />
        <Sl label="Laps round cake" v={p.meanderLaps} min={0.5} max={8} step={0.5} on={set('meanderLaps')} />
        <Sl label="Skew"          v={p.skew} min={0} max={1.2} step={0.05} on={set('skew')} />
        <Sl label="Shingle"       v={p.shingle} min={0} max={0.06} step={0.002} on={set('shingle')} />
        <Sl label="Nest"          v={p.nest} min={0} max={1} step={0.05} on={set('nest')} />
        <Sl label="Jitter"        v={p.jitter} min={0}   max={1}   step={0.02} on={set('jitter')} />

        <Row label="Hem">
          {['straight', 'notch', 'torn', 'round', 'petal'].map(h => (
            <Btn key={h} on={p.hem === h} onClick={() => setP(o => ({ ...o, hem: h }))}>{h}</Btn>
          ))}
        </Row>
        <Sl label="Cut depth / shoulder" v={p.notch} min={0} max={0.4} step={0.01} on={set('notch')} />
        <Sl label="Seed"      v={p.seed}  min={1} max={40}  step={1}    on={set('seed')} int />

        <Row label="Paper">
          <Btn on={!p.alpha} onClick={() => setP(o => ({ ...o, alpha: 0 }))}>transmission</Btn>
          <Btn on={!!p.alpha} onClick={() => setP(o => ({ ...o, alpha: 1 }))}>alpha (the old one)</Btn>
        </Row>
        <Sl label="Transmission" v={p.transmission} min={0} max={1} step={0.02} on={set('transmission')} />
        <Sl label="Thickness"    v={p.thickness} min={0.01} max={0.5} step={0.01} on={set('thickness')} />
        <Sl label="Roughness"    v={p.roughness} min={0.2} max={1} step={0.02} on={set('roughness')} />
        <Sl label="Sheen (fibre lobe)" v={p.sheen} min={0} max={1} step={0.02} on={set('sheen')} />
        <Sl label="Specular"     v={p.specular} min={0} max={1} step={0.02} on={set('specular')} />
        <Sl label="Grain"        v={p.fibre} min={0} max={1} step={0.02} on={set('fibre')} />
        <Sl label="Opacity (alpha mode)" v={p.opacity} min={0.4} max={1} step={0.02} on={set('opacity')} />
        <Row label="Colour">
          {['#ffffff', '#fbf7f2', '#f2766d', '#f6c6cf', '#d9c7f0'].map(c => (
            <button key={c} onClick={() => setP(o => ({ ...o, colour: c }))}
              style={{ width: 26, height: 26, borderRadius: 5, background: c, cursor: 'pointer',
                       border: p.colour === c ? '2.5px solid #1a1a1a' : '1px solid #ccc' }} />
          ))}
        </Row>
      </div>

      <div style={{ flex: 1, position: 'relative', background: p.bg || '#efe7e2' }}>
        <Canvas shadows camera={{ position: [0, 2.2, 5.0], fov: 40 }}
          gl={{ preserveDrawingBuffer: true }} style={{ position: 'absolute', inset: 0 }}>
          <color attach="background" args={[p.bg || '#efe7e2']} />
          {/* THE shared rig — see dev/grass.jsx and INVARIANTS #17. A harness lit differently from
              production cannot judge a material whose whole character is how light passes through it. */}
          {/* ⚠️ `shadows` — SceneLights only casts when asked, and without it the key light lands on
              every sheet and leaves no dark anywhere. The references are full of deep shadow BETWEEN
              the sheets, and that is most of what separates one panel from the next on a white cake.
              The harness ran without it while the admin studio had it, so the two were not the same
              scene and I was judging from the wrong one. */}
          <SceneLights shadows />
          <SceneEnv />

          {shapeKey === 'round' ? (
            <mesh position={[0, TIER.baseY + TIER.height / 2, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[TIER.radius, TIER.radius, TIER.height, 72]} />
              <meshStandardMaterial color={p.cake || '#f6efe4'} roughness={0.9} />
            </mesh>
          ) : (
            <mesh position={[0, TIER.baseY + TIER.height / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[SHAPES.sheet.halfW * 2, TIER.height, SHAPES.sheet.halfD * 2]} />
              <meshStandardMaterial color={p.cake || '#f6efe4'} roughness={0.9} />
            </mesh>
          )}

          <Skirt shape={SHAPES[shapeKey]} p={p} />

          {/* ⚠️ THE FLOOR IS NOT SCENERY — it is the only thing in the scene that can RECEIVE the
              key light's shadow. Without it the cake and the skirt are lit correctly and cast into
              nothing, and the whole frame reads as flat and glaring however right the material is.
              `?floor=0` reproduces a studio that forgot it. */}
          {p.floor !== 0 && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <circleGeometry args={[7, 48]} />
              <meshStandardMaterial color={p.bg || '#efe7e2'} roughness={1} />
            </mesh>
          )}
          <OrbitControls target={[0, TOP_Y * 0.55, 0]} />
        </Canvas>
      </div>
    </div>
  );
}

const Row = ({ label, children }) => (
  <div style={{ margin: '8px 0' }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 4 }}>{label}</div>
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{children}</div>
  </div>
);
const Btn = ({ on, children, ...r }) => (
  <button {...r} style={{ padding: '4px 9px', fontSize: 11.5, borderRadius: 6, cursor: 'pointer',
    border: on ? '1.5px solid #1a1a1a' : '1px solid #ccc', background: on ? '#1a1a1a' : '#fff',
    color: on ? '#fff' : '#333', fontFamily: 'inherit' }}>{children}</button>
);
const Sl = ({ label, v, min, max, step, on, int }) => (
  <label style={{ display: 'block', margin: '7px 0' }}>
    <span style={{ fontSize: 11, color: '#666' }}>{label} <b style={{ color: '#1a1a1a' }}>
      {int ? v : Number(v).toFixed(2)}</b></span>
    <input type="range" min={min} max={max} step={step} value={v} style={{ width: '100%' }}
      onChange={e => on(int ? parseInt(e.target.value, 10) : parseFloat(e.target.value))} />
  </label>
);

createRoot(document.getElementById('root')).render(<Harness />);
