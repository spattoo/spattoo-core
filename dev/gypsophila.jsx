import { useState } from 'react';
import './scene.js';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { SceneEnv, SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
import GypCloud from '../src/designer/canvas/GypCloud.jsx';
import { buildGypSprig, GYP_DEFAULTS } from '../src/designer/geometry/gypsophila.js';

/* ── Does one sprig read as gypsophila? Open /gypsophila.html ────────────────────────────────────
 *
 * STEP 1, and deliberately the only step until this question is answered — the same order grass.jsx
 * used, and the order the two procedural studios that never shipped (isomalt, palette knife) did
 * NOT: both got as far as a studio before anybody judged the look.
 *
 * ⚠️ IT OPENS ON ONE SPRIG, BIG. A fault is invisible at tier scale: a hundred sprigs read as a
 * white haze whatever each one is doing, and the haze flatters it. Judge the single stem first and
 * only then press "a band round the rim".
 *
 * WHAT TO JUDGE, roughly in the order it is likely to be wrong:
 *   1. SILHOUETTE. Gypsophila is sold by its airiness — stems you can see daylight through, with
 *      the mass out at the tips. A solid blob is the failure.
 *   2. Do the tips read as CLUSTERS of small blooms, or as single berries on sticks?
 *   3. Is the forking irregular? Always-three reads as a fishbone and the eye finds it fast.
 *   4. Only then: does a band of them look like the reference cakes?
 *
 * ⚠️ Lit by `SceneLights` / `SceneEnv` — the components production mounts (INVARIANTS #17). A
 * harness with its own rig judges a scene no customer sees.
 */

const TIER = { radius: 1.5, height: 1.1, baseY: 0.1 };
const TOP_Y = TIER.baseY + TIER.height;
const SHAPES = {
  round: { kind: 'round', radius: TIER.radius },
  sheet: { kind: 'rect', halfW: 1.6, halfD: 1.15, cornerR: 0.2 },
};

/* The arrangements the references actually show, as seat options rather than as four code paths. */
const LAYOUTS = {
  'one sprig':      { solo: true },
  'a few, close':   { spacing: 0.34, jitter: 0.8 },
  'ring the rim':   { spacing: 0.12, jitter: 0.7, bandInner: 0.82, overhang: 0.6 },
  'cover the top':  { spacing: 0.16, jitter: 0.75 },
  'two clumps':     { spacing: 0.10, jitter: 0.8, patches: [{ u: 0.12, v: 0.55, r: 0.45 },
                                                            { u: 0.62, v: 0.5, r: 0.38 }] },
};

function Solo({ p }) {
  const geo = buildGypSprig(p);
  return (
    <mesh geometry={geo} position={[0, 0, 0]} castShadow receiveShadow scale={3.2}>
      <meshStandardMaterial color={p.colour} roughness={0.78} metalness={0} />
    </mesh>
  );
}

function Harness() {
  const [layout, setLayout] = useState('one sprig');
  const [shapeKey, setShapeKey] = useState('round');
  const [stats, setStats] = useState(null);
  const [p, setP] = useState({ ...GYP_DEFAULTS, colour: '#fdfdfb' });
  const set = (k) => (v) => setP(o => ({ ...o, [k]: v }));
  const L = LAYOUTS[layout];

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: 290, padding: 16, background: '#faf7f8', overflowY: 'auto', fontSize: 13,
                    borderRight: '1px solid #e7e2e4' }}>
        <h2 style={{ fontSize: 16, margin: '0 0 2px' }}>Gypsophila</h2>
        <p style={{ fontSize: 11.5, color: '#777', lineHeight: 1.5, margin: '0 0 12px' }}>
          One stem that forks three times and carries a cluster of small blooms at every tip.
          Judge the single sprig before any arrangement — a hundred of them read as a haze whatever
          each one is doing.
        </p>

        <Row label="Arrangement">
          {Object.keys(LAYOUTS).map(k => (
            <Btn key={k} on={layout === k} onClick={() => setLayout(k)}>{k}</Btn>
          ))}
        </Row>
        <Row label="Tier">
          {Object.keys(SHAPES).map(k => (
            <Btn key={k} on={shapeKey === k} onClick={() => setShapeKey(k)}>{k}</Btn>
          ))}
        </Row>

        <H>The sprig</H>
        <Sl label="Reach"        v={p.height} min={0.12} max={0.6} step={0.01} on={set('height')}
            hint="Cut end to the furthest bloom." />
        <Sl label="Divisions"    v={p.levels} min={1} max={4} step={1} on={set('levels')} int
            hint="2 is a twig, 3 a sprig, 4 a branch — and 4 costs 3× the triangles." />
        <Sl label="Branches"     v={p.forks} min={2} max={4} step={1} on={set('forks')} int
            hint="A maximum: the builder rolls 2 or 3 per node, or it reads as a fishbone." />
        <Sl label="Openness"     v={p.spread} min={0.1} max={1.2} step={0.02} on={set('spread')} />
        <Sl label="Shrink"       v={p.shrink} min={0.4} max={0.85} step={0.01} on={set('shrink')}
            hint="Each level as a fraction of its parent. Low is a stick with specks on it." />
        <Sl label="Droop"        v={p.droop} min={0} max={0.9} step={0.02} on={set('droop')} />
        <Sl label="Stem"         v={p.thickness} min={0.001} max={0.012} step={0.0005} on={set('thickness')} />

        <H>The blooms</H>
        <Sl label="Per tip"      v={p.florets} min={1} max={10} step={1} on={set('florets')} int />
        <Sl label="Bloom size"   v={p.floretSize} min={0.004} max={0.04} step={0.001} on={set('floretSize')} />
        <Sl label="Size variety" v={p.floretVary} min={0} max={0.9} step={0.02} on={set('floretVary')}
            hint="Buds and open flowers sit together. At 0 it is a cluster of identical beads." />
        <Sl label="Seed"         v={p.seed} min={1} max={40} step={1} on={set('seed')} int />

        <H>Arrangement</H>
        <Sl label="Spacing" v={p.spacing ?? 0.13} min={0.05} max={0.5} step={0.01}
            on={set('spacing')} hint="Only applies when it is not a single sprig." />

        <div style={{ marginTop: 14, padding: 10, background: '#fff', borderRadius: 8, fontSize: 11,
                      color: '#555', border: '1px solid #eee', lineHeight: 1.6 }}>
          {L.solo
            ? <>One sprig, <b>{(buildGypSprig(p).index?.count ?? 0) / 3}</b> triangles.<br />
                Shown at 3.2× so the forking is visible.</>
            : stats
              ? <>{stats.sprigs} sprigs · {stats.perSprig} tris each<br />
                  <b>{stats.tris.toLocaleString()}</b> triangles if merged — one draw call as it stands.</>
              : '…'}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', background: '#efe7e2' }}>
        {/* ⚠️ KEYED ON THE VIEW. R3F reads `camera` ONCE, at mount — switching from one sprig to a
            tier left the camera where the sprig had been, two units from a cake that starts three
            units away, and the canvas rendered an empty frame. Remounting is the honest fix in a
            harness; a product screen would move the camera instead. */}
        <Canvas key={L.solo ? 'solo' : 'tier'} shadows
          camera={{ position: L.solo ? [0, 0.9, 2.2] : [0, 2.2, 5.0], fov: 40 }}
          gl={{ preserveDrawingBuffer: true }} style={{ position: 'absolute', inset: 0 }}>
          <color attach="background" args={['#efe7e2']} />
          <SceneLights shadows />
          <SceneEnv />

          {L.solo ? <Solo p={p} /> : (
            <>
              <mesh position={[0, TIER.baseY + TIER.height / 2, 0]} castShadow receiveShadow>
                {shapeKey === 'round'
                  ? <cylinderGeometry args={[TIER.radius, TIER.radius, TIER.height, 72]} />
                  : <boxGeometry args={[SHAPES.sheet.halfW * 2, TIER.height, SHAPES.sheet.halfD * 2]} />}
                <meshStandardMaterial color="#f6efe4" roughness={0.9} />
              </mesh>
              <GypCloud shape={SHAPES[shapeKey]} topY={TOP_Y} color={p.colour}
                {...p} {...L} onStats={setStats} />
            </>
          )}

          {/* The floor is the only thing that can RECEIVE the key light's shadow; without it the
              subject is lit correctly and casts into nothing, and the frame reads flat. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, L.solo ? -0.4 : 0, 0]} receiveShadow>
            <circleGeometry args={[7, 48]} />
            <meshStandardMaterial color="#efe7e2" roughness={1} />
          </mesh>
          <OrbitControls target={[0, L.solo ? 0.35 : TOP_Y * 0.6, 0]} />
        </Canvas>
      </div>
    </div>
  );
}

const Row = ({ label, children }) => (
  <div style={{ margin: '0 0 10px' }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#888', letterSpacing: 0.5,
                  textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{children}</div>
  </div>
);
const Btn = ({ on, onClick, children }) => (
  <button onClick={onClick} style={{ padding: '5px 9px', borderRadius: 6, fontSize: 11.5,
    cursor: 'pointer', fontFamily: 'inherit', border: on ? 'none' : '1px solid #d8d2d4',
    background: on ? '#1a1a1a' : '#fff', color: on ? '#fff' : '#333' }}>{children}</button>
);
const H = ({ children }) => (
  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#888', letterSpacing: 0.6,
                textTransform: 'uppercase', margin: '14px 0 6px' }}>{children}</div>
);
const Sl = ({ label, v, min, max, step, on, int, hint }) => (
  <div style={{ margin: '0 0 9px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
      <span>{label}</span><b>{int ? Math.round(v) : Number(v).toFixed(step < 0.01 ? 4 : 2)}</b>
    </div>
    <input type="range" min={min} max={max} step={step} value={v} style={{ width: '100%' }}
      onChange={e => on(Number(e.target.value))} />
    {hint && <div style={{ fontSize: 10, color: '#999', lineHeight: 1.4 }}>{hint}</div>}
  </div>
);

createRoot(document.getElementById('root')).render(<Harness />);
