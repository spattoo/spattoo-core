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

function Tier({ lip, seed }) {
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
    () => (q.get('off') === '1' || lip <= 0 ? null : buildTopCavity(SHAPE, HEIGHT, cfg)),
    [cfg.lip, cfg.dish, cfg.width, cfg.crest, cfg.wobble, cfg.swells, cfg.seed],
  );
  useEffect(() => () => cavity?.dispose(), [cavity]);

  const body = useMemo(() => (SHAPE.kind === 'rect'
    ? new THREE.BoxGeometry(SHAPE.halfW * 2, HEIGHT, SHAPE.halfD * 2).translate(0, HEIGHT / 2, 0)
    : new THREE.CylinderGeometry(SHAPE.radius, SHAPE.radius, HEIGHT, 160).translate(0, HEIGHT / 2, 0)), []);

  /* ⚠️ ONE MATERIAL DESCRIPTOR, TWO MESHES. Two `meshStandardMaterial` tags with the same props are
     two materials, and they drift the moment either is tuned — which is the whole failure mode this
     is meant to avoid, a ring that reads as a separate object. */
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.82, metalness: 0 }), []);

  return (
    <group>
      <mesh geometry={body} material={mat} castShadow receiveShadow />
      {cavity && <mesh geometry={cavity} material={mat} position={[0, HEIGHT, 0]} castShadow receiveShadow />}
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
    <Canvas shadows camera={{ position: [0, num('cam', 2.5), num('dist', 3.3)], fov: 32 }} style={{ height: '100%' }}>
      <SceneLights />
      <SceneEnv />
      <Tier lip={lip} seed={seed} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3, 64]} />
        <meshStandardMaterial color="#efe9e2" roughness={1} />
      </mesh>
      <OrbitControls target={[0, 0.7, 0]} />
    </Canvas>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
