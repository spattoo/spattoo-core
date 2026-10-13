import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { layAxis, instancedTriangleCount, outwardBand, rimBand,
         withoutCollarCentres, liftOverDomes } from './useSeatedInstances.js';

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

/* ⚠️ SURROUNDING AND MERGING ARE TWO DIFFERENT ARRANGEMENTS, and only the first existed at first.
 * Sandeep: *"you also surrounded the flower. surrounding and merging are two diff options."* Both
 * are in the references — the filler can ring a bloom and keep off it, or be part of the same mass
 * with sprays lying ACROSS it. `withoutCollarCentres` is the first; this is the second, and they
 * are opposites: one clears the footprint, the other keeps those seats and lifts them onto it. */
describe('liftOverDomes — merging into a bunch rather than ringing it', () => {
  const grid = [];
  for (let x = -1; x <= 1; x += 0.05) for (let z = -1; z <= 1; z += 0.05) grid.push({ x, z });
  const dome = [{ x: 0, z: 0, r: 0.5, height: 0.4 }];

  it('lifts seats onto the bloom and leaves the rest on the surface', () => {
    const out = liftOverDomes(grid, dome, { keep: 1 });
    const on = out.filter(s => Math.hypot(s.x, s.z) < 0.5);
    const off = out.filter(s => Math.hypot(s.x, s.z) > 0.6);
    expect(on.every(s => s.lift > 0)).toBe(true);
    expect(off.every(s => !s.lift)).toBe(true);
  });

  /* The dome's own profile — a spray at the centre rides highest and one at the rim sits on the
     surface, so the filler follows the bloom's curve instead of hovering on a disc above it. */
  it('follows the curve: highest at the centre, nothing at the rim', () => {
    const out = liftOverDomes(grid, dome, { keep: 1 });
    const at = (r) => out.find(s => Math.abs(Math.hypot(s.x, s.z) - r) < 0.03)?.lift ?? 0;
    expect(at(0.02)).toBeGreaterThan(at(0.25));
    expect(at(0.25)).toBeGreaterThan(at(0.47));
    expect(at(0.02)).toBeCloseTo(0.4, 1);
  });

  /* ⚠️ A FEW SPRAYS CROSS A BLOOM; A BLANKET DOES NOT. Keeping every seat that lands on a rose
     covered it completely and the flowers vanished under the filler — merging taken past the point
     where there is anything left to merge WITH. */
  it('keeps only a share of the seats that land on a bloom', () => {
    const all = liftOverDomes(grid, dome, { keep: 1 }).filter(s => s.lift > 0).length;
    const few = liftOverDomes(grid, dome, { keep: 0.2 }).filter(s => s.lift > 0).length;
    expect(few).toBeGreaterThan(0);
    expect(few).toBeLessThan(all * 0.45);
  });

  it('never drops a seat that is not on a bloom', () => {
    const off = (arr) => arr.filter(s => Math.hypot(s.x, s.z) > 0.6).length;
    expect(off(liftOverDomes(grid, dome, { keep: 0.05 }))).toBe(off(grid));
  });

  it('is stable for a seed', () => {
    const a = liftOverDomes(grid, dome, { keep: 0.3, seed: 5 });
    const b = liftOverDomes(grid, dome, { keep: 0.3, seed: 5 });
    expect(a.length).toBe(b.length);
    expect(a.map(s => s.lift ?? 0)).toEqual(b.map(s => s.lift ?? 0));
  });

  it('two overlapping blooms: the taller one wins', () => {
    const out = liftOverDomes([{ x: 0, z: 0 }],
                              [{ x: 0, z: 0, r: 0.5, height: 0.2 },
                               { x: 0.1, z: 0, r: 0.5, height: 0.9 }], { keep: 1 });
    expect(out[0].lift).toBeGreaterThan(0.2);
  });

  it('no domes, nothing changed', () => {
    expect(liftOverDomes(grid, null)).toBe(grid);
    expect(liftOverDomes(grid, [])).toBe(grid);
  });
});
