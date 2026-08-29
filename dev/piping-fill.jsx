import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { fillShape, liftCount, FILL_PATTERNS } from '../src/designer/geometry/pipingFill.js';
import { tidyDrawn, fillWorthwhile } from '../src/designer/geometry/drawnShape.js';
import Segmented from '../src/shared/Segmented.jsx';

/* Draw a shape with the mouse or a finger, then choose a fill — or no fill. A flat plate, which is
 * how these pieces are actually made: piped on parchment, set, peeled off, stood on the cake.
 *
 * ⚠️ FILL IS A CHOICE AND STARTS AT "NONE". Half the reference pieces are outline only — the leaf
 * veins, the treble clefs, the loops. Filling by default would decide for the baker, and it is the
 * same rule the photo editor settled on: our judgement is offered, never applied.
 */

const CHOC = '#4A2C1B';
const PLATE = '#F6F4F0';

const FILLS = [
  { id: 'none', label: 'None' },
  ...Object.entries(FILL_PATTERNS).map(([id, s]) => ({ id, label: s.label })),
];

function Studio() {
  const ref = useRef(null);
  const trail = useRef([]);            // the live trail while the pointer is down
  const [shape, setShape] = useState(null);
  const [fill, setFill] = useState('none');
  const [spacing, setSpacing] = useState(14);
  const [drawing, setDrawing] = useState(false);

  const paths = shape && fill !== 'none'
    ? fillShape(shape.ring, { pattern: fill, spacing, inset: 4, seed: 11 })
    : [];

  // ── Draw ────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const c = ref.current, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr;
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = PLATE; x.fillRect(0, 0, W, H);

    const stroke = (pts, w, colour = CHOC) => {
      if (pts.length < 2) return;
      x.beginPath();
      pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
      x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = colour;
      x.stroke();
    };

    for (const p of paths) stroke(p, 5);                        // fill first, outline over it
    if (shape) stroke(shape.ring, 8);
    if (drawing) stroke(trail.current, 8, 'rgba(74,44,27,0.45)');   // wet, still being piped
  }, [shape, fill, spacing, drawing, paths]);

  // ── Capture ─────────────────────────────────────────────────────────────────────────────────
  const at = e => {
    const r = ref.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  function down(e) {
    ref.current.setPointerCapture(e.pointerId);      // so a finger leaving the plate still tracks
    trail.current = [at(e)]; setShape(null); setDrawing(true);
  }
  function move(e) { if (drawing) { trail.current = [...trail.current, at(e)]; setDrawing(true); } }
  function up() {
    setDrawing(false);
    const tidy = tidyDrawn(trail.current);
    trail.current = [];
    if (tidy) setShape(tidy);
  }

  const worthwhile = shape && fillWorthwhile(shape.ring);

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <canvas
        ref={ref}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ width: 420, height: 420, borderRadius: 14, touchAction: 'none', cursor: 'crosshair',
                 border: '1px solid #E3DFD8', display: 'block' }}
      />

      <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 13, color: '#555', margin: 0, lineHeight: 1.5 }}>
          Draw a shape on the plate — any shape, it does not need to be neat or to join up.
        </p>

        <div>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6, color: '#333' }}>Fill</div>
          <Segmented equal items={FILLS} value={fill} onChange={setFill} tone={CHOC} label="Fill" />
        </div>

        {fill !== 'none' && (
          <label style={{ fontSize: 12, color: '#555' }}>
            Gap between lines — {spacing}px
            <input type="range" min={6} max={30} value={spacing} style={{ width: '100%', accentColor: CHOC }}
                   onChange={e => setSpacing(Number(e.target.value))} />
          </label>
        )}

        <div style={{ fontSize: 12, color: '#555', lineHeight: 1.7 }} data-readout>
          {!shape && <>Nothing drawn yet.</>}
          {shape && <>
            Outline: {shape.ring.length - 1} points{shape.closed ? '' : `, joined up for you (${Math.round(shape.gap)}px gap)`}<br />
            {fill === 'none'
              ? 'No fill — outline only.'
              : <>Fill: {paths.length} continuous {paths.length === 1 ? 'squeeze' : 'squeezes'} ({liftCount(paths)} {liftCount(paths) === 1 ? 'lift' : 'lifts'})</>}
            {shape && !worthwhile && fill !== 'none' &&
              <><br /><span style={{ color: '#9A6A2F' }}>This reads more like a line than a region — a fill will look like dashes.</span></>}
          </>}
        </div>

        <button onClick={() => { setShape(null); setFill('none'); }}
                style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid #DDD8D0',
                         background: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
          Clear
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <div style={{ padding: 22, background: '#fff', fontFamily: 'system-ui, sans-serif' }}>
    <h1 style={{ fontSize: 15, marginBottom: 14 }}>Piped chocolate — draw a shape, then choose a fill</h1>
    <Studio />
  </div>
);
