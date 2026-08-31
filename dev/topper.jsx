import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useThree } from '@react-three/fiber';
import { topperShapes, components, bridgeLoose } from '../src/designer/geometry/topperShape.js';
import { SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';

/* ── An acrylic topper, standing up ──────────────────────────────────────────────────────────────
 *
 * Before the studio, because two of the decisions here cannot be made from a number and the
 * geometry tests cannot answer either of them:
 *
 *   1. HOW THIN IS TOO THIN. A topper is a few millimetres of acrylic. At the designer's camera
 *      distance that is a couple of pixels edge-on, and thin flat geometry either disappears or
 *      aliases into a shimmering line. The `Thickness` slider is here to find the floor.
 *   2. WHETHER MIRROR READS AS ACRYLIC. Opaque metal is far cheaper than transmission — no scene
 *      re-render behind the object — and mirror gold happens to be the commonest finish sold. If it
 *      reads right, clear acrylic never has to be built.
 *
 * The connectivity check is wired to the picture: anything that would arrive as a separate piece is
 * painted RED. That is the studio's whole UX, tried here first — a number saying "2 pieces" sends
 * you hunting, a red dot on the i does not.
 *
 * Ships as a dev page rather than a test because both questions are "does it look right", and the
 * answer is a judgement somebody has to make with their eyes.
 */

const FONT = new FontLoader().parse(helvetikerBold);

/* ⚠️ A LOCAL environment, not the designer's SceneEnv.
 *
 * Mirror gold is nothing but reflections — with no environment map a metalness-1 surface has
 * nothing to reflect and renders as flat paint, which is exactly how the first screenshot came out
 * and would have made the finish look wrong when it is the maths that was missing.
 *
 * SceneEnv resolves to a self-hosted HDRI when the host configures an assets base and to a drei
 * preset otherwise — and the preset fetches from a CDN, which a bare dev page may not get.
 * RoomEnvironment is generated in-process from a handful of emissive boxes: no network, no config,
 * and enough of a room for a mirror to be judged.
 */
function LocalEnv() {
  const { scene, gl } = useThree();
  useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    return () => pmrem.dispose();
  }, [scene, gl]);
  return null;
}

// Mirror gold, silver, rose and black are what the market actually sells. All opaque: metalness 1
// with a low roughness, so the cost is one more material and not a transmissive re-render.
const FINISHES = {
  gold:   { label: 'Mirror gold',   color: '#d4af37', metalness: 1,    roughness: 0.12 },
  silver: { label: 'Mirror silver', color: '#cfd4d8', metalness: 1,    roughness: 0.10 },
  rose:   { label: 'Rose gold',     color: '#e0a899', metalness: 1,    roughness: 0.14 },
  black:  { label: 'Gloss black',   color: '#141414', metalness: 0.35, roughness: 0.06 },
  white:  { label: 'Gloss white',   color: '#f2f0ec', metalness: 0.1,  roughness: 0.08 },
};

