import { createRoot } from 'react-dom/client';
import { useEffect, useRef } from 'react';
import { fillShape, liftCount } from '../src/designer/geometry/pipingFill.js';

/* A flat plate, drawn the way the pieces are actually made: outline first, then the fill path, both
 * as ONE stroked polyline with round caps — which is what a nozzle lays down. Nothing here is
 * 3D; it exists to answer "does the generated path look like the reference photo". */

const poly = (n, r, rot = 0, inner = null) => Array.from({ length: inner ? n * 2 : n }, (_, i) => {
  const a = rot + (i / (inner ? n * 2 : n)) * Math.PI * 2;
  const rr = inner && i % 2 ? inner : r;
  return [Math.cos(a) * rr, Math.sin(a) * rr];
});
const leaf = () => {
  const p = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24, x = t * 2 - 1; p.push([x, Math.sin(t * Math.PI) * 0.55]); }
  for (let i = 24; i >= 0; i--) { const t = i / 24, x = t * 2 - 1; p.push([x, -Math.sin(t * Math.PI) * 0.55]); }
  return p;
};

const PIECES = [
  { name: 'Disc — scribble',     shape: poly(40, 0.9),                pattern: 'scribble', spacing: 0.13 },
  { name: 'Star — cross-hatch',  shape: poly(5, 1, -Math.PI/2, 0.42), pattern: 'cross',    spacing: 0.15 },
  { name: 'Leaf — hatch',        shape: leaf(),                       pattern: 'hatch',    spacing: 0.11, angle: 1.2 },
  { name: 'Square — woven',      shape: poly(4, 0.95, Math.PI/4),     pattern: 'weave',    spacing: 0.15 },
];

function Plate({ piece }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, S = 260, dpr = 2;
    c.width = S * dpr; c.height = S * dpr; c.style.width = c.style.height = S + 'px';
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    x.fillStyle = '#F6F4F0'; x.fillRect(0, 0, S, S);

    const to = ([px, py]) => [S / 2 + px * (S * 0.42), S / 2 + py * (S * 0.42)];
    const stroke = (pts, w) => {
      x.beginPath();
      pts.forEach((p, i) => { const [a, b] = to(p); i ? x.lineTo(a, b) : x.moveTo(a, b); });
      x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round';
      x.strokeStyle = '#4A2C1B'; x.stroke();
    };

    const paths = fillShape(piece.shape, { pattern: piece.pattern, spacing: piece.spacing,
                                           angle: piece.angle ?? 0, inset: 0.03, seed: 11 });
    for (const p of paths) stroke(p, 4);          // the fill, laid first
    stroke([...piece.shape, piece.shape[0]], 6);  // the outline, piped over it
    c.dataset.lifts = liftCount(paths);
  }, [piece]);
  return (
    <figure style={{ margin: 0 }}>
      <canvas ref={ref} style={{ borderRadius: 12, display: 'block' }} />
      <figcaption style={{ fontSize: 12, marginTop: 6, color: '#555' }}>{piece.name}</figcaption>
    </figure>
  );
}

createRoot(document.getElementById('root')).render(
  <div style={{ padding: 20, background: '#fff' }}>
    <h1 style={{ fontSize: 15, marginBottom: 14 }}>Piped chocolate — outline drawn, then filled</h1>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {PIECES.map(p => <Plate key={p.name} piece={p} />)}
    </div>
  </div>
);
