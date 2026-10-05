import { describe, it, expect } from 'vitest';
import { brushRelief, brushLoad, buildBrushStrokeOnWall, buildBrushStrokeOnFlat, strokeFacesOutward,
         wallCoordsOf, grabOffset, dragStrokeTo,
         BRUSH_ON_CAKE_DEFAULTS } from './brushStrokeOnCake.js';

const WALL = { R: 1, baseY: 0, wallH: 1 };
const SWEEP = [[0.00, 0.30], [0.06, 0.42], [0.13, 0.50], [0.20, 0.55]];

/* How far the stroke stands off the wall at its highest point — the thing `weight` is supposed to
   move, measured off the built geometry rather than off the parameter that set it. */
function maxLift(geo, R = 1) {
  const pos = geo.attributes.position;
  let hi = 0;
  for (let v = 0; v < pos.count; v++) {
    hi = Math.max(hi, Math.hypot(pos.getX(v), pos.getZ(v)) - R);
  }
  return hi;
}

describe('brushRelief — raised edges, scraped middle', () => {
  /* ⚠️ NOT A DOME. A piping bag makes a hump; a spatula pushes the cream OUT to its edges and leaves
     the middle thinnest. Reading one for the other is what made our first palette-knife petals look
     piped (see palette-knife-petals-are-pressed-not-piped). */
  it('is higher just inside each edge than it is in the middle', () => {
    const mid = brushRelief(0.5);
    expect(brushRelief(0.18)).toBeGreaterThan(mid);
    expect(brushRelief(0.82)).toBeGreaterThan(mid);
  });

  /* ⚠️ AND IT REACHES ZERO AT BOTH EDGES, or the stroke ends in a vertical cliff — a sticker cut out
     and laid on, rather than cream pushed across. */
  it('meets the cake at both edges', () => {
    expect(brushRelief(0)).toBe(0);
    expect(brushRelief(1)).toBe(0);
  });

  it('a scraped middle is still cream — it does not pinch through to nothing', () => {
    expect(brushRelief(0.5)).toBeGreaterThan(0.2);
  });
});

describe('brushLoad — the knife lands full and runs dry', () => {
  it('is blunt at the start and thin at the lift', () => {
    expect(brushLoad(0.1)).toBeGreaterThan(0.9);
    expect(brushLoad(0.99)).toBeLessThan(0.1);
  });
});

