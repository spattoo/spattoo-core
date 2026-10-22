import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { snapStroke, softenStroke, shapeStroke, SMOOTH_DEFAULT } from './strokeSnap.js';

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
      /* Distance from the TRUE arc, before and after — measured to the arc's SEGMENTS, not to its
         sample points. Nearest-point is density-sensitive: a smoothed stroke carries more points
         than the arc does, so the extra ones land BETWEEN its samples and are charged up to half
         the sample spacing for sitting exactly where they should. That penalty grew with the point
         count and failed this test on a change that had made the stroke smoother, not rougher. */
      const toSeg = (p, a, bb) => {
        const vx = bb[0] - a[0], vy = bb[1] - a[1], vz = bb[2] - a[2];
        const wx = p[0] - a[0], wy = p[1] - a[1], wz = p[2] - a[2];
        const L2 = vx * vx + vy * vy + vz * vz;
        const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy + wz * vz) / L2));
        return Math.hypot(wx - vx * t, wy - vy * t, wz - vz * t);
      };
      const toClean = set => set.reduce((s, p) =>
        s + Math.min(...clean.slice(1).map((q, i) => toSeg(p, clean[i], q))), 0) / set.length;
      expect(toClean(points)).toBeLessThan(toClean(shaky) * 0.6);
    });
  });
});


/* ── The Smooth dial ─────────────────────────────────────────────────────────────────────────────
 * Smoothing shipped welded to the Auto-correct checkbox at one fixed strength: *"so its still not
 * smooth. can we have a smooth control. so every turn is smooth?"* Two complaints — the setting was
 * too weak, and there was no way to say so. Auto-correct decides whether a drawing BECOMES a circle
 * or a line; Smooth decides how much of the hand survives either way.
 */
describe('the Smooth control', () => {
  const wobble = (i, amp) => Math.sin(i * 2.399963) * amp + Math.sin(i * 5.7) * amp * 0.6;
  const shakyArc = (n = 90, R = 1.2) => Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1), a = -0.9 + 1.8 * t;
    return [Math.cos(a) * R, 1.0 + Math.sin(t * Math.PI) * 0.22 + wobble(i, 0.018), Math.sin(a) * R];
  });
  // worst direction change between consecutive segments — "is every turn smooth?", as a number
  const worstTurn = (pts) => {
    let w = 0;
    for (let i = 0; i + 2 < pts.length; i++) {
      const v1 = [pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1], pts[i+1][2]-pts[i][2]];
      const v2 = [pts[i+2][0]-pts[i+1][0], pts[i+2][1]-pts[i+1][1], pts[i+2][2]-pts[i+1][2]];
      const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
      if (l1 < 1e-9 || l2 < 1e-9) continue;
      const c = Math.min(1, Math.max(-1, (v1[0]*v2[0]+v1[1]*v2[1]+v1[2]*v2[2]) / (l1 * l2)));
      w = Math.max(w, Math.acos(c) * 180 / Math.PI);
    }
    return w;
  };
  const wall = { normal: [1, 0, 0], axis: [0, 0] };

  it('smooths without snapping — Auto-correct is a separate decision', () => {
    const drawn = shakyArc();
    const { points, shape } = softenStroke(drawn, { ...wall, smooth: 0.6 });
    expect(shape).toBe('smooth');                       // never 'line', never 'circle'
    expect(worstTurn(points)).toBeLessThan(worstTurn(drawn) / 4);
  });

  it('is OFF at zero — every point exactly where it was drawn', () => {
    const drawn = shakyArc();
    expect(softenStroke(drawn, { ...wall, smooth: 0 }).points).toEqual(drawn);
  });

  it('turns get smoother as the dial goes up', () => {
    const drawn = shakyArc();
    const turnAt = a => worstTurn(softenStroke(drawn, { ...wall, smooth: a }).points);
    expect(turnAt(1)).toBeLessThan(turnAt(0.25));
    expect(turnAt(0.25)).toBeLessThan(worstTurn(drawn));
  });

  /* ⚠️ THE END WAS THE LAST ROUGH JOINT, and it was rough by construction: smoothPath pins the
     ends, so each pass pulls the neighbours geometrically onto the final point, leaving hops a
     hundredth of a rope's thickness whose direction is rounding error at the four decimals a
     stroke is saved on. It measured 8-13 degrees against 3-4 everywhere else. */
  it('leaves no kink at the end, and no segment too short to mean anything', () => {
    const drawn = shakyArc();
    for (const a of [0.25, 0.5, 0.75, 1]) {
      const { points } = softenStroke(drawn, { ...wall, smooth: a });
      expect(worstTurn(points), `worst turn at ${a}`).toBeLessThan(6);
      const segs = points.slice(1).map((p, i) =>
        Math.hypot(p[0] - points[i][0], p[1] - points[i][1], p[2] - points[i][2]));
      expect(Math.min(...segs), `shortest segment at ${a}`).toBeGreaterThan(1e-3);
    }
  });

  it('keeps the ends where they were drawn, at every setting', () => {
    const drawn = shakyArc();
    for (const a of [0.25, 1]) {
      const { points } = softenStroke(drawn, { ...wall, smooth: a });
      for (const [got, want] of [[points[0], drawn[0]], [points[points.length - 1], drawn[drawn.length - 1]]]) {
        expect(Math.hypot(got[0] - want[0], got[1] - want[1], got[2] - want[2])).toBeLessThan(1e-3);
      }
    }
  });

  it('is the same amount whether or not Auto-correct is on', () => {
    // a shape neither straight nor round: the snapper falls through to its own softening, and that
    // must be the softening the dial asked for rather than a second fixed one
    const drawn = shakyArc();
    const snapped  = snapStroke(drawn,   { ...wall, smooth: 0.8 });
    const softened = softenStroke(drawn, { ...wall, smooth: 0.8 });
    expect(snapped.shape).toBe('smooth');
    expect(snapped.points).toEqual(softened.points);
  });

  it('has a default in the middle of its travel, not at an end', () => {
    expect(SMOOTH_DEFAULT).toBeGreaterThan(0);
    expect(SMOOTH_DEFAULT).toBeLessThan(1);
  });
});


