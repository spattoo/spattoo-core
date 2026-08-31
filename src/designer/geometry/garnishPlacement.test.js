import { describe, it, expect } from 'vitest';
import { movableContract } from './movableContract.js';
import { GARNISH_DEFAULTS, garnishPlacement, garnishDragTo, clampRadius } from './garnishPlacement.js';

const CAKE = { radius: 1.2, topY: 1.55, boardY: 0.1 };
const PIECE = { w: 0.6, h: 0.5 };

describe('where a garnish sits', () => {
  /* ⚠️ A STANDING PIECE IS BURIED, a lying one RESTS. Exactly on the surface reads as floating, which
   * is the one tell that separates a render from a photograph. */
  it('buries a standing piece and rests a lying one', () => {
    const stand = garnishPlacement({ mode: 'stand' }, CAKE, PIECE);
    const lie   = garnishPlacement({ mode: 'lie' }, CAKE, PIECE);
    expect(stand.position[1]).toBeLessThan(CAKE.topY);
    expect(lie.position[1]).toBeGreaterThan(CAKE.topY);
  });

  /* ⚠️ RADIUS IS A FRACTION of the tier, so "near the edge" stays near the edge when the customer
   * resizes the cake — which they do constantly. Storing world x/z would put this piece off the
   * edge of a smaller tier. */
  it('scales its distance with the tier rather than holding a world position', () => {
    const small = garnishPlacement({ radius: 0.8 }, { ...CAKE, radius: 0.8 }, PIECE);
    const big   = garnishPlacement({ radius: 0.8 }, { ...CAKE, radius: 1.6 }, PIECE);
    const out = p => Math.hypot(p.position[0], p.position[2]);
    expect(out(big)).toBeCloseTo(out(small) * 2, 5);
  });

  // It cannot be pushed over the rim: a piece half over air reads as an accident.
  it('keeps the piece off the edge', () => {
    expect(clampRadius(5)).toBeLessThanOrEqual(0.88);
    expect(clampRadius(-3)).toBe(0);
    const p = garnishPlacement({ radius: 9 }, CAKE, PIECE);
    expect(Math.hypot(p.position[0], p.position[2])).toBeLessThan(CAKE.radius);
  });

  /* ⚠️ FACING IS RELATIVE TO WHERE IT STANDS. A standing garnish should present itself square-on
   * from outside, so moving it round the cake must re-aim it — otherwise every piece needs turning
   * by hand after every move. */
  /* ⚠️ CHECK THE DIRECTION IT FACES, NOT JUST THAT IT CHANGED. The first version of this compared
   * two placements and asserted the difference — which is identical whether the formula is −θ or
   * π/2 − θ. It passed while every standing garnish stood EDGE-ON to the room, a sliver, and only a
   * render showed it. A relative assertion cannot see an absolute error. */
  it('turns its face outward, away from the middle of the cake', () => {
    for (const theta of [0, 0.8, Math.PI / 2, 2.7, -1.2]) {
      const { rotation } = garnishPlacement({ theta }, CAKE, PIECE);
      const phi = rotation[1];
      // the piece is built in the XY plane, so its face looks along +Z; a Y-turn of φ sends that to:
      const face = [Math.sin(phi), Math.cos(phi)];
      const outward = [Math.cos(theta), Math.sin(theta)];
      expect(face[0]).toBeCloseTo(outward[0], 6);
      expect(face[1]).toBeCloseTo(outward[1], 6);
    }
  });

  it('adds the customer yaw on top of that, rather than replacing it', () => {
    const plain = garnishPlacement({ theta: 1 }, CAKE, PIECE);
    const eased = garnishPlacement({ theta: 1, yaw: 0.3 }, CAKE, PIECE);
    expect(eased.rotation[1] - plain.rotation[1]).toBeCloseTo(0.3, 6);
  });

  /* ⚠️ A DRAG RETURNS ONLY WHAT IT CHANGES. Anything else it hands back would overwrite a setting
   * the customer made — the size they chose, whether they laid the piece flat — every time they
   * nudged it. The movable contract enforces this; this states it in one place for a reader. */
  it('returns only the position keys, so a drag cannot reset size or mode', () => {
    const before = { ...GARNISH_DEFAULTS, scale: 1.6, mode: 'lie' };
    const after = garnishDragTo(before, CAKE, 0.25, 0.4);
    expect(Object.keys(after).sort()).toEqual(['radius', 'theta']);
    expect(after.theta).toBeCloseTo(Math.PI / 2, 6);
    expect(after.radius).toBeCloseTo(0.4, 6);
    expect(before.scale).toBe(1.6);            // and the source is untouched
    expect({ ...before, ...after }.mode).toBe('lie');
  });
});

/* ⚠️ THE CONTRACT. Unlike the pen — where a stroke is where the hand went and there is nothing to
 * take hold of — a garnish IS a placed object, so it is dragged and must answer for the six ways the
 * rainbow and the cloud broke in one week. */
movableContract('chocolate_garnish', {
  positionKeys: ['theta', 'radius', 'yaw'],
  pointsOf: (p, cake) => garnishPlacement(p, cake, PIECE).anchors,
  cases: [
    {
      label: 'standing on the cake top',
      cake: CAKE,
      params: { ...GARNISH_DEFAULTS, mode: 'stand' },
      freedoms: [
        { label: 'round the cake', drag: (p, c, u) => garnishDragTo(p, c, u, 0.55),
          targets: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875] },
        { label: 'out from the middle', drag: (p, c, v) => garnishDragTo(p, c, 0.25, v),
          targets: [0.1, 0.3, 0.5, 0.7, 0.85] },
      ],
    },
    {
      label: 'lying on the cake top',
      cake: CAKE,
      params: { ...GARNISH_DEFAULTS, mode: 'lie' },
      freedoms: [
        { label: 'round the cake', drag: (p, c, u) => garnishDragTo(p, c, u, 0.5),
          targets: [0, 0.2, 0.4, 0.6, 0.8] },
      ],
    },
  ],
});
