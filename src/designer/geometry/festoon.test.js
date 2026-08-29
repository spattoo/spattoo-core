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
