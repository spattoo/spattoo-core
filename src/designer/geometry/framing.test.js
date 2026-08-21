import { describe, it, expect } from 'vitest';
import { cakeAimY, cakeAimTarget, cakeMiddleY, cakeStackHeight, cameraDistance, CAKE_SIT_FRAC,
         fitDistance, fitDistanceTight, sitFromSlack } from './framing.js';
import { BOTTOM_H, TIER_HEIGHT_STEP, CAMERA_POSITION, CAMERA_POSITION_MOBILE } from '../constants.js';

// The three cakes the old constant could not serve at once.
const ONE   = [BOTTOM_H];
const TWO   = [BOTTOM_H, BOTTOM_H - TIER_HEIGHT_STEP];
const THREE = [BOTTOM_H, BOTTOM_H - TIER_HEIGHT_STEP, BOTTOM_H - 2 * TIER_HEIGHT_STEP];

describe('cakeStackHeight', () => {
  it('sums the tiers', () => {
    expect(cakeStackHeight(TWO)).toBeCloseTo(BOTTOM_H * 2 - TIER_HEIGHT_STEP);
  });

  it('falls back for a cake with no tiers, rather than collapsing to zero', () => {
    // A camera aimed at y=0 stares at the floor, and swings up when the first tier lands.
    expect(cakeStackHeight([])).toBeGreaterThan(0);
    expect(cakeStackHeight(null)).toBeGreaterThan(0);
  });

  it('ignores a tier whose height is missing rather than returning NaN', () => {
    expect(cakeStackHeight([BOTTOM_H, undefined, null, NaN])).toBeCloseTo(BOTTOM_H);
  });
});

describe('cakeMiddleY', () => {
  it('counts the board — it is part of the cake that is being framed', () => {
    expect(cakeMiddleY(ONE)).toBeCloseTo((0.1 + BOTTOM_H) / 2);
  });

  it('rises with the cake', () => {
    expect(cakeMiddleY(ONE)).toBeLessThan(cakeMiddleY(TWO));
    expect(cakeMiddleY(TWO)).toBeLessThan(cakeMiddleY(THREE));
  });
});

// The angle the aim sits above the cake's middle, which is what the eye actually reads.
const sitAngle = (tiers, cam) =>
  Math.atan((cakeAimY(tiers, cam) - cakeMiddleY(tiers)) / cameraDistance(cam)) * 180 / Math.PI;

describe('cameraDistance', () => {
  it('is the length of the camera position — a cake stands at the origin', () => {
    expect(cameraDistance([0, 3, 4])).toBeCloseTo(5);
  });

  it('never returns zero, so the sit can always be divided by it', () => {
    expect(cameraDistance([0, 0, 0])).toBeGreaterThan(0);
    expect(cameraDistance(null)).toBeGreaterThan(0);
  });
});

