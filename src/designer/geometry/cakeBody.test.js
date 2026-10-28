import { describe, it, expect } from 'vitest';
import { cakeBody, clampOutsideBody } from './cakeBody.js';
import { BOTTOM_BASE } from '../constants.js';

/* The cake as a solid, for a hand-placed piece. The rule these all protect: free hand releases the
   SEATING rules, never the fact that there is already cake there. */

const TIERS = [
  { radius: 1.2, baseY: 0.1, height: 1.0 },      // bottom: y 0.10 → 1.10, r 1.2
  { radius: 0.8, baseY: 1.1, height: 0.8 },      // top:    y 1.10 → 1.90, r 0.8
];
const BOARD = { kind: 'round', radius: 1.8 };

// A piece with no size of its own, so a test says exactly where the CAKE's surface is.
const POINT = { hy: 0, reachAt: () => 0 };
// …and one with a body, for the tests about clearing rather than touching.
const BODY_PIECE = { hy: 0.2, reachAt: () => 0.15 };

describe('cakeBody — slabs, not a silhouette', () => {
  it('gives one slab per tier, over that tier\'s own vertical band', () => {
    const body = cakeBody(TIERS);
    expect(body).toHaveLength(2);
    expect(body[0].yBottom).toBeCloseTo(0.1, 6);
    expect(body[0].yTop).toBeCloseTo(1.1, 6);
    expect(body[1].yBottom).toBeCloseTo(1.1, 6);
    expect(body[1].yTop).toBeCloseTo(1.9, 6);
  });

  it('adds the board as a floor rather than a slab', () => {
    const body = cakeBody(TIERS, BOARD);
    const drum = body[body.length - 1];
    expect(drum.yTop).toBe(BOTTOM_BASE);
    expect(drum.floor).toBe(true);
  });

  it('survives a cake with no tiers', () => {
    expect(cakeBody([], null)).toEqual([]);
    expect(cakeBody(undefined)).toEqual([]);
  });

  it('skips a tier with no resolved position rather than inventing one', () => {
    expect(cakeBody([{ radius: 1 }, ...TIERS])).toHaveLength(2);
  });
});

describe('clampOutsideBody — the wall stops a solid body', () => {
  const body = cakeBody(TIERS, BOARD);

  it('leaves a piece that is already outside exactly where it is', () => {
    const at = { x: 2.0, y: 0.6, z: 0 };
    expect(clampOutsideBody(body, at, POINT)).toEqual(at);
  });

  it('pushes a piece dragged into the bottom wall back out to it', () => {
    const out = clampOutsideBody(body, { x: 0.9, y: 0.6, z: 0 }, POINT);
    expect(out.x).toBeCloseTo(1.2, 4);      // the tier's own radius
    expect(out.y).toBeCloseTo(0.6, 4);      // and it does not jump in height
  });

  it('clears by the piece\'s own reach, so a body touches rather than overlaps', () => {
    const out = clampOutsideBody(body, { x: 0.9, y: 0.6, z: 0 }, BODY_PIECE);
    expect(out.x).toBeCloseTo(1.35, 4);     // 1.2 + its 0.15 half-width
  });

  it('pushes out along the direction it came from, not along an axis', () => {
    // Just inside the wall on the 45°, where sideways is the short way out.
    const out = clampOutsideBody(body, { x: 0.8, y: 0.3, z: 0.8 }, POINT);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(1.2, 4);
    expect(out.x).toBeCloseTo(out.z, 6);    // the 45° it was on
  });

  /* ⚠️ THE CASE A SINGLE SILHOUETTE WOULD REFUSE. The visible ring of the bottom tier is inside the
     bottom tier's own footprint; a piece standing on it is where it belongs. */
  it('leaves a piece standing on the lower tier beside the upper one', () => {
    const at = { x: 1.0, y: 1.3, z: 0 };    // outside r 0.8, inside r 1.2, in the UPPER band
    expect(clampOutsideBody(body, at, POINT)).toEqual(at);
  });

  it('stops that piece at the upper tier\'s wall when it is dragged into it', () => {
    const out = clampOutsideBody(body, { x: 0.5, y: 1.3, z: 0 }, POINT);
    expect(out.x).toBeCloseTo(0.8, 4);
    expect(out.y).toBeCloseTo(1.3, 4);
  });

  it('leaves a piece above the whole stack alone', () => {
    const at = { x: 0, y: 2.5, z: 0 };
    expect(clampOutsideBody(body, at, POINT)).toEqual(at);
  });
});

