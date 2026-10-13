import { describe, it, expect } from 'vitest';
import { wallSeats, withoutWallOccupants, wallOccupants } from './wallSeats.js';

const ROUND = { kind: 'round', radius: 1.2 };
const SHEET = { kind: 'rect', halfW: 1.2, halfD: 0.9, cornerR: 0.18 };

describe('wallSeats', () => {
  it('puts every seat on the wall, not inside or outside it', () => {
    for (const s of wallSeats(ROUND, { height: 1.45 })) {
      expect(Math.hypot(s.x, s.z)).toBeCloseTo(1.2, 5);
    }
  });

  /* ⚠️ THE BAND IS A FRACTION OF THE TIER, which is INVARIANTS #8 in one assertion: the same
     control on a short tier and a tall one must mean the same thing about the cake. */
  it('keeps the band inside the fractions it was given, at any tier height', () => {
    for (const h of [0.9, 1.45, 2.4]) {
      const seats = wallSeats(ROUND, { height: h, lo: 0.2, hi: 0.6 });
      expect(seats.length).toBeGreaterThan(0);
      for (const s of seats) {
        expect(s.dy).toBeGreaterThanOrEqual(0.2 * h - 1e-9);
        expect(s.dy).toBeLessThanOrEqual(0.6 * h + 1e-9);
      }
    }
  });

  it('points every seat outward, away from the cake', () => {
    for (const s of wallSeats(ROUND, { height: 1.45 })) {
      // `out` is the bearing atan2(x, z) for a circle — the normal IS the polar direction.
      expect(Math.sin(s.out)).toBeCloseTo(s.x / 1.2, 5);
      expect(Math.cos(s.out)).toBeCloseTo(s.z / 1.2, 5);
    }
  });

  it('buries the cut end INWARD, not downward', () => {
    const bare   = wallSeats(ROUND, { height: 1.45, bury: 0, seed: 3 });
    const buried = wallSeats(ROUND, { height: 1.45, bury: 0.05, seed: 3 });
    expect(buried.length).toBe(bare.length);
    expect(Math.hypot(buried[0].x, buried[0].z)).toBeCloseTo(1.2 - 0.05, 5);
    expect(buried[0].dy).toBeCloseTo(bare[0].dy, 10);   // height is untouched
  });

  it('is STABLE: the same seed seats the same field twice', () => {
    expect(wallSeats(ROUND, { height: 1.45, seed: 11 }))
      .toEqual(wallSeats(ROUND, { height: 1.45, seed: 11 }));
  });

  it('walks a sheet outline as readily as a circle', () => {
    const seats = wallSeats(SHEET, { height: 1.45 });
    expect(seats.length).toBeGreaterThan(0);
    // Every seat on the rounded rectangle's edge: inside the box, outside its inner rectangle.
    for (const s of seats) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(1.2 + 1e-6);
      expect(Math.abs(s.z)).toBeLessThanOrEqual(0.9 + 1e-6);
    }
  });

  it('covers only the arc it was given', () => {
    const all = wallSeats(ROUND, { height: 1.45 });
    const part = wallSeats(ROUND, { height: 1.45, from: 0, to: 0.25 });
    expect(part.length).toBeLessThan(all.length);
    expect(part.length).toBeGreaterThan(0);
    // A quarter turn from s=0 — the arc from +Z round towards +X on this parameterisation.
    for (const s of part) expect(s.x).toBeGreaterThan(-1e-6);
  });

  it('wraps an arc that runs past the back of the cake', () => {
    const seats = wallSeats(ROUND, { height: 1.45, from: 0.9, to: 0.1 });
    expect(seats.length).toBeGreaterThan(0);
    // One fifth of the way round, whichever side of the seam it started.
    expect(seats.length).toBeLessThan(wallSeats(ROUND, { height: 1.45 }).length / 3);
  });

  it('a band of no height is still a line of flowers, not none', () => {
    expect(wallSeats(ROUND, { height: 1.45, lo: 0.4, hi: 0.4 }).length).toBeGreaterThan(0);
  });
});

/* ⚠️ THE NORMAL CASE ON A WALL, and the band is the exception. *"flowers on side is mostly hand
   drawn. usually people wont cover the entire side with these flowers. on sides, its usually along
   with other flowers."* */
