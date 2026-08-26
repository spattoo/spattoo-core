import { describe, it, expect } from 'vitest';
import { numberTopperPlaceAt, writingPlaceAt } from './surface.js';
import { movableContract } from './movableContract.js';

// ── The movable contract, for the two decorations that place DIRECTLY ───────────────────────────
// The rainbow and the cloud SOLVE for their parameters: the pointer gives an angle and a distance,
// and the geometry works backwards to a yaw and a standoff. That solve is where both of them went
// wrong — a solve can have no answer over part of its domain, which is what left the rainbow dead
// over 71% of the cake top.
//
// These two do not solve. The pointer lands somewhere and that IS the position, clamped to the
// surface. Which is exactly why neither ever went dead — and worth pinning, because the next
// decoration is one refactor away from acquiring a solve nobody noticed.
const CAKE_SHAPE = { kind: 'round', radius: 1.2 };
const at = (x, z) => ({ x, y: 1.55, z });

movableContract('number_topper', {
  positionKeys: ['offsetX', 'offsetZ'],
  cases: [{
    label: 'on the cake top',
    cake: CAKE_SHAPE,
    params: { offsetX: 0, offsetZ: 0 },
    freedoms: [
      { label: 'across the cake', drag: (p, shape, x) => numberTopperPlaceAt(shape, at(x, 0)),
        targets: [-0.8, -0.4, 0, 0.4, 0.8] },
      { label: 'front to back',   drag: (p, shape, z) => numberTopperPlaceAt(shape, at(0, z)),
        targets: [-0.8, -0.4, 0, 0.4, 0.8] },
    ],
  }],
});

movableContract('writing', {
  positionKeys: ['offsetX', 'offsetZ', 'boardX', 'boardZ', 'sideAngle', 'sideY'],
  cases: [
    {
      label: 'on the cake top',
      cake: { surface: 'top', shape: CAKE_SHAPE },
      params: { offsetX: 0, offsetZ: 0 },
      freedoms: [
        { label: 'across the cake', drag: (p, w, x) => writingPlaceAt(w, at(x, 0)),
          targets: [-0.8, -0.4, 0, 0.4, 0.8] },
        { label: 'front to back',   drag: (p, w, z) => writingPlaceAt(w, at(0, z)),
          targets: [-0.8, -0.4, 0, 0.4, 0.8] },
      ],
    },
    {
      label: 'on a round wall',
      cake: { surface: 'side', sideRect: false, minSideY: 0.14, maxSideY: 1.4 },
      params: { sideAngle: 0, sideY: 0.5 },
      freedoms: [
        { label: 'round the wall', drag: (p, w, th) => writingPlaceAt(w, { theta: th, y: 0.5 }),
          targets: [0, 1, 2, 3, 4] },
        { label: 'up the wall',    drag: (p, w, y) => writingPlaceAt(w, { theta: 0, y }),
          targets: [0.2, 0.5, 0.8, 1.1, 1.3] },
      ],
    },
  ],
});

// The clamps are the one place these CAN go wrong — a clamp that pins too early is a dead patch by
// another name, which is the same bug the rainbow had, arrived at differently.
describe('placing directly, and the clamps that bound it', () => {
  it('keeps the number topper on the cake', () => {
    const far = numberTopperPlaceAt(CAKE_SHAPE, at(9, 9));
    expect(Math.hypot(far.offsetX, far.offsetZ)).toBeLessThanOrEqual(1.2 + 1e-9);
  });

  it('does not pin a writing to the wall\'s bounds until it reaches them', () => {
    const w = { surface: 'side', sideRect: false, minSideY: 0.14, maxSideY: 1.4 };
    for (const y of [0.3, 0.6, 0.9, 1.2]) {
      expect(writingPlaceAt(w, { theta: 0, y }).sideY).toBeCloseTo(y, 9);
    }
    expect(writingPlaceAt(w, { theta: 0, y: 99 }).sideY).toBe(1.4);
  });

  it('returns nothing when the ray missed, rather than a position at the origin', () => {
    // A miss that answered (0, 0) would teleport the decoration to the middle of the cake.
    expect(numberTopperPlaceAt(CAKE_SHAPE, null)).toBeNull();
    expect(writingPlaceAt({ surface: 'top' }, null)).toBeNull();
  });
});
