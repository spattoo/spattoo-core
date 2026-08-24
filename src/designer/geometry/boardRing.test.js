import { describe, it, expect } from 'vitest';
import { boardRingClamp, shapeReach } from './surface.js';

// A 6" round cake on its drum: boardOf() gives radius + 0.6.
const CAKE  = { kind: 'round', radius: 1.2 };
const BOARD = { kind: 'round', radius: 1.8 };

const rOf = p => Math.hypot(p.x, p.z);

describe('shapeReach', () => {
  it('is the radius for a round shape, whatever the direction', () => {
    expect(shapeReach(CAKE, { x: 1, z: 0 })).toBeCloseTo(1.2, 6);
    expect(shapeReach(CAKE, { x: 0, z: 1 })).toBeCloseTo(1.2, 6);
    const d = Math.SQRT1_2;
    expect(shapeReach(CAKE, { x: d, z: d })).toBeCloseTo(1.2, 6);
  });

  it('reaches the CORNER of a rect, not just its edge', () => {
    // The support function of a box. Getting this wrong the easy way (min of the half-extents) would
    // let a decoration sit inside a sheet cake's corner, which is the one place it is most buried.
    const rect = { kind: 'rect', halfW: 2, halfD: 1 };
    expect(shapeReach(rect, { x: 1, z: 0 })).toBeCloseTo(2, 6);
    expect(shapeReach(rect, { x: 0, z: 1 })).toBeCloseTo(1, 6);
    const d = Math.SQRT1_2;
    expect(shapeReach(rect, { x: d, z: d })).toBeCloseTo(d * 2 + d * 1, 6);
  });

  it('uses the furthest vertex for an authored outline', () => {
    // A crude heart-ish outline: the lobes reach further than the inscribed circle would suggest.
    const heart = { outline: [{ x: 0, z: -1 }, { x: 1.4, z: 0.2 }, { x: 0, z: 1 }, { x: -1.4, z: 0.2 }] };
    expect(shapeReach(heart, { x: 1, z: 0 })).toBeCloseTo(1.4, 6);
  });
});

describe('boardRingClamp', () => {
  it('leaves a point that is already in the ring alone', () => {
    const p = boardRingClamp(BOARD, CAKE, 1.5, 0);
    expect(p.x).toBeCloseTo(1.5, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  it('pushes a point that is UNDER the cake back out to its edge', () => {
    // This is the whole reason the helper exists: on a plain topClamp the point stays where it is,
    // the cake is opaque, and the decoration vanishes with nothing left to grab.
    const p = boardRingClamp(BOARD, CAKE, 0.3, 0);
    expect(rOf(p)).toBeCloseTo(1.2, 6);
    expect(p.z).toBeCloseTo(0, 6);       // keeps the direction it was dragged toward
  });

  it('keeps a point that is off the BOARD on the board', () => {
    const p = boardRingClamp(BOARD, CAKE, 5, 0);
    expect(rOf(p)).toBeCloseTo(1.8, 6);
  });

  it('clears the cake by the decoration\'s own half-width', () => {
    // margin is the footprint's half-width: at the cake edge its inner half would still be buried.
    const p = boardRingClamp(BOARD, CAKE, 1.2, 0, 0.25);
    expect(rOf(p)).toBeCloseTo(1.45, 6);
  });

  it('sends a point at DEAD CENTRE to the front, not to an arbitrary axis', () => {
    // (0,0) has no outward direction. +z is the front of the cake — always visible, and where a
    // decoration is most likely wanted. Anything else is a coin toss the baker has to undo.
    const p = boardRingClamp(BOARD, CAKE, 0, 0);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(1.2, 6);
  });

  it('prefers standing PROUD of the board over standing inside the cake', () => {
    // A board barely wider than its cake has a ring thinner than the decoration, so no position
    // satisfies both constraints. Off the edge is recoverable — you can see it and drag it. Inside an
    // opaque cake is not.
    const tight = { kind: 'round', radius: 1.25 };
    const p = boardRingClamp(tight, CAKE, 0.2, 0, 0.3);
    expect(rOf(p)).toBeCloseTo(1.5, 6);       // cake radius + margin, past the board's 1.25
  });

  it('works on a rect board with a rect cake — a sheet on its board', () => {
    const board = { kind: 'rect', halfW: 2.5, halfD: 1.8 };
    const cake  = { kind: 'rect', halfW: 1.8, halfD: 1.1 };
    const inside = boardRingClamp(board, cake, 0.2, 0.2);
    // Pushed out along its own direction until it clears the cake's box.
    expect(shapeReach(cake, { x: inside.x / rOf(inside), z: inside.z / rOf(inside) }))
      .toBeLessThanOrEqual(rOf(inside) + 1e-6);
  });

  it('is a plain board clamp when there is no cake to avoid', () => {
    // Defensive: a board with no bottom tier resolved should still clamp rather than throw.
    const p = boardRingClamp(BOARD, null, 5, 0);
    expect(rOf(p)).toBeCloseTo(1.8, 6);
  });
});
