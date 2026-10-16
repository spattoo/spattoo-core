import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { layAxis, instancedTriangleCount, outwardBand, rimBand,
         withoutCollarCentres } from './useSeatedInstances.js';

/* ⚠️ THIS IS THE SIGN THE WAFER SKIRT GOT WRONG, and it cost a day. `fin` mounting sent every strip
 * INWARD through the cake instead of outward, which a render could not show (the strips were simply
 * gone) and a test found in one line. Laying a sprig down on a board is the same operation: tip +Y
 * toward the seat's outward bearing. Inward, a board ring would grow into the cake. */
describe('layAxis — tipping a piece AWAY from the cake', () => {
  const tipped = (out, angle) =>
    new THREE.Vector3(0, 1, 0).applyQuaternion(
      new THREE.Quaternion().setFromAxisAngle(layAxis(out), angle));

  it('laid flat, a piece points along its own outward bearing', () => {
    for (const out of [0, Math.PI / 2, Math.PI, -Math.PI / 3, 2.4]) {
      const v = tipped(out, Math.PI / 2);
      // Fully laid over, +Y should be the horizontal outward direction (sin out, 0, cos out).
      expect(v.x, `out ${out}`).toBeCloseTo(Math.sin(out), 5);
      expect(v.z, `out ${out}`).toBeCloseTo(Math.cos(out), 5);
      expect(v.y, `out ${out}`).toBeCloseTo(0, 5);
    }
  });

  it('part way over, it leans outward and is still standing', () => {
    const out = 0.9;
    const v = tipped(out, Math.PI / 4);
    expect(v.y).toBeGreaterThan(0.6);                       // still mostly upright
    const outward = new THREE.Vector3(Math.sin(out), 0, Math.cos(out));
    expect(v.dot(outward)).toBeGreaterThan(0.5);            // and leaning the right way
  });

  it('never leans inward, at any bearing or angle', () => {
    for (let out = -Math.PI; out < Math.PI; out += 0.37) {
      for (const a of [0.2, 0.8, 1.4, Math.PI / 2]) {
        const v = tipped(out, a);
        const outward = new THREE.Vector3(Math.sin(out), 0, Math.cos(out));
        expect(v.dot(outward), `out ${out.toFixed(2)} angle ${a}`).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('upright is untouched', () => {
    const v = tipped(1.1, 0);
    expect(v.y).toBeCloseTo(1, 6);
  });
});

describe('instancedTriangleCount — what a MERGED field would cost', () => {
  it('counts off the geometry rather than a formula', () => {
    const g = new THREE.BoxGeometry(1, 1, 1);             // 12 triangles, unindexed in three
    const { per, total } = instancedTriangleCount(g, 10);
    expect(per).toBe(12);
    expect(total).toBe(120);
  });

  it('survives a geometry that is not there yet', () => {
    expect(instancedTriangleCount(null, 5).total).toBe(0);
  });
});

/* ⚠️ A RING AT THE FOOT IS THE CAKE'S OWN OUTLINE, GROWN. Seated against the BOARD's outline the
 * band fills everything between the two — it floods the board and reads as flowers standing in
 * card: *"we dont need to flood the board entirely… it should actually be the ring on the botton
 * rim of the cake. like i already said, you cant insert them on board."* */
describe('outwardBand — a ring hugging the foot of the cake', () => {
  it('grows a round tier by the width asked for', () => {
    expect(outwardBand({ kind: 'round', radius: 1.5 }, 0.2).radius).toBeCloseTo(1.8, 6);
    expect(outwardBand({ kind: 'round', radius: 1.5 }, 0).radius).toBeCloseTo(1.5, 6);
  });

  /* The band is the tier's SHAPE, not a circle round it, or a sheet cake would get a round ring
     with the corners left bare — the same reason grassSeats clips with the outline's own test. */
  it('keeps a sheet tier rectangular, corners and all', () => {
    const b = outwardBand({ kind: 'rect', halfW: 1.6, halfD: 1.15, cornerR: 0.2 }, 0.25);
    expect(b.kind).toBe('rect');
    expect(b.halfW).toBeCloseTo(2.0, 6);
    expect(b.halfD).toBeCloseTo(1.4375, 6);
    expect(b.cornerR).toBeCloseTo(0.25, 6);
  });

  it('scales an outline shape rather than inventing a radius for it', () => {
    const b = outwardBand({ kind: 'outline', outline: [[0, 0]], scale: 1 }, 0.5);
    expect(b.scale).toBeCloseTo(1.5, 6);
    expect(b.outline).toBeTruthy();
  });

  it('never shrinks, whatever it is given', () => {
    expect(outwardBand({ kind: 'round', radius: 2 }, -3).radius).toBeCloseTo(2, 6);
  });

  it('leaves the original alone — a seat memo depends on identity', () => {
    const src = { kind: 'round', radius: 1.5 };
    const out = outwardBand(src, 0.2);
    expect(src.radius).toBe(1.5);
    expect(out).not.toBe(src);
  });
});

/* ⚠️ A RIM BAND HAS TWO EDGES AND BOTH ARE CHOICES — how far in from the rim the flowers start and
 * how far past it they reach. `overhang` is not that control: it caps at 9% of the outline and also
 * drives the rim lean, so turning it up to reach further tips the pieces over too. Sandeep: *"on
 * the rim also, how much to come out of the rim should be a controlling field."* */
describe('rimBand — a band straddling the top edge', () => {
  const tier = { kind: 'round', radius: 1.5 };
  /* Where the band's inner edge actually lands, in tier units: `bandInner` scales the shape being
     FILLED, and that shape is already grown outward. */
  const innerEdge = (b) => (b.shape.radius * b.bandInner) / tier.radius;

  it('reaches out by exactly what it is asked for', () => {
    expect(rimBand(tier, { out: 0.2 }).shape.radius / tier.radius).toBeCloseTo(1.2, 6);
    expect(rimBand(tier, { out: 0 }).shape.radius / tier.radius).toBeCloseTo(1.0, 6);
  });

  /* ⚠️ THE DIVISION IS THE POINT. Written as a plain `1 - inn`, the band would narrow as the reach
     grew — turn "out" up and the inner edge would walk outward with it, which is one slider moving
     two edges. */
  it('starts where it is asked to, whatever the reach', () => {
    for (const out of [0, 0.1, 0.3]) {
      expect(innerEdge(rimBand(tier, { inn: 0.14, out })), `out ${out}`).toBeCloseTo(0.86, 6);
    }
  });

  it('the two edges are independent', () => {
    const a = rimBand(tier, { inn: 0.1, out: 0.1 });
    const b = rimBand(tier, { inn: 0.4, out: 0.1 });
    expect(a.shape.radius).toBeCloseTo(b.shape.radius, 6);
    expect(innerEdge(a)).toBeGreaterThan(innerEdge(b));
  });

  it('refuses to turn itself inside out', () => {
    const b = rimBand(tier, { inn: 5, out: -2 });
    expect(b.bandInner).toBeGreaterThan(0);
    expect(b.bandInner).toBeLessThanOrEqual(1);
    expect(b.shape.radius).toBeCloseTo(tier.radius, 6);
  });
});

/* ⚠️ GYPSOPHILA GOES AROUND A ROSE, NOT THROUGH IT. Every florist-style reference puts the filler
 * hugging the subject and radiating outward, which is what makes the rose read as placed rather
 * than stuck on. Neither of the two placements that already existed can say it: `patches` gives a
 * disc, so flowers grow through the rose, and `hole` is an outline test against the TIER's own
 * centre, so it can only bite the middle out of the cake. */
describe('withoutCollarCentres — a ring around something already placed', () => {
  const seats = [];
  for (let x = -1; x <= 1; x += 0.1) for (let z = -1; z <= 1; z += 0.1) seats.push({ x, z });

  it('clears the footprint and keeps the ring', () => {
    const kept = withoutCollarCentres(seats, [{ x: 0, z: 0, inner: 0.5 }]);
    expect(kept.every(s => Math.hypot(s.x, s.z) >= 0.5 - 1e-9)).toBe(true);
    expect(kept.some(s => Math.hypot(s.x, s.z) > 0.6)).toBe(true);
    expect(kept.length).toBeLessThan(seats.length);
  });

  it('clears around EVERY rose, not just the first', () => {
    const kept = withoutCollarCentres(seats, [{ x: -0.6, z: 0, inner: 0.25 },
                                              { x: 0.6, z: 0, inner: 0.25 }]);
    for (const c of [[-0.6, 0], [0.6, 0]]) {
      expect(kept.some(s => Math.hypot(s.x - c[0], s.z - c[1]) < 0.25)).toBe(false);
    }
  });

  it('a collar with no footprint takes nothing away', () => {
    expect(withoutCollarCentres(seats, [{ x: 0, z: 0, inner: 0 }])).toHaveLength(seats.length);
    expect(withoutCollarCentres(seats, [])).toBe(seats);
    expect(withoutCollarCentres(seats, null)).toBe(seats);
  });

  it('leaves the seats it keeps untouched — they carry yaw and scale', () => {
    const rich = [{ x: 2, z: 0, yaw: 1.2, scale: 0.8 }];
    expect(withoutCollarCentres(rich, [{ x: 0, z: 0, inner: 0.5 }])[0]).toBe(rich[0]);
  });
});

/* ⚠️ MERGING IS NOT "SPRAYS ON TOP OF THE ROSE". A `liftOverDomes` that lifted seats onto each bloom
 * so sprigs lay across the petals was written, rendered, tested and then deleted: it looked right
 * at arm's length and was impossible, because zoomed in every stem ran THROUGH the rose. INVARIANTS
 * #3b — nothing a customer places may penetrate what is already there. Sandeep: *"you are inserting
 * into roses. that cannot happen in real. it should be between the rose bunch."*
 *
 * So BOTH arrangements clear every footprint and one function does both; what differs is the size
 * of the bite. These two cases are that distinction, and they are why the clearing function takes a
 * list rather than a single shape. */
describe('one bite or many: surrounding a bunch versus filling between it', () => {
  const grid = [];
  for (let x = -1.2; x <= 1.2; x += 0.04) for (let z = -1.2; z <= 1.2; z += 0.04) grid.push({ x, z });
  const roses = [{ x: -0.35, z: 0, r: 0.25 }, { x: 0.35, z: 0, r: 0.25 }];
  const gap = (s) => Math.abs(s.x) < 0.08 && Math.abs(s.z) < 0.08;   // between the two roses

  it('MERGE — one bite per rose leaves the gap between them filled', () => {
    const kept = withoutCollarCentres(grid, roses.map(r => ({ ...r, inner: r.r })));
    expect(kept.some(gap)).toBe(true);
    for (const r of roses) {
      expect(kept.some(s => Math.hypot(s.x - r.x, s.z - r.z) < r.r)).toBe(false);
    }
  });

  it('SURROUND — one bite over the whole bunch empties the gap too', () => {
    const kept = withoutCollarCentres(grid, [{ x: 0, z: 0, inner: 0.7 }]);
    expect(kept.some(gap)).toBe(false);
    expect(kept.some(s => Math.hypot(s.x, s.z) > 0.8)).toBe(true);
  });

  /* A sprig has width of its own, so clearing to the exact radius still lets its blooms clip the
     bloom it stands beside. The margin is what keeps contact from becoming penetration. */
  it('a margin on the bite clears more than the footprint itself', () => {
    const tight = withoutCollarCentres(grid, [{ x: 0, z: 0, inner: 0.25 }]).length;
    const margin = withoutCollarCentres(grid, [{ x: 0, z: 0, inner: 0.25 * 1.18 }]).length;
    expect(margin).toBeLessThan(tight);
  });
});