describe('a stroke on the wall', () => {
  it('builds, and refuses a gesture too short to be one', () => {
    expect(buildBrushStrokeOnWall({ ...WALL, path: SWEEP })).toBeTruthy();
    expect(buildBrushStrokeOnWall({ ...WALL, path: [[0, 0.5]] })).toBeNull();
    expect(buildBrushStrokeOnWall({ ...WALL, path: [] })).toBeNull();
  });

  /* ⚠️ THE ASK, AS ONE NUMBER. Sandeep: "if its a thick stroke edges have elevation, if its a
     lighter stroke, it just merges with the cake surface without elevation." */
  it('weight is what decides whether it stands proud or merges', () => {
    const heavy = maxLift(buildBrushStrokeOnWall({ ...WALL, path: SWEEP, weight: 1 }));
    const light = maxLift(buildBrushStrokeOnWall({ ...WALL, path: SWEEP, weight: 0 }));
    expect(heavy).toBeGreaterThan(BRUSH_ON_CAKE_DEFAULTS.lift * 0.5);
    /* ⚠️ "MERGES" MEANS A THIN LAYER, NOT NOTHING — `film`. A dead-flat stroke read as a sticker and
       z-fought with the wall over a long sweep; it keeps a little relief, and its knife marks. */
    expect(light).toBeLessThan(BRUSH_ON_CAKE_DEFAULTS.lift * 0.2);
    expect(light).toBeGreaterThan(BRUSH_ON_CAKE_DEFAULTS.lift * 0.03);
  });

  it('every size of cake gets the same stroke, in proportion', () => {
    const small = maxLift(buildBrushStrokeOnWall({ R: 0.5, baseY: 0, wallH: 0.5, path: SWEEP, weight: 1 }), 0.5);
    const big   = maxLift(buildBrushStrokeOnWall({ R: 2,   baseY: 0, wallH: 2,   path: SWEEP, weight: 1 }), 2);
    expect(big / small).toBeCloseTo(4, 1);
  });

  it('sits ON the wall — every vertex is at or just outside the tier', () => {
    const geo = buildBrushStrokeOnWall({ ...WALL, path: SWEEP, weight: 1 });
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const r = Math.hypot(pos.getX(v), pos.getZ(v));
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThan(1 + BRUSH_ON_CAKE_DEFAULTS.lift * 1.2);
    }
  });

  it('is deterministic — the same stroke comes back after a reload', () => {
    const a = buildBrushStrokeOnWall({ ...WALL, path: SWEEP, seed: 4 });
    const b = buildBrushStrokeOnWall({ ...WALL, path: SWEEP, seed: 4 });
    expect([...a.attributes.position.array]).toEqual([...b.attributes.position.array]);
    const c = buildBrushStrokeOnWall({ ...WALL, path: SWEEP, seed: 9 });
    expect([...c.attributes.position.array]).not.toEqual([...a.attributes.position.array]);
  });

  /* ⚠️ THE TEST THAT MATTERED, AND MY FIRST ONE WAS NOT IT. I asked only that two seeds differ
     somewhere in the last row — which they did even while the tip was being COLLAPSED to its two end
     points, because those two points come from different places. Sandeep spotted it off a render:
     *"all the edges where the stroke is released look same. there should be randomness."*

     The honest question is whether the last row is a straight line. `brushStroke` returns the tip as
     seven fingers of different lengths; flattened between two corners they are gone, and every
     stroke ends on the same ruled taper however different its seed is. */
  it('the lift-off end is a row of fingers, not a ruled line', () => {
    const geo = buildBrushStrokeOnWall({ ...WALL, path: SWEEP, weight: 1, across: 15 });
    const pos = geo.attributes.position, m = 15;
    const row = [];
    for (let v = pos.count - m; v < pos.count; v++) row.push([pos.getX(v), pos.getY(v), pos.getZ(v)]);
    // How far each point strays from the straight line between the row's two ends.
    const a = row[0], b = row[row.length - 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    let worst = 0;
    for (let i = 1; i < row.length - 1; i++) {
      const t = ((row[i][0] - a[0]) * dx + (row[i][1] - a[1]) * dy + (row[i][2] - a[2]) * dz) / (len * len);
      worst = Math.max(worst, Math.hypot(row[i][0] - (a[0] + dx * t),
                                         row[i][1] - (a[1] + dy * t),
                                         row[i][2] - (a[2] + dz * t)));
    }
    expect(worst).toBeGreaterThan(0.01);     // a collapsed tip measures exactly 0
  });

  it('and two strokes tear differently', () => {
    const endRow = seed => {
      const g = buildBrushStrokeOnWall({ ...WALL, path: SWEEP, seed, weight: 1, across: 15 });
      const pos = g.attributes.position, out = [];
      for (let v = pos.count - 15; v < pos.count; v++) out.push(pos.getY(v));
      return out;
    };
    const a = endRow(3), b = endRow(8);
    const spread = a.reduce((acc, y, i) => acc + Math.abs(y - b[i]), 0) / a.length;
    expect(spread).toBeGreaterThan(0.002);
  });

});

describe('a stroke on a flat surface', () => {
  it('lies on the plane it was given', () => {
    const geo = buildBrushStrokeOnFlat({ R: 1, y: 0.7, path: [[-0.5, 0], [0, 0.1], [0.5, 0.05]], weight: 1 });
    const pos = geo.attributes.position;
    let lo = Infinity, hi = -Infinity;
    for (let v = 0; v < pos.count; v++) { lo = Math.min(lo, pos.getY(v)); hi = Math.max(hi, pos.getY(v)); }
    expect(lo).toBeGreaterThanOrEqual(0.7);
    expect(hi).toBeLessThan(0.7 + BRUSH_ON_CAKE_DEFAULTS.lift * 1.2);
  });
});

/* ⚠️ THE FAULT THAT IS INVISIBLE EVERY OTHER WAY. Wound the wrong way round, a stroke has correct
   vertices, correct measurements, a passing suite — and is not drawn at all, because its faces point
   into the cake and are culled. A full-weight stroke dead in front of the camera rendered as nothing
   and I went looking for a width bug. */
describe('winding', () => {
  it('a stroke on the wall faces the viewer, not the cake', () => {
    expect(strokeFacesOutward(buildBrushStrokeOnWall({ ...WALL, path: SWEEP, weight: 1 }))).toBe(true);
  });
});

/* ── How wide the stroke still is where it was lifted ────────────────────────────────────────────
 * Sandeep, off a render of five: "the width of the stroke release does not need to be same. there
 * should be randomness. some can be looking as close rectangle, and thats real."
 */
