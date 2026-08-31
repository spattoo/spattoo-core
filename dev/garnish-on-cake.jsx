import { createRoot } from 'react-dom/client';
import { CakePreview } from '../src/designer/canvas/CakeCanvas.jsx';
import { fillShape } from '../src/designer/geometry/pipingFill.js';

/* The whole chain, end to end: design.garnishes -> toCanvasConfig -> CakeContent -> Garnishes.
 * Tests can prove the maths; only this can prove the piece actually arrives on the cake. */

const leaf = [];
for (let i = 0; i <= 26; i++) { const t = i / 26; leaf.push([60 + t * 300, 210 - Math.sin(t * Math.PI) * 100]); }
for (let i = 26; i >= 0; i--) { const t = i / 26; leaf.push([60 + t * 300, 210 + Math.sin(t * Math.PI) * 100]); }
const paths = [leaf, ...fillShape(leaf, { pattern: 'hatch', spacing: 26, inset: 9, ropeWidth: 12, seed: 5 })];

const design = {
  tiers: [{ shape: 'round', color: '#F6DCE2', frostingType: 'buttercream', frostingStyle: 'smooth',
            topPipings: [], bottomPipings: [], creamLayers: [] }],
  texts: [], ages: [], stickers: [], writings: [], piping: [],
  garnishes: [
    { id: 'a', name: 'Leaf', paths, rope: 6, plate: 420, theta: -1.2, radius: 0.55, mode: 'stand', scale: 1.6 },
    { id: 'b', name: 'Leaf', paths, rope: 6, plate: 420, theta: 1.6,  radius: 0.55, mode: 'lie' },
  ],
};

createRoot(document.getElementById('root')).render(
  <div style={{ height: '100%' }}><CakePreview design={design} /></div>
);