describe('cakeAimY', () => {
  it('aims ABOVE the middle, which is what sits the cake low in frame instead of floating it', () => {
    for (const tiers of [ONE, TWO, THREE]) {
      expect(cakeAimY(tiers, CAMERA_POSITION)).toBeGreaterThan(cakeMiddleY(tiers));
    }
  });

  it('sits every cake by the same ANGLE — only the middle moves', () => {
    expect(sitAngle(ONE, CAMERA_POSITION)).toBeCloseTo(sitAngle(THREE, CAMERA_POSITION));
  });

  it('sits the cake the same on a PHONE, where the camera is further out', () => {
    // The bug this replaced: a world-space lift tuned on the desktop camera covered a quarter less
    // of the frame on the phone's, which sits 1.33x further back — so the cake read as floating on a
    // phone and correct on a desktop. As an angle, both cameras get the same shot.
    expect(cameraDistance(CAMERA_POSITION_MOBILE)).toBeGreaterThan(cameraDistance(CAMERA_POSITION));
    expect(sitAngle(ONE, CAMERA_POSITION_MOBILE)).toBeCloseTo(sitAngle(ONE, CAMERA_POSITION));
    // …which means the phone's aim is higher in world terms, not the same number.
    expect(cakeAimY(ONE, CAMERA_POSITION_MOBILE)).toBeGreaterThan(cakeAimY(ONE, CAMERA_POSITION));
  });

  it('aims higher at a taller cake — the whole point of not using a constant', () => {
    expect(cakeAimY(ONE, CAMERA_POSITION)).toBeLessThan(cakeAimY(TWO, CAMERA_POSITION));
    expect(cakeAimY(TWO, CAMERA_POSITION)).toBeLessThan(cakeAimY(THREE, CAMERA_POSITION));
  });

  it('reproduces the old framing on a one-tier cake at the desktop camera', () => {
    // The hand-tuned constant was [0, 1.55, 0]. On the cake this app makes most, and the camera it
    // was tuned against, the rule must land on the same spot — otherwise "keep the old look" was
    // not honoured. CAKE_SIT_FRAC is derived from exactly this.
    expect(cakeAimY(ONE, CAMERA_POSITION)).toBeCloseTo(1.55, 1);
    expect(CAKE_SIT_FRAC).toBeGreaterThan(0);
  });

  it('no longer aims over the top of a tall cake, which is what cut the top tier off', () => {
    const top = 0.1 + cakeStackHeight(THREE);
    for (const cam of [CAMERA_POSITION, CAMERA_POSITION_MOBILE]) {
      expect(cakeAimY(THREE, cam)).toBeLessThan(top);
    }
  });
});

describe('cakeAimTarget', () => {
  it('is the aim on the Y axis, centred in X and Z', () => {
    expect(cakeAimTarget(TWO, CAMERA_POSITION)).toEqual([0, cakeAimY(TWO, CAMERA_POSITION), 0]);
  });
});

// ── Fitting the cake to the frame ───────────────────────────────────────────────────────────────
// The camera stood at a fixed distance and was hand-tuned four times, each tune right for the cake it
// was checked against. Then it was fitted to the cake's BOUNDING SPHERE, which is rotation-proof and
// badly wrong for this shape: a cake with its board is a wide flat disc, so the sphere is far taller
// than the cake and the frame reserves vertical room for empty air. The camera stood too far back and
// the cake floated in the middle of it.
//
// A standing CYLINDER is just as rotation-proof — its silhouette from every azimuth is the same
// rectangle — and it is the shape a cake actually is.
const FOV = 42, WIDE = 2.2, PHONE = 335 / 560;
const ELEV = 34 * Math.PI / 180;          // the studio camera's tilt above the horizon
const ONE_TIER  = { w: 1.8, h: 0.775 };   // board radius; half of board+tier
const THREE_TIER = { w: 1.8, h: 2.155 };

