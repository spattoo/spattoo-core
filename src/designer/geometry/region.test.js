import { describe, it, expect } from 'vitest';
import {
  REGION_KINDS, REGION_DEFAULTS, regionRing, ringBounds, ringDepth, ringInradius,
  regionSeatShape, shapeExtent, surfaceDepth,
} from './region.js';
import { buildSandMound, sandSpan, ZONES_TOP } from './sand.js';

const round = { kind: 'round', radius: 1.2 };
const sheet = { kind: 'rect', halfW: 1.35, halfD: 0.95, cornerR: 0.18 };

describe('a region is placed in fractions of the cake, never in world units', () => {
  it('scales with the cake, so the same region fits a 6" and a 12"', () => {
    const small = regionRing({ kind: 'rect', size: 0.5 }, 1);
    const big   = regionRing({ kind: 'rect', size: 0.5 }, 3);
    for (let i = 0; i < small.length; i++) {
      expect(big[i].x).toBeCloseTo(small[i].x * 3, 9);
      expect(big[i].z).toBeCloseTo(small[i].z * 3, 9);
    }
  });

  /* ⚠️ THE CAKE'S LONG SIDE, NOT ITS DIAGONAL. `shapeMaxReach` (sand.js) is a support-function
     maximum and on a sheet that is the corner — 1.63 on a 1.35 × 0.95. Sizing a region by it made
     `size: 0.5` wider than the cake is deep. A baker reading "half" means half the long side. */
  it('measures a cake by its long side', () => {
    expect(shapeExtent(round)).toBeCloseTo(1.2, 9);
    expect(shapeExtent(sheet)).toBeCloseTo(1.35, 9);          // not hypot(1.35, 0.95) = 1.65
    expect(shapeExtent({ kind: 'outline', outline: [{ x: -2, z: 0.4 }, { x: 1, z: -0.3 }] })).toBe(2);
  });

  it('turning a region does not also resize it', () => {
    const area = (ring) => {
      let a = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
        a += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
      return Math.abs(a / 2);
    };
    const flat = area(regionRing({ kind: 'rect', size: 0.6 }, 1.2));
    for (const rotation of [0.3, 1, 2.4]) {
      expect(area(regionRing({ kind: 'rect', size: 0.6, rotation }, 1.2))).toBeCloseTo(flat, 9);
    }
  });

  /* ⚠️ `aspect` SPLITS EITHER SIDE OF 1 so it cannot double as a size control. Scaling x alone made
     every wide region a large one, and `size` and `aspect` then fought over the same pixels. */
  it('stretching a region does not also resize it', () => {
    const area = (ring) => {
      let a = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
        a += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
      return Math.abs(a / 2);
    };
    const square = area(regionRing({ kind: 'rect', size: 0.6, aspect: 1 }, 1.2));
    for (const aspect of [0.25, 0.5, 2, 4]) {
      expect(area(regionRing({ kind: 'rect', size: 0.6, aspect }, 1.2))).toBeCloseTo(square, 9);
    }
  });

  it('offers kinds as data, so a new one is a row and not a branch', () => {
    expect(Object.keys(REGION_KINDS).sort()).toEqual(['rect', 'triangle']);
    expect(REGION_DEFAULTS.kind in REGION_KINDS).toBe(true);
    for (const pts of Object.values(REGION_KINDS)) {
      expect(pts.length).toBeGreaterThanOrEqual(3);
      for (const p of pts) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('depth is measured from the edge, which is what lets a region sit anywhere', () => {
  const ring = regionRing({ kind: 'rect', size: 0.5, x: 0.6, z: -0.4 }, 1.2);

  it('is positive inside, negative outside and zero on the boundary', () => {
    const b = ringBounds(ring);
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    expect(ringDepth(ring, cx, cz).depth).toBeGreaterThan(0);
    expect(ringDepth(ring, b.maxX + 0.5, cz).depth).toBeLessThan(0);
    expect(Math.abs(ringDepth(ring, b.maxX, cz).depth)).toBeLessThan(1e-9);
  });

  /* ⚠️ THE WHOLE POINT OF THE MODULE. `shapeReach(shape, dir)` is a support function measured from
     the ORIGIN, so it can only describe regions star-shaped about the middle of the cake — which is
     why handing an off-centre polygon to the generator produced a cone spreading out of the centre
     rather than a patch in the corner. Depth does not care where the cake's middle is. */
  it('says nothing about the cake centre: a far corner is as deep as a middle one', () => {
    const near = regionRing({ kind: 'rect', size: 0.4, x: 0, z: 0 }, 1.2);
    const far  = regionRing({ kind: 'rect', size: 0.4, x: 0.9, z: 0.9 }, 1.2);
    expect(ringInradius(far)).toBeCloseTo(ringInradius(near), 6);
  });

  it('points toward the inside from the boundary, whichever way the ring is wound', () => {
    const cw  = regionRing({ kind: 'rect', size: 0.5 }, 1.2);
    const ccw = [...cw].reverse();
    for (const r of [cw, ccw]) {
      const b = ringBounds(r);
      // Stand well outside the right-hand edge: "inward" must point back toward -x.
      const d = ringDepth(r, b.maxX + 0.3, 0);
      expect(d.depth).toBeLessThan(0);
      expect(d.inX).toBeLessThan(-0.5);
    }
  });

  it('gives a square its half-width as an inradius', () => {
    const r = regionRing({ kind: 'rect', size: 0.5 }, 1.2);   // half-extent 0.6
    expect(ringInradius(r)).toBeGreaterThan(0.6 * 0.95);
    expect(ringInradius(r)).toBeLessThanOrEqual(0.6 + 1e-9);
  });
});

describe('a region drives the sand generator', () => {
  const span = sandSpan(ZONES_TOP, 1);
  const extentOf = (g) => {
    const p = g.attributes.position;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < p.count; i++) {
      if (p.getX(i) < minX) minX = p.getX(i);
      if (p.getX(i) > maxX) maxX = p.getX(i);
      if (p.getZ(i) < minZ) minZ = p.getZ(i);
      if (p.getZ(i) > maxZ) maxZ = p.getZ(i);
    }
    return { minX, maxX, minZ, maxZ };
  };

  /* ⚠️ THE ONE THAT WAS BROKEN BEFORE THIS MODULE EXISTED. An off-centre patch rendered as a cone
     spreading from the middle of the cake. If this ever regresses, minX collapses toward 0. */
  it('keeps an off-centre patch off-centre, with nothing left behind at the cake middle', () => {
    const region = { kind: 'rect', size: 0.35, x: 0.55, z: -0.4 };
    const e = extentOf(buildSandMound(sheet, { ...span, region, edgeBreak: 0 }));
    const r = ringBounds(regionRing(region, shapeExtent(sheet)));
    expect(e.minX).toBeGreaterThan(r.minX - 0.02);
    expect(e.maxX).toBeLessThan(r.maxX + 0.02);
    expect(e.minZ).toBeGreaterThan(r.minZ - 0.02);
    expect(e.maxZ).toBeLessThan(r.maxZ + 0.02);
    // And emphatically not reaching back to the middle of the cake.
    expect(e.minX).toBeGreaterThan(0.1);
  });

  /* ⚠️ A TRIANGLE MUST STAY A TRIANGLE at edgeBreak 0. Someone who just drew one expects to see it;
     the ragged coastline is a choice they make afterwards, not something imposed on them. */
  it('leaves a drawn edge alone when the wander is off', () => {
    const region = { kind: 'triangle', size: 0.8 };
    const ring = regionRing(region, shapeExtent(round));
    const p = buildSandMound(round, { ...span, region, edgeBreak: 0 }).attributes.position;
    let worstOutside = 0;
    for (let i = 0; i < p.count; i++) {
      const d = ringDepth(ring, p.getX(i), p.getZ(i)).depth;
      if (d < 0) worstOutside = Math.max(worstOutside, -d);
    }
    expect(worstOutside).toBeLessThan(1e-6);
  });

  it('eats the edge in, never out, once the wander is on', () => {
    const region = { kind: 'rect', size: 0.7 };
    const ring = regionRing(region, shapeExtent(round));
    const p = buildSandMound(round, { ...span, region, edgeBreak: 1 }).attributes.position;
    let worstOutside = 0, deepest = 0;
    for (let i = 0; i < p.count; i++) {
      const d = ringDepth(ring, p.getX(i), p.getZ(i)).depth;
      if (d < 0) worstOutside = Math.max(worstOutside, -d);
      if (d > deepest) deepest = d;
    }
    expect(worstOutside).toBeLessThan(1e-6);   // never outside what was drawn
    expect(deepest).toBeGreaterThan(0.1);      // and it did not eat the whole thing
  });

  it('stands the sand up inside the region and nowhere else', () => {
    const region = { kind: 'triangle', size: 0.7, x: -0.3, z: 0.3 };
    const ring = regionRing(region, shapeExtent(round));
    const p = buildSandMound(round, { ...span, region }).attributes.position;
    let tallestOutside = 0, peak = 0;
    for (let i = 0; i < p.count; i++) {
      peak = Math.max(peak, p.getY(i));
      if (ringDepth(ring, p.getX(i), p.getZ(i)).depth < -1e-9)
        tallestOutside = Math.max(tallestOutside, p.getY(i));
    }
    expect(peak).toBeGreaterThan(0.02);
    expect(tallestOutside).toBe(0);
  });

  /* ⚠️ SAND MAY NOT HANG OFF THE CAKE, and a region is the one placement that can ask it to. Its
     boundary has nothing to do with the tier's, so a triangle at size 0.85 put its base corners at
     radius 1.44 on a 1.2 round — floating. The radial drift has had this guarantee since the top
     placement landed; a region needs it by a different route. */
  it('never lets a region carry sand off the edge of the cake', () => {
    for (const [cake, region] of [
      [round, { kind: 'triangle', size: 0.85 }],
      [round, { kind: 'rect', size: 1.2, rotation: 0.7 }],
      [sheet, { kind: 'rect', size: 1.1, aspect: 3, rotation: 0.6 }],
      [sheet, { kind: 'triangle', size: 0.9, x: 0.6, z: 0.6 }],
    ]) {
      const p = buildSandMound(cake, { ...span, region }).attributes.position;
      let worst = 0;
      for (let i = 0; i < p.count; i++) {
        const d = surfaceDepth(cake, p.getX(i), p.getZ(i));
        if (d < 0) worst = Math.max(worst, -d);
      }
      expect(worst).toBeLessThan(1e-6);
    }
  });

  it('hands the seat samplers a shape they already understand', () => {
    const ring = regionRing({ kind: 'rect', size: 0.4, x: 0.8 }, 1.2);
    const s = regionSeatShape(ring);
    expect(s.kind).toBe('outline');
    expect(s.outline).toBe(ring);
    /* ⚠️ `halfW` IS THE REACH TO THE REGION, NOT ITS OWN HALF-WIDTH — `grassSeats` walks -ext…+ext,
       so a patch out in a corner needs the extent that GETS there or its seats are cut off. */
    expect(s.halfW).toBeGreaterThan(ringBounds(ring).maxX - 1e-9);
  });
});
