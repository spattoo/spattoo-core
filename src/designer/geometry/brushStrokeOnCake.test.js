import { describe, it, expect } from 'vitest';
import { brushRelief, brushLoad, buildBrushStrokeOnWall, buildBrushStrokeOnFlat, strokeFacesOutward,
         wallCoordsOf, grabOffset, dragStrokeTo, paintBrushColors, brushGesture, makeBrushBed,
         buildBrushBand, brushBandCount, brushMaxWidth,
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
      /* ⚠️ A TOLERANCE, because the RIM sits exactly on the wall and `R + 0` comes back as
         0.99999999 through a sine and a cosine. The claim is "nothing is inside the tier", and a
         vertex 1e-8 inside it is not inside it. */
      expect(r).toBeGreaterThanOrEqual(1 - 1e-6);
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
    expect(lo).toBeGreaterThanOrEqual(0.7 - 1e-6);   // the rim lands exactly on the plane
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
    /* ⚠️ FROM THE END OF THE TOP SURFACE, not of the buffer — the rim is appended after it. */
    const base = geo.userData.topCount - 2 * m;     // the row before the torn fingers
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
  /* ⚠️ THE TOP SURFACE ONLY. The rim drops to whatever is underneath, so it is at the wall for every
     layer by construction and would make this measure the same number every time. */
  const lowest = geo => {
    const pos = geo.attributes.position;
    let lo = Infinity;
    for (let v = 0; v < geo.userData.topCount; v++) lo = Math.min(lo, Math.hypot(pos.getX(v), pos.getZ(v)));
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

  it('runs out toward the LIFT, and stays strong at the sides', () => {
    /* ⚠️ THE TWO USED TO BE ONE NUMBER, and that is what made the tops look like cut paper: raising
       the opacity so the BODY stopped washing out — a brushstroke is cream, not a glaze — made the
       RELEASE solid too, and a release that does not fade ends in a hard torn silhouette. A knife
       leaves a clean full-strength edge sideways and runs dry lengthways. */
    const g = geo();
    const t = g.attributes.aThickness;
    const m = BRUSH_ON_CAKE_DEFAULTS.across;
    expect(t.getX(10 * m)).toBeGreaterThan(0.5);                       // the side: still cream
    expect(t.getX(g.userData.topCount - m + Math.floor(m / 2))).toBeLessThan(0.3); // the release: running out
  });

  it('the BODY is one colour — a brush does not carry white', () => {
    /* Five cuts tried to make a per-row fade small enough and every one still washed out a quarter
       of the stroke, because the tip is seven fingers of different lengths and the last ROW spans a
       tall triangle. The body is solid now; the dissolve is measured in world units from the end. */
    const painted = paintBrushColors(geo(), '#ff0000', '#ffffff');
    const c = painted.attributes.color, t = painted.attributes.aThickness;
    let lo = 1, hi = 0;
    for (let v = 0; v < c.count; v++) {
      if (t.getX(v) < 0.999) continue;                 // the body: everything the dissolve has not reached
      const red = c.getX(v) - c.getY(v);
      lo = Math.min(lo, red); hi = Math.max(hi, red);
    }
    expect(hi - lo).toBeLessThan(1e-3);                // float noise out of pow(), nothing visible
  });

  it('and the release DISSOLVES into the cake over the same depth, long stroke or short', () => {
    /* ⚠️ THE RULE, IN SANDEEP'S WORDS: *"even a short stroke will have a release, so it dissolves.
       its not like it needs to have some height."* A release is a physical thing — the layer thins
       out over a few millimetres and the cake comes through — so it CANNOT be a fraction of the
       stroke's length. As a fraction it is a huge wash on a long pull and nothing on a stubby one,
       which is both wrong and backwards. Measured here as the height of the band of vertices the
       dissolve touches, on two strokes whose lengths differ by three times. */
    const depth = (climb) => {
      const g = buildBrushStrokeOnWall({ R: 1, baseY: 0, wallH: 1, weight: 0.6, seed: 11,
        path: brushGesture({ at: 0, seed: 11, climb, climbVar: 0, sweep: 0.012 }) });
      /* ⚠️ THE CENTRE COLUMN ONLY. Coverage carries TWO things — the dissolve at the end and the
         slight thinning at the two sides — so sweeping every vertex counts the stroke's whole left
         and right edges as "dissolving" and reports a band the length of the stroke. The first cut
         of this test did exactly that and failed a working change. */
      const m = BRUSH_ON_CAKE_DEFAULTS.across;
      const t = g.attributes.aThickness, p = g.attributes.position;
      let lo = Infinity, hi = -Infinity;
      for (let v = (m / 2) | 0; v < g.userData.topCount; v += m) {
        if (t.getX(v) > 0.98) continue;                // untouched by the dissolve
        lo = Math.min(lo, p.getY(v)); hi = Math.max(hi, p.getY(v));
      }
      return { span: hi - lo, len: climb };
    };
    const short = depth(0.22), long = depth(0.7);
    expect(short.span).toBeGreaterThan(0.01);                       // a short stroke dissolves at all
    expect(Math.abs(long.span - short.span)).toBeLessThan(short.span * 0.6);  // and by the same depth
    /* And it is NOT a fraction of the length: as a fraction, three times the stroke would be three
       times the band. */
    expect(long.span).toBeLessThan(short.span * 2);
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

  /* ⚠️ AND THERE IS DELIBERATELY NO TEST ON HOW DEEP THEY CUT. There was one, asserting the marks
     reach some depth, written the day I raised `grain` to 0.55 off a close-up — which made the
     strokes rib and was the wrong call. A number that is a matter of taste does not become a fact by
     having an assertion put under it; all that does is make the next person's correction fail the
     suite. The ratio above is a sampling fact and belongs here. The depth does not. */
});

/* ⚠️ AN OVERLAP IS A STEP, AND A STEP IS THE ONLY THING THAT SAYS WHICH ONE IS ON TOP. Everything
   here was green while the seam was invisible: the stroke was above its neighbour, by a number far
   too small to see, and no test asked how far. Sandeep, twice, off two different renders: *"it
   looked like a separate piece than an overlap."* */
describe('a stroke laid across another ENDS on it', () => {
  const gest = at => brushGesture({ at, seed: 11, sweep: 0.012, climb: 0.52 });
  /* Heights of one mesh on a horizontal line, as [angle, height above the wall]. */
  const sliceOf = (geo, R, yWant) => {
    const p = geo.attributes.position, out = [];
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (Math.abs(y - yWant) > 0.012) continue;
      out.push([Math.atan2(p.getX(i), p.getZ(i)), Math.hypot(p.getX(i), p.getZ(i)) - R]);
    }
    return out.sort((a, b) => a[0] - b[0]);
  };
  const pair = (opts = {}) => {
    const bed = makeBrushBed({ R: 1, wallH: 1 });
    const A = buildBrushStrokeOnWall({ ...WALL, bed, weight: 0.7, seed: 11, path: gest(-0.014), ...opts });
    const B = buildBrushStrokeOnWall({ ...WALL, bed, weight: 1.0, seed: 18, path: gest(0.014), ...opts });
    return { A, B };
  };

  it('the bed says how high the cream actually is, not a fraction of it', () => {
    /* The splat used to fall off from its own centre, so a cell whose vertex missed it kept only
       what a neighbour wrote — the bed read ~0.75 of the surface right across a stroke's middle,
       which is most of a seam's worth of error and all of it in the direction that lets the stroke
       underneath come back through. */
    const bed = makeBrushBed({ R: 1, wallH: 1 });
    const g = buildBrushStrokeOnWall({ ...WALL, bed, weight: 0.8, seed: 11, path: gest(0) });
    const p = g.attributes.position, m = BRUSH_ON_CAKE_DEFAULTS.across, n = p.count / m;
    let worst = 1;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      /* The stroke's middle. Its feathered rim is a steep ramp read off a grid and will always come
         back low there, which costs nothing: the rim is where a neighbour is barely on it anyway. */
      if (j < m * 0.2 || j > m * 0.8) continue;
      const k = i * m + j, h = Math.hypot(p.getX(k), p.getZ(k)) - 1;
      if (h < 0.02) continue;
      worst = Math.min(worst, bed.heightAt(Math.atan2(p.getX(k), p.getZ(k)), p.getY(k)) / h);
    }
    expect(worst).toBeGreaterThan(0.88);                        // it was 0.68 when the shoulder started at the middle
  });

  it('where it crosses, it never comes back through', () => {
    /* ⚠️ ASKED OF THE BED, WHICH IS THE AUTHORITY, and this is the third shape of this test. The
       first compared one horizontal slice; the second swept the whole overlap but matched B's
       vertices to the NEAREST A vertex within a tolerance — and near the base, where both strokes
       are widest and steepest, "nearest" is not "underneath", so it reported 2mm of penetration that
       is not there. Both cried wolf on correct changes.
       What the renderer actually promises is that a stroke never sits below the cream that was
       already on the wall when it was laid. That is exactly what the bed holds, so ask it: build A
       into a second bed and compare B against THAT — not against the shared bed, which by then also
       contains B's own stamps and reads higher than anything A ever put down. */
    const shared = makeBrushBed({ R: 1, wallH: 1 });
    const A = buildBrushStrokeOnWall({ ...WALL, bed: shared, weight: 0.7, seed: 11, path: gest(-0.014) });
    const B = buildBrushStrokeOnWall({ ...WALL, bed: shared, weight: 1.0, seed: 18, path: gest(0.014) });
    expect(A && B).toBeTruthy();

    const before = makeBrushBed({ R: 1, wallH: 1 });          // what was there when B was laid
    buildBrushStrokeOnWall({ ...WALL, bed: before, weight: 0.7, seed: 11, path: gest(-0.014) });

    const p = B.attributes.position;
    let worst = Infinity, over = 0;
    /* ⚠️ THE TOP SURFACE ONLY. B's RIM is dropped onto whatever is beneath it — that is its whole
       job, closing the solid — so it sits exactly ON A and measures as a 6e-8 penetration. The claim
       here has always been about the surface not sinking below its neighbour. */
    for (let i = 0; i < B.userData.topCount; i++) {
      const th = Math.atan2(p.getX(i), p.getZ(i)), y = p.getY(i);
      const h = Math.hypot(p.getX(i), p.getZ(i)) - 1;
      const under = before.heightAt(th, y);
      if (under < 0.006) continue;                            // only where A really left cream
      over++;
      worst = Math.min(worst, h - under);
    }
    expect(over).toBeGreaterThan(50);                         // they really do overlap
    expect(worst).toBeGreaterThan(0);                         // and B is above A everywhere they do
  });

  it('a stroke with nothing under it is untouched by any of it', () => {
    const bed = makeBrushBed({ R: 1, wallH: 1 });
    const lone = buildBrushStrokeOnWall({ ...WALL, bed, weight: 0.8, seed: 11, path: gest(0) });
    const bare = buildBrushStrokeOnWall({ ...WALL, weight: 0.8, seed: 11, path: gest(0) });
    const a = lone.attributes.position.array, b = bare.attributes.position.array;
    expect(a.length).toBe(b.length);
    let worst = 0;
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
    expect(worst).toBeLessThan(1e-9);
  });
});

