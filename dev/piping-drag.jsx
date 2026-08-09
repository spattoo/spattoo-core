import { Suspense, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CakeCanvas from '../src/designer/canvas/CakeCanvas.jsx';
import { toCanvasConfig } from '../src/designer/hooks/useCakeDesign.js';
import { PIPING_FRONT_ANGLE } from '../src/designer/constants.js';

/* ── Dragging a single-mode piping piece round its ring. Open /piping-drag.html ──────────────────
 *
 * The bug this was built for: an admin ticks "Movable" on a rosette, switches the ring to Single,
 * and the piece will not drag. It never could — the decoration draggables read the capability, but
 * piping renders through a completely different path (CakeTier → TopPipingRing → renderShells) that
 * had no pointer handling at all. The only way to place a single piece was an angle slider.
 *
 * Seeing that in the real designer costs a baker login, a cake with a piping element on it, and the
 * right element switched to Single mode — which is why the gap survived so long. Everything here is
 * local: hand-written tiers, a generated stand-in GLB (public/sample-rosette.glb), and the two
 * callbacks the host normally supplies.
 *
 * ── What to actually check ──────────────────────────────────────────────────────────────────────
 *   1. Press a piece and drag → it follows the pointer AROUND the ring, and the cake does NOT
 *      rotate (the orbit-suspend path, which is a different mechanism from the drag itself).
 *   2. Tap a piece without moving → it still SELECTS (logged below). A drag must not eat the click.
 *   3. Untick Movable → the piece pins, but tapping it still selects. That is the whole point of
 *      gating the write rather than the press.
 *   4. Switch to Ring → pressing the cream rotates the cake again, as it always did.
 *   5. Rect tier → the piece tracks the perimeter incl. corners, not a circle. This is the branch
 *      angleAtPoint has to invert by sampling, so it is the one worth watching closely.
 */

const GLB = '/sample-rosette.glb';

// Two pieces so a drag that moves the WRONG one is obvious immediately.
const seedInstances = () => [
  { id: 1, angle: PIPING_FRONT_ANGLE },
  { id: 2, angle: PIPING_FRONT_ANGLE + Math.PI / 2 },
];

const layer = (instances, arrangement) => ({
  id: 'el-rosette',            // the ELEMENT id — what isPipingMovable looks up
  layerId: 'layer-1',
  cardId: 'card-1',
  glbUrl: GLB,
  name: 'Rosette',
  color: '#f5e6c8',
  size: 1,
  arrangement,
  instances,
});

export default function Harness() {
  const [instances, setInstances] = useState(seedInstances);
  const [arrangement, setArrangement] = useState('single');
  const [movable, setMovable] = useState(true);
  const [shape, setShape] = useState('round');
  const [zone, setZone] = useState('rim');
  const [log, setLog] = useState([]);
  // CakeScene writes resolved tier geometry into this on every render — it is not optional, and
  // omitting it throws inside the scene, which r3f swallows into a blank canvas with a clean console.
  const tierDataRef = useRef([]);

  const say = (m) => setLog(l => [`${l.length + 1}. ${m}`, ...l].slice(0, 8));

  const ring = layer(instances, arrangement);
  // Through the SAME resolver the live editor uses (toCanvasConfig), not a hand-written scene config
  // — stacking, radius-from-footprint and the frosting defaults are all resolved there, and a harness
  // that reproduced them by hand would be testing my copy rather than the real path.
  const config = toCanvasConfig({
    tiers: [{
      radius: 1.5, height: 1.2, color: '#ffd9e8', frostingType: 'buttercream',
      ...(shape === 'rect' ? { shapeFamily: 'rounded_rect', shape: 'rect', width: 3, depth: 2.2, cornerR: 0.3 } : {}),
      topPipings:    zone === 'rim'   ? [ring] : [],
      bottomPipings: zone === 'board' ? [ring] : [],
    }],
  });

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Quicksand',sans-serif" }}>
      <div style={{ width: 260, padding: 16, background: '#faf7f8', overflowY: 'auto', fontSize: 13 }}>
        <h2 style={{ fontSize: 15, marginTop: 0 }}>Single-piece drag</h2>

        <Row label="Arrangement">
          {['single', 'ring'].map(a => (
            <Btn key={a} on={arrangement === a} onClick={() => setArrangement(a)}>{a}</Btn>
          ))}
        </Row>
        <Row label="Zone">
          {['rim', 'board'].map(z => <Btn key={z} on={zone === z} onClick={() => setZone(z)}>{z}</Btn>)}
        </Row>
        <Row label="Tier shape">
          {['round', 'rect'].map(s => <Btn key={s} on={shape === s} onClick={() => setShape(s)}>{s}</Btn>)}
        </Row>
        <Row label="Capability">
          <Btn on={movable} onClick={() => setMovable(m => !m)}>
            {movable ? 'Movable ✓' : 'Pinned'}
          </Btn>
        </Row>

        <h3 style={{ fontSize: 13, marginBottom: 4 }}>Angles (live)</h3>
        {instances.map((x, i) => (
          <div key={x.id} style={{ fontVariantNumeric: 'tabular-nums', color: '#666' }}>
            piece {i + 1}: {Math.round((((x.angle - PIPING_FRONT_ANGLE) * 180 / Math.PI) % 360 + 360) % 360)}°
          </div>
        ))}
        <button onClick={() => setInstances(seedInstances)}
          style={{ marginTop: 10, padding: '4px 10px', fontSize: 12 }}>Reset angles</button>

        <h3 style={{ fontSize: 13, marginBottom: 4 }}>Events</h3>
        <div style={{ color: '#666', lineHeight: 1.5 }}>
          {log.length ? log.map(l => <div key={l}>{l}</div>) : <em>none yet</em>}
        </div>
      </div>

      {/* position:relative — the r3f Canvas is `position:absolute; inset:0`, so without a positioned
          ancestor it escapes this column and covers the whole viewport, sidebar included. */}
      <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
        {/* useGLTF suspends while the ring's model loads. CakeDesigner wraps the canvas in a boundary
            for exactly this reason; without one the whole tree suspends and the canvas stays blank
            with a clean console — no error, nothing drawn, not even the scene background. */}
        <Suspense fallback={<div style={{ padding: 20, color: '#999' }}>loading model…</div>}>
        <CakeCanvas
          config={config}
          tierDataRef={tierDataRef}
          selectedTier={null}
          onTierClick={() => say('tier clicked')}
          onDeselect={() => {}}
          onTopPipingSelect={() => say('piping SELECTED (rim)')}
          onBottomPipingSelect={() => say('piping SELECTED (board)')}
          isPipingMovable={() => movable}
          onPipingInstanceMove={(tierIndex, z, layerId, index, angle) => {
            setInstances(prev => prev.map((x, i) => i === index ? { ...x, angle } : x));
          }}
          selectedStickerIds={[]}
          onStickerSelect={() => {}}
          onStickerMove={() => {}}
        />
        </Suspense>
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
    padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
    border: '1.5px solid #1a1a1a', background: on ? '#1a1a1a' : '#fff', color: on ? '#fff' : '#1a1a1a',
    fontFamily: 'inherit', fontWeight: 600,
  }}>{children}</button>
);

createRoot(document.getElementById('root')).render(<Harness />);
