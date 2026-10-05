import { describe, it, expect } from 'vitest';
import { brushRelief, brushLoad, brushStriation, buildBrushStrokeOnWall, buildBrushStrokeOnFlat, strokeFacesOutward,
         wallCoordsOf, grabOffset, dragStrokeTo, paintBrushColors, brushGesture, makeBrushBed,
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

/* ── Over the edge ───────────────────────────────────────────────────────────────────────────────
 * "lets make it drape over the edge." A gesture that reaches the rim used to keep laying cream on
 * the plane of the lid, so it hung in the air past the tier.
 */
describe('a stroke that reaches the rim drapes down the wall', () => {
  const TOP = { R: 1, y: 2 };
  const OVER = [[-0.5, 0], [0.3, 0.02], [1.1, 0.03], [1.6, 0.02]];   // runs well past the rim
  const INSIDE = [[-0.5, 0], [-0.1, 0.02], [0.3, 0.03], [0.6, 0.02]];

  const verts = geo => {
    const pos = geo.attributes.position, out = [];
    for (let v = 0; v < pos.count; v++) out.push([pos.getX(v), pos.getY(v), pos.getZ(v)]);
    return out;
  };

  /* ⚠️ THE ASSERTION IS ABOUT RADIUS, NOT HEIGHT, and my first one got that wrong. I required every
     vertex past the rim to sit below the lid — but right AT the corner the lip is still rolling, so
     it legitimately stands a little above the plane, which is what cream going over an edge does.
     What must never happen is cream floating OUTWARD into the air beyond the wall. */
  it('nothing hangs in the air past the tier', () => {
    for (const [x, , z] of verts(buildBrushStrokeOnFlat({ ...TOP, path: OVER, weight: 1 }))) {
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(1 + BRUSH_ON_CAKE_DEFAULTS.lift * 1.2);
    }
  });

  it('some of it is on the lid and some of it is down the side', () => {
    const v = verts(buildBrushStrokeOnFlat({ ...TOP, path: OVER, weight: 1 }));
    expect(v.some(([, y]) => y > TOP.y - 1e-6)).toBe(true);        // still on top
    expect(v.some(([, y]) => y < TOP.y - 0.1)).toBe(true);         // and over the edge
  });

  /* ⚠️ THE LENGTH OF CREAM DOES NOT CHANGE BECAUSE IT MET A CORNER. Distance past the rim becomes
     exactly that distance down the wall — fold, never stretch. */
  it('folds without stretching', () => {
    const geo = buildBrushStrokeOnFlat({ ...TOP, path: OVER, weight: 0 });
    const pos = geo.attributes.position;
    let lowest = Infinity;
    for (let v = 0; v < pos.count; v++) lowest = Math.min(lowest, pos.getY(v));
    // The gesture's furthest point is 1.6 from the axis; 0.6 of it is past the rim.
    expect(TOP.y - lowest).toBeGreaterThan(0.4);
    expect(TOP.y - lowest).toBeLessThan(0.8);
  });

  it('a stroke that stays on the lid is untouched by any of this', () => {
    for (const [, y] of verts(buildBrushStrokeOnFlat({ ...TOP, path: INSIDE, weight: 1 }))) {
      expect(y).toBeGreaterThanOrEqual(TOP.y);
    }
  });

  it('the board does not drape — there is no rim to fall off', () => {
    const geo = buildBrushStrokeOnFlat({ ...TOP, path: OVER, weight: 1, drape: false });
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) expect(pos.getY(v)).toBeGreaterThanOrEqual(TOP.y);
  });
});

/* ── Strokes overlap, and the later one goes on top ──────────────────────────────────────────────
 * "we should allow overlaps. this is an important thing to make the final output look real."
 * Nothing ever prevented the overlap; what was missing was an ORDER — two layers at one radius
 * interpenetrate, which is fighting rather than stacking.
 */
describe('overlapping strokes', () => {
  const base = { ...WALL, path: SWEEP, weight: 1, seed: 5 };
  const lowest = geo => {
    const pos = geo.attributes.position;
    let lo = Infinity;
    for (let v = 0; v < pos.count; v++) lo = Math.min(lo, Math.hypot(pos.getX(v), pos.getZ(v)));
    return lo;
  };

  it('a later stroke sits above an earlier one at the same place', () => {
    const first = lowest(buildBrushStrokeOnWall({ ...base, layer: 0 }));
    const third = lowest(buildBrushStrokeOnWall({ ...base, layer: 2 }));
    expect(third).toBeGreaterThan(first);
  });

  it('the shape is otherwise identical — stacking moves it, it does not reshape it', () => {
    const a = buildBrushStrokeOnWall({ ...base, layer: 0 }).attributes.position;
    const b = buildBrushStrokeOnWall({ ...base, layer: 3 }).attributes.position;
    expect(b.count).toBe(a.count);
    // Same height up the wall, every vertex — only the radius moved.
    for (let v = 0; v < a.count; v += 37) expect(b.getY(v)).toBeCloseTo(a.getY(v), 9);
  });

  /* ⚠️ A STROKE ON ITS OWN MUST STILL LOOK PAINTED ON. Stacked ten deep the lift has to stay under
     one stroke's own relief, or the last one hovers. */
  it('ten deep is still less than one stroke of relief', () => {
    const solo = lowest(buildBrushStrokeOnWall({ ...base, layer: 0 }));
    const tenth = lowest(buildBrushStrokeOnWall({ ...base, layer: 10 }));
    expect(tenth - solo).toBeLessThan(BRUSH_ON_CAKE_DEFAULTS.lift * 0.35);
  });
});

