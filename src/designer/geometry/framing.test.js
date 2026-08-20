import { describe, it, expect } from 'vitest';
import { cakeAimY, cakeAimTarget, cakeMiddleY, cakeStackHeight, CAKE_AIM_LIFT } from './framing.js';
import { BOTTOM_H, TIER_HEIGHT_STEP } from '../constants.js';

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

describe('cakeAimY', () => {
  it('aims ABOVE the middle, which is what sits the cake low in frame instead of floating it', () => {
    for (const tiers of [ONE, TWO, THREE]) {
      expect(cakeAimY(tiers)).toBeGreaterThan(cakeMiddleY(tiers));
    }
  });

  it('sits every cake by the SAME amount — the lift is fixed, only the middle moves', () => {
    const sit = tiers => cakeAimY(tiers) - cakeMiddleY(tiers);
    expect(sit(ONE)).toBeCloseTo(sit(THREE));
    expect(sit(ONE)).toBeCloseTo(CAKE_AIM_LIFT);
  });

  it('aims higher at a taller cake — the whole point of not using a constant', () => {
    expect(cakeAimY(ONE)).toBeLessThan(cakeAimY(TWO));
    expect(cakeAimY(TWO)).toBeLessThan(cakeAimY(THREE));
  });

  it('reproduces the old framing on a one-tier cake, which is the look that was asked back', () => {
    // The hand-tuned constant was [0, 1.55, 0]. On the cake this app makes most, the adaptive rule
    // must land on the same spot — otherwise "keep the old look" was not honoured.
    expect(cakeAimY(ONE)).toBeCloseTo(1.55, 2);
  });

  it('no longer aims over the top of a tall cake, which is what cut the top tier off', () => {
    const top = 0.1 + cakeStackHeight(THREE);
    expect(cakeAimY(THREE)).toBeLessThan(top);
  });
});

describe('cakeAimTarget', () => {
  it('is the aim on the Y axis, centred in X and Z', () => {
    expect(cakeAimTarget(TWO)).toEqual([0, cakeAimY(TWO), 0]);
  });
});
