import { createRoot } from 'react-dom/client';
import { useMemo, useState, useEffect } from 'react';
import { SizeDial } from '../src/designer/shared/SizeDial.jsx';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import './scene.js';
import { SceneLights, SceneEnv } from '../src/designer/canvas/CakeCanvas.jsx';
import { buildTopCavity, CAVITY_DEFAULTS } from '../src/designer/geometry/topCavity.js';

/* ── A dished cake top with a raised cream lip ───────────────────────────────────────────────────
 *
 * Sandeep, with two reference photographs: *"top edge of the cake has a cavity. there is cream
 * elevation at the edges... for a existing cake shape, baker would choose that top cavity, then it
 * should build that cavity with same cream color."*
 *
 * ⚠️ THE QUESTION THE PICTURE HAS TO ANSWER is whether it reads as CREAM SCRAPED UP or as an edge
 * cut away. The profile has a crest with a fall on both sides for exactly that reason, and whether
 * the numbers behind it are right is not something a test can say.
 *
 * ⚠️ AND IT IS THE SAME COLOUR AS THE TIER, WHICH IS NOT A DETAIL. This is not a decoration sitting
 * on a cake; it is the cake's own cream, pushed about. One material, taken from the tier, or the
 * ring reads as a separate object balanced on the rim.
 *
 *   /top-cavity.html                     a round tier, the defaults
 *   /top-cavity.html?shape=rect          a sheet cake — the same ring, walked round a rectangle
 *   /top-cavity.html?lip=0&dish=0.05     dish only: does the edge still read?
 *   /top-cavity.html?dish=0&lip=0.09     lip only: a bowl rim with a flat floor
 *   /top-cavity.html?crest=0.6           the ridge pushed inward, away from the very edge
 *   /top-cavity.html?off=1               no cavity at all, the control case
 *   /top-cavity.html?tiers=3             a stack — does a raised rim clear the tier above it?
 *   /top-cavity.html?wobble=0            the machined torus this started as — the control for the
 *                                        thing that matters most, and the one to keep looking at
 *   /top-cavity.html?swells=6            fewer, slower passes of the scraper
 *   /top-cavity.html?seed=3              a different cake with the same settings
 */
const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);

const HEIGHT = 1.0;
const SHAPE = q.get('shape') === 'rect'
  ? { kind: 'rect', halfW: 1.25, halfD: 0.85, cornerR: 0.22 }
  : { kind: 'round', radius: 1.1 };

/* ── A stack, because one tier cannot answer the question ───────────────────────────────────────
 *
 * ⚠️ `?tiers=3` EXISTS BECAUSE NEITHER OF US HAD SEEN IT. Sandeep: *"this works only on the top
 * tier. for example if its a 3 tier cake"* — then, a minute later: *"sorry, there is nothing wrong
 * if its applied to a lower tier. its only edge, so not really a proble."* He is almost certainly
 * right: a tier rests well inside the rim, so a raised edge has nothing to collide with. But "almost
 * certainly right" about geometry is what a picture is for, and a harness that can only draw one
 * tier cannot be asked.
 *
 * Each tier is 80% of the one below, which is roughly how a real stack steps in.
 */
const TIERS = Math.max(1, Math.min(4, Number(q.get('tiers') ?? 1)));
const STACK = Array.from({ length: TIERS }, (_, i) => ({
  shape: SHAPE.kind === 'rect'
    ? { ...SHAPE, halfW: SHAPE.halfW * 0.8 ** i, halfD: SHAPE.halfD * 0.8 ** i, cornerR: SHAPE.cornerR * 0.8 ** i }
    : { ...SHAPE, radius: SHAPE.radius * 0.8 ** i },
  /* Lower tiers are shorter, as they are on a real cake — and it keeps the whole stack in frame. */
  height: HEIGHT * (i === TIERS - 1 ? 1 : 0.8),
}));
const BASE_Y = STACK.reduce((y, t, i) => (i === 0 ? [0] : [...y, y[i - 1] + STACK[i - 1].height]), [0]);
/* ⚠️ THE CAMERA IS FITTED TO THE STACK, NOT NUDGED TOWARDS IT. Adding a fraction of the top tier's
   height to a hand-picked position framed one tier well, two poorly and a rectangle off the edge of
   the picture — which is a contact sheet that cannot be compared, the exact failure the reference
   panel was added to fix. Derived from the stack's own extent instead. */
const TOTAL_H = BASE_Y[TIERS - 1] + STACK[TIERS - 1].height;
const SPAN = SHAPE.kind === 'rect' ? Math.max(SHAPE.halfW, SHAPE.halfD) : SHAPE.radius;
const EYE_Y = num('cam', TOTAL_H * 1.15 + SPAN * 0.7);
const EYE_D = num('dist', SPAN * 2.0 + TOTAL_H * 0.9);
const LOOK_Y = TOTAL_H * 0.62;

/* The cake's own cream. One colour for the tier and the cavity — see above. */
const CREAM = q.get('cream') ?? '#b9c8e8';

/* ── The two controls a baker gets ──────────────────────────────────────────────────────────────
 *
 * Sandeep, once the shape was right: *"there should be 2 options - 1. adjustable height of the
 * elevation option. 2. randamizing the irregularity."*
 *
 * ⚠️ HEIGHT IS A DIAL AND IRREGULARITY IS A BUTTON, and the asymmetry is the point rather than an
 * inconsistency. Height is a quantity with a direction — more, less, and a baker knows which way
 * they want it. The irregularity is not: nobody wants "seed 7" over "seed 8", they want to see
 * another one. A dial over a seed would be a control whose numbers carry no meaning, which is worse
 * than a button that admits it.
 *
 * ⚠️ AND THE OTHER NUMBERS STAY OUT OF THE WAY. Width, crest, swells and wobble were each chosen
 * against the photograph and are what MAKE it read as cream; handing them to a baker is handing
 * over the chance to make it read as something else. They stay authorable in the URL here, and
 * belong to an admin row rather than a customer card when this is wired up.
 */