describe('the release width varies between strokes', () => {
  /* Width of the LAST full cross-section, in world units. */
  const endWidth = seed => {
    const geo = buildBrushStrokeOnWall({ ...WALL, path: SWEEP, seed, weight: 1, across: 15 });
    const pos = geo.attributes.position, m = 15;
    const base = pos.count - 2 * m;                 // the row before the torn fingers
    const p0 = [pos.getX(base), pos.getY(base), pos.getZ(base)];
    const p1 = [pos.getX(base + m - 1), pos.getY(base + m - 1), pos.getZ(base + m - 1)];
    return Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  };

  it('some strokes run out to a point and some stay nearly square', () => {
    const widths = [1, 2, 3, 4, 5, 6, 7, 8].map(endWidth);
    const spread = (Math.max(...widths) - Math.min(...widths)) / Math.max(...widths);
    expect(spread).toBeGreaterThan(0.3);     // a fixed taper measures 0
  });

  it('and the same seed always releases the same width', () => {
    expect(endWidth(5)).toBeCloseTo(endWidth(5), 10);
  });

  it('every one of them is still a releasable width — none pinches to nothing', () => {
    for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) expect(endWidth(s)).toBeGreaterThan(0);
  });
});

/* ⚠️ THE CHOCOLATE GARNISHES MUST NOT MOVE. Every saved piece is a path and a seed regenerated on
   load, so a change to the shared generator's default reshapes work bakers have already approved.
   `tipWidth` is opt-in and this is what says so. */
describe('brushStroke default is untouched', () => {
  it('a stroke asked the old way comes back exactly as it did', async () => {
    const { brushStroke } = await import('./brushStroke.js');
    const path = [[0, 0], [10, 4], [22, 9], [34, 12]];
    const asBefore = brushStroke(path, { width: 12, seed: 3 });
    const explicit = brushStroke(path, { width: 12, seed: 3, tipWidth: 0.42 });
    expect(JSON.stringify(asBefore.band)).toBe(JSON.stringify(explicit.band));
  });
});

/* ── Placing a stroke by hand ────────────────────────────────────────────────────────────────────
 * "round and height need to be done with dragging". The maths is here rather than in the studio
 * because a studio behind a login cannot be driven, and this is the half that can be wrong.
 */
describe('dragging a stroke', () => {
  const CAKE = { baseY: 0.07, wallH: 1.25 };
  const onWall = (at, rise) => ({
    x: Math.sin(at * Math.PI * 2), z: Math.cos(at * Math.PI * 2),
    y: CAKE.baseY + rise * CAKE.wallH,
  });

  it('reads a world point back as the two numbers a stroke is authored with', () => {
    const w = wallCoordsOf(onWall(0.3, 0.4), CAKE);
    expect(w.at).toBeCloseTo(0.3, 6);
    expect(w.rise).toBeCloseTo(0.4, 6);
  });

  /* ⚠️ LAW 5. Grab a stroke and put the pointer back where it started and NOTHING moves. Without the
     offset the stroke jumps to the pointer by however far the grabbed point was from its origin —
     the exact fault a piping border shipped with. */
  it('a grab that does not travel does not move the stroke', () => {
    const stroke = { at: 0.20, rise: 0.55 };
    const point = onWall(0.26, 0.61);                 // taken hold of away from its origin
    const g = grabOffset(stroke, point, CAKE);
    const back = dragStrokeTo(g, point, CAKE);
    expect(back.at).toBeCloseTo(stroke.at, 6);
    expect(back.rise).toBeCloseTo(stroke.rise, 6);
  });

  it('and a drag moves it by exactly what the pointer travelled', () => {
    const stroke = { at: 0.20, rise: 0.55 };
    const g = grabOffset(stroke, onWall(0.26, 0.61), CAKE);
    const moved = dragStrokeTo(g, onWall(0.31, 0.45), CAKE);
    expect(moved.at).toBeCloseTo(0.25, 6);            // +0.05 round
    expect(moved.rise).toBeCloseTo(0.39, 6);          // −0.16 up
  });

  it('carries on round the back rather than sticking at the seam', () => {
    const g = grabOffset({ at: 0.98, rise: 0.5 }, onWall(0.98, 0.5), CAKE);
    expect(dragStrokeTo(g, onWall(0.03, 0.5), CAKE).at).toBeCloseTo(0.03, 6);
  });

  it('but stops at the top and bottom of the wall', () => {
    const g = grabOffset({ at: 0.5, rise: 0.5 }, onWall(0.5, 0.5), CAKE);
    expect(dragStrokeTo(g, onWall(0.5, 5), CAKE).rise).toBeLessThanOrEqual(0.95);
    expect(dragStrokeTo(g, onWall(0.5, -5), CAKE).rise).toBeGreaterThanOrEqual(0.02);
  });
});
