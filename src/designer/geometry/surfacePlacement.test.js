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

describe('a message with WIDTH stays on the cake', () => {
  /* ⚠️ The clamp used to stop the ANCHOR at the rim, which is right for a point and wrong for
   * anything with width: an 84mm topper dragged to the edge put half its length and one of its legs
   * out over thin air, with the prong hanging down the side. Reported from a real cake.
   *
   * Asserted rather than eyeballed — a screenshot of a 3D scene cannot tell you whether a leg is at
   * the rim or a few millimetres past it, and the camera moves while you drag. */
  const round = { kind: 'round', radius: 1.6 };
  const at = (x, z) => ({ x, z });

  it('keeps the whole word inside the rim, not just its centre', () => {
    const halfWidth = 0.6;
    const where = { surface: 'top', shape: round, halfWidth };
    // Push it well past the edge from every direction.
    for (const [x, z] of [[9, 0], [-9, 0], [0, 9], [0, -9], [7, 7], [-7, 5]]) {
      const p = writingPlaceAt(where, at(x, z));
      const reach = Math.hypot(p.offsetX, p.offsetZ) + halfWidth;
      expect(reach, `dragged to ${x},${z}`).toBeLessThanOrEqual(round.radius + 1e-6);
    }
  });

  it('still lets a point-sized message reach the rim', () => {
    // halfWidth 0 is the old behaviour exactly — cream writing passes nothing and must not change.
    const p = writingPlaceAt({ surface: 'top', shape: round }, at(9, 0));
    expect(Math.hypot(p.offsetX, p.offsetZ)).toBeCloseTo(round.radius, 6);
  });

  it('does not shove a message that was already comfortably inside', () => {
    const where = { surface: 'top', shape: round, halfWidth: 0.6 };
    const p = writingPlaceAt(where, at(0.2, -0.3));
    expect(p.offsetX).toBeCloseTo(0.2, 6);
    expect(p.offsetZ).toBeCloseTo(-0.3, 6);
  });

  it('clamps on the board too, where a topper also stands', () => {
    const board = { kind: 'round', radius: 2.2 };
    const p = writingPlaceAt({ surface: 'board', boardShape: board, halfWidth: 0.5 }, at(9, 0));
    expect(Math.hypot(p.boardX, p.boardZ) + 0.5).toBeLessThanOrEqual(board.radius + 1e-6);
  });
});

/* ⚠️ WHAT THIS CONTRACT CANNOT SEE: whether there is anything on screen to take hold of.
 *
 * It asks "does the position respond to a drag", and `writingPlaceAt` answered yes throughout the
 * whole time an acrylic topper could not be picked up at all. The catcher for a standing topper lay
 * FLAT on the icing — inherited from cream writing, which really is piped onto the surface — while
 * the piece rose vertically off it, so every click on the letters passed over the catcher and hit
 * nothing. The maths was never wrong; there was no way to reach it.
 *
 * The gap is structural, not an oversight to patch here: the catcher is R3F geometry and a jsdom
 * test cannot raycast it. Which means for anything dragged, GATE GREEN IS NOT EVIDENCE — the drag
 * has to be driven in a browser. `dev/acrylic-text.html` is that harness for this one.
 */
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