describe('fitDistance', () => {
  // The exact solve, not an estimate: for each corner of the cylinder's silhouette, the distance
  // that puts it on the frame edge; the largest wins.
  const touching = (w, h, a) => fitDistanceTight(w, h, ELEV, FOV, a);

  it('stands further back for a taller cake', () => {
    expect(fitDistance(ONE_TIER.w, ONE_TIER.h, ELEV, FOV, WIDE))
      .toBeLessThan(fitDistance(THREE_TIER.w, THREE_TIER.h, ELEV, FOV, WIDE));
  });

  it('stands further back for a wider cake', () => {
    expect(fitDistance(1.8, 0.775, ELEV, FOV, WIDE))
      .toBeLessThan(fitDistance(3.0, 0.775, ELEV, FOV, WIDE));
  });

  it('stands FURTHER back on a narrow frame, which is what a phone needs', () => {
    expect(fitDistance(ONE_TIER.w, ONE_TIER.h, ELEV, FOV, PHONE))
      .toBeGreaterThan(fitDistance(ONE_TIER.w, ONE_TIER.h, ELEV, FOV, WIDE));
  });

  it('accounts for the near board rim being closer than the cake\'s middle', () => {
    // THE BUG, twice. Measuring the extent in the plane through the CENTRE stands about 20% too
    // close, because the near front rim of the board projects bigger than that plane suggests — and
    // that rim is precisely what kept ending up off the bottom of the screen.
    const c = Math.cos(ELEV), s2 = Math.sin(ELEV);
    const centrePlane = (ONE_TIER.h * c + ONE_TIER.w * s2) / Math.tan((FOV / 2) * Math.PI / 180);
    expect(touching(ONE_TIER.w, ONE_TIER.h, WIDE)).toBeGreaterThan(centrePlane * 1.1);
  });

  it('puts EVERY corner of the cake inside the frame, on every screen and every cake', () => {
    // The invariant, checked against the projection itself rather than against the formula that
    // produced it: each silhouette corner, at its own distance from the camera, inside the frustum.
    const vHalf = (FOV / 2) * Math.PI / 180;
    const c = Math.cos(ELEV), s2 = Math.sin(ELEV);
    for (const aspect of [PHONE, 0.8, 1.2, 2.2, 3.0]) {
      const hHalf = Math.atan(Math.tan(vHalf) * aspect);
      for (const cake of [ONE_TIER, THREE_TIER, { w: 2.6, h: 0.8 }, { w: 1.4, h: 3.2 }]) {
        const d = fitDistance(cake.w, cake.h, ELEV, FOV, aspect);
        for (const px of [cake.w, -cake.w]) {
          for (const py of [cake.h, -cake.h]) {
            const along  = d - (px * c + py * s2);
            const across = Math.abs(py * c - px * s2);
            expect(across).toBeLessThanOrEqual(along * Math.tan(vHalf) + 1e-9);
            expect(cake.w).toBeLessThanOrEqual((d - py * s2) * Math.tan(hHalf) + 1e-9);
          }
        }
      }
    }
  });

  it('leaves real air rather than fitting flush', () => {
    expect(fitDistance(ONE_TIER.w, ONE_TIER.h, ELEV, FOV, WIDE))
      .toBeGreaterThan(touching(ONE_TIER.w, ONE_TIER.h, WIDE));
  });

  it('never divides by zero on an empty or degenerate cake', () => {
    expect(Number.isFinite(fitDistance(0, 0, ELEV, FOV, WIDE))).toBe(true);
    expect(Number.isFinite(fitDistance(1.8, 0.8, ELEV, FOV, 0))).toBe(true);
  });
});

describe('sitFromSlack', () => {
  it('sits the cake below centre using the air the margin bought', () => {
    const tight = fitDistanceTight(ONE_TIER.w, ONE_TIER.h, ELEV, FOV, WIDE);
    const d = fitDistance(ONE_TIER.w, ONE_TIER.h, ELEV, FOV, WIDE);
    expect(sitFromSlack(tight, d, FOV)).toBeGreaterThan(0);
  });

  it('gives up the sit entirely when there is no air', () => {
    // A fixed-angle sit went on pushing down however tall the cake got, until the board left the
    // bottom edge — the opposite of what a sit is for. Tied to the margin it cannot.
    const tight = fitDistanceTight(ONE_TIER.w, ONE_TIER.h, ELEV, FOV, WIDE);
    expect(sitFromSlack(tight, tight, FOV)).toBe(0);
    expect(sitFromSlack(tight, tight * 0.8, FOV)).toBe(0);   // closer than touching: still never negative
  });

  it('never takes all of the air, or the cake ends up against the edge again', () => {
    const tight = fitDistanceTight(ONE_TIER.w, ONE_TIER.h, ELEV, FOV, WIDE);
    const d = fitDistance(ONE_TIER.w, ONE_TIER.h, ELEV, FOV, WIDE);
    const air = (d - tight) * Math.tan((FOV / 2) * Math.PI / 180);
    expect(sitFromSlack(tight, d, FOV)).toBeLessThan(air);
  });
});