/* ── A stroke is semi-opaque ─────────────────────────────────────────────────────────────────────
 * The thing a photograph of a real cake showed and three renders of relief did not: where the knife
 * ran thin the cake shows through, and where it piled up the colour is full. A stroke painted one
 * flat colour reads as vinyl however good its relief is.
 */
describe('coverage', () => {
  const geo = () => buildBrushStrokeOnWall({ ...WALL, path: SWEEP, weight: 1, seed: 5 });

  it('carries how much cream is at each point', () => {
    const t = geo().attributes.aThickness;
    expect(t).toBeTruthy();
    expect(t.count).toBe(geo().attributes.position.count);
  });

  /* ⚠️ COVERAGE IS NOT HEIGHT, and driving it from the relief is the mistake worth pinning: the
     middle of a stroke is deliberately SCRAPED — a hollow between two ridges — and a real stroke is
     at its most saturated exactly there. Driven by height it washed out down the centre line. */
  it('the scraped middle is still fully covered', () => {
    const g = geo();
    const t = g.attributes.aThickness, pos = g.attributes.position;
    // Walk one row across the band, a third of the way along the stroke.
    const m = BRUSH_ON_CAKE_DEFAULTS.across, row = Math.floor(10) * m;
    const mid = t.getX(row + Math.floor(m / 2));
    const quarter = t.getX(row + Math.floor(m / 4));
    expect(mid).toBeGreaterThan(0.5);
    expect(Math.abs(mid - quarter)).toBeLessThan(0.25);   // no groove down the colour
  });

  it('and it runs out toward the lift and at the edges', () => {
    const g = geo();
    const t = g.attributes.aThickness;
    const m = BRUSH_ON_CAKE_DEFAULTS.across;
    expect(t.getX(10 * m)).toBeLessThan(0.2);                       // the feathered edge
    expect(t.getX(t.count - m + Math.floor(m / 2))).toBeLessThan(0.3); // the torn end
  });

  it('paints full strength where it is thick and washes toward the cake where it is thin', () => {
    const painted = paintBrushColors(geo(), '#ff0000', '#ffffff');
    const c = painted.attributes.color;
    let strongest = 0, weakest = 1;
    const t = painted.attributes.aThickness;
    for (let v = 0; v < c.count; v++) {
      const red = c.getX(v) - c.getY(v);          // distance from white, in the red channel
      if (t.getX(v) > 0.8) strongest = Math.max(strongest, red);
      if (t.getX(v) < 0.05) weakest = Math.min(weakest, red);
    }
    expect(strongest).toBeGreaterThan(weakest + 0.2);
  });

  it('a stroke with no thickness attribute is left alone', () => {
    const bare = new (geo().constructor)();
    expect(paintBrushColors(bare, '#ff0000', '#fff').attributes.color).toBeUndefined();
  });
});

/* ── What a hand actually does ───────────────────────────────────────────────────────────────────
 * "they differ in height, can we try that?" — from a photograph where a short stubby stroke sits
 * beside one reaching two thirds up the wall. Ours were all one length, so five strokes looked like
 * five of the same object.
 */
describe('brushGesture', () => {
  const topOf = seed => Math.max(...brushGesture({ seed }).map(([, v]) => v));

  it('strokes run out at different heights', () => {
    const tops = [1, 2, 3, 4, 5, 6, 7, 8].map(topOf);
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(0.12);
  });

  /* ⚠️ AND THEY START AT THE BOTTOM. A baker loads at the base and pulls UP, so that is where the
     cream is thickest and where strokes merge into one another. Starting them mid-wall puts the
     ragged end at both ends and the merge nowhere. */
  it('and every one of them starts at the base', () => {
    for (const seed of [1, 2, 3, 4, 5]) expect(brushGesture({ seed })[0][1]).toBeLessThan(0.08);
  });

  it('never climbs off the top of the wall', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(topOf(seed)).toBeLessThanOrEqual(0.97);
      expect(Math.max(...brushGesture({ seed, climb: 2 }).map(([, v]) => v))).toBeLessThanOrEqual(0.97);
    }
  });

  it('is deterministic, so a cake reopens as the cake that was made', () => {
    expect(brushGesture({ seed: 3 })).toEqual(brushGesture({ seed: 3 }));
  });

  it('climbVar 0 makes them all the same, for a caller that wants a rule not a hand', () => {
    const tops = [1, 2, 3, 4].map(s => Math.max(...brushGesture({ seed: s, climbVar: 0 }).map(([, v]) => v)));
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(0.05);
  });
});

