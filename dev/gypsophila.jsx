import { useState, useMemo } from 'react';
import './scene.js';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { SceneEnv, SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
import GypCloud from '../src/designer/canvas/GypCloud.jsx';
import { outwardBand, rimBand } from '../src/designer/canvas/useSeatedInstances.js';
import { buildGypSprig, GYP_DEFAULTS, GYP_COLOURS } from '../src/designer/geometry/gypsophila.js';

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
/* The board is its own outline, wider than the cake. A ring on it is bounded OUTSIDE by the board
   and INSIDE by the cake — two different shapes, which is exactly what `hole` is for and what
   `bandInner` cannot express (it hollows out the same outline it fills). */
/* Stand-ins for placed roses. The real ones are catalogue GLBs the designer places; the harness
   only needs something the right size in the right spot to judge how the filler sits around it. */
const ROSES = [
  { u: 0.06, v: 0.62, size: 0.30, halo: 0.56 },
  { u: 0.40, v: 0.55, size: 0.26, halo: 0.50 },
  { u: 0.74, v: 0.66, size: 0.22, halo: 0.44 },
];

/* ── A posy: roses bunched, not spaced ───────────────────────────────────────────────────────────
 * The arrangement every reference actually shows — several roses crowded together with the filler
 * woven THROUGH them, not a ring round each. Sizes vary because a bunch of identical blooms reads
 * as a pattern, and they are close enough that their collars overlap and merge, which is what makes
 * one arrangement out of six flowers. */
const POSY = [
  { u: 0.00, v: 0.26, size: 0.30 }, { u: 0.16, v: 0.52, size: 0.23 },
  { u: 0.34, v: 0.28, size: 0.27 }, { u: 0.51, v: 0.55, size: 0.21 },
  { u: 0.68, v: 0.30, size: 0.26 }, { u: 0.85, v: 0.50, size: 0.22 },
];

/* The bunch as one shape: where it sits and how far it reaches, for the arrangement that rings the
   outside of it rather than filling between its flowers. */
const BUNCH = (() => {
  const u = POSY.reduce((a, r) => a + r.u, 0) / POSY.length;
  const v = POSY.reduce((a, r) => a + r.v, 0) / POSY.length;
  const at = (r) => [r.v * Math.sin(r.u * Math.PI * 2), r.v * Math.cos(r.u * Math.PI * 2)];
  const [cx, cz] = [u, v].map(() => 0) && [POSY.reduce((a, r) => a + at(r)[0], 0) / POSY.length,
                                           POSY.reduce((a, r) => a + at(r)[1], 0) / POSY.length];
  const reach = Math.max(...POSY.map(r => {
    const [x, z] = at(r);
    return Math.hypot(x - cx, z - cz) * TIER.radius + r.size;
  }));
  return { u: Math.atan2(cx, cz) / (Math.PI * 2), v: Math.hypot(cx, cz), r: reach };
})();

const BOARD = { round: { kind: 'round', radius: TIER.radius * 1.34 },
                sheet: { kind: 'rect', halfW: 2.15, halfD: 1.55, cornerR: 0.25 } };

/* The arrangements the references actually show, as seat options rather than as four code paths. */
/* ⚠️ A LAYOUT IS A LIST OF CLOUDS, not one. The reference cake wears TWO rings — one hugging the
   top edge and one on the board round the base — and they are different seat problems: the top one
   is a band in the tier's own outline, the board one is bounded outside by the board and inside by
   the cake. Modelling a layout as one cloud would have forced a second component to say that. */
const LAYOUTS = {
  'one sprig':      { solo: true },
  'a few, close':   { clouds: [{ spacing: 0.34, jitter: 0.8 }] },
  /* ⚠️ A RING USES SHORTER, DROOPIER SPRIGS THAN A STANDALONE ONE, and that belongs to the
     arrangement rather than to the sprig. At the sprig's own default the first stem is long and
     bare before it forks, so a packed ring read as a fence of green sticks with blooms on top —
     the reference is the other way round: a band of bloom with green showing through it. Cut
     short and laid over, the same sprig reads as the reference does. */
  /* ⚠️ THE TOP RING LIES OVER TOO, just less far. Its stems ARE pushed into buttercream, so it is
     not the board's problem — but seated bolt upright the band showed a palisade of green stems
     round the inside of the rim, which is the same "tree plantation" read. In the reference the
     sprigs are laid toward the edge and the band is bloom, not stem. 45° keeps them planted and
     tips them over. */
  'ring the rim':   { clouds: [{ on: 'rim', spacing: 0.075, jitter: 0.65, overhang: 0.8,
                                 height: 0.20, droop: 0.6, lay: 45, bury: 0.06 }] },
  'rim + board':    { clouds: [{ on: 'rim', spacing: 0.075, jitter: 0.65, overhang: 0.8,
                                 height: 0.20, droop: 0.6, lay: 45, bury: 0.06 },
                               /* Laid down, not planted: the board is card. 78° leaves the sprigs
                                  tilted just off the board so they rest against the cake's side
                                  rather than lying dead flat on it. */
                               /* The foot of the cake, not the board: a narrow band grown outward
                                  from the tier's own outline, stems tucked into the join.
                                  ⚠️ NO `bury` HERE. Burying moves a seat DOWN, which is right for a
                                  stem pushed into buttercream and wrong at the foot — 0.02 put the
                                  whole ring inside the board slab, where it rendered perfectly and
                                  was never seen. Laid flat against the join, the cut ends are
                                  already hidden by the blooms in front of them. */
                               { on: 'foot', spacing: 0.075, jitter: 0.7,
                                 height: 0.22, droop: 0.3, lay: 78 }] },
  'cover the top':  { clouds: [{ spacing: 0.16, jitter: 0.75 }] },
  'two clumps':     { clouds: [{ spacing: 0.10, jitter: 0.8,
                                 patches: [{ u: 0.12, v: 0.55, r: 0.45 },
                                           { u: 0.62, v: 0.5, r: 0.38 }] }] },
  /* ⚠️ A COLLAR IS A PATCH WITH A BITE OUT OF IT. Every florist-style reference puts gypsophila
     AROUND the roses — hugging each one and radiating outward, so the rose reads as placed rather
     than stuck on. A plain patch would grow flowers through the rose. */
  /* ⚠️ THE FILLER STANDS UP IN A POSY. Laid over (`lay` 45–78) is right for a band hugging an edge,
     where the sprigs rest on something; in a bunch they are pushed in BETWEEN the roses and hold
     each other up, and some reach above the blooms — which is most of what makes a crowd of flowers
     read as arranged rather than as a ring with roses dropped on it. */
  /* ⚠️ BOTH CLEAR EVERY FOOTPRINT. Nothing a customer places may penetrate what is already there
     (INVARIANTS #3b), and that is not negotiable for a flower: a stem through a rose petal is the
     one thing that cannot happen on a real cake. What differs between the two arrangements is
     WHERE the filler is allowed to be.
     ⚠️ BURIED DEEP AND CUT LONG either way. A posy's filler is pushed down between the roses, so
     what shows is the bloom mass at their shoulder and none of the stem — seated shallow it stood
     as a palisade of green sticks under the bunch, the "tree plantation" read all over again. */

  /* SURROUND: the whole bunch is cleared, so the filler rings the OUTSIDE of it. One bite, centred
     on the bunch, wide enough to take in every rose. */
  'posy, surrounded': { roses: POSY,
                      clouds: [{ spacing: 0.05, jitter: 0.9, lay: 28, layVary: 0.8,
                                 height: 0.40, droop: 0.45, bury: 0.16,
                                 collars: [{ ...BUNCH, r: BUNCH.r * 1.5, inner: BUNCH.r }] }] },

  /* MERGE: each rose is cleared separately, so the filler fills the GAPS BETWEEN them and the two
     masses interlock without either entering the other. `inner` is the rose plus a margin, because
     a sprig has width of its own and clearing to the exact radius still lets blooms clip it. */
  'posy, merged':   { roses: POSY,
                      clouds: [{ spacing: 0.045, jitter: 0.9, lay: 16, layVary: 0.85,
                                 height: 0.44, droop: 0.45, bury: 0.18,
                                 collars: POSY.map(r => ({ ...r, r: r.size * 2.0,
                                                           inner: r.size * 1.18 })) }] },
  'around roses':   { roses: ROSES,
                      clouds: [{ spacing: 0.055, jitter: 0.85, lay: 55, height: 0.19, droop: 0.5,
                                 collars: ROSES.map(r => ({ ...r, r: r.halo, inner: r.size * 0.92 })) }] },
};

function Solo({ p }) {
  const geo = buildGypSprig(p);
  return (
    <mesh geometry={geo} position={[0, 0, 0]} castShadow receiveShadow scale={3.2}>
      <meshStandardMaterial vertexColors color="#ffffff" roughness={0.78} metalness={0} />
    </mesh>
  );
}

const CAM = new URLSearchParams(location.search).get('cam') || 'side';

function Harness() {
  const [layout, setLayout] = useState('one sprig');
  const [shapeKey, setShapeKey] = useState('round');
  /* ⚠️ ONE ROW PER CLOUD. The panel reported cloud 0 only, so a layout with two rings told you
     half the truth about what it costs — and when the rim ring vanished it still read 561 sprigs,
     which is exactly the kind of number that sends you looking in the wrong place. */
  const [stats, setStats] = useState({});
  const [p, setP] = useState({ ...GYP_DEFAULTS, ...GYP_COLOURS, ringWidth: 0.18, rimIn: 0.14,
                              rimOut: 0.10, shadeVary: 0.35, spacingScale: 1 });
  const set = (k) => (v) => setP(o => ({ ...o, [k]: v }));
  const L = LAYOUTS[layout];
  /* ⚠️ A FRESH OBJECT LITERAL IS A NEW DEPENDENCY EVERY RENDER. `hole` feeds the seat memo, so
     writing `hole={{ shape: … }}` inline rebuilt every seat on every frame — which is half of why
     the board ring shook. The other half was the PRNG stream; both had to go. */
  const shape = SHAPES[shapeKey];
  const holeForFoot = useMemo(() => ({ shape, scale: 1.0 }), [shape]);
  /* How far the base ring reaches out from the cake, as a fraction of the tier. Memoised because a
     fresh shape object every render rebuilds every seat (see the comment on `hole`). */
  const footBand = useMemo(() => outwardBand(shape, p.ringWidth ?? 0.18), [shape, p.ringWidth]);
  /* The rim band has two edges and both are controls: how far in it starts, how far out it reaches. */
  const rim = useMemo(() => rimBand(shape, { inn: p.rimIn, out: p.rimOut }),
                      [shape, p.rimIn, p.rimOut]);

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
        <Sl label="Stem"         v={p.thickness} min={0.0008} max={0.008} step={0.0002} on={set('thickness')}
            hint="A hair next to its own flowers — about 1:20 on a real sprig." />

        <H>The blooms</H>
        <Sl label="Per tip"      v={p.florets} min={1} max={10} step={1} on={set('florets')} int />
        <Sl label="Bloom size"   v={p.floretSize} min={0.004} max={0.04} step={0.001} on={set('floretSize')}
            hint="Measured off the reference: a floret is about 1.45% of the cake's WIDTH." />
        <Sl label="Size variety" v={p.floretVary} min={0} max={0.9} step={0.02} on={set('floretVary')}
            hint="Buds and open flowers sit together. At 0 it is a cluster of identical beads." />
        <Sl label="Depth"        v={p.ao} min={0} max={1.4} step={0.05} on={set('ao')}
            hint="How much a bloom buried in the cloud is darkened. At 0 a white cloud on a white cake is one flat field." />
        <Sl label="Depth floor"  v={p.aoFloor} min={0.2} max={0.9} step={0.02} on={set('aoFloor')}
            hint="The darkest a bloom may go. White petals in shadow are grey, never black." />
        <Sl label="Crowd depth"  v={p.shadeVary} min={0} max={0.6} step={0.02} on={set('shadeVary')}
            hint="How much sprigs differ in brightness. A crowd has some lit and some in the shade of the rest — at 0 a packed ring is one flat white mass." />
        <Sl label="Seed"         v={p.seed} min={1} max={40} step={1} on={set('seed')} int />

        <H>Arrangement</H>
        {/* ⚠️ A MULTIPLIER, NOT A VALUE. Each arrangement sets its own spacing — a rim band is
            packed where a scatter is not — and `{...p} {...c}` lets the preset win, so a plain
            Spacing slider was DEAD on every ring. Scaling the preset keeps both: the presets stay
            meaningful and the control still does something wherever you are. */}
        <Sl label="Spacing ×" v={p.spacingScale} min={0.5} max={2.5} step={0.05}
            on={set('spacingScale')}
            hint="Scales whatever the arrangement asks for. Above 1 opens it up and lets the green show." />
        <Sl label="Rim: out past the edge" v={p.rimOut} min={0} max={0.4} step={0.01} on={set('rimOut')}
            hint="How far the top ring reaches PAST the rim, × the tier." />
        <Sl label="Rim: in from the edge" v={p.rimIn} min={0.03} max={0.6} step={0.01} on={set('rimIn')}
            hint="How far in from the rim it starts. The two together are the band's width." />
        <Sl label="Foot ring width" v={p.ringWidth} min={0.04} max={0.5} step={0.01} on={set('ringWidth')}
            hint="How far the base ring reaches out from the cake's foot, × the tier. It is a ring on the cake, not a field on the board." />

        <div style={{ marginTop: 14, padding: 10, background: '#fff', borderRadius: 8, fontSize: 11,
                      color: '#555', border: '1px solid #eee', lineHeight: 1.6 }}>
          {L.solo
            ? <>One sprig, <b>{(buildGypSprig(p).index?.count ?? 0) / 3}</b> triangles.<br />
                Shown at 3.2× so the forking is visible.</>
            : Object.keys(stats).length
              ? Object.entries(stats).map(([i, st]) => (
                  <div key={i}>{st.on}: {st.sprigs} sprigs · {st.perSprig} tris each ·{' '}
                    <b>{st.tris.toLocaleString()}</b> merged</div>
                ))
              : '…'}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', background: '#efe7e2' }}>
        {/* ⚠️ KEYED ON THE VIEW. R3F reads `camera` ONCE, at mount — switching from one sprig to a
            tier left the camera where the sprig had been, two units from a cake that starts three
            units away, and the canvas rendered an empty frame. Remounting is the honest fix in a
            harness; a product screen would move the camera instead. */}
        {/* ⚠️ `?cam=top` LOOKS STRAIGHT DOWN, and that view is not a nicety — an arrangement is
            judged from above as much as from the side, and the two faults this feature has had
            (a ring flooding the board, filler running through a rose) were both invisible at eye
            level. Keyed with the view, because R3F reads `camera` once, at mount. */}
        <Canvas key={`${L.solo ? 'solo' : 'tier'}:${CAM}`} shadows
          camera={{ position: L.solo ? [0, 0.9, 2.2]
                            : CAM === 'top' ? [0, 6.0, 0.9]
                            : CAM === 'high' ? [0, 3.6, 3.0] : [0, 2.2, 5.0], fov: 40 }}
          gl={{ preserveDrawingBuffer: true }} style={{ position: 'absolute', inset: 0 }}>
          <color attach="background" args={['#efe7e2']} />
          <SceneLights shadows />
          <SceneEnv />

          {L.solo ? <Solo p={p} /> : (
            <>
              {/* The board, so a ring round the base has something to stand on. */}
              <mesh position={[0, TIER.baseY - 0.03, 0]} receiveShadow>
                {shapeKey === 'round'
                  ? <cylinderGeometry args={[BOARD.round.radius, BOARD.round.radius, 0.06, 72]} />
                  : <boxGeometry args={[BOARD.sheet.halfW * 2, 0.06, BOARD.sheet.halfD * 2]} />}
                <meshStandardMaterial color="#efe3e8" roughness={0.85} />
              </mesh>
              <mesh position={[0, TIER.baseY + TIER.height / 2, 0]} castShadow receiveShadow>
                {shapeKey === 'round'
                  ? <cylinderGeometry args={[TIER.radius, TIER.radius, TIER.height, 72]} />
                  : <boxGeometry args={[SHAPES.sheet.halfW * 2, TIER.height, SHAPES.sheet.halfD * 2]} />}
                <meshStandardMaterial color="#f6efe4" roughness={0.9} />
              </mesh>
              {(L.roses ?? []).map((r, i) => {
                const R = SHAPES[shapeKey].radius ?? 1;
                return (
                  <mesh key={`rose${i}`} castShadow receiveShadow
                        position={[r.v * R * Math.sin(r.u * Math.PI * 2), TOP_Y + r.size * 0.45,
                                   r.v * R * Math.cos(r.u * Math.PI * 2)]}>
                    <sphereGeometry args={[r.size, 20, 14]} />
                    <meshStandardMaterial color="#9d1b2f" roughness={0.55} />
                  </mesh>
                );
              })}
              {/* ⚠️ `foot` IS A BAND ON THE CAKE'S OWN OUTLINE, grown outward — not the board's.
                  Seating against the board filled everything between the two and read as flowers
                  standing IN the board. The cake is the hole, so the band is the annulus between
                  the cake and `ringWidth` past it, and it sits at the join rather than on the
                  board. */}
              {L.clouds.map((c, i) => (
                <GypCloud key={i}
                  shape={c.on === 'foot' ? footBand : c.on === 'rim' ? rim.shape : SHAPES[shapeKey]}
                  bandInner={c.on === 'rim' ? rim.bandInner : undefined}
                  topY={c.on === 'foot' ? TIER.baseY + 0.005 : TOP_Y}
                  hole={c.on === 'foot' ? holeForFoot : null}
                  patchRadius={c.on === 'foot' ? footBand.radius
                             : c.on === 'rim' ? rim.shape.radius : undefined}
                  {...p} {...c}
                  spacing={(c.spacing ?? p.spacing ?? 0.13) * (p.spacingScale ?? 1)}
                  seed={p.seed + i * 13}
                  onStats={(st) => setStats(o => ({ ...o, [i]: { ...st, on: c.on ?? 'top' } }))} />
              ))}
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