function Topper({ text, height, weight, bar, barThick, legCount, legLen, thickness, bridge, finish, cakeTop, bury, rows, lineGap }) {
  const { geos, groups, standY } = useMemo(() => {
    const t = topperShapes(FONT, text, {
      height, weight, lines: rows || 'auto', lineGap,
      baseline: bar ? { thickness: barThick } : null,
      legs: legCount > 0 ? { count: legCount, length: legLen } : null,
    });
    if (!t.parts?.length) return { geos: [], groups: [], standY: 0 };
    const parts = bridge ? [...t.parts, ...bridgeLoose(t.parts, { width: height * 0.022 })] : t.parts;
    const grouped = components(parts);
    const loose = new Set(grouped.slice(1).flat());

    // One geometry per PART, not one merged mesh — so a loose piece can be painted red. The real
    // renderer will merge; here the whole point is telling them apart.
    const geos = parts.map((p, i) => {
      const shape = new THREE.Shape(p.outer.map(q => new THREE.Vector2(q.x, q.y)));
      shape.holes = (p.holes ?? []).map(h => new THREE.Path(h.map(q => new THREE.Vector2(q.x, q.y))));
      const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
      g.translate(0, 0, -thickness / 2);
      return { geo: g, loose: loose.has(i), kind: p.kind };
    });
    /* ⚠️ WHAT TOUCHES THE ICING is the bottom of the LEGS, not the bar.
     *
     * The legs are the stand. Sitting the bar's underside on the cake buries them completely and the
     * word looks glued to the surface — which is what the first version did, and it is wrong twice
     * over: it hides the part a baker has to push in, and it hides whether the prongs are long
     * enough to hold anything up.
     *
     * So the lowest point of the whole object goes `bury` BELOW the icing, leaving the rest of the
     * leg showing. With no legs there is nothing to stand on and the baseline meets the surface,
     * which is also how a topper with no legs is actually used — laid against the cake. */
    const lowest = Math.min(...parts.flatMap(p => p.outer.map(q => q.y)));
    const foot = t.legs.length ? lowest : t.baselineY;
    return { geos, groups: grouped, standY: foot + (t.legs.length ? bury : 0) };
  }, [text, height, weight, bar, barThick, legCount, legLen, thickness, bridge, bury, rows, lineGap]);

  const f = FINISHES[finish];
  return (
    <group position={[0, cakeTop - standY, 0]}>
      {geos.map(({ geo, loose }, i) => (
        <mesh key={i} geometry={geo} castShadow>
          {loose
            ? <meshStandardMaterial color="#d33" metalness={0.1} roughness={0.5} />
            : <meshStandardMaterial color={f.color} metalness={f.metalness} roughness={f.roughness} envMapIntensity={1.4} />}
        </mesh>
      ))}
      <Report groups={groups} />
    </group>
  );
}
// Kept as its own component so the count re-reads from the same memo the meshes came from — a
// separately-computed number is a number that can disagree with the picture beside it.
function Report() { return null; }

/* The scene is a 6-INCH cake, and that is what makes the numbers mean anything.
 *
 * Both questions on this page are questions about millimetres — 3mm acrylic, a 35mm word — and
 * scene units answer neither. Pinning the cake to a real size turns every slider into a measurement:
 * the cake is 1.6 units across the radius and 6 inches across the top, so one unit is 47.6mm, and
 * the panel can say "3.0mm" beside a thickness the eye is being asked to judge. */
const CAKE_R = 1.6;
const MM_PER_UNIT = (6 * 25.4) / (CAKE_R * 2);   // ≈ 47.6
const mm = u => `${(u * MM_PER_UNIT).toFixed(1)}mm`;

// A slab to stand it on, so "does it read as standing" is a question the scene can answer.
function Cake({ r = CAKE_R, h = 0.55 }) {
  return (
    <mesh position={[0, h / 2, 0]} receiveShadow>
      <cylinderGeometry args={[r, r, h, 96]} />
      <meshStandardMaterial color="#f3ece2" roughness={0.85} />
    </mesh>
  );
}

const row = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 };
const lab = { fontSize: 11, fontWeight: 800, color: '#6E8577', width: 74, letterSpacing: 0.3 };
const val = { fontSize: 11, fontWeight: 700, color: '#3D5A44', width: 42, textAlign: 'right' };