describe('clampOutsideBody — the smallest of three pushes', () => {
  const body = cakeBody(TIERS, BOARD);

  /* Lowered onto the middle of a tier, the way out is UP. Resolving horizontally would shove a
     piece the baker is setting down in the centre out to the rim, which is not where it was going. */
  it('rests a piece lowered onto the top surface ON it', () => {
    const out = clampOutsideBody(body, { x: 0, y: 1.88, z: 0 }, POINT);
    expect(out.y).toBeCloseTo(1.9, 4);
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it('rests it on its own base, not its centre', () => {
    const out = clampOutsideBody(body, { x: 0, y: 1.85, z: 0 }, BODY_PIECE);
    expect(out.y).toBeCloseTo(1.9 + 0.2, 4);
  });

  it('pushes sideways when the piece came in through the wall', () => {
    // Deep in the bottom tier's band but close to its wall: sideways is the short way out.
    const out = clampOutsideBody(body, { x: 1.1, y: 0.5, z: 0 }, POINT);
    expect(out.x).toBeCloseTo(1.2, 4);
    expect(out.y).toBeCloseTo(0.5, 4);
  });

  /* ⚠️ THE FAULT THE HARNESS FOUND. The first version offered a push DOWN as well, and took the
     shortest of the three — so a piece low in a tier left through its underside, dropped onto the
     board and stood there, underneath the cake. Measured on the satin bow: (0.20, 0.75) came back
     (0.20, 0.66). Below a tier is the board or the tier beneath it; it is never open space. */
  it('never drops a piece out through the bottom of a tier', () => {
    const out = clampOutsideBody(body, { x: 0.2, y: 0.25, z: 0 }, POINT);
    expect(out.y).toBeGreaterThanOrEqual(0.25);
    expect(Math.hypot(out.x, out.z) >= 1.2 - 1e-6 || out.y >= 1.1 - 1e-6).toBe(true);
  });

  it('stands a piece pushed down through the board on top of it', () => {
    const out = clampOutsideBody(body, { x: 1.5, y: -0.4, z: 0 }, POINT);
    expect(out.y).toBeCloseTo(BOTTOM_BASE, 4);
  });

  /* ⚠️ A FLOOR, NOT AN OBSTACLE. Modelled as an ordinary slab the drum let a piece take the
     shortest way out, which near its edge is SIDEWAYS — squeezing out from under the board rather
     than standing on it. Nobody puts a decoration under a cake board. */
  it('lifts a piece out from under the board rather than sliding it out sideways', () => {
    const out = clampOutsideBody(body, { x: 1.7, y: -0.4, z: 0 }, POINT);
    expect(out.y).toBeCloseTo(BOTTOM_BASE, 4);
    expect(out.x).toBeCloseTo(1.7, 4);
  });

  it('never resolves a board collision downwards', () => {
    const out = clampOutsideBody(body, { x: 1.5, y: -5, z: 0 }, POINT);
    expect(out.y).toBeCloseTo(BOTTOM_BASE, 4);
  });

  it('leaves a piece beside the board, below its level, alone', () => {
    const at = { x: 3.0, y: -0.4, z: 0 };
    expect(clampOutsideBody(body, at, POINT)).toEqual(at);
  });

  it('settles against both tiers at once rather than ping-ponging', () => {
    const out = clampOutsideBody(body, { x: 0.1, y: 1.05, z: 0 }, POINT);
    // Wherever it lands, it is in neither tier.
    const r = Math.hypot(out.x, out.z);
    const inBottom = out.y > 0.1 && out.y < 1.1 && r < 1.2 - 1e-6;
    const inTop = out.y > 1.1 && out.y < 1.9 && r < 0.8 - 1e-6;
    expect(inBottom || inTop).toBe(false);
  });
});

describe('clampOutsideBody — when it must not act at all', () => {
  it('is a no-op with no body, so a cake with no tiers constrains nothing', () => {
    const at = { x: 0, y: 0, z: 0 };
    expect(clampOutsideBody([], at, POINT)).toBe(at);
  });

  it('hands back a non-finite position untouched rather than writing NaN', () => {
    const at = { x: NaN, y: 0, z: 0 };
    expect(clampOutsideBody(cakeBody(TIERS), at, POINT)).toBe(at);
  });

  it('treats a piece with no declared size as a point', () => {
    const out = clampOutsideBody(cakeBody(TIERS), { x: 0.9, y: 0.6, z: 0 }, {});
    expect(out.x).toBeCloseTo(1.2, 4);
  });

  /* Dead centre has no outward direction. +z is the FRONT of the cake, always in view, which is the
     same choice boardRingClamp makes — an arbitrary axis can hide the piece behind the cake. */
  it('pushes a piece at dead centre toward the front', () => {
    // A tall pillar, so sideways is unambiguously the short way out of the middle of it.
    const out = clampOutsideBody([{ shape: { kind: 'round', radius: 1 }, yBottom: 0, yTop: 20 }],
      { x: 0, y: 10, z: 0 }, POINT);
    expect(out.z).toBeCloseTo(1, 4);
    expect(out.x).toBeCloseTo(0, 6);
  });
});

describe('clampOutsideBody — a rectangular cake', () => {
  // Tall, so the horizontal push is always the shortest and these test the FOOTPRINT, not the pick.
  const body = [{ shape: { kind: 'rect', halfW: 1.0, halfD: 0.6 }, yBottom: 0, yTop: 20 }];

  it('stops at the short side, not at a bounding circle', () => {
    const out = clampOutsideBody(body, { x: 0, y: 10, z: 0.3 }, POINT);
    expect(out.z).toBeCloseTo(0.6, 4);
  });

  it('stops at the long side on the other axis', () => {
    const out = clampOutsideBody(body, { x: 0.5, y: 10, z: 0 }, POINT);
    expect(out.x).toBeCloseTo(1.0, 4);
  });
});
