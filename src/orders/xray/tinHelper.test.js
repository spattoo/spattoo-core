import { describe, it, expect } from 'vitest';
import {
  computeTinPlan, footprintArea, diameterFor, spongeDensity, ANCHOR, CAKE_BUILD,
} from './tinHelper.js';

const round = (r, h) => ({ shape: 'round', radius: r, height: h });
const rect  = (w, d, h) => ({ shape: 'rect', width: w, depth: d, height: h });
const heart = (w, d, h) => ({ shape: 'heart', shapeFamily: 'heart', width: w, depth: d, height: h });

/* ── The model has to reproduce the one datum anybody can check ──────────────────────────────────
 *
 * A 6-inch round, 4 inches tall, is sold as a 1kg cake — that is what the trade prints on a pan set.
 * Everything else here is geometry, so if this holds the rest follows.
 */
describe('the anchor', () => {
  it('makes a 6in x 4in tier weigh 1kg', () => {
    const d = diameterFor(ANCHOR.kg, ANCHOR.heightIn / ANCHOR.diameterIn);
    expect(d).toBeCloseTo(ANCHOR.diameterIn, 2);
  });

  it('derives the sponge density rather than asserting one', () => {
    /* ⚠️ The guard against the error the old chart died of. Component densities picked
     * independently look fine one at a time and disagree together — 0.40 kg/L for sponge is a
     * perfectly reasonable figure, and it produced a 7-inch tier twelve inches tall. */
    expect(spongeDensity()).toBeCloseTo(0.5, 2);
  });

  it('does not let the order\'s build rewrite the sponge recipe', () => {
    /* ⚠️ Found by the layers test below, which failed in the opposite direction to reality.
     *
     * The first version derived the sponge density from the CALLER's build, so asking for four
     * layers made the sponge lighter — something had to give to hold a 6×4 at exactly 1kg. Cutting
     * a sponge does not change what it is made of. The anchor is a calibration at a stated build;
     * departing from it legitimately changes what a 6×4 weighs. */
    const base = spongeDensity();
    for (const layers of [2, 3, 5]) expect(spongeDensity({ ...CAKE_BUILD, layers })).toBe(base);
    for (const fillingDensity of [0.7, 1.1]) expect(spongeDensity({ ...CAKE_BUILD, fillingDensity })).toBe(base);
  });
});

describe('footprint — every shape measured, none guessed', () => {
  it('measures a round tier as a circle', () => {
    expect(footprintArea(round(1.2, 1.45))).toBeCloseTo(Math.PI * 1.44, 4);
  });

  it('measures a rect tier as its rectangle', () => {
    // Corner rounding takes a little off, so it is at most w*d and close to it.
    const a = footprintArea(rect(2.16, 1.56, 1.45));
    expect(a).toBeLessThanOrEqual(2.16 * 1.56 + 1e-9);
    expect(a).toBeGreaterThan(2.16 * 1.56 * 0.95);
  });

  it('measures a heart from its outline, NOT the circle around it', () => {
    /* The old code had no branch for this: a heart is sized by width/depth, `r != null` failed, and
     * it fell through to a hardcoded 0.62ⁿ taper — the real footprint never looked at. A heart
     * covers appreciably less than its bounding square. */
    const a = footprintArea(heart(2.4, 2.4, 1.45));
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(2.4 * 2.4);
  });
});