describe('a band of strokes round a tier', () => {
  const BAND = { R: 1, baseY: 0, wallH: 1.25, under: '#FBF8F3' };

  it('is ONE part per colour, however many strokes it lays', () => {
    /* The performance answer. Not instances — an InstancedMesh draws one geometry many times and no
       two strokes here are the same shape, which is the point of a band. Not one mesh either: cream
       takes its sheen from its own colour, so a single material puts a white sheen on a charcoal
       stroke. Eighteen strokes, three draw calls. */
    const parts = buildBrushBand({ ...BAND, count: 18, colors: ['#a00', '#0a0', '#00a'] });
    expect(parts).toHaveLength(3);
    expect(parts.map(p => p.color)).toEqual(['#a00', '#0a0', '#00a']);
    for (const p of parts) {
      expect(p.geometry.attributes.color).toBeTruthy();         // the wash survived the merge
      expect(p.geometry.attributes.position.count).toBeGreaterThan(1000);
    }
  });

  it('every stroke is in exactly one part, and the parts are the palette', () => {
    /* A colour that laid no strokes is dropped rather than returned empty — a part with no geometry
       is a mesh with nothing in it and a material compiled for nobody. */
    const parts = buildBrushBand({ ...BAND, count: 8, colors: ['#a00', '#0a0'] });
    const verts = parts.reduce((n, p) => n + p.geometry.attributes.position.count, 0);
    const one = buildBrushBand({ ...BAND, count: 8, colors: ['#a00'] });
    expect(verts).toBe(one.reduce((n, p) => n + p.geometry.attributes.position.count, 0));
  });

  it('snaps the count to a whole number of colour repeats', () => {
    /* A band is a CLOSED loop. Nineteen strokes in three colours puts two of the same colour side by
       side at the seam, once, on the far side of the cake — a fault that only shows up after the
       design is saved. */
    expect(brushBandCount({ count: 19, colors: ['a', 'b', 'c'] })).toBe(18);
    expect(brushBandCount({ count: 20, colors: ['a', 'b', 'c'] })).toBe(21);
    expect(brushBandCount({ count: 20, colors: ['a', 'b'] })).toBe(20);
  });

  it('never lays fewer strokes than there are colours', () => {
    expect(brushBandCount({ count: 1, colors: ['a', 'b', 'c', 'd'] })).toBe(4);
  });

  it('comes back the same band from the same numbers', () => {
    /* A design is re-rendered from what was saved, so a reload that gives a different cake is a lost
       cake. Everything random here is seeded. */
    const a = buildBrushBand({ ...BAND, count: 9, seed: 4, colors: ['#a00', '#0a0', '#00a'] });
    const b = buildBrushBand({ ...BAND, count: 9, seed: 4, colors: ['#a00', '#0a0', '#00a'] });
    expect(a.map(p => Array.from(p.geometry.attributes.position.array)))
      .toEqual(b.map(p => Array.from(p.geometry.attributes.position.array)));
  });

  it('and a different seed is a different band', () => {
    const a = buildBrushBand({ ...BAND, count: 9, seed: 4, colors: ['#a00'] });
    const b = buildBrushBand({ ...BAND, count: 9, seed: 5, colors: ['#a00'] });
    expect(Array.from(a[0].geometry.attributes.position.array))
      .not.toEqual(Array.from(b[0].geometry.attributes.position.array));
  });

  it('the strokes run out at different heights', () => {
    /* ⚠️ MEASURED ON THE BAND, not on brushGesture, because the band is where the seeds are chosen
       and that is where it went wrong: neighbouring seeds give neighbouring answers out of the small
       salts the gesture hashes at, so `seed + i` walked the whole ring in one direction — every
       stroke a little taller than the last, a staircase round the cake rather than a hand. */
    const g = buildBrushBand({ ...BAND, count: 12, seed: 2, colors: ['#a00'] })[0].geometry;
    const p = g.attributes.position, m = BRUSH_ON_CAKE_DEFAULTS.across;
    const tops = [];
    for (let s = 0; s < 12; s++) {
      let hi = 0;
      for (let v = s * m * BRUSH_ON_CAKE_DEFAULTS.rows; v < (s + 1) * m * BRUSH_ON_CAKE_DEFAULTS.rows; v++) {
        if (v < p.count) hi = Math.max(hi, p.getY(v));
      }
      tops.push(hi);
    }
    const lo = Math.min(...tops), hiAll = Math.max(...tops);
    expect(hiAll - lo).toBeGreaterThan(0.1);                   // they really do differ
    /* And not as a ramp: the tallest is not simply the last one round. */
    expect(tops.indexOf(hiAll)).not.toBe(tops.length - 1);
  });
});