/* The dial has to be ON THE CARD and wired to the pen, and the vitest environment here is `node`
 * with no DOM, so this is asserted the way this codebase asserts UI — by reading the source. It is
 * a weak check standing in for a strong one: the pen screen is not reachable in the dev harness
 * (the Cream pen fixture never gets past placement), so the control itself has not been turned by
 * hand in a browser. Worth fixing the fixture; until then this at least fails if the wiring goes.
 */
describe('the Smooth dial is wired to the pen', () => {
  const designer = readFileSync(new URL('../CakeDesigner.jsx', import.meta.url), 'utf8');
  const pen      = readFileSync(new URL('../canvas/CreamPen.jsx', import.meta.url), 'utf8');

  it('sits in the cream branch of the pen row and writes penStyle.smooth', () => {
    expect(designer).toMatch(/k: 'Smooth'[\s\S]{0,260}penStyle\.smooth/);
    expect(designer).toMatch(/k: 'Smooth'[\s\S]{0,400}smooth: v/);
  });

  it('reads "off" at zero rather than 0.00 beside Softness', () => {
    expect(designer).toMatch(/k: 'Smooth'[\s\S]{0,260}'off'/);
  });

  it('commits through the one shaping path, carrying the amount and the checkbox', () => {
    expect(pen).toMatch(/pts2 = shapeStroke\(raw, \{[\s\S]{0,120}smooth,[\s\S]{0,40}autoShape/);
  });

  /* ⚠️ The drawn points must reach the stroke, or the dial on the piece card has nothing to
     re-smooth from and is dead exactly as reported. */
  it('keeps the drawn points on every stroke that has a path', () => {
    expect(pen).toMatch(/const raw = pts\.map\(round\)/);
    expect(pen).toMatch(/const shaped = \{ raw, smooth, autoShape \}/);
    expect((pen.match(/\.\.\.shaped/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('puts a live Smooth on the piece card, not only in the pen row', () => {
    expect(designer).toMatch(/label="Smooth"[\s\S]{0,400}shapeStroke\(pickedStroke\.raw/);
  });
});


/* ── Re-smoothing a stroke already on the cake ───────────────────────────────────────────────────
 * *"smooth has no impact. its a dead control."* It was applied once at commit and baked into the
 * stored points, so the dial could only ever describe the NEXT stroke — and moving it while
 * looking at a piped line did nothing. The drawn points are now kept as `raw`, and `shapeStroke`
 * is the single path from those to what is rendered: at commit, and again on every move of the
 * dial. One path, so a re-smoothed stroke is IDENTICAL to one drawn at that setting.
 */
describe('shapeStroke', () => {
  const wobble = (i, amp) => Math.sin(i * 2.399963) * amp + Math.sin(i * 5.7) * amp * 0.6;
  const drawn = Array.from({ length: 80 }, (_, i) => {
    const t = i / 79, a = -0.9 + 1.8 * t;
    return [Math.cos(a) * 1.2, 1 + Math.sin(t * Math.PI) * 0.22 + wobble(i, 0.018), Math.sin(a) * 1.2];
  });
  const wall = { normal: [1, 0, 0], axis: [0, 0] };

  it('gives a different line at a different setting — the dial is not dead', () => {
    const low  = shapeStroke(drawn, { ...wall, smooth: 0.1 });
    const high = shapeStroke(drawn, { ...wall, smooth: 1 });
    expect(low).not.toEqual(high);
  });

  it('re-smoothing from raw matches drawing at that setting exactly', () => {
    // what the card does when the dial moves, against what the pen does at commit
    for (const a of [0, 0.3, 0.75, 1]) {
      expect(shapeStroke(drawn, { ...wall, smooth: a }))
        .toEqual(softenStroke(drawn, { ...wall, smooth: a }).points);
    }
  });

  it('honours Auto-correct when the stroke was drawn with it on', () => {
    const straightish = Array.from({ length: 40 }, (_, i) => {
      const t = i / 39, a = -0.8 + 1.6 * t;
      return [Math.cos(a) * 1.2, 1 + wobble(i, 0.03), Math.sin(a) * 1.2];
    });
    const snapped = shapeStroke(straightish, { ...wall, smooth: 0.5, autoShape: true });
    expect(snapped).toEqual(snapStroke(straightish, { ...wall, smooth: 0.5 }).points);
    // and with it off the same drawing keeps its wobbleless curve without being made a bar
    expect(shapeStroke(straightish, { ...wall, smooth: 0.5, autoShape: false }))
      .toEqual(softenStroke(straightish, { ...wall, smooth: 0.5 }).points);
  });

  it('hands back anything too short to shape', () => {
    expect(shapeStroke([[0, 1, 0]], wall)).toEqual([[0, 1, 0]]);
    expect(shapeStroke(null, wall)).toBeNull();
  });
});