function Panel({ lip, onLip, seed, onShuffle }) {
  const row = { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 };
  const cap = { fontSize: 11, fontWeight: 800, color: '#6B8C74', letterSpacing: 0.4, textTransform: 'uppercase' };
  return (
    <div style={{ width: 210, padding: 20, borderRight: '1.5px solid #E8E4DC', background: '#fff',
                  fontFamily: "'Quicksand',system-ui,sans-serif" }}>
      <div style={{ ...cap, marginBottom: 14 }}>Top cavity</div>

      <div style={row}>
        {/* The shared dial, not a range input — CLAUDE.md names it "THE size control", and using it
            here is also a preview of what the real control would feel like. */}
        <SizeDial size={lip} min={0} max={0.18} step={0.005} onChange={onLip}
                  fmt={v => (v === 0 ? 'flat' : `${Math.round(v * 1000) / 10}`)} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#2C4433' }}>Height</div>
          <div style={{ fontSize: 11, color: '#8a8a8a' }}>how proud the rim stands</div>
        </div>
      </div>

      <div style={row}>
        <button type="button" onClick={onShuffle}
          style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid #2C4433', background: '#2C4433',
                   color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          Shuffle
        </button>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#2C4433' }}>Irregularity</div>
          <div style={{ fontSize: 11, color: '#8a8a8a' }}>another hand&rsquo;s pass &middot; #{seed}</div>
        </div>
      </div>

      <div style={{ fontSize: 10.5, color: '#b29aa2', lineHeight: 1.5, marginTop: 6 }}>
        Width, crest, swells and wobble were chosen against the reference photographs and stay in the
        URL — they are what make it read as cream rather than as a moulding.
      </div>
    </div>
  );
}

function Tier({ lip, seed, shape, height, y }) {
  const cfg = {
    lip,
    seed,
    dish:   num('dish',   CAVITY_DEFAULTS.dish),
    width:  num('width',  CAVITY_DEFAULTS.width),
    crest:  num('crest',  CAVITY_DEFAULTS.crest),
    wobble: num('wobble', CAVITY_DEFAULTS.wobble),
    swells: num('swells', CAVITY_DEFAULTS.swells),
  };
  const cavity = useMemo(
    () => (q.get('off') === '1' || lip <= 0 ? null : buildTopCavity(shape, height, cfg)),
    [shape, height, cfg.lip, cfg.dish, cfg.width, cfg.crest, cfg.wobble, cfg.swells, cfg.seed],
  );
  useEffect(() => () => cavity?.dispose(), [cavity]);

  const body = useMemo(() => (shape.kind === 'rect'
    ? new THREE.BoxGeometry(shape.halfW * 2, height, shape.halfD * 2).translate(0, height / 2, 0)
    : new THREE.CylinderGeometry(shape.radius, shape.radius, height, 160).translate(0, height / 2, 0)),
  [shape, height]);

  /* ⚠️ ONE MATERIAL DESCRIPTOR, TWO MESHES. Two `meshStandardMaterial` tags with the same props are
     two materials, and they drift the moment either is tuned — which is the whole failure mode this
     is meant to avoid, a ring that reads as a separate object. */
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.82, metalness: 0 }), []);

  return (
    <group position={[0, y, 0]}>
      <mesh geometry={body} material={mat} castShadow receiveShadow />
      {cavity && <mesh geometry={cavity} material={mat} position={[0, height, 0]} castShadow receiveShadow />}
    </group>
  );
}

function App() {
  const [lip, setLip] = useState(num('lip', CAVITY_DEFAULTS.lip));
  /* A fresh number, not the next one. "Seed 8 after seed 7" invites the idea that they are ordered
     and that somewhere further along is a better one; they are just different hands. */
  const [seed, setSeed] = useState(num('seed', CAVITY_DEFAULTS.seed));
  /* ⚠️ LOOKING DOWN, because the subject is the TOP. The first camera here sat at eye level and
     photographed the wall: the ridge showed as a hairline against the sky and the dish not at all,
     which is a picture of the wrong thing. `?cam=` sweeps the height — a dished top reads
     differently from every angle and one of them is the one a customer sees.

     (Written as a JSX comment inside `return (`, which is not a thing: a {} container has to sit
     inside an element. Vite said so in one line and the page served a 500 until it moved here.) */
  return (
    <div style={{ height: '100%', display: 'flex' }}>
      <Panel lip={lip} onLip={setLip} seed={seed}
             onShuffle={() => setSeed(1 + Math.floor(Math.random() * 9999))} />
    <Canvas shadows camera={{ position: [0, EYE_Y, EYE_D], fov: 32 }} style={{ height: '100%' }}>
      <SceneLights />
      <SceneEnv />
      {/* ⚠️ A DIFFERENT SEED PER TIER, or a three-tier cake wears the same edge three times — the
          one thing a hand-scraped rim never does, and more obviously wrong than the uniform ring
          this whole feature started as. */}
      {STACK.map((t, i) => (
        <Tier key={i} lip={lip} seed={seed + i * 37} shape={t.shape} height={t.height} y={BASE_Y[i]} />
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3, 64]} />
        <meshStandardMaterial color="#efe9e2" roughness={1} />
      </mesh>
      <OrbitControls target={[0, LOOK_Y, 0]} />
    </Canvas>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
