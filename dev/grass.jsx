import { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import GrassPatch from '../src/designer/canvas/GrassPatch.jsx';
import { GRASS_DEFAULTS, grassTriangleCount } from '../src/designer/geometry/grass.js';

/* ── Does procedural grass read as grass? Open /grass.html ───────────────────────────────────────
 *
 * Step 1 of the grass feature, and deliberately the ONLY step until this question is answered. The
 * two procedural studios that never shipped (isomalt, palette knife) both got as far as a studio
 * before anyone judged the look. This harness exists so the look is judged first, for an hour's
 * work instead of a day's.
 *
 * Nothing here touches the catalogue, admin, or the designer. It renders the geometry against a
 * plain tier so the shape of the answer is: yes it reads as grass, or no it reads as a shag carpet
 * or a bed of nails — in which case we drop it.
 *
 * WHAT TO JUDGE, roughly in order of how likely it is to be the thing that is wrong:
 *   1. SILHOUETTE against the background. Grass is sold by its ragged edge, not its surface.
 *   2. Does the mass read as many CLUMPS, or as one undifferentiated fuzz?
 *   3. Blade tips — they must come to a point. Stumps read as wires.
 *   4. Density: at the default, does it cover, or does the tier show through in bald patches?
 */

const TIER = { radius: 1.5, height: 1.1, baseY: 0.1 };
const TOP_Y = TIER.baseY + TIER.height;
const SHAPES = {
  round: { kind: 'round', radius: TIER.radius },
  sheet: { kind: 'rect',  halfW: 1.6, halfD: 1.15, cornerR: 0.2 },
};

export default function Harness() {
  const [p, setP] = useState({ ...GRASS_DEFAULTS, color: '#4caf3d' });
  const [shapeKey, setShapeKey] = useState('round');
  const [region, setRegion] = useState(null);
  const [stats, setStats] = useState({ tufts: 0, blades: 0 });
  const set = (k) => (v) => setP(o => ({ ...o, [k]: v }));
  const onStats = useCallback(s => setStats(s), []);
  const shape = SHAPES[shapeKey];

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Quicksand',sans-serif" }}>
      <div style={{ width: 270, padding: 16, background: '#faf7f8', overflowY: 'auto', fontSize: 13 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 10px' }}>Grass — does it read?</h2>

        <Row label="Tier">
          {Object.keys(SHAPES).map(k => (
            <Btn key={k} on={shapeKey === k} onClick={() => setShapeKey(k)}>{k}</Btn>
          ))}
        </Row>
        <Row label="Coverage">
          <Btn on={!region} onClick={() => setRegion(null)}>whole top</Btn>
          <Btn on={!!region} onClick={() => setRegion({ from: 0.55, to: 1 })}>rim band</Btn>
        </Row>

        <Sl label="Density (spacing)" v={p.spacing} min={0.04} max={0.2}  step={0.005} on={set('spacing')} inv />
        <Sl label="Blade height"      v={p.height}  min={0.06} max={0.45} step={0.01}  on={set('height')} />
        <Sl label="Strands per tuft"  v={p.strands} min={4}    max={20}   step={1}     on={set('strands')} int />
        <Sl label="Thickness"         v={p.thickness} min={0.004} max={0.025} step={0.001} on={set('thickness')} />
        <Sl label="Splay"             v={p.splay}  min={0} max={1}   step={0.02} on={set('splay')} />
        <Sl label="Droop"             v={p.droop}  min={0} max={1}   step={0.02} on={set('droop')} />
        <Sl label="Length variation"  v={p.lengthVary} min={0} max={0.8} step={0.02} on={set('lengthVary')} />
        <Sl label="Jitter"            v={p.jitter} min={0} max={1}   step={0.02} on={set('jitter')} />

        <Row label="Colour">
          {['#4caf3d', '#2e7d32', '#7bc043', '#1b5e20'].map(c => (
            <button key={c} onClick={() => setP(o => ({ ...o, color: c }))}
              style={{ width: 26, height: 26, borderRadius: 5, background: c, cursor: 'pointer',
                border: p.color === c ? '2.5px solid #1a1a1a' : '1px solid #ccc' }} />
          ))}
        </Row>

        <div style={{ marginTop: 12, padding: 8, background: '#fff', borderRadius: 6, color: '#666', lineHeight: 1.6 }}>
          <b style={{ color: '#1a1a1a' }}>Cost</b><br />
          tufts {stats.tufts.toLocaleString()}<br />
          blades {stats.blades.toLocaleString()}<br />
          {/* Drawn triangles. The instanced geometry itself is only one tuft's worth — this is what
              the GPU rasterises, which is the number that decides whether a phone copes. */}
          triangles {grassTriangleCount(stats.tufts, p.strands).toLocaleString()}<br />
          draw calls 1
        </div>
        <button onClick={() => { setP({ ...GRASS_DEFAULTS, color: p.color }); }}
          style={{ marginTop: 10, padding: '5px 12px', fontSize: 12 }}>Reset</button>
      </div>

      <div style={{ flex: 1, position: 'relative', background: '#e8b4a8' }}>
        <Canvas shadows camera={{ position: [0, 2.6, 4.4], fov: 42 }} style={{ position: 'absolute', inset: 0 }}>
          <color attach="background" args={['#e8b4a8']} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[3, 6, 4]} intensity={1.5} castShadow
            shadow-mapSize={[1024, 1024]} />
          <Environment preset="studio" />

          {/* A plain tier so the grass is judged against a cake, not floating in space. */}
          {shapeKey === 'round' ? (
            <mesh position={[0, TIER.baseY + TIER.height / 2, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[TIER.radius, TIER.radius, TIER.height, 64]} />
              <meshStandardMaterial color="#fdfdfd" roughness={0.85} />
            </mesh>
          ) : (
            <mesh position={[0, TIER.baseY + TIER.height / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[SHAPES.sheet.halfW * 2, TIER.height, SHAPES.sheet.halfD * 2]} />
              <meshStandardMaterial color="#5d3a1f" roughness={0.9} />
            </mesh>
          )}

          <GrassPatch shape={shape} topY={TOP_Y} color={p.color}
            strands={p.strands} height={p.height} spacing={p.spacing} jitter={p.jitter}
            splay={p.splay} droop={p.droop} thickness={p.thickness} lengthVary={p.lengthVary}
            region={region} onStats={onStats} />

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <circleGeometry args={[6, 48]} />
            <meshStandardMaterial color="#e8b4a8" roughness={1} />
          </mesh>
          <OrbitControls target={[0, TOP_Y * 0.7, 0]} />
        </Canvas>
      </div>
    </div>
  );
}

const Row = ({ label, children }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 11, color: '#999', marginBottom: 3 }}>{label}</div>
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{children}</div>
  </div>
);
const Btn = ({ on, onClick, children }) => (
  <button onClick={onClick} style={{
    padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
    border: '1.5px solid #1a1a1a', background: on ? '#1a1a1a' : '#fff', color: on ? '#fff' : '#1a1a1a', fontWeight: 600,
  }}>{children}</button>
);
const Sl = ({ label, v, min, max, step, on, int, inv }) => (
  <div style={{ marginBottom: 7 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666' }}>
      <span>{label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{int ? v : v.toFixed(3)}</span>
    </div>
    {/* `inv` flips the slider so dragging RIGHT means MORE grass — spacing is the underlying number
        but density is what a person is actually adjusting. */}
    <input type="range" min={min} max={max} step={step}
      value={inv ? min + max - v : v}
      onChange={e => on(inv ? min + max - +e.target.value : +e.target.value)}
      style={{ width: '100%' }} />
  </div>
);

createRoot(document.getElementById('root')).render(<Harness />);
