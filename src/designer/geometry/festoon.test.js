import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildFestoons, perimeterBreaks } from './festoon.js';
import { circlePerimeter, roundedRectPerimeter, tierShape, pipingPerimeters } from './surface.js';

// ── Swags on a wall that is not a circle ────────────────────────────────────────────────────────
// A garland used to be bent around cos/sin only. A sheet cake was excluded at the call site and fell
// through to the shell renderer, which repeats a piece FACING OUTWARD at every perimeter point — so
// a long ribbon pointed straight out of the cake. Those were the spikes.
//
// What is pinned here is the pair of guarantees that replaces the circle: the garland follows the
// real wall whatever its shape, and no wall length can make a swag the wrong SIZE — because the two
// ways that goes wrong are the two ways it "looks odd": a rope stretched thin across a long face,
// or one fat enough to stand off the cake.

// A plain strip: long in x, a shallow bump in z, thin in y. Matches what bakeStrip expects — one
// mesh, a world matrix to bake, a real position buffer.
//
// SEGMENTED along its length, and it has to be: the bend maps each vertex by how far along the
// strip it sits, so a plain 8-vertex box has nothing between its two ends and comes out of the U
// perfectly flat. A real piping GLB is dense; an unsegmented box would be testing nothing.
function stripScene({ length = 1, bump = 0.1, width = 0.05 } = {}) {
  const geo = new THREE.BoxGeometry(length, width, bump, 48, 1, 1);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  const scene = new THREE.Group();
  scene.add(mesh);
  return scene;
}

const bbox = (g) => { g.computeBoundingBox(); return g.boundingBox; };

// How far from the cake axis the furthest point of a geometry sits.
const reach = (g) => {
  const p = g.attributes.position;
  let max = 0;
  for (let i = 0; i < p.count; i++) max = Math.max(max, Math.hypot(p.getX(i), p.getZ(i)));
  return max;
};

const RADIUS = 1.2;
const build = (perims, opts = {}) => buildFestoons(stripScene(), {
  festoons: 6, depth: 0.4, attachY: 0, radius: RADIUS, perims, ...opts,
});

describe('perimeterBreaks — where the wall turns a corner', () => {
  it('finds none on a circle: it turns a full 360°, just evenly', () => {
    expect(perimeterBreaks(circlePerimeter(1.2))).toEqual([]);
  });

  it('finds four on a sheet cake, one per corner', () => {
    expect(perimeterBreaks(roundedRectPerimeter(1.08, 0.78, 0))).toHaveLength(4);
  });

  it('finds four on a ROUNDED rect too — a fillet is still a corner', () => {
    // The turn is spread over the fillet instead of spiking at a point, so the detector has to
    // group consecutive samples rather than count spikes. 0.15 is a generous corner radius.
    expect(perimeterBreaks(roundedRectPerimeter(1.08, 0.78, 0.15))).toHaveLength(4);
  });

  it('puts each break AT the corner, not near it', () => {
    // Front-centre is s=0 and the walk goes +x first, so the first corner is a half-front away.
    const [first] = perimeterBreaks(roundedRectPerimeter(1, 1, 0));
    expect(first).toBeCloseTo(1, 1);          // (0,1) → (1,1) is one unit of wall
  });

  it('does not split a corner that sits on the seam', () => {
    // A square rotated so a corner lands at s=0 would report five breaks if the scan started
    // mid-corner and closed the wrap-around group separately.
    const square = roundedRectPerimeter(1, 1, 0);
    const shifted = { length: square.length, at: (s) => square.at(s + 1) };   // s=0 now AT a corner
    expect(perimeterBreaks(shifted)).toHaveLength(4);
  });
});

