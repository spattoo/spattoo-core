import { describe, it, expect } from 'vitest';
import { cakeAimY, cakeAimTarget, cakeStackHeight, CAKE_AIM_FRAC } from './framing.js';
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

describe('cakeAimY', () => {
  it('aims higher at a taller cake — the whole point', () => {
    expect(cakeAimY(ONE)).toBeLessThan(cakeAimY(TWO));
    expect(cakeAimY(TWO)).toBeLessThan(cakeAimY(THREE));
  });

  it('aims INSIDE the cake, never above its top or below its board', () => {
    for (const tiers of [ONE, TWO, THREE]) {
      const top = cakeStackHeight(tiers);
      expect(cakeAimY(tiers)).toBeGreaterThan(0);
      expect(cakeAimY(tiers)).toBeLessThan(top);
    }
  });

  it('leaves the slack ABOVE the cake, where toppers are — so it aims below the true middle', () => {
    const top = cakeStackHeight(THREE);
    expect(cakeAimY(THREE)).toBeLessThan(top / 2);
    expect(CAKE_AIM_FRAC).toBeLessThan(0.5);
  });

  it('fixes the case that prompted it: a single tier was aimed at from above its own top', () => {
    // The old constant was 1.55 — a single tier's top is 0.1 (board) + 1.45, i.e. exactly 1.55. The
    // camera looked at the very top of the cake, so the cake sat in the bottom half of the frame.
    const singleTierTop = 0.1 + BOTTOM_H;
    expect(1.55).toBeCloseTo(singleTierTop);
    expect(cakeAimY(ONE)).toBeLessThan(singleTierTop);
  });
});

describe('cakeAimTarget', () => {
  it('is the aim on the Y axis, centred in X and Z', () => {
    expect(cakeAimTarget(TWO)).toEqual([0, cakeAimY(TWO), 0]);
  });
});
