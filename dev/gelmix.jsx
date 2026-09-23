import { createRoot } from 'react-dom/client';
import GelMix from '../src/orders/xray/GelMix.jsx';
import { gelRecipeFor } from '../src/orders/xray/gelLibrary.js';

/* The mix strip, on the colours X-Ray actually produces — including the ones it handles badly.
 * Open /gelmix.html. 390px is the judging width: this lands on a phone at a bench. */
const CASES = [
  ['petal',  '#ffffff'],   // no gel — the strip must not draw at all
  ['center', '#ffcc33'],   // the reported case: Sugarflair Egg Yellow
  ['stem',   '#8f9b0f'],   // the other reported case: Americolor Lemon Yellow
  // ⚠️ REAL CAKE COLOURS, NOT THE GEL TABLE'S OWN HEXES. Seeding this list from GELS made half the
  // rows draw two identical chips, which is the one thing the strip is NOT for — a baker's colour
  // is a TINT, always some distance from the neat gel, and that distance is the whole point.
  ['blush',  '#F2A0B5'],
  ['dusty',  '#9DB7CE'],
  ['sage',   '#A8B89A'],
  ['terra',  '#C87A5B'],
  ['butter', '#FFF3D6'],
  ['wine',   '#8E1B2E'],
  ['ink',    '#0d0d0d'],
  ['taupe',  '#8a7f72'],
];

const muted = { fontSize: 11.5, color: '#8A857D', lineHeight: 1.35 };

createRoot(document.getElementById('root')).render(
  <div style={{ maxWidth: 390, padding: 16, fontFamily: 'Quicksand, system-ui, sans-serif' }}>
    <div style={{ fontSize: 11, fontWeight: 900, color: '#8A857D', letterSpacing: 0.6, marginBottom: 10 }}>
      COLOUR GUIDE
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {CASES.map(([role, hex]) => {
        const rec = gelRecipeFor(hex);
        return (
          <div key={role} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ width: 20, height: 20, borderRadius: 5, background: hex,
                           border: '1.5px solid rgba(0,0,0,0.12)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2C2A26' }}>
                {role}<span style={{ fontWeight: 600, color: '#8A857D' }}> · {hex}</span>
              </div>
              <div style={{ ...muted, marginTop: 1 }}>
                {rec?.recipe}{rec?.approx && <span> (closest match — adjust by eye)</span>}
              </div>
              <GelMix hex={hex} recipe={rec} />
            </div>
          </div>
        );
      })}
    </div>
  </div>,
);
