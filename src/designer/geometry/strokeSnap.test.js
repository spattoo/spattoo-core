import { describe, it, expect } from 'vitest';
import { snapStroke } from './strokeSnap.js';

// ── Tidying a hand-drawn piping line ─────────────────────────────────────────────────────────────
// The risk here is not that it fails to tidy — it is that it tidies something the customer MEANT.
// A heart snapped to a circle, a name straightened into a bar: that destroys work, and a stroke
// takes real effort to draw. So most of these tests are about what it must LEAVE ALONE.

// A wobbling hand: a repeatable jitter, so a failure is reproducible rather than occasionally red.
const wobble = (i, amp = 0.02) => Math.sin(i * 2.399963) * amp;

const ringPoints = (r, n, { amp = 0.02, from = 0, to = Math.PI * 2, cx = 0, cz = 0, y = 1 } = {}) =>
  Array.from({ length: n }, (_, i) => {
    const a = from + (to - from) * (i / (n - 1));
    const rr = r + wobble(i, amp);
    return [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr];
  });

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
// How far the worst point strays from the straight line through the two ends. This is what
// "straightened" actually means — NOT that the result is axis-aligned. A line fitted through wobbly
// points has a genuine slight slope, and asserting a flat z or y would be demanding that the fit
// ignore the data.
// Points are stored at 4 decimal places, so "straight" bottoms out at half that — 5e-5. Anything
// tighter would be asserting about float noise rather than about the fit.
const STRAIGHT = 1e-4;
const maxOffLine = (pts, ax, bx) => {
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b[ax] - a[ax], dy = b[bx] - a[bx];
  const len = Math.hypot(dx, dy) || 1;
  return Math.max(...pts.map(p =>
    Math.abs((p[ax] - a[ax]) * dy - (p[bx] - a[bx]) * dx) / len));
};
const radii = (pts, cx = 0, cz = 0) => pts.map(p => Math.hypot(p[0] - cx, p[2] - cz));

/* How far the tidied stroke wanders from the one that was DRAWN, as a fraction of the drawing's own
 * size. This replaced `toEqual(drawn)` when Auto-correct stopped being all-or-nothing: the promise
 * was never "the array is untouched", it was "what you meant is still there". A smoothed stroke
 * fails the first and keeps the second, and a stroke flattened into a bar fails both. */
const strayFrom = (drawn, out) => {
  const d3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const spread = ax => Math.max(...drawn.map(p => p[ax])) - Math.min(...drawn.map(p => p[ax]));
  const extent = Math.max(spread(0), spread(1), spread(2)) || 1;
  return Math.max(...out.map(p => Math.min(...drawn.map(q => d3(p, q))))) / extent;
};