describe('a short pull is a narrow pull', () => {
  /* ⚠️ THE FAILURE IS A COLLAPSE, NOT A WOBBLE, which is why this is clamped rather than warned
     about. `brushStroke` offsets the gesture by half the width; once that approaches the length
     there is no gesture left to offset, the two edges cross, and the tip taper and the tear — both
     fractions of the WIDTH — swallow the piece. Sandeep, dragging Length down: *"it lost the
     shape."* What came back were sideways lumps with holes in them. */
  const gest = climb => brushGesture({ at: 0, seed: 11, sweep: 0.012, climb, climbVar: 0 });
  /* How far the mesh reaches across the wall against how far it reaches up it. */
  const spread = (geo) => {
    const p = geo.attributes.position;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const th = Math.atan2(p.getX(i), p.getZ(i));
      x0 = Math.min(x0, th); x1 = Math.max(x1, th);
      y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i));
    }
    return { across: x1 - x0, along: y1 - y0 };
  };

  it('a stroke is never much wider than it is long, however wide it was asked to be', () => {
    for (const climb of [0.5, 0.3, 0.2, 0.12]) {
      const g = buildBrushStrokeOnWall({ R: 1, baseY: 0, wallH: 1, width: 1.2, seed: 11, path: gest(climb) });
      const { across, along } = spread(g);
      expect(across / along).toBeLessThan(1.6);
    }
  });

  it('and a stroke with room for its width is left exactly alone', () => {
    /* The clamp must not be a tax on the normal case: a long pull keeps the width it was given,
       byte for byte, so nothing already authored changes shape. */
    const asked = buildBrushStrokeOnWall({ R: 1, baseY: 0, wallH: 1, width: 0.3, seed: 11, path: gest(0.8) });
    const loose = buildBrushStrokeOnWall({ R: 1, baseY: 0, wallH: 1, width: 0.3, seed: 11, path: gest(0.8), rows: BRUSH_ON_CAKE_DEFAULTS.rows });
    expect(Array.from(asked.attributes.position.array)).toEqual(Array.from(loose.attributes.position.array));
    expect(brushMaxWidth(0.8)).toBeGreaterThan(0.3);     // the clamp genuinely had room to spare
  });

  it('the band keeps its shape at every length, not just the default', () => {
    /* ⚠️ MEASURED AGAINST THE GESTURE'S OWN LENGTH, and the two cuts before this one are the reason.
       The first divided the PART's angular span by the stroke count, which proves nothing twice
       over: the part wraps the whole ring and `atan2` wraps with it, so the span is ~2π whatever
       shape the strokes are. The second measured one stroke's width against its height — better, and
       still blind here, because an over-wide band does not spread sideways, it FOLDS: at climb 0.15
       the unclamped stroke measured 0.405 tall for a gesture 0.19 long, so the aspect ratio came out
       at 1.24 and passed while the shape was ruined.
       What the collapse actually does is put cream where the gesture never went. So: how far up the
       wall the mesh reaches, against how far the hand moved. Both cuts above passed with the clamp
       REMOVED, which is how they were caught; this one does not. */
    const m = BRUSH_ON_CAKE_DEFAULTS.across, rows = BRUSH_ON_CAKE_DEFAULTS.rows, wallH = 1.25;
    for (const climb of [0.52, 0.3, 0.15, 0.12]) {
      /* ⚠️ `bow: 0` HOLDS THE OTHER VARIABLE. This sweeps LENGTH, and the band's default bow is
         -0.2 — which bends the gesture into an S and legitimately changes how tall the mesh is for
         a given climb. Inheriting it made this test fail on a defaults change that had nothing to do
         with what it is about. A sweep answers only the question it varies. */
      const parts = buildBrushBand({ R: 1, baseY: 0, wallH, under: '#fff',
                                     colors: ['#a00'], count: 18, climb, climbVar: 0, bow: 0, seed: 5 });
      const p = parts[0].geometry.attributes.position;
      let y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < m * rows; i++) { y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); }
      expect((y1 - y0) / (climb * wallH)).toBeLessThan(1.7);
    }
  });
});

