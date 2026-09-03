import { createRoot } from 'react-dom/client';
import { CakePreview } from '../src/designer/canvas/CakeCanvas.jsx';
import { fillShape } from '../src/designer/geometry/pipingFill.js';

/* The whole chain, end to end: design.garnishes -> toCanvasConfig -> CakeContent -> Garnishes.
 * Tests can prove the maths; only this can prove the piece actually arrives on the cake. */

const leaf = [];
for (let i = 0; i <= 26; i++) { const t = i / 26; leaf.push([60 + t * 300, 210 - Math.sin(t * Math.PI) * 100]); }
for (let i = 26; i >= 0; i--) { const t = i / 26; leaf.push([60 + t * 300, 210 + Math.sin(t * Math.PI) * 100]); }
const paths = [leaf, ...fillShape(leaf, { pattern: 'hatch', spacing: 26, inset: 9, ropeWidth: 12, seed: 5 })];

/* ⚠️ THE COLOUR IS DRIVEN FROM THE URL, so this harness can be MEASURED rather than looked at.
 * `?color=%234EC5B0` renders the piece in that colour on the real cake scene — same lights, same
 * environment, same material as a customer sees. Without this the fixture was dark chocolate, which
 * is the one colour the environment wash does not show up on: it was measured, reported as correct,
 * and the bug survived four more rounds. A harness that can only be checked with the easy case is
 * not a harness. */
const asked = new URLSearchParams(location.search).get('color') || '#4A2C1B';

const design = {
  tiers: [{ shape: 'round', color: '#F6DCE2', frostingType: 'buttercream', frostingStyle: 'smooth',
            topPipings: [], bottomPipings: [], creamLayers: [] }],
  texts: [], ages: [], stickers: [], writings: [], piping: [],
  garnishes: [
    // A CUT panel with a hole punched in it, beside a piped piece — the two ways of being made.
    { id: 'a', name: 'Panel', kind: 'cut', color: asked, plate: 420, radius: 0.5, mode: 'stand', scale: 1.3,
      rings: [
        [[110, 60], [310, 60], [270, 360], [150, 360], [110, 60]],
        Array.from({ length: 25 }, (_, i) => { const t = (i / 24) * Math.PI * 2;
          return [210 + Math.cos(t) * 45, 170 + Math.sin(t) * 45]; }),
      ] },
    { id: 'b', name: 'Leaf', color: asked, paths, rope: 6, plate: 420, theta: 3.4, radius: 0.55, mode: 'lie' },
  ],
};

createRoot(document.getElementById('root')).render(
  <div style={{ height: '100%', position: 'relative' }}>
    <CakePreview design={design} />
    {/* The colour that was ASKED FOR, against the cake, so the gap is visible without a screenshot
        being sent anywhere. */}
    <div data-asked style={{ position: 'absolute', top: 12, left: 12, width: 90, height: 60,
                             background: asked, border: '1px solid rgba(0,0,0,.15)', borderRadius: 6 }} />
  </div>
);