describe('snapStroke', () => {
  it('leaves a stroke with too few points alone', () => {
    const pts = [[0, 1, 0], [0.1, 1, 0], [0.2, 1, 0]];
    expect(snapStroke(pts)).toEqual({ points: pts, shape: null });
  });

  describe('on the cake top', () => {
    it('snaps a wobbling run round the rim to a true circle', () => {
      const drawn = ringPoints(1.0, 60);
      const { points, shape } = snapStroke(drawn, { normal: [0, 1, 0], axis: [0, 0] });
      expect(shape).toBe('circle');
      const rs = radii(points);
      const spread = Math.max(...rs) - Math.min(...rs);
      expect(spread).toBeLessThan(1e-3);              // the wobble is gone
      expect(rs[0]).toBeCloseTo(1.0, 1);              // …at the radius they drew
    });

    it('re-centres a rim border on the CAKE\'S axis, not the hand\'s', () => {
      // Drawn a little off-centre, as a hand does. A border round a rim has one right centre and it
      // is the cake's, so being faithful to the drawing would be the wrong kind of accuracy.
      const drawn = ringPoints(1.0, 60, { cx: 0.08, cz: -0.05 });
      const { points, shape } = snapStroke(drawn, { axis: [0, 0] });
      expect(shape).toBe('circle');
      const rs = radii(points);                        // measured about the CAKE axis
      expect(Math.max(...rs) - Math.min(...rs)).toBeLessThan(1e-3);
    });

    it('closes a full lap exactly, so there is no visible join', () => {
      const drawn = ringPoints(1.0, 80, { from: 0, to: Math.PI * 2 * 0.99 });
      const { points, shape } = snapStroke(drawn, { axis: [0, 0] });
      expect(shape).toBe('circle');
      expect(dist(points[0], points[points.length - 1])).toBeLessThan(1e-3);
    });

    it('keeps a partial arc partial rather than closing it into a ring', () => {
      const drawn = ringPoints(1.0, 40, { from: 0, to: Math.PI * 0.9 });
      const { points, shape } = snapStroke(drawn, { axis: [0, 0] });
      expect(shape).toBe('circle');
      expect(dist(points[0], points[points.length - 1])).toBeGreaterThan(0.5);
    });

    it('straightens a wobbling bar across the top', () => {
      const drawn = Array.from({ length: 40 }, (_, i) => {
        const t = -0.8 + 1.6 * (i / 39);
        return [t, 1, 0.2 + wobble(i, 0.015)];
      });
      const { points, shape } = snapStroke(drawn, { axis: [0, 0] });
      expect(shape).toBe('line');
      expect(maxOffLine(points, 0, 2)).toBeLessThan(STRAIGHT);   // dead straight in XZ
      // …and it really did remove the wobble it was given.
      expect(maxOffLine(drawn, 0, 2)).toBeGreaterThan(0.01);
    });

    it('reads a SHALLOW bow as a line, not as an enormous circle', () => {
      // A gentle curve fits a huge circle beautifully, and snapping to it swings the stroke somewhere
      // nobody asked for. The arc has to be a real arc before round wins.
      const drawn = ringPoints(6.0, 40, { from: 1.4, to: 1.75, amp: 0.004 });
      const { shape } = snapStroke(drawn, { axis: [0, 0] });
      expect(shape).not.toBe('circle');
    });

    it('keeps a deliberate squiggle a squiggle, tidying the hand and not the shape', () => {
      const drawn = Array.from({ length: 50 }, (_, i) => {
        const t = i / 49;
        return [-0.8 + 1.6 * t, 1, Math.sin(t * Math.PI * 5) * 0.4];
      });
      const { points, shape } = snapStroke(drawn, { axis: [0, 0] });
      expect(shape).toBe('smooth');                    // tidied, never snapped to a primitive
      expect(strayFrom(drawn, points)).toBeLessThan(0.06);
    });

    it('keeps a heart a heart', () => {
      const drawn = Array.from({ length: 60 }, (_, i) => {
        const t = (i / 59) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const z = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        return [x / 20, 1, z / 20];
      });
      const { points, shape } = snapStroke(drawn, { axis: [0, 0] });
      expect(shape).not.toBe('circle');                // the one that would destroy it
      expect(shape).not.toBe('line');
      expect(strayFrom(drawn, points)).toBeLessThan(0.06);
    });

    it('keeps every point at the height it was drawn at', () => {
      const drawn = ringPoints(1.0, 60, { y: 1.37 });
      const { points } = snapStroke(drawn, { axis: [0, 0] });
      for (const p of points) expect(p[1]).toBeCloseTo(1.37, 3);
    });
  });

  describe('on the wall', () => {
    // Straightening in world space would drive the stroke through the cake. Unrolled to
    // (arc-length, height) it stays on the wall.
    const wallPoints = (n, fn, r = 1.2) => Array.from({ length: n }, (_, i) => {
      const { a, y } = fn(i, n);
      return [Math.cos(a) * r, y, Math.sin(a) * r];
    });

    it('levels a wobbling band round the side', () => {
      const drawn = wallPoints(50, (i, n) => ({
        a: -0.6 + 1.2 * (i / (n - 1)),
        y: 0.9 + wobble(i, 0.02),
      }));
      const { points, shape } = snapStroke(drawn, { normal: [1, 0, 0], axis: [0, 0] });
      expect(shape).toBe('line');
      // Straight in UNROLLED space — (arc-length round the tier, height) — which is where a level
      // band round a cylinder is actually a straight line.
      const unrolled = points.map(p => [Math.atan2(p[2], p[0]) * 1.2, p[1]]);
      expect(maxOffLine(unrolled, 0, 1)).toBeLessThan(STRAIGHT);
    });

    it('keeps the straightened band ON the wall', () => {
      // The whole reason for unrolling. A straight line in world space between two points on a
      // cylinder cuts a chord THROUGH it.
      const drawn = wallPoints(50, (i, n) => ({
        a: -0.9 + 1.8 * (i / (n - 1)),
        y: 0.9 + wobble(i, 0.02),
      }));
      const { points } = snapStroke(drawn, { normal: [1, 0, 0], axis: [0, 0] });
      for (const p of points) expect(Math.hypot(p[0], p[2])).toBeCloseTo(1.2, 2);
    });

    it('straightens a vertical drop down the wall', () => {
      const drawn = wallPoints(30, (i, n) => ({
        a: 0.4 + wobble(i, 0.03),
        y: 0.3 + 0.9 * (i / (n - 1)),
      }));
      const { points, shape } = snapStroke(drawn, { normal: [1, 0, 0], axis: [0, 0] });
      expect(shape).toBe('line');
      const angs = points.map(p => Math.atan2(p[2], p[0]));
      expect(Math.max(...angs) - Math.min(...angs)).toBeLessThan(0.01);
    });

    it('keeps a scalloped swag scalloped', () => {
      const drawn = wallPoints(60, (i, n) => {
        const t = i / (n - 1);
        return { a: -1 + 2 * t, y: 0.9 + Math.sin(t * Math.PI * 4) * 0.25 };
      });
      const { points, shape } = snapStroke(drawn, { normal: [1, 0, 0], axis: [0, 0] });
      expect(shape).toBe('smooth');
      expect(strayFrom(drawn, points)).toBeLessThan(0.06);
    });

    /* ── The reported bug ───────────────────────────────────────────────────────────────────────
       Sandeep piped a curved band round a tier with Auto-correct on and got a straight one:
       *"auto correction is making the curved piping to a straight line. here my expectation is a
       smoother curved path."* The old ceiling of 0.035 of the path length admitted a bow of nearly
       an eighth of that length, because for a bowed path the RMS to the best-fit line is only
       about 0.3 of the sagitta. */
    it('keeps a deliberately bowed band curved instead of flattening it', () => {
      const SAG = 0.22;                                 // bow, as a fraction of the run
      const drawn = wallPoints(60, (i, n) => {
        const t = i / (n - 1);
        return { a: -0.9 + 1.8 * t, y: 1.0 + Math.sin(t * Math.PI) * SAG };
      });
      const { points, shape } = snapStroke(drawn, { normal: [1, 0, 0], axis: [0, 0] });
      expect(shape).toBe('smooth');                     // NOT 'line'
      const ys = points.map(p => p[1]);
      // the arch is still there: the middle still rides well above both ends
      const ends = (ys[0] + ys[ys.length - 1]) / 2;
      expect(Math.max(...ys) - ends).toBeGreaterThan(SAG * 0.8);
    });

    /* ⚠️ AND THE OTHER HALF, which tightening the threshold alone broke: a tremor is not a bow.
       Both leave the same residual, so straightness is judged on the SOFTENED path — the wobble is
       gone by then and a genuinely straight run still snaps. */
    it('still straightens a run that is only wobbly, not bowed', () => {
      const drawn = wallPoints(40, (i, n) => ({
        a: -0.8 + 1.6 * (i / (n - 1)),
        y: 1.0 + wobble(i, 0.035),
      }));
      expect(snapStroke(drawn, { normal: [1, 0, 0], axis: [0, 0] }).shape).toBe('line');
    });

    it('takes the tremor out of a curve it keeps', () => {
      // a clean arc, and the same arc drawn by a shaking hand
      const arc  = (i, n) => ({ a: -0.9 + 1.8 * (i / (n - 1)), y: 1.0 + Math.sin((i / (n - 1)) * Math.PI) * 0.22 });
      const clean = wallPoints(60, arc);
      const shaky = wallPoints(60, (i, n) => { const p = arc(i, n); return { a: p.a, y: p.y + wobble(i, 0.03) }; });
      const { points } = snapStroke(shaky, { normal: [1, 0, 0], axis: [0, 0] });
      // distance from the TRUE arc, before and after
      const d3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      const toClean = set => set.reduce((s, p) => s + Math.min(...clean.map(q => d3(p, q))), 0) / set.length;
      expect(toClean(points)).toBeLessThan(toClean(shaky) * 0.6);
    });
  });
});