describe('splitting the weight', () => {
  it('gives equal real volumes equal weight, round against rect', () => {
    /* ⚠️ THE MISSING PI. Round measured r²·h and rect measured w·d·h, so these two — which hold the
     * same cake — split 0.96 / 3.04 instead of 2 / 2. Any cake mixing the families was wrong. */
    const r = 1.2, h = 1.45;
    const side = Math.sqrt(Math.PI) * r;          // a square of exactly the circle's area
    const { tiers } = computeTinPlan([round(r, h), rect(side, side, h)], 4);
    expect(tiers[0].weightKg).toBeCloseTo(2, 1);
    expect(tiers[1].weightKg).toBeCloseTo(2, 1);
  });

  it('uses a heart\'s real footprint when splitting', () => {
    // Two hearts, the lower one wider: the split must follow their areas, not a fixed taper.
    const { tiers } = computeTinPlan([heart(2.4, 2.4, 1.45), heart(1.8, 1.8, 1.45)], 4);
    const ratio = tiers[0].weightKg / tiers[1].weightKg;
    expect(ratio).toBeCloseTo((2.4 / 1.8) ** 2, 1);   // area scales with the square
    expect(ratio).not.toBeCloseTo(1 / 0.62, 1);       // and NOT the old taper
  });
});

describe('the tin for a real order', () => {
  const twoTier = [round(1.2, 1.45), round(0.9, 1.37)];

  it('sizes a 5kg two-tier from the design\'s own proportions', () => {
    const { tiers } = computeTinPlan(twoTier, 5);
    expect(tiers[0].tinInch).toBe(9);
    expect(tiers[1].tinInch).toBe(7);
    // And it says how tall that makes them, which the old sheet never did.
    expect(tiers[0].heightIn).toBeGreaterThan(4);
    expect(tiers[0].heightIn).toBeLessThan(7);
  });

  it('says nothing when the order has no weight', () => {
    // No weight means no scale. Inventing one is how a printed tin size becomes indistinguishable
    // from a measured one.
    const { tiers, totalKg } = computeTinPlan(twoTier, null);
    expect(totalKg).toBeNull();
    expect(tiers[0].tinInch).toBeNull();
    expect(tiers[0].heightIn).toBeNull();
  });

  it('grows the tin with the weight, monotonically', () => {
    let last = 0;
    for (const kg of [1, 2, 3, 5, 8, 12]) {
      const d = computeTinPlan(twoTier, kg).tiers[0].exactInch;
      expect(d, `${kg}kg`).toBeGreaterThan(last);
      last = d;
    }
  });
});

describe('the two controls a baker gets', () => {
  const tier = [round(1.2, 1.45)];

  it('shapeBias trades width for height at the same weight', () => {
    const wide = computeTinPlan(tier, 3, { shapeBias: 0.7 }).tiers[0];
    const asIs = computeTinPlan(tier, 3).tiers[0];
    const tall = computeTinPlan(tier, 3, { shapeBias: 1.4 }).tiers[0];
    expect(wide.exactInch).toBeGreaterThan(asIs.exactInch);
    expect(tall.exactInch).toBeLessThan(asIs.exactInch);
    expect(tall.heightIn).toBeGreaterThan(wide.heightIn);
  });

  it('starts on the design, so 1 is what the customer was shown', () => {
    expect(computeTinPlan(tier, 3, { shapeBias: 1 })).toEqual(computeTinPlan(tier, 3));
  });

  it('makes the tier SHORTER as layers are added, not taller', () => {
    /* ⚠️ The counter-intuitive one, and worth pinning. Cutting to add filling does add height — but
     * only if the weight may grow. The ORDER fixes the weight, and filling is nearly twice the
     * density of sponge, so each gap buys its height by removing more sponge than it adds. */
    const two   = computeTinPlan(tier, 3, { build: { ...CAKE_BUILD, layers: 2 } }).tiers[0];
    const four  = computeTinPlan(tier, 3, { build: { ...CAKE_BUILD, layers: 4 } }).tiers[0];
    expect(four.heightIn).toBeLessThan(two.heightIn);
  });

  it('moves the tier less than a step of tin does', () => {
    // Which is the argument for the tall/wide handle being the control and layers being a trim.
    const two  = computeTinPlan(tier, 3, { build: { ...CAKE_BUILD, layers: 2 } }).tiers[0];
    const four = computeTinPlan(tier, 3, { build: { ...CAKE_BUILD, layers: 4 } }).tiers[0];
    expect(Math.abs(four.heightIn - two.heightIn)).toBeLessThan(1);
  });
});