function App() {
  const [text, setText]     = useState('Amelia');
  const [span, setSpan]     = useState(0.55);   // share of the cake's width, NOT a letter height
  const [rows, setRows]     = useState(0);   // 0 = let the phrase decide
  // 1.2, not 1.0: helvetiker's cap is 0.72em and its descender reaches -0.21, so at 1.0 the 'p'
  // of Happy hangs 0.07em INTO the B of Birthday. That overlap is what makes it one piece, which
  // is a real trade and worth reaching for deliberately — not something to ship as the default.
  const [lineGap, setLG]    = useState(1.2);
  const [weight, setW]      = useState(0);
  const [bar, setBar]       = useState(true);
  const [barRatio, setBR]   = useState(0.13);   // a share of the letter height, so it scales with it
  const [legCount, setLC]   = useState(2);
  const [legLen, setLL]     = useState(0.42);
  const [bury, setBury]     = useState(0.21);   // half the leg in the cake, half of it showing
  const [thickness, setTh]  = useState(0.063);
  const [bridge, setBridge] = useState(true);
  const [finish, setFinish] = useState('gold');

  /* ⚠️ SIZED BY HOW MUCH OF THE CAKE IT CROSSES, and the letter height falls out of that.
   *
   * A shop does not sell you 33mm letters, it sells you a topper for a 6-inch cake — look at any of
   * them and the word spans somewhere around half the top, whatever the name. Driving this off a
   * letter height instead made "Amelia" 142mm on a 152mm cake: correct arithmetic, and a topper the
   * width of the whole cake, because a long name at a fixed letter height simply keeps growing.
   *
   * `topperShapes` sizes by height, so this measures the word at height 1 and divides — the aspect
   * ratio is a property of the text and the font, and one build is enough to learn it. */
  const height = useMemo(() => {
    const w1 = topperShapes(FONT, text, { height: 1, weight, lines: rows || 'auto', lineGap }).width;
    return w1 > 0 ? (CAKE_R * 2 * span) / w1 : 0.5;
  }, [text, weight, span, rows, lineGap]);
  const barThick = height * barRatio;

  // The same call the mesh makes, so the reported count is the picture's count.
  const report = useMemo(() => {
    const t = topperShapes(FONT, text, {
      height, weight, lines: rows || 'auto', lineGap,
      baseline: bar ? { thickness: barThick } : null,
      legs: legCount > 0 ? { count: legCount, length: legLen } : null,
    });
    if (!t.parts?.length) return { n: 0, width: 0, cap: 0, rows: [] };
    const parts = bridge ? [...t.parts, ...bridgeLoose(t.parts, { width: height * 0.022 })] : t.parts;
    return { n: components(parts).length, width: t.width, cap: t.capHeight, rows: t.rows };
  }, [text, height, weight, bar, barThick, legCount, legLen, bridge, rows, lineGap]);

  const slider = (label, v, set, min, max, step, fmt = x => x.toFixed(2)) => (
    <div style={row}>
      <span style={lab}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v}
             onChange={e => set(+e.target.value)} style={{ flex: 1, accentColor: '#3D5A44' }} />
      <span style={val}>{fmt(v)}</span>
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex' }}>
      <div style={{ width: 300, padding: 18, background: '#fff', borderRight: '1.5px solid #E8E4DC', overflowY: 'auto' }}>
        <h1 style={{ fontSize: 15, fontWeight: 800, color: '#1a1a1a', marginBottom: 4 }}>Acrylic topper</h1>
        <p style={{ fontSize: 11.5, color: '#6E8577', lineHeight: 1.5, marginBottom: 16 }}>
          Judge two things: how thin it can get before the edge disappears, and whether mirror reads
          as acrylic. Anything that would arrive as a loose piece is red. The cake is 6 inches, so
          every measurement below is the real one.
        </p>

        <input value={text} onChange={e => setText(e.target.value)} placeholder="Name"
               style={{ width: '100%', padding: '8px 10px', fontSize: 14, fontFamily: 'inherit',
                        border: '1.5px solid #D8E0DA', borderRadius: 8, marginBottom: 14 }} />

        {slider('Across cake', span, setSpan, 0.2, 1, 0.01, x => `${Math.round(x * 100)}%`)}
        {slider('Rows', rows, setRows, 0, 3, 1, x => (x === 0 ? 'auto' : String(x)))}
        {slider('· gap', lineGap, setLG, 0.7, 1.6, 0.05)}
        {slider('Weight', weight, setW, 0, 0.04, 0.002, x => x.toFixed(3))}
        {slider('Thickness', thickness, setTh, 0.004, 0.16, 0.002, x => mm(x))}

        <div style={{ ...row, marginTop: 12 }}>
          <span style={lab}>Bar</span>
          <input type="checkbox" checked={bar} onChange={e => setBar(e.target.checked)} />
          <span style={{ fontSize: 11, color: '#8a8a8a' }}>a base the letters sit on</span>
        </div>
        {bar && slider('· thickness', barRatio, setBR, 0.05, 0.3, 0.01, x => mm(height * x))}

        {slider('Legs', legCount, setLC, 0, 4, 1, x => String(x))}
        {legCount > 0 && slider('· length', legLen, setLL, 0.15, 0.9, 0.02, x => mm(x))}
        {legCount > 0 && slider('· buried', bury, setBury, 0, Math.min(0.9, legLen), 0.01, x => mm(x))}

        <div style={{ ...row, marginTop: 12 }}>
          <span style={lab}>Bridge</span>
          <input type="checkbox" checked={bridge} onChange={e => setBridge(e.target.checked)} />
          <span style={{ fontSize: 11, color: '#8a8a8a' }}>join floating bits</span>
        </div>

        <div style={{ ...row, marginTop: 12 }}>
          <span style={lab}>Finish</span>
          <select value={finish} onChange={e => setFinish(e.target.value)}
                  style={{ flex: 1, padding: '5px 8px', fontFamily: 'inherit', fontSize: 12,
                           border: '1.5px solid #D8E0DA', borderRadius: 7 }}>
            {Object.entries(FINISHES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        <div style={{ marginTop: 18, padding: '10px 12px', borderRadius: 9, fontSize: 12, lineHeight: 1.5,
                      background: report.n === 1 ? '#EDF2EE' : '#FDF3E3',
                      border: `1px solid ${report.n === 1 ? '#D6E2DA' : '#F0DCB8'}`,
                      color: report.n === 1 ? '#3D5A44' : '#8A5A1E' }}>
          <b>{report.n} piece{report.n === 1 ? '' : 's'}</b>
          {report.n === 1
            ? ' — cuts as one topper.'
            : ' — the red parts would arrive loose. Turn on Bridge, add the Bar, or raise Weight.'}
          <div style={{ marginTop: 4, color: report.width > CAKE_R * 2 ? '#8A5A1E' : '#8a8a8a' }}>
            {mm(report.width)} wide, {mm(report.cap)} letters
            {report.width > CAKE_R * 2 && ' — wider than the cake'}
          </div>
          {/* Below about 12mm the strokes are thinner than the sheet they are cut from. That is the
              number that decides whether a phrase needs stacking, so it is stated, not implied. */}
          <div style={{ marginTop: 2, color: report.cap * MM_PER_UNIT < 12 ? '#8A5A1E' : '#8a8a8a' }}>
            {report.rows.length > 1 ? report.rows.join(' / ') : '\u00a0'}
            {report.cap * MM_PER_UNIT < 12 && ' — letters thinner than the sheet; add a row'}
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <Canvas shadows camera={{ position: [0, 1.75, 5.1], fov: 32 }} gl={{ preserveDrawingBuffer: true }}>
          <color attach="background" args={['#EDEAE3']} />
          <SceneLights />
          <LocalEnv />
          <Cake />
          <Topper text={text} height={height} weight={weight} bar={bar} barThick={barThick}
                  legCount={legCount} legLen={legLen} thickness={thickness} bridge={bridge} finish={finish}
                  cakeTop={0.55} bury={Math.min(bury, legLen)} rows={rows} lineGap={lineGap} />
          <OrbitControls target={[0, 0.62, 0]} />
        </Canvas>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