describe('Thickness runs from merged to proud', () => {
  /* ⚠️ THE CONTROL HAS TO REACH BOTH ENDS, and the bottom end is the one that was wrong. Sandeep's
     own words for what it should do: *"if its a thick stroke edges have elevation, if its a lighter
     stroke, it just merges with the cake surface without elevation"* — then, with the slider at the
     bottom: *"even at thickness 0 it looks very thick."* A band stood 0.0497R proud at ZERO, from a
     film of 0.12 of the lift doubling wherever two strokes overlapped, plus a clearance that was a
     fixed height however thin the cream under it was. */
  const band = weight => buildBrushBand({ R: 1, baseY: 0, wallH: 1.25, under: '#fff',
                                          colors: ['#a00', '#0a0', '#00a'], count: 18, climb: 0.45, weight, seed: 5 });
  const tallest = (parts) => {
    let hi = 0;
    for (const part of parts) {
      const p = part.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) hi = Math.max(hi, Math.hypot(p.getX(i), p.getZ(i)) - 1);
    }
    return hi;
  };

  it('at 0 a band lies almost flat on the wall, overlaps and all', () => {
    expect(tallest(band(0))).toBeLessThan(0.025);
  });

  it('and it is still THERE — a flat stroke is not a missing one', () => {
    /* The other half of the same sentence. A film with no relief at all catches no light and
       z-fights the wall, which is what the film exists to prevent. */
    expect(tallest(band(0))).toBeGreaterThan(0.008);
  });

  it('at 1 it stands well proud, so the slider spans something worth dragging', () => {
    expect(tallest(band(1))).toBeGreaterThan(tallest(band(0)) * 8);
  });
});

