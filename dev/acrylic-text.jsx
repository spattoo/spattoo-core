import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import AcrylicWriting from '../src/designer/canvas/AcrylicWriting.jsx';
import CreamWriting from '../src/designer/canvas/CreamWriting.jsx';
import { SceneLights } from '../src/designer/canvas/CakeCanvas.jsx';
import { TOPPER_FACES } from '../src/designer/geometry/topperFaces.js';
import { TOPPER_FINISHES } from '../src/designer/geometry/topperFinishes.js';
import { faceFit } from '../src/designer/geometry/topperFaces.js';

/* ── The acrylic Look in Texts, on a real writing object ─────────────────────────────────────────
 *
 * The designer itself sits behind a login, so this mounts the SAME components CakeCanvas mounts —
 * AcrylicWriting and CreamWriting, dispatched on the message's `style` exactly as the canvas does —
 * against a cake built the way the canvas builds one. It exercises the integration (writingSurface
 * resolving the tier from the height, the pose following the surface, the font list differing by
 * material), not a re-creation of it.
 */

const TIERS = [
  { baseY: 0.10, height: 1.90, radius: 1.60, shape: 'round', width: 3.2, depth: 3.2 },
];
const TOP_Y = TIERS[0].baseY + TIERS[0].height;
const BOARD = { radius: 2.3, shape: 'round' };

function Cake() {
  return (
    <>
      <mesh position={[0, TIERS[0].baseY + TIERS[0].height / 2, 0]} receiveShadow>
        <cylinderGeometry args={[1.6, 1.6, 1.9, 96]} />
        <meshStandardMaterial color="#f3ece2" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <cylinderGeometry args={[2.3, 2.3, 0.1, 96]} />
        <meshStandardMaterial color="#e6e0d6" roughness={0.7} />
      </mesh>
    </>
  );
}

/* ⚠️ Mirror metal is nothing but reflections — with no environment it renders BLACK, which is what
 * the first frame of this page showed. And a bright environment then washes out the shadow that
 * makes the piece read as proud of the wall. `environmentIntensity` is exposed here rather than
 * fixed because that balance is the open question, and it is easier to answer by sliding it than by
 * arguing about it. */
function LocalEnv({ intensity }) {
  const { scene, gl } = useThree();
  useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    return () => pmrem.dispose();
  }, [scene, gl]);
  scene.environmentIntensity = intensity;
  return null;
}

const row = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 };
const lab = { fontSize: 11, fontWeight: 800, color: '#6E8577', width: 62, letterSpacing: 0.3, flexShrink: 0 };
const seg = (opts, value, onPick) => (
  <div style={{ display: 'flex', gap: 3, background: '#f2efe9', borderRadius: 8, padding: 3, flex: 1 }}>
    {opts.map(([k, l]) => (
      <button key={k} onClick={() => onPick(k)}
        style={{ flex: 1, padding: '5px 4px', fontFamily: 'inherit', fontSize: 11, fontWeight: 800,
                 border: 0, borderRadius: 6, cursor: 'pointer',
                 background: value === k ? '#3D5A44' : 'transparent',
                 color: value === k ? '#fff' : '#6E8577' }}>{l}</button>
    ))}
  </div>
);

