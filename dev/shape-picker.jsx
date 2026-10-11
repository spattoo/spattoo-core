// The New-cake shape picker, with the catalog grouped by footprint.
// http://localhost:5173/shape-picker.html        — add ?narrow=1 to see the phone layout
//
// ⚠️ THE CATALOG HERE IS A FIXTURE, AND ITS FAMILIES ARE INFERRED, not read from the DB. The twelve
// labels and the thumbnails come from a screenshot of app.spattoo.dev; the `family` on each row is
// what that thumbnail can only plausibly be (a 3-tier tower of discs is `circle`; a sheet is
// `rounded_rect`). That is enough to prove the GROUPING, which is all this bench is for — it is not
// evidence about any particular authored row, and if a real row disagrees the fix is the row.
//
// What it is here to show, in order:
//   1. every round footprint in one block, every rectangular one in another
//   2. a shape whose family nobody mapped still appears, under "More shapes", rather than vanishing
//   3. the simplest cake leading its group — plain Round before Tall Round before 2/3/4 Tier,
//      even though the fixture authors them in the jumbled order the screenshot showed
//   4. the whole thing at 375px, where four headings cost real height in a bottom sheet

import React from 'react';
import './scene.js';
import ReactDOM from 'react-dom/client';
import { applyCakeShapeConfig, cakeShapeList } from '../src/index.js';
import ShapePicker from '../src/designer/controls/ShapePicker.jsx';

/* `tiers` is load-bearing in this fixture, not decoration: the picker orders a group by tier count
   so the simplest cake leads, and a fixture where every row is single-tier would show grouping
   while proving nothing about order. A stack entry's contents do not matter here — only how many. */
const stack  = n => Array.from({ length: n }, () => ({ width: 2.4, depth: 2.4, height: 1.45 }));
const circle = (key, label, tiers = 1) => ({ key, label, family: 'circle', tiers: stack(tiers) });
const rect   = (key, label, tiers = 1) => ({ key, label, family: 'rounded_rect', tiers: stack(tiers) });

applyCakeShapeConfig([
  // Deliberately in the JUMBLED order the screenshot shows — which is DB insertion order, the thing
  // being fixed. If the bench authored them already sorted it would prove nothing.
  // (no 'Rectangle' row — the SEED already ships `rect`, and authoring a second one here
  //  would put two identical tiles in the group and look like a grouping bug.)
  circle('two-tier', '2 Tier', 2),
  { key: 'heart', label: 'Heart', family: 'heart', config: { plump: 1, cleft: 1 } },
  circle('three-tier', '3 Tier', 3),
  rect('quarter-sheet', 'Quarter Sheet'),
  rect('half-sheet', 'Half Sheet'),
  { key: 'letter-cake', label: 'Letter cake', family: 'letter' },
  circle('four-tier', '4 Tier', 4),
  rect('full-sheet', 'Full Sheet'),
  circle('tall-round', 'Tall Round'),
  { key: 'number-cake', label: 'Number cake', family: 'number' },
  // ⚠️ NOT A REAL SHAPE. A family no group claims, standing in for whatever somebody authors next.
  // It must appear under "More shapes"; if this tile is missing, the catch-all is broken.
  { key: 'mystery', label: 'Unmapped family', family: 'dodecahedron' },
]);

const narrow = new URLSearchParams(location.search).has('narrow');

function Bench() {
  return (
    <div style={{ minHeight: '100vh', background: '#efedf1', padding: narrow ? 0 : 24 }}>
      <div style={{ width: narrow ? 375 : '100%', margin: '0 auto', background: '#efedf1' }}>
        <ShapePicker shapes={cakeShapeList()} onPick={k => console.log('picked', k)} onClose={() => {}} />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Bench />);