/* ── Riding on what is already there ─────────────────────────────────────────────────────────────
 * "the part that coming out from the other strip is elevated high." That is a GLOBAL lift, seen: a
 * stroke raised by its place in the order stands proud everywhere, including where nothing is under
 * it. A bed raises it only where cream actually is.
 */
describe('the bed', () => {
  const WALLB = { R: 1, baseY: 0, wallH: 1 };
  const radii = geo => {
    const pos = geo.attributes.position, out = [];
    for (let v = 0; v < pos.count; v++) out.push(Math.hypot(pos.getX(v), pos.getZ(v)));
    return out;
  };

  it('with nothing laid, a stroke lies on the wall exactly as it would with no bed at all', () => {
    const bare = radii(buildBrushStrokeOnWall({ ...WALLB, path: SWEEP, weight: 1, seed: 5 }));
    const bed = makeBrushBed({ R: 1, wallH: 1 });
    const onEmpty = radii(buildBrushStrokeOnWall({ ...WALLB, path: SWEEP, weight: 1, seed: 5, bed }));
    for (let i = 0; i < bare.length; i += 29) expect(onEmpty[i]).toBeCloseTo(bare[i], 9);
  });

  /* ⚠️ AND IT DOES NOT CLIMB ITS OWN STAMPS. Reading and writing in one pass makes every vertex see
     the one before it and rise; the stroke walks off the cake. The build collects and commits after,
     and this is what says so: the first stroke onto an empty bed is identical to no bed. */
  it('a second stroke over the first rides on it', () => {
    const bed = makeBrushBed({ R: 1, wallH: 1 });
    buildBrushStrokeOnWall({ ...WALLB, path: SWEEP, weight: 1, seed: 5, bed });
    const over = radii(buildBrushStrokeOnWall({ ...WALLB, path: SWEEP, weight: 1, seed: 5, bed }));
    const alone = radii(buildBrushStrokeOnWall({ ...WALLB, path: SWEEP, weight: 1, seed: 5 }));
    let higher = 0;
    for (let i = 0; i < over.length; i++) if (over[i] > alone[i] + 1e-6) higher++;
    expect(higher / over.length).toBeGreaterThan(0.5);
  });

  it('and a stroke somewhere else is untouched by it', () => {
    const bed = makeBrushBed({ R: 1, wallH: 1 });
    buildBrushStrokeOnWall({ ...WALLB, path: SWEEP, weight: 1, seed: 5, bed });
    const far = SWEEP.map(([u, v]) => [u + 0.45, v]);              // the far side of the cake
    const clear = radii(buildBrushStrokeOnWall({ ...WALLB, path: far, weight: 1, seed: 5, bed }));
    const alone = radii(buildBrushStrokeOnWall({ ...WALLB, path: far, weight: 1, seed: 5 }));
    for (let i = 0; i < clear.length; i += 29) expect(clear[i]).toBeCloseTo(alone[i], 9);
  });

  it('the bed keeps the highest — cream fills, it does not cut', () => {
    const bed = makeBrushBed({ R: 1, wallH: 1 });
    bed.commit([[0.5, 0.5, 0.09]]);
    const tall = bed.heightAt(0.5, 0.5);
    bed.commit([[0.5, 0.5, 0.02]]);
    expect(bed.heightAt(0.5, 0.5)).toBeCloseTo(tall, 9);
  });
});

/* ⚠️ THE KNIFE MARKS HAVE TO BE SAMPLED FINELY ENOUGH TO BE ROUND. Two numbers decide whether the
   striations look like dragged cream or like facets, and they are set in different places for
   different reasons — `lanes` by how a blade is nicked, `across` by cost. Raising lanes without
   raising across is a silent regression: nothing errors, the mesh measures right, and the lanes come
   out stepped with half of them never resolving at all. Side by side at 4.4 samples per lane the
   difference is plain; six is where they go round. */
describe('the striations are sampled finely enough to resolve', () => {
  const D = BRUSH_ON_CAKE_DEFAULTS;

  it('at least six samples across for every drag line', () => {
    expect(D.across / D.lanes).toBeGreaterThanOrEqual(6);
  });

  it('and they actually cut — a stroke is not a smooth panel', () => {
    /* Measured, not asserted from the constant: the depth that reaches the SURFACE is what was
       tuned, and it is `grain` × the local relief, so reading grain alone proves nothing. */
    const at = u => brushStriation(u, 0.3, { seed: 1, lanes: D.lanes, grain: D.grain });
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k <= 400; k++) { const v = at(k / 400); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    expect(hi - lo).toBeGreaterThan(0.4);
  });
});