/* ⚠️ `u` IS THE APP'S `u`, measured from the cake's FRONT: x = R·sin(u·2π), z = R·cos(u·2π), which
   is how `FinishHandles` places a side handle and how every side sticker stores its `theta`.
   `circlePerimeter.at(s)` starts at +X instead, a quarter turn away — so `wallSeats` converts, and
   these tests assert the app's convention. Getting it the other way round puts a clump's drag
   handle on the front of the cake and its flowers on the right, which looks exactly like the filter
   not working at all. */
describe('wallSeats clumps', () => {
  it('seats only inside the clumps it was given', () => {
    const per = 2 * Math.PI * 1.2;
    const seats = wallSeats(ROUND, { height: 1.45, spacing: 0.04,
                                     patches: [{ u: 0.25, v: 0.5, r: 0.3 }] });
    expect(seats.length).toBeGreaterThan(0);
    for (const s of seats) {
      // u = 0.25 is a quarter way round from the seam; measure in the unrolled wall.
      let ds = Math.abs(((Math.atan2(s.x, s.z) * 1.2) % per + per) % per - 0.25 * per);
      if (ds > per / 2) ds = per - ds;
      expect(Math.hypot(ds, s.dy - 0.5 * 1.45)).toBeLessThan(0.3);
    }
  });

  it('puts far fewer flowers on the cake than a band does', () => {
    const band = wallSeats(ROUND, { height: 1.45, spacing: 0.06 });
    const clump = wallSeats(ROUND, { height: 1.45, spacing: 0.06,
                                     patches: [{ u: 0.5, v: 0.5, r: 0.3 }] });
    expect(clump.length).toBeLessThan(band.length / 4);
    expect(clump.length).toBeGreaterThan(0);
  });

  it('is ROUND on the cake, not an ellipse', () => {
    const seats = wallSeats(ROUND, { height: 1.45, spacing: 0.03,
                                     patches: [{ u: 0, v: 0.5, r: 0.35 }] });
    const across = Math.max(...seats.map(s => Math.abs(Math.atan2(s.x, s.z) * 1.2)));
    const up = Math.max(...seats.map(s => Math.abs(s.dy - 0.5 * 1.45)));
    // Both reach about the same distance — a clump measured in (u, v) would not.
    expect(Math.abs(across - up)).toBeLessThan(0.1);
  });

  /* A clump at u=0.98 must still catch a seat at u=0.01 — the seam is not a wall. */
  it('wraps across the seam', () => {
    const seats = wallSeats(ROUND, { height: 1.45, spacing: 0.03,
                                     patches: [{ u: 0, v: 0.5, r: 0.3 }] });
    expect(seats.some(s => Math.atan2(s.x, s.z) > 0)).toBe(true);
    expect(seats.some(s => Math.atan2(s.x, s.z) < 0)).toBe(true);
  });

  /* ⚠️ A CLUMP CARRIES ITS OWN HEIGHT, so touching the band's edges must not move one a baker has
     already placed. The band's slice applies only when there are no clumps. */
  it('ignores the band when clumps are placed', () => {
    const low = wallSeats(ROUND, { height: 1.45, spacing: 0.04, lo: 0, hi: 0.2,
                                   patches: [{ u: 0, v: 0.8, r: 0.25 }] });
    expect(low.length).toBeGreaterThan(0);
    for (const s of low) expect(s.dy).toBeGreaterThan(0.2 * 1.45);
  });

  /* ⚠️ THE TEST THAT PINS THE TWO CONVENTIONS TOGETHER. `FinishHandles` draws a side handle at
     (R·sin(u·2π), cy + v·h, R·cos(u·2π)). If `wallSeats` ever reads `u` differently, the dot a
     baker grabs and the flowers it is supposed to be holding drift apart — silently, and by a
     quarter turn on a round cake, which reads as "dragging does nothing to that clump". */
  it('seats the flowers where FinishHandles draws the handle', () => {
    for (const u of [0, 0.125, 0.4, 0.75]) {
      const seats = wallSeats(ROUND, { height: 1.45, spacing: 0.03,
                                       patches: [{ u, v: 0.5, r: 0.3 }] });
      expect(seats.length).toBeGreaterThan(0);
      const hx = 1.2 * Math.sin(u * Math.PI * 2);
      const hz = 1.2 * Math.cos(u * Math.PI * 2);
      const hy = 0.5 * 1.45;
      for (const s of seats) {
        expect(Math.hypot(s.x - hx, s.z - hz, s.dy - hy)).toBeLessThan(0.32);
      }
    }
  });

  it('still clears what is already on the wall', () => {
    const bare = wallSeats(ROUND, { height: 1.45, spacing: 0.03, seed: 4,
                                    patches: [{ u: 0, v: 0.5, r: 0.35 }] });
    const past = wallSeats(ROUND, { height: 1.45, spacing: 0.03, seed: 4,
                                    patches: [{ u: 0, v: 0.5, r: 0.35 }],
                                    avoid: [{ x: 0, z: 1.2, dy: 0.5 * 1.45, r: 0.15 }] });
    expect(past.length).toBeLessThan(bare.length);
    expect(past.length).toBeGreaterThan(0);
  });
});

