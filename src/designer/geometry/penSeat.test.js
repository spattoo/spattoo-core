import { describe, it, expect } from 'vitest';
import { pickSeat } from './penSeat.js';

/* The rule these cover: piping onto piping is the point of a mane, and before this the pen kept only
   hits tagged `isPenCatcher`, so a placed piece was invisible to the ray and every stamp landed on
   the CAKE however much cream was already standing there. */

const cake = (y = 1.5) => ({
  userData: { isPenCatcher: true },
  point: [0, y, 0],
  faceNormal: [0, 1, 0],
});

const cream = (y = 1.6, grow = [0, 1, 0], faceNormal = [0.6, 0.8, 0]) => ({
  userData: { isPenSeat: true, strokeId: 's1', grow },
  point: [0, y, 0],
  faceNormal,
});

describe('pickSeat', () => {
  it('returns null when the ray struck nothing pipeable', () => {
    expect(pickSeat([])).toBeNull();
    expect(pickSeat([{ userData: {}, point: [0, 0, 0], faceNormal: [0, 1, 0] }])).toBeNull();
  });

  it('lifts a seat on the CAKE by the rope radius, so cream rests on it rather than cutting in', () => {
    const s = pickSeat([cake(1.5)], { thickness: 0.05 });
    expect(s.onCream).toBe(false);
    expect(s.point[1]).toBeCloseTo(1.55, 6);
    expect(s.normal).toEqual([0, 1, 0]);
  });

  /* The change itself. Before it, this hit was discarded and the seat fell through to the cake. */
  it('seats on CREAM when a placed piece is nearer than the cake behind it', () => {
    const s = pickSeat([cream(1.6), cake(1.5)], { thickness: 0.05 });
    expect(s.onCream).toBe(true);
    expect(s.point[1]).toBeCloseTo(1.65, 6);
  });

  /* ⚠️ THE LIFT APPLIES ON CREAM TOO, and the first version of this file asserted the opposite. The
     stored point is a centreline one radius above the surface, and `stampTransforms` subtracts that
     radius unconditionally when it places the piece — so a seat with no lift makes the renderer
     subtract something nobody added, and the stacked piece sinks into the one below. Caught by
     measuring on a real cake: two taps at one point put the second 0.0754 BELOW the first. */
  it('lifts a cream seat by the rope radius, the same as a cake seat', () => {
    const thin = pickSeat([cream(1.6)], { thickness: 0.01 });
    const fat  = pickSeat([cream(1.6)], { thickness: 0.30 });
    expect(thin.point[1]).toBeCloseTo(1.61, 6);
    expect(fat.point[1]).toBeCloseTo(1.90, 6);
  });

  /* Cake and cream differ in WHICH WAY the piece grows, never in the lift. */
  it('treats cake and cream alike for the lift, at the same hit point', () => {
    const onCake  = pickSeat([cake(1.6)], { thickness: 0.05 });
    const onCream = pickSeat([cream(1.6)], { thickness: 0.05 });
    expect(onCream.point[1]).toBeCloseTo(onCake.point[1], 6);
  });

  /* ⚠️ THE PIECE BELOW DECIDES WHICH WAY THE NEXT ONE GROWS, not the facet the ray happened to
     strike. A rosette's face normals swing right round between crests and creases. */
  it('grows along the piece’s own stored normal, not the struck face', () => {
    const s = pickSeat([cream(1.6, [0, 1, 0], [0.6, 0.8, 0])]);
    expect(s.normal).toEqual([0, 1, 0]);
  });

  it('falls back to the struck face when a piece carries no usable grow', () => {
    expect(pickSeat([cream(1.6, null)]).normal[0]).toBeCloseTo(0.6, 6);
    expect(pickSeat([cream(1.6, [0, 0, 0])]).normal[0]).toBeCloseTo(0.6, 6);
  });

  it('normalises a stored grow that is not unit length', () => {
    const s = pickSeat([cream(1.6, [0, 4, 0])]);
    expect(s.normal).toEqual([0, 1, 0]);
  });

  /* Distance order is the raycaster's, and it is the whole of "whatever the tip touches": the cake
     in front of a piece wins, exactly as the piece in front of the cake does. */
  it('takes the nearest hit either way round', () => {
    expect(pickSeat([cake(1.5), cream(1.6)]).onCream).toBe(false);
    expect(pickSeat([cream(1.6), cake(1.5)]).onCream).toBe(true);
  });
});