function App() {
  const [env, setEnv] = useState(0.45);
  const [w, setW] = useState({
    id: 1, style: 'acrylic', text: 'Ava', font: 'great_vibes',
    tracking: faceFit('great_vibes'), acrylicFinish: 'gold',
    surface: 'side', sideAngle: 0, sideY: 1.0, fit: 0.55,
    color: '#ffffff', finish: 'cream',
  });
  const set = (c) => setW(p => ({ ...p, ...c }));
  const Renderer = w.style === 'acrylic' ? AcrylicWriting : CreamWriting;

  return (
    <div style={{ height: '100%', display: 'flex' }}>
      <div style={{ width: 290, padding: 18, background: '#fff', borderRight: '1.5px solid #E8E4DC', overflowY: 'auto' }}>
        <h1 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Texts — acrylic Look</h1>
        <p style={{ fontSize: 11.5, color: '#6E8577', lineHeight: 1.5, marginBottom: 14 }}>
          The same message object in two materials. Switching Look keeps the text, the surface and
          the place — only what it is made of changes.
        </p>
        <input value={w.text} onChange={e => set({ text: e.target.value })}
               style={{ width: '100%', padding: '8px 10px', fontSize: 14, fontFamily: 'inherit',
                        border: '1.5px solid #D8E0DA', borderRadius: 8, marginBottom: 12 }} />
        <div style={row}><span style={lab}>Look</span>
          {seg([['cream', 'Piped cream'], ['acrylic', 'Acrylic']], w.style,
               k => set({ style: k, font: k === 'acrylic' ? 'great_vibes' : 'ems_allure',
                          tracking: k === 'acrylic' ? faceFit('great_vibes') : 0 }))}</div>
        <div style={row}><span style={lab}>Surface</span>
          {seg([['top', 'Top'], ['side', 'Side'], ['board', 'Board']], w.surface, k => set({ surface: k }))}</div>
        {w.style === 'acrylic' && (
          <div style={{ ...row, alignItems: 'flex-start' }}>
            <span style={lab}>Face</span>
            <select value={w.font} onChange={e => set({ font: e.target.value, tracking: faceFit(e.target.value) })}
                    style={{ flex: 1, padding: '5px 8px', fontFamily: 'inherit', fontSize: 12,
                             border: '1.5px solid #D8E0DA', borderRadius: 7 }}>
              {Object.entries(TOPPER_FACES).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </select>
          </div>
        )}
        {w.style === 'acrylic' && (
          <div style={{ ...row, flexWrap: 'wrap' }}>
            <span style={lab}>Finish</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, flex: 1 }}>
              {Object.entries(TOPPER_FINISHES).map(([k, f]) => (
                <button key={k} onClick={() => set({ acrylicFinish: k })}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 7px', borderRadius: 7,
                           cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, background: '#fff',
                           border: `2px solid ${w.acrylicFinish === k ? '#1a1a1a' : '#e2ddd6'}` }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: f.color, border: '1px solid #00000022' }} />
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={row}><span style={lab}>Size</span>
          <input type="range" min={0.25} max={0.95} step={0.05} value={w.fit}
                 onChange={e => set({ fit: +e.target.value })} style={{ flex: 1, accentColor: '#3D5A44' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#3D5A44', width: 34, textAlign: 'right' }}>
            {Math.round(w.fit * 100)}%</span></div>
        <div style={row}><span style={lab}>Room</span>
          <input type="range" min={0} max={1.5} step={0.05} value={env}
                 onChange={e => setEnv(+e.target.value)} style={{ flex: 1, accentColor: '#3D5A44' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#3D5A44', width: 34, textAlign: 'right' }}>
            {env.toFixed(2)}</span></div>
        {w.surface === 'side' && (
          <div style={row}><span style={lab}>Height</span>
            <input type="range" min={0.3} max={1.75} step={0.05} value={w.sideY}
                   onChange={e => set({ sideY: +e.target.value })} style={{ flex: 1, accentColor: '#3D5A44' }} />
          </div>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <Canvas shadows camera={{ position: [0, 2.6, 7.0], fov: 32 }}>
          <color attach="background" args={['#EDEAE3']} />
          <SceneLights shadows />
          <LocalEnv intensity={env} />
          <Cake />
          <Renderer
            writing={w} topY={TOP_Y} topRadius={1.6} shape="round" width={3.2} depth={3.2}
            shp={{ kind: 'circle', radius: 1.6 }} tiers={TIERS}
            boardRadius={BOARD.radius} boardY={0.1} boardShp={BOARD}
            onMove={m => set(m)} onClick={() => {}} onOrbitEnable={() => {}} />
          <OrbitControls target={[0, 1.1, 0]} />
        </Canvas>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