describe('withoutWallOccupants', () => {
  /* ⚠️ THE TEST THAT IS THE WHOLE REASON THIS FILE EXISTS. A flat (x, z) clearance would take out
     every seat in the column above and below a rose, because on a wall they all share one (x, z) —
     a stripe from the board to the rim for each thing on the side. */
  it('clears around a thing on the wall, not the whole column above it', () => {
    const seats = wallSeats(ROUND, { height: 1.45, lo: 0.05, hi: 0.95, spacing: 0.05, seed: 5 });
    const rose = { x: 1.2 * Math.sin(0), z: 1.2 * Math.cos(0), dy: 0.72, r: 0.18 };
    const kept = withoutWallOccupants(seats, [rose]);
    expect(kept.length).toBeLessThan(seats.length);          // it cleared something
    // …and something survives in the SAME column, high above and low below the rose.
    const column = kept.filter(s => Math.hypot(s.x - rose.x, s.z - rose.z) < 0.12);
    expect(column.some(s => s.dy > rose.dy + 0.25)).toBe(true);
    expect(column.some(s => s.dy < rose.dy - 0.25)).toBe(true);
  });

  it('leaves nothing inside the footprint it was asked to clear', () => {
    const seats = wallSeats(ROUND, { height: 1.45, spacing: 0.04, seed: 9 });
    const rose = { x: 0, z: 1.2, dy: 0.6, r: 0.2 };
    for (const s of withoutWallOccupants(seats, [rose])) {
      const d = Math.hypot(s.x - rose.x, s.z - rose.z, s.dy - rose.dy);
      expect(d).toBeGreaterThanOrEqual(0.2);                 // its own radius, before the margin
    }
  });

  it('passes the field through untouched when the wall is bare', () => {
    const seats = wallSeats(ROUND, { height: 1.45 });
    expect(withoutWallOccupants(seats, [])).toBe(seats);
    expect(withoutWallOccupants(seats, null)).toBe(seats);
  });
});

describe('wallOccupants', () => {
  it('reads a round wall decoration off theta and y', () => {
    const got = wallOccupants(
      [{ id: 'a', tierIndex: 0, zone: 'side', theta: Math.PI / 2, y: 0.9, scale: 1 }],
      { tierIndex: 0, shape: ROUND, baseY: 0.2 });
    expect(got).toHaveLength(1);
    expect(got[0].x).toBeCloseTo(1.2, 5);     // sin(π/2) · R
    expect(got[0].z).toBeCloseTo(0, 5);
    expect(got[0].dy).toBeCloseTo(0.7, 5);    // y, measured from the tier's own base
  });

  it('ignores what is not on this wall', () => {
    const stickers = [
      { id: 'top', tierIndex: 0, zone: 'top_surface', x: 0, z: 0, y: 1.6 },
      { id: 'other', tierIndex: 1, zone: 'side', theta: 0, y: 2.4 },
      { id: 'mine', tierIndex: 0, zone: 'side', theta: 0, y: 0.8 },
    ];
    const got = wallOccupants(stickers, { tierIndex: 0, shape: ROUND });
    expect(got.map(o => o.id)).toEqual(['mine']);
  });

  it('counts a middle-tier decoration as on the wall, because it is', () => {
    const got = wallOccupants([{ id: 'm', tierIndex: 0, zone: 'middle_tier', theta: 0, y: 1 }],
                              { tierIndex: 0, shape: ROUND });
    expect(got).toHaveLength(1);
  });

  it('scales the footprint with the piece', () => {
    const one = wallOccupants([{ id: 'a', tierIndex: 0, zone: 'side', theta: 0, y: 1, scale: 1 }],
                              { tierIndex: 0, shape: ROUND })[0];
    const two = wallOccupants([{ id: 'a', tierIndex: 0, zone: 'side', theta: 0, y: 1, scale: 2 }],
                              { tierIndex: 0, shape: ROUND })[0];
    expect(two.r).toBeCloseTo(one.r * 2, 10);
  });
});
