import { describe, it, expect } from 'vitest';
import { outlineOf, scaledOutline, polygonPerimeter, pointInPolygon, nearestOnPolygon } from './shapes.js';
import { tierShape, perimeter, topContains, topClamp, snapToRim, boundingRadius, nearestU, selfTest } from './surface.js';
import { CAKE_SHAPES, applyCakeShapeConfig, cakeShapeDef } from '../cakeShapes.js';

// The contract that makes a new cake shape DATA rather than a branch. The first block is the one that
// actually matters: adding shapes must not change what an existing cake does.

describe('no regression — round and rect keep their analytic math', () => {
  it('every pre-existing surface invariant still holds', () => {
    expect(selfTest()).toEqual([]);
  });

  it('an absent shape is still round; "rect" is still the sheet prism', () => {
    expect(tierShape({ radius: 1.2 }).kind).toBe('round');
    expect(tierShape({ shape: 'rect', width: 2.16, depth: 1.56 }).kind).toBe('rect');
  });

  it('an unknown shape key degrades to round rather than throwing', () => {
    expect(tierShape({ shape: 'no_such_shape', radius: 1 }).kind).toBe('round');
  });
});

describe('outlines are normalised, closed and outward-wound', () => {
  for (const family of ['heart', 'butterfly', 'polygon', 'oval']) {
    it(`${family}: fills [-1,1]² and is centred`, () => {
      const pts = outlineOf(family, {});
      const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
      expect(Math.max(...xs)).toBeCloseTo(1, 6);
      expect(Math.min(...xs)).toBeCloseTo(-1, 6);
      expect(Math.max(...zs)).toBeCloseTo(1, 6);
      expect(Math.min(...zs)).toBeCloseTo(-1, 6);
    });

    it(`${family}: perimeter normals point OUTWARD`, () => {
      // A point just outside the edge must be outside the polygon; just inside, inside. This is the
      // property every side-decoration depends on — get the winding wrong and decor faces into the cake.
      //
      // Probed away from s=0: a heart's cleft is a CUSP (the curve passes exactly through x=0 between
      // the lobes), and at a cusp "one step outward" from one wall lands inside the other. That is a
      // property of the shape, not a defect in the winding — so the probe simply doesn't belong there.
      const pts = scaledOutline(family, {}, 1, 1);
      const perim = polygonPerimeter(pts);
      for (const f of [0.17, 0.41, 0.63, 0.88]) {
        const p = perim.at(f * perim.length);
        const eps = 1e-3;
        expect(pointInPolygon(pts, p.x + p.nx * eps, p.z + p.nz * eps)).toBe(false);
        expect(pointInPolygon(pts, p.x - p.nx * eps, p.z - p.nz * eps)).toBe(true);
      }
    });
  }
});

describe('outline shapes plug into the generic surface ops', () => {
  // A heart is an AUTHORED shape — a row, not a constant — so the test authors one, exactly as the
  // studio does. Nothing but `round` and `rect` is seeded in code.
  applyCakeShapeConfig([{ key: 'heart', label: 'Heart', family: 'heart', config: { plump: 1, cleft: 1 } }]);
  const heart = tierShape({ shape: 'heart', width: 2.4, depth: 2.4 });

  it('is an outline kind sized by width/depth', () => {
    expect(heart.kind).toBe('outline');
    expect(heart.halfW).toBeCloseTo(1.2);
    expect(heart.halfD).toBeCloseTo(1.2);
    expect(boundingRadius(heart)).toBeGreaterThan(0);
  });

  it('topContains follows the SILHOUETTE, not a bounding circle', () => {
    expect(topContains(heart, 0, 0)).toBe(true);
    // The heart's POINT faces the front (+Z) and its lobes the back (−Z). The valley BETWEEN the lobes
    // is inside the bounding box but OUTSIDE the cake — a radius test would happily seat a decoration
    // in thin air there, which is the whole reason placement goes through the outline.
    expect(topContains(heart, 0, -heart.halfD * 0.98)).toBe(false);
    // …while the tip itself is cake.
    expect(topContains(heart, 0, heart.halfD * 0.9)).toBe(true);
    expect(topContains(heart, 9, 9)).toBe(false);
  });

  it('topClamp pulls an outside point back onto the footprint', () => {
    const c = topClamp(heart, 5, 5, 1);
    expect(topContains(heart, c.x, c.z, 1.02)).toBe(true);
  });

  it('snapToRim lands ON the rim', () => {
    const p = snapToRim(heart, 3, 0.2);
    const near = nearestOnPolygon(heart.outline, p.x, p.z);
    expect(Math.hypot(near.x - p.x, near.z - p.z)).toBeLessThan(1e-6);
  });

  it('nearestU round-trips through the perimeter (side placement stays consistent)', () => {
    const perim = perimeter(heart);
    for (const u of [0.05, 0.3, 0.62, 0.91]) {
      const p = perim.at(u * perim.length);
      const back = nearestU(heart, p.x, p.z);
      const d = Math.min(Math.abs(back - u), 1 - Math.abs(back - u));
      expect(d).toBeLessThan(0.01);
    }
  });

  it('arc length is continuous and closes', () => {
    const perim = perimeter(heart);
    const a = perim.at(0), b = perim.at(perim.length);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6);
  });
});

describe('the catalog is the data↔code seam', () => {
  it('a DB row can add a shape the code never named', () => {
    applyCakeShapeConfig([{ key: 'octagon', label: 'Octagon', family: 'polygon', config: { sides: 8 } }]);
    expect(cakeShapeDef('octagon').label).toBe('Octagon');
    const shp = tierShape({ shape: 'octagon', width: 2, depth: 2 });
    expect(shp.kind).toBe('outline');
    expect(shp.outline.length).toBe(8);
  });

  it('a row can be retuned without code', () => {
    applyCakeShapeConfig([{ key: 'hexagon', label: 'Hexagon', family: 'polygon', config: { sides: 6 } }]);
    expect(tierShape({ shape: 'hexagon', width: 2, depth: 2 }).outline.length).toBe(6);
    applyCakeShapeConfig([{ key: 'hexagon', label: 'Hexagon', family: 'polygon', config: { sides: 5 } }]);
    expect(tierShape({ shape: 'hexagon', width: 2, depth: 2 }).outline.length).toBe(5);
  });

  it('the code seeds only the two shapes that MUST exist', async () => {
    // Freshly imported, the catalog is exactly { round, rect } — the keys existing designs already
    // store. A heart is authored (a row), never shipped as a constant, so the code has no opinion on
    // what one looks like. (This module is re-imported because the tests above have authored into the
    // live catalog, which is precisely how a real catalog gets its shapes.)
    const fresh = await import('../cakeShapes.js?fresh');
    expect(Object.keys(fresh.CAKE_SHAPES).sort()).toEqual(['rect', 'round']);
    expect(fresh.CAKE_SHAPES.round.family).toBe('circle');
    expect(fresh.CAKE_SHAPES.rect.family).toBe('rounded_rect');
  });
});
