import { describe, it, expect } from 'vitest';
import {
  computeTinPlan, footprintArea, diameterFor, spongeDensity, ANCHOR, CAKE_BUILD, BUILDS,
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
    const tier = [round(1.2, 1.45)];
    const at = (layers) => computeTinPlan(tier, 3, { build: { ...CAKE_BUILD, layers } }).tiers[0].heightIn;
    // More filling can only make a tier shorter at a fixed weight. If the recipe followed the
    // slicing this would rise instead, which is how the bug showed itself.
    expect(at(4)).toBeLessThan(at(2));
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
  /* ⚠️ Quantisation OFF in this block, deliberately.
   *
   * These test the VOLUME model — that a heart is measured and that round and rect are measured the
   * same way. Bakeable weights round those shares to the nearest 250g, which is right for a baker
   * and coarse enough to blur the very thing being asserted: the heart split landed on 1.67 where
   * the areas say 1.78, and that is the rounding, not the model. Rounding is tested on its own
   * below. */
  const RAW = { build: { ...CAKE_BUILD, quantumKg: 0 } };
  it('gives equal real volumes equal weight, round against rect', () => {
    /* ⚠️ THE MISSING PI. Round measured r²·h and rect measured w·d·h, so these two — which hold the
     * same cake — split 0.96 / 3.04 instead of 2 / 2. Any cake mixing the families was wrong. */
    const r = 1.2, h = 1.45;
    const side = Math.sqrt(Math.PI) * r;          // a square of exactly the circle's area
    const { tiers } = computeTinPlan([round(r, h), rect(side, side, h)], 4, RAW);
    expect(tiers[0].weightKg).toBeCloseTo(2, 1);
    expect(tiers[1].weightKg).toBeCloseTo(2, 1);
  });

  it('uses a heart\'s real footprint when splitting', () => {
    // Two hearts, the lower one wider: the split must follow their areas, not a fixed taper.
    const { tiers } = computeTinPlan([heart(2.4, 2.4, 1.45), heart(1.8, 1.8, 1.45)], 4, RAW);
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

describe('weights a baker can actually weigh out', () => {
  const two   = [round(1.2, 1.45), round(0.9, 1.37)];
  const three = [round(1.2, 1.45), round(0.9, 1.37), round(0.65, 1.29)];

  it('lands every tier on a whole quantum', () => {
    // ⚠️ Nobody bakes 3.26 kg. The maths was exactly right and impossible to follow.
    const { tiers } = computeTinPlan(two, 5);
    for (const t of tiers) expect((t.weightKg / 0.25) % 1).toBeCloseTo(0, 6);
    expect(tiers.map(t => t.weightKg)).toEqual([3.25, 1.75]);
  });

  it('still sums to the order', () => {
    /* Rounding each tier on its own is what breaks this — three tiers each losing a fraction take a
     * quarter-kilo off the cake with nothing saying so. Largest remainder keeps the total. */
    for (const kg of [1, 1.5, 2, 3, 5, 7.5, 12]) {
      for (const tiers of [two, three]) {
        const plan = computeTinPlan(tiers, kg);
        const sum = plan.tiers.reduce((s, t) => s + t.weightKg, 0);
        expect(+sum.toFixed(3), `${kg}kg / ${tiers.length} tiers`).toBe(plan.bakedKg);
        expect(sum, `${kg}kg / ${tiers.length} tiers`).toBeGreaterThanOrEqual(kg - 1e-9);
      }
    }
  });

  it('rounds the total UP, never down', () => {
    // A baker can trim a heavy cake; they cannot add to a light one without baking again. An order
    // that is not a whole number of quanta bakes slightly over, and bakedKg says so.
    const plan = computeTinPlan(two, 4.6);
    expect(plan.totalKg).toBe(4.6);
    expect(plan.bakedKg).toBe(4.75);
    expect(plan.bakedKg).toBeGreaterThan(plan.totalKg);
  });

  it('never gives a tier nothing', () => {
    // A three-tier 1kg cake splits small. A tier of zero is not a tier.
    const { tiers } = computeTinPlan(three, 1);
    for (const t of tiers) expect(t.weightKg).toBeGreaterThan(0);
  });

  it('keeps the big tier the big one', () => {
    // Rounding must not reorder the cake — the base is always at least the top.
    for (const kg of [1, 2, 5, 9]) {
      const { tiers } = computeTinPlan(three, kg);
      expect(tiers[0].weightKg).toBeGreaterThanOrEqual(tiers[1].weightKg);
      expect(tiers[1].weightKg).toBeGreaterThanOrEqual(tiers[2].weightKg);
    }
  });

  it('lets a bakery set its own step', () => {
    // 500g houses exist; so do 100g ones. It is config, not a constant.
    const half = computeTinPlan(two, 5, { build: { ...CAKE_BUILD, quantumKg: 0.5 } });
    for (const t of half.tiers) expect((t.weightKg / 0.5) % 1).toBeCloseTo(0, 6);
  });
});

describe('the named builds, calibrated against real cakes', () => {
  /* ⚠️ "Long" means TALL, not long along the bench — every general baking reference uses "long" for
   * a loaf. The code says `tall`; the trade says long.
   *
   * These numbers are not chosen. A grid search over density and height-to-width against five of
   * this bakery's own single-tier cakes hit all five exactly at h/d 0.98 and 0.47 kg/L, and their
   * two-tier practice falls out of the same figures without further fitting. If a change here stops
   * reproducing these, the change is wrong.
   */
  const single = (r, h) => [round(r, h)];
  const tinFor = (kg) => computeTinPlan(single(1.2, 1.45), kg, { preset: 'tall' }).tiers[0].tinInch;

  const exactFor = (kg) => computeTinPlan(single(1.2, 1.45), kg, { preset: 'tall' }).tiers[0].exactInch;

  it('reproduces the cakes whose tin is not a coin toss', () => {
    expect(tinFor(1.5)).toBe(6);
    expect(tinFor(2)).toBe(7);
    expect(tinFor(3)).toBe(8);
  });

  it('lands within one tin of the bakery\'s choice everywhere, including the ties', () => {
    /* ⚠️ Two of the five sit EXACTLY on a snap boundary — 1kg computes to 5.5in and 2.5kg to 7.5in —
     * and this bakery rounds up at one and down at the other. That is not inconsistency, it is
     * BANDING: a tin is picked for a weight range and the height flexes inside it, which is a
     * different rule from computing a diameter and snapping to the nearest.
     *
     * Forcing both would be overfitting to a tie-break. What the model owes is to be close, and to
     * SHOW the exact figure so a baker can see when it could go either way. */
    for (const [kg, theirs] of [[1, 6], [1.5, 6], [2, 7], [2.5, 7], [3, 8]]) {
      expect(Math.abs(exactFor(kg) - theirs), `${kg}kg`).toBeLessThanOrEqual(0.55);
    }
  });

  it('reports the exact diameter beside the tin, so a tie is visible', () => {
    // 5.5 and 7.5 are the two that could go either way; a sheet showing only "6in" hides that.
    expect(exactFor(1)).toBeCloseTo(5.5, 1);
    expect(exactFor(2.5)).toBeCloseTo(7.5, 1);
  });

  it('makes a long cake as tall as it is wide', () => {
    // The definition, asserted rather than described: h/d ~ 1.
    const t = computeTinPlan(single(1.2, 1.45), 3, { preset: 'tall' }).tiers[0];
    expect(t.heightIn / t.exactInch).toBeCloseTo(0.98, 1);
  });

  it('builds a standard cake about two thirds as tall as it is wide', () => {
    const t = computeTinPlan(single(1.2, 1.45), 3, { preset: 'standard' }).tiers[0];
    expect(t.heightIn / t.exactInch).toBeCloseTo(0.65, 1);
    expect(t.tinInch).toBeGreaterThan(tinFor(3));   // and therefore wider than the long one
  });

  it('keeps the two densities apart', () => {
    /* At the tall build's 0.47 kg/L a 6x4 weighs 0.87kg, not 1.00. A taller tier carries
     * proportionally more filling and less sponge, so ONE density cannot serve both builds — and a
     * later "simplification" back to a single figure will break one of them. */
    expect(spongeDensity(BUILDS.tall.anchor)).not.toBeCloseTo(spongeDensity(BUILDS.standard.anchor), 2);
  });

  it('leaves the design\'s own proportions alone when no build is named', () => {
    // The conservative default: no preset means the tier keeps what the customer was shown.
    const asDesigned = computeTinPlan(single(1.2, 1.45), 3);
    expect(asDesigned.preset).toBeNull();
    expect(asDesigned.tiers[0].aspect).toBe(asDesigned.tiers[0].designAspect);
  });
});
