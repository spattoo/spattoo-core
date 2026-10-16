import { describe, it, expect } from 'vitest';
import { spatulaFramePath } from './spatulaPath.js';
import { RAIL } from './rail.js';

const RAIL_BLADE_HALF = 61;   // RAIL.bladeHalf, named so the reference ratio below reads as a ratio

/* ── The handle has to stay wide enough to carry the nav ─────────────────────────────────────────
 *
 * The rail's labels are CENTRED on the silhouette, so a label is legible only while the paint under
 * it is at least as wide as the label is. Narrowing the handle is therefore not a free visual
 * choice — it is the thing that pushes "Decorations" off the dark shape onto the page.
 *
 * ⚠️ THESE NUMBERS ARE MEASURED, NOT CHOSEN. Read off the live rail at 1280x900
 * (`dev/rail.html`), label by label: each entry is where the label sits in the SVG's own
 * coordinates and how wide it is. They are what makes the reference photo's shape impossible —
 * a real spatula tapers the whole way, and "Decorations" at y=157 pins the top of our handle open.
 * Re-measure if the rail's font, label set or item spacing changes; do not nudge them to pass.
 */
const LABELS = [
  { t: 'New Cake',    y:  92.5, half: 22.3 },
  { t: 'Decorations', y: 157.5, half: 27.4 },   // the widest in the rail — the binding constraint
  { t: 'Templates',   y: 222.5, half: 23.5 },
  { t: 'Uploads',     y: 287.5, half: 18.5 },
  { t: 'Orders',      y: 352.5, half: 15.5 },
  { t: 'Calendar',    y: 417.5, half: 20.6 },
  { t: 'Customers',   y: 482.5, half: 24.1 },
  { t: 'Store',       y: 547.5, half: 12.3 },
];

/* The rail as it is drawn at a typical window height, from SpatulaFrame's own arithmetic. */
const H = 840;
const geo = {
  W: RAIL.svgW, handleHalf: 30, bladeHalf: RAIL.bladeHalf, capTopY: 8,
  lShoulderY: H - 12 - 194 - 65, rShoulderY: H - 12 - 194 - 65,
  bladeFullY: H - 12 - 194, bladeBotY: H - 12,
  lCornerH: 7, lCornerW: 37, rCornerH: 90, rCornerW: 77,
};

/* Half-width of the handle at `y`, evaluating the SAME two cubics spatulaPath.js draws: the nose
 * from the apex out to the grip, then the long narrowing into the neck. Sampled rather than solved —
 * 4000 steps is exact to far under a pixel and cannot drift from the path the way a re-derived
 * closed form could. */
const NOSE_C2 = 0.061;   // must match spatulaPath.js — the fitted nose's second control
function halfWidthAt(y, { noseHalf, gripHalf, gripY, neckHalf }) {
  const shY = geo.lShoulderY;
  if (y >= shY) return geo.handleHalf;
  if (y <= geo.capTopY) return 0;
  const bez = (t, a, b, c, d) => {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  };
  const noseLen = gripY - geo.capTopY;
  const segs = [
    { y: [geo.capTopY, geo.capTopY, geo.capTopY + noseLen * NOSE_C2, gripY],
      x: [0, noseHalf, gripHalf, gripHalf] },
    { y: [gripY, gripY + (shY - gripY) * 0.45, gripY + (shY - gripY) * 0.72, shY],
      x: [gripHalf, gripHalf, neckHalf, neckHalf] },
  ];
  let best = geo.handleHalf, bestD = Infinity;
  for (const sg of segs) {
    for (let i = 0; i <= 4000; i++) {
      const t = i / 4000;
      const d = Math.abs(bez(t, ...sg.y) - y);
      if (d < bestD) { bestD = d; best = bez(t, ...sg.x); }
    }
  }
  return best;
}

