import { createRoot } from 'react-dom/client';
import { CakePreview, SceneBackground } from '../src/designer/canvas/CakeCanvas.jsx';
import { DESIGNER_GROUND } from '../src/designer/constants.js';
import './scene.js';                       // light it the way production does (check:harness-scene)

/* Does a composed topper actually ARRIVE on the cake?
 *
 * The whole chain, end to end: design.toppers -> toCanvasConfig -> CakeContent -> Toppers ->
 * topperSheets -> garnishPlacement. Tests prove the maths and the stacking order; only this proves
 * the piece is on the cake, the right way up, the right size, and the colour that was asked for.
 *
 * ⚠️ THE PAYLOAD HERE IS THE COMPOSER'S OWN OBJECT LIST, not a hand-built set of contours. If this
 * harness invented its own payload shape it would prove the renderer works on input the composer
 * never produces, which is the failure mode a harness exists to catch.
 *
 *   npm run dev       (5190)   →   /topper-on-cake.html?word=Mia&shape=heart
 *
 * `?still=1` freezes the spin for a screenshot; `?mode=stand` stands the card up instead of laying
 * it down; `?scale=`, `?colour=`, `?offset=`, `?radius=` sweep the placement and the piece.
 */
const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);

const word = q.get('word') ?? 'Mia';
const family = q.get('shape');            // absent = the word alone, no plate under it

/* Back to front, which is the order the composer stores and the order the stacking depends on: a
   plate added first sits behind a word added after it. */
const objects = [
  ...(family ? [{ id: 1, kind: 'shape', family, size: 1.5, x: 0, y: 0, colour: q.get('plate') ?? '#F2AEC4' }] : []),
  { id: 2, kind: 'text', text: word, size: num('size', 0.6), x: 0, y: 0,
    colour: q.get('colour') ?? '#4A2C1B',
    offset: num('offset', 0.06), offsetColour: q.get('offsetColour') ?? '#FFFFFF',
    face: '__block' },
];

const design = {
  tiers: [{ shape: 'round', color: q.get('tier') ?? '#F6DCE2',
            frostingType: 'buttercream', frostingStyle: 'smooth',
            topPipings: [], bottomPipings: [], creamLayers: [] }],
  texts: [], ages: [], stickers: [], piping: [], garnishes: [],
  toppers: [{
    id: 't1', name: 'harness', payload: { v: 1, objects },
    /* Placement keys are the GARNISH's, because a topper is placed by `garnishPlacement`. Leaving
       them out would take the hook's defaults and prove nothing about what a drag writes back. */
    theta: num('theta', 0), radius: num('radius', 0.35), yaw: num('yaw', 0),
    mode: q.get('mode') ?? 'lie', scale: num('scale', 1),
  }],
};

function App() {
  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <CakePreview design={design} shadows autoRotate={!q.has('still')}>
        <SceneBackground colour={DESIGNER_GROUND} />
      </CakePreview>
      {/* The colours that were ASKED FOR, beside the cake, so the gap is visible without measuring. */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>
        {[objects[objects.length - 1].colour, objects[objects.length - 1].offsetColour].map((c, i) => (
          <div key={i} data-asked style={{ width: 56, height: 44, background: c,
                                           border: '1px solid rgba(0,0,0,.15)', borderRadius: 6 }} />
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