/* ── An outline shape is a POLYGON, and that is what broke this ─────────────────────────────────
 *
 * ⚠️ THE BUG. `perimeter()` on an outline is `polygonPerimeter` over ~160 points, and its normal is
 * per SEGMENT — piecewise constant. It does not turn gradually; it holds still along a facet and
 * jumps at a vertex. The detector compared NEIGHBOURING samples, which on a polygon asks "did the
 * normal jump here", and the answer is yes at every vertex. So every outline shape reported one
 * corner per vertex: a heart 93, a butterfly 160, and an OVAL — which has no corners whatsoever —
 * 160. Each of those runs was ~0.05 long and each was still forced to hold one whole swag, squeezed
 * to 0.03× the calibrated size. Reported as "garland doesn't look right on a heart": a few correct
 * drapes with dense clots of crushed rope between them.
 *
 * ⚠️ AND IT WAS INVISIBLE TO EVERY TEST ABOVE, because they all use `circlePerimeter` and
 * `roundedRectPerimeter` — analytic curves whose normals turn smoothly. Not one of them touches the
 * polygon path, which is every shape the catalogue can author. That is the gap this block closes,
 * and why it drives `tierShape` rather than building a perimeter by hand.
 */
describe('perimeterBreaks — on the shapes a catalogue can actually hold', () => {
  const perim = (tier) => pipingPerimeters(tierShape(tier))[0];

  /* The whole table, at three proportions each, because the fault showed on some and not others:
     a square heart reported 93 breaks and a wide one 97, and picking either alone would have looked
     like a one-off. `null` = no single right answer, only "a small stable number, never one per
     vertex" — a butterfly's notches are real corners and nobody has decided how many. */
  it.each([
    ['round',        { radius: 1.2 },                                              0],
    ['round large',  { radius: 1.8 },                                              0],
    ['rect',         { shape: 'rect', width: 2.16, depth: 1.56 },                  4],
    ['rect square',  { shape: 'rect', width: 2.2, depth: 2.2 },                    4],
    ['hexagon',      { shapeFamily: 'polygon', shapeConfig: { sides: 6 }, width: 2.4, depth: 2.4 }, 6],
    ['heart',        { shapeFamily: 'heart', width: 2.4, depth: 2.4 },             2],
    ['heart wide',   { shapeFamily: 'heart', width: 3.0, depth: 2.0 },          null],
    ['heart deep',   { shapeFamily: 'heart', width: 2.0, depth: 3.0 },          null],
    ['butterfly',    { shapeFamily: 'butterfly', width: 2.4, depth: 2.4 },      null],
    ['oval',         { shapeFamily: 'oval', width: 2.4, depth: 2.4 },               0],
    ['oval wide',    { shapeFamily: 'oval', width: 3.0, depth: 2.0 },               0],
    ['oval flat',    { shapeFamily: 'oval', width: 3.4, depth: 1.6 },               2],
  ])('%s', (_name, tier, expected) => {
    const breaks = perimeterBreaks(perim(tier));
    if (expected !== null) expect(breaks).toHaveLength(expected);
    // The real guarantee, and the one that failed: a corner per vertex is never an answer.
    expect(breaks.length).toBeLessThan(12);
  });

  /* ⚠️ AN OVAL IS THE CASE THAT PROVES IT WAS FACETING AND NOT GEOMETRY. A round-ish one is a
     smooth closed curve with no corner anywhere — the same shape as a circle as far as a garland
     cares — so a break on THIS is the polygon being read rather than the oval. It used to report
     160 of them. */
  it('a round-ish oval has no corners at all', () => {
    for (const [w, d] of [[2.4, 2.4], [3.0, 2.0], [2.0, 3.0]]) {
      expect(perimeterBreaks(perim({ shapeFamily: 'oval', width: w, depth: d }))).toEqual([]);
    }
  });

  /* ⚠️ AND A FLAT ONE BREAKS AT ITS TWO ENDS, WHICH IS CORRECT, not a leftover of the old fault.
     Past about 1.8:1 an ellipse really does concentrate its turning at the ends — that is what an
     ellipse IS — and a garland joined there reads as joined at the ends rather than draped over
     them. Measured, the transition sits between 1.5:1 (none) and 1.78:1 (two), and it stays at two
     out to 2.9:1; the runs are each exactly half the wall and the swags land at 1.06–1.12× of the
     calibrated size. The distinction that matters is not "any break" but "a break with nothing
     between it and the next one", which is what the size assertion below actually guards. */
  it('a flat oval breaks at its two ends and nowhere else', () => {
    for (const [w, d] of [[3.2, 1.8], [3.4, 1.6], [4.0, 1.4]]) {
      const p = perim({ shapeFamily: 'oval', width: w, depth: d });
      const at = perimeterBreaks(p).map(b => b / p.length);
      expect(at).toHaveLength(2);
      expect(Math.abs(at[1] - at[0])).toBeCloseTo(0.5, 1);   // the two ends, opposite each other
    }
  });

  /* A heart's two corners are its TIP and its CLEFT, and they are half a perimeter apart — the
     shape is symmetric about +Z, so each side of it is one continuous face. Positions, not just a
     count: two breaks in the wrong places would pass a length assertion and still drape a swag
     over the point. */
  it('breaks a heart at its point and its cleft, and nowhere else', () => {
    const p = perim({ shapeFamily: 'heart', width: 2.4, depth: 2.4 });
    const at = perimeterBreaks(p).map(b => b / p.length);
    expect(at).toHaveLength(2);
    expect(Math.abs(at[1] - at[0])).toBeCloseTo(0.5, 1);    // diametrically opposite
  });
});

