import { describe, it, expect } from 'vitest';
import { cakeAimY, cakeAimTarget, cakeMiddleY, cakeStackHeight, cameraDistance, CAKE_SIT_FRAC } from './framing.js';
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
