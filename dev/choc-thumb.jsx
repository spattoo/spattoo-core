import { fillShape } from '../src/designer/geometry/pipingFill.js';

/* A thumbnail for the Chocolate Pen element row. Drawn with the same generator the tool uses, so
 * the picture is an honest sample of the output rather than an illustration of it. */
const x = document.getElementById('c').getContext('2d');
x.scale(2, 2);
x.fillStyle = '#F7F4EF'; x.fillRect(0, 0, 256, 256);

const stroke = (pts, w) => {
  x.beginPath();
  pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
  x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#4A2C1B'; x.stroke();
};

// A filigree leaf: outline, hatched inside — the shape most like the reference pieces.
const leaf = [];
for (let i = 0; i <= 30; i++) { const t = i / 30; leaf.push([46 + t * 164, 128 - Math.sin(t * Math.PI) * 62]); }
for (let i = 30; i >= 0; i--) { const t = i / 30; leaf.push([46 + t * 164, 128 + Math.sin(t * Math.PI) * 62]); }
for (const p of fillShape(leaf, { pattern: 'hatch', spacing: 13, angle: 1.15, inset: 5, seed: 4 })) stroke(p, 5);
stroke([...leaf, leaf[0]], 8);
document.title = 'ready';