describe('buildFestoons — on an outline cake', () => {
  const heart = tierShape({ shapeFamily: 'heart', width: 2.4, depth: 2.4 });
  const perims = pipingPerimeters(heart);

  /* The number the eye actually judges. Before: 93 swags at 0.03× — a solid crust of rope. */
  it('lays down a handful of swags, not one per polygon vertex', () => {
    const geos = build(perims);
    expect(geos.length).toBeGreaterThan(2);
    expect(geos.length).toBeLessThan(12);
  });

  /* Every swag the right SIZE, which is the file's stated guarantee and the thing a crushed one
     breaks. Measured as length along the wall: the largest and smallest swag must be within the
     √2/(1/√2) band of each other — a factor of two end to end. */
  it('keeps every swag within the size band it promises', () => {
    const spans = build(perims).map(g => {
      const bb = bbox(g);
      return Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    });
    expect(Math.max(...spans) / Math.min(...spans)).toBeLessThan(2);
  });

  /* And still ON the wall — the original spikes bug, re-checked on a shape it was never run on. */
  it('drapes along the wall rather than pointing out of it', () => {
    const corner = 1.2 * Math.SQRT2;
    for (const g of build(perims)) expect(reach(g)).toBeLessThan(corner + 0.2);
  });
});

describe('buildFestoons — a round cake is unchanged', () => {
  it('lays down exactly the authored number of swags', () => {
    expect(build([circlePerimeter(RADIUS)], { festoons: 6 })).toHaveLength(6);
    expect(build([circlePerimeter(RADIUS)], { festoons: 9 })).toHaveLength(9);
  });

  it('centres the first swag at the cake FRONT (+Z)', () => {
    // The old code opened at th0 = π/2, which is +Z. A garland that rotated a sixth of a turn on
    // every existing round cake would be a silent regression on saved designs.
    const [first] = build([circlePerimeter(RADIUS)], { festoons: 6 });
    const c = bbox(first).getCenter(new THREE.Vector3());
    expect(c.z).toBeGreaterThan(0);
    expect(Math.abs(c.x)).toBeLessThan(1e-6);
  });

  it('hangs the belly below the attachment line by the requested depth', () => {
    const [g] = build([circlePerimeter(RADIUS)], { festoons: 6, depth: 0.4, attachY: 2 });
    expect(bbox(g).min.y).toBeLessThan(2);
    expect(2 - bbox(g).min.y).toBeGreaterThan(0.3);
  });
});