describe('no stroke in a band is an outlier', () => {
  /* ⚠️ ONE FAT RIDGE COSTS THE WHOLE CONTROL, which is why this is worth a test of its own rather
     than being left to "it looks about right". Sandeep, ringing a single edge: *"this pice is too
     thick. if i reduce the thickness because of this, other pieces are becming too thin. this is an
     outlier."* A slider gets dragged until the WORST thing on the cake looks acceptable, so one
     vertex at three times the median drags every other stroke down with it.
     It was the overlap stacking: a stroke's own crest laid on top of its neighbour's crest, summed.
     Measured at weight 0.5, the 99th percentile was 3.7× the median and ONE HUNDRED PER CENT of the
     tallest one per cent sat at a stroke's edge. */
  const heights = (weight) => {
    const parts = buildBrushBand({ R: 1, baseY: 0, wallH: 1.25, under: '#fff',
                                   colors: ['#a00', '#0a0', '#00a'], count: 18, climb: 0.52, weight, seed: 5 });
    const hs = [];
    for (const part of parts) {
      const p = part.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) hs.push(Math.hypot(p.getX(i), p.getZ(i)) - 1);
    }
    return hs.sort((a, b) => a - b);
  };
  const q = (hs, f) => hs[Math.floor(f * (hs.length - 1))];

  it('the tallest cream is not far above the typical cream', () => {
    for (const weight of [0.25, 0.5, 0.75]) {
      const hs = heights(weight);
      expect(q(hs, 0.99) / q(hs, 0.5)).toBeLessThan(3);
    }
  });

  it('and the tall vertices are not all crammed onto the edges', () => {
    /* Where a stroke is thickest should be its own ridge, not the seam with its neighbour.
       ⚠️ READ THROUGH THE BAND'S OWN LAYOUT. A part comes back MERGED, so a vertex number says
       nothing by itself: `stride` is how many vertices each stroke contributes and `topCount` how
       many of those are top surface rather than rim. Inlining `i % across` over the whole buffer —
       which is what this did before the rim existed — counts side walls as columns. */
    const parts = buildBrushBand({ R: 1, baseY: 0, wallH: 1.25, under: '#fff',
                                   colors: ['#a00', '#0a0', '#00a'], count: 18, climb: 0.52, weight: 0.5, seed: 5 });
    const m = BRUSH_ON_CAKE_DEFAULTS.across, rows = [];
    for (const part of parts) {
      const p = part.geometry.attributes.position;
      const { stride, topCount, strokes } = part.geometry.userData;
      for (let s = 0; s < strokes; s++) {
        for (let k = 0; k < topCount; k++) {
          const i = s * stride + k;
          rows.push([Math.hypot(p.getX(i), p.getZ(i)) - 1, (k % m) / (m - 1)]);
        }
      }
    }
    const cut = q(rows.map(r => r[0]).sort((a, b) => a - b), 0.99);
    const tall = rows.filter(r => r[0] >= cut);
    const middle = tall.filter(r => r[1] > 0.25 && r[1] < 0.75).length;
    /* ⚠️ THE RATIO ABOVE IS THE LOAD-BEARING ONE; this is a sanity check on the shape of the
       distribution and its threshold is a judgement. The fault it was written for was 0% in the
       middle with a p99/median of 3.7 — everything piled on the seams. */
    expect(tall.length).toBeGreaterThan(20);
    expect(middle / tall.length).toBeGreaterThan(0.08);
  });
});