describe('the spatula handle carries the nav', () => {
  it.each(LABELS)('"$t" sits on paint at y=$y', ({ y, half }) => {
    expect(halfWidthAt(y, RAIL)).toBeGreaterThanOrEqual(half);
  });

  /* ⚠️ THE REASON THE SHIPPED SHAPE IS NOT THE REFERENCE PHOTO'S. A taper running the whole handle
     is what makes a spatula read as a spatula, and it cannot carry "Decorations" — not even at a
     tip of 26, which is a 4px narrowing nobody would see. Stated as a test so that if the label set
     ever changes, this fails and says the better shape has become available. */
  /* ⚠️ WHY THE SHIPPED HANDLE IS NOT THE PHOTO'S. Measured off the reference, its handle is 26% of
     its blade width at the neck. Ours would be a half-width of 16, and "Customers" sits at y=478
     needing 24.1 — so the shape that actually reads as a spatula cannot carry the nav. Stated as a
     test so that if the label set ever shrinks, this fails and says the better shape is available. */
  it('cannot neck down to the reference photo while the labels are this wide', () => {
    const customers = LABELS.find(l => l.t === 'Customers');
    const refNeck = { ...RAIL, neckHalf: Math.round(RAIL_BLADE_HALF * 2 * 0.263 / 2) };
    expect(halfWidthAt(customers.y, refNeck)).toBeLessThan(customers.half);
  });
});

/* ⚠️ THE HOLE IS WHY THE RAIL LOST A MENU ITEM ONCE. The old one sat at y=62 with r=9 on a parallel
 * bar, so the first nav item had to clear y=71 and `sidebarInner`'s top padding paid for it. It is
 * affordable again only because the fitted nose put narrow, unusable paint up there. These two tests
 * are what stop it costing anything a second time — measured on the live rail, the first nav item's
 * box starts at y=52. */
const FIRST_ITEM_TOP = 52;

describe('the hang hole is free this time', () => {
  it('ends above the first nav item', () => {
    expect(RAIL.holeY + RAIL.holeRy).toBeLessThanOrEqual(FIRST_ITEM_TOP);
  });

  it('leaves real material either side of it', () => {
    const atHole = halfWidthAt(RAIL.holeY, RAIL);
    expect(atHole - RAIL.holeRx).toBeGreaterThan(8);
  });

  /* An oval, not a circle: the photo's is 20x33. A circle at this size reads as a rivet. */
  it('is an oval, as the photo is', () => {
    expect(RAIL.holeRy).toBeGreaterThan(RAIL.holeRx * 1.3);
  });

  /* ⚠️ The hole is a subpath of the SAME `d`, so it is only a hole under evenodd. Rendered with the
     default nonzero winding it fills solid and the rail silently loses it. */
  it('is wound into the outline, so it needs evenodd', () => {
    const withHole = spatulaFramePath({ ...geo, ...RAIL });
    const without = spatulaFramePath({ ...geo, ...RAIL, holeY: null });
    expect(withHole.length).toBeGreaterThan(without.length);
    expect(withHole).toContain(`a ${RAIL.holeRx} ${RAIL.holeRy}`);
  });
});

describe('the outline itself', () => {
  it('is a closed path that starts at the tip', () => {
    const d = spatulaFramePath({ ...geo, ...RAIL });
    expect(d.startsWith(`M ${geo.W / 2} ${geo.capTopY}`)).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
  });

  /* Without a tip the builder must draw exactly what it drew before the taper existed, so the
     harnesses and `dev/logo-placement.html` that call it without one are untouched. */
  it('is the old parallel bar when no tip is given', () => {
    const d = spatulaFramePath(geo);
    expect(d).toContain(`A 30 30 0 0 1 ${geo.W / 2 + 30} 38`);
    expect(d).not.toContain('C 96');
  });

  /* ⚠️ NO ARC ANYWHERE IN THE SHAPED OUTLINE. A circular cap has constant curvature and the curve
     below it has almost none, and that discontinuity is visible as a kink even though the tangents
     match — "it suddenly started to bend". The nose is one cubic for exactly this reason, so an arc
     creeping back in is a regression this names. */
  it('draws the nose with no arc at all', () => {
    const d = spatulaFramePath({ ...geo, ...RAIL });
    expect(d).not.toContain('A ');
    expect(d).toContain(`${geo.W / 2 + RAIL.neckHalf} ${geo.lShoulderY}`);   // necked at the shoulder
  });

  /* The nose follows the photo's profile, which is an ellipse about 1:2.2 — far longer than a
     semicircle, which can only ever round over its own half-width. Checked at the midpoint. */
  it('has a nose longer than a semicircular cap could be', () => {
    expect(RAIL.gripY - geo.capTopY).toBeGreaterThan(RAIL.gripHalf * 2);
  });
});