describe('buildFestoons — a sheet cake', () => {
  const sheet = tierShape({ shape: 'rect', width: 2.16, depth: 1.56 });
  const perims = pipingPerimeters(sheet);

  it('drapes along the wall instead of pointing out of it', () => {
    // The bug, stated as a measurement. A ribbon repeated outward reaches roughly its own LENGTH
    // past the cake; a draped one never leaves the wall by more than its own thin cross-section.
    const geos = build(perims);
    expect(geos.length).toBeGreaterThan(0);
    const corner = Math.hypot(1.08, 0.78);
    for (const g of geos) expect(reach(g)).toBeLessThan(corner + 0.1);
  });

  it('covers the whole wall — every face carries at least one swag', () => {
    const centres = build(perims).map(g => bbox(g).getCenter(new THREE.Vector3()));
    expect(centres.some(c => c.z >  0.6)).toBe(true);   // front
    expect(centres.some(c => c.z < -0.6)).toBe(true);   // back
    expect(centres.some(c => c.x >  0.9)).toBe(true);   // right
    expect(centres.some(c => c.x < -0.9)).toBe(true);   // left
  });

  it('never lets one swag drape across a corner', () => {
    // A swag spans one face only, so its own bounding box must not straddle two of them. Checked
    // as: it cannot reach past the halfway point of BOTH a long and a short face.
    for (const g of build(perims)) {
      const bb = bbox(g);
      const spansX = bb.max.x > 0.55 && bb.min.x < -0.55;
      const spansZ = bb.max.z > 0.40 && bb.min.z < -0.40;
      expect(spansX && spansZ).toBe(false);
    }
  });

  it('keeps the ROPE the size it was calibrated at, however long the face is', () => {
    // The other half of the sizing fix. Cross-section used to be derived from the stretch, so a
    // swag squeezed into a short face came out thinner and a stretched one came out fatter — a
    // garland that changed weight from face to face. A sheet has faces of two different lengths,
    // so it is exactly where that would show.
    //
    // Measured as the rope's THICKNESS: on a flat face the swag runs along the face and in y, so
    // its extent along that face's own normal is the rope and nothing else.
    const thick = build(perims).map(g => {
      const bb = bbox(g), c = bb.getCenter(new THREE.Vector3());
      return Math.abs(c.x) > Math.abs(c.z) ? bb.max.x - bb.min.x : bb.max.z - bb.min.z;
    });
    expect(Math.max(...thick) - Math.min(...thick)).toBeLessThan(0.02);
  });
});

describe('buildFestoons — the count follows the wall LENGTH', () => {
  // The authored count was tuned on a round tier, which makes it a disguised measurement of how
  // much wall one swag covers. Carrying the LENGTH rather than the count is what stops a long wall
  // from stretching the same few swags across all of it.
  //
  // Note this does NOT mean a sheet cake always gets more swags than a round one: a 2.16 × 1.56
  // sheet has almost exactly the perimeter of the circle its own radius describes, so it lands on
  // six either way. The point is that the six are the calibrated SIZE, not six stretched to fit.
  it('doubles the swags when the wall is twice as long', () => {
    const one = build([circlePerimeter(RADIUS)], { festoons: 6 });
    const two = build([circlePerimeter(RADIUS * 2)], { festoons: 6 });   // same calibration radius
    expect(one).toHaveLength(6);
    expect(two).toHaveLength(12);
  });
});

describe('buildFestoons — the size guarantee', () => {
  // A swag can never be stretched past √2 or squeezed below 1/√2 of its calibrated span, whatever
  // the wall measures. Swept across many wall lengths rather than asserted on one, because the
  // worst case sits between two counts and a single example would miss it.
  it('holds across every wall length', () => {
    const calib = (2 * Math.PI * RADIUS) / 6;
    for (let len = 0.4; len < 14; len += 0.037) {
      const raw = len / calib;
      const lo = Math.max(1, Math.floor(raw)), lastr = (m) => { const r = (len / m) / calib; return r >= 1 ? r : 1 / r; };
      const hi = Math.max(1, Math.ceil(raw));
      const m = lastr(hi) < lastr(lo) ? hi : lo;
      // Only meaningful once the wall is at least one swag long; below that there is nothing to
      // divide and the single swag is simply squeezed.
      if (raw >= 1) expect(lastr(m)).toBeLessThanOrEqual(Math.SQRT2 + 1e-9);
    }
  });
});
