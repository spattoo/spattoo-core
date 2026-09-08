import { describe, it, expect } from 'vitest';
import {
  computeTinPlan,
  footprintArea,
  diameterFor,
  spongeDensity,
  ANCHOR,
  CAKE_BUILD,
  heightFor,
  enforceStep,
  MIN_TIER_STEP_IN,
  COMMON_TINS,
  layersFor,
  tinOptions,
  quantumFor,
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
  it('reproduces the cake it was measured from', () => {
    const d = diameterFor(ANCHOR.kg, ANCHOR.heightIn / ANCHOR.diameterIn);
    expect(d).toBeCloseTo(ANCHOR.diameterIn, 2);
  });

  it('derives the sponge density rather than asserting one', () => {
    /* ⚠️ The guard against the error the old chart died of. Component densities picked
     * independently look fine one at a time and disagree together.
     *
     * 0.44, and it is worth knowing why the previous 0.80 was impossible rather than merely wrong:
     * NOTHING BAKED IS 0.80 kg/L — that is the density of batter, before it rises. It came from a
     * 6x4 assumed to weigh 1.5kg. Measured against a real cake (3kg, 8in tin, 7in tall) the sponge
     * is 0.44 and the whole filled tier is 0.52, which is what a buttercream layer cake weighs.
     * A figure that cannot be true of anything you could take out of an oven is the tell. */
    expect(spongeDensity()).toBeCloseTo(0.44, 2);
  });

  it('does not let the order\'s build rewrite the sponge recipe', () => {
    /* ⚠️ Found by the layers test below, which failed in the opposite direction to reality.
     *
     * The first version derived the sponge density from the CALLER's build, so asking for four
     * layers made the sponge lighter — something had to give to hold a 6×4 at exactly 1kg. Cutting
     * a sponge does not change what it is made of. The anchor is a calibration at a stated build;
     * departing from it legitimately changes what a 6×4 weighs. */
    const tier = [round(1.2, 1.45)];
    // Layers are no longer a build FIELD — they follow the height (layersFor). The caller's handle
    // on them is the target slice thickness, so that is what must not reach the recipe.
    const at = (targetLayerIn) =>
      computeTinPlan(tier, 3, { build: { ...CAKE_BUILD, targetLayerIn } }).tiers[0].heightIn;
    expect(spongeDensity()).toBeCloseTo(0.44, 2);          // unmoved by anything below
    // Thinner slices means more of them, so more filling. More filling can only make a tier
    // shorter at a fixed weight. If the recipe followed the slicing this would rise instead,
    // which is how the bug showed itself.
    expect(at(1.0)).toBeLessThan(at(2.0));
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
  it('measures round and rect on the same scale', () => {
    /* ⚠️ THE MISSING PI. Round measured r²·h and rect measured w·d·h, so two tiers holding the same
     * cake split 0.96 / 3.04 instead of 2 / 2. Any cake mixing the families was wrong.
     *
     * Asserted on footprintArea rather than through computeTinPlan, which is where the bug was and
     * the only place it can be seen cleanly. The plan itself can no longer answer this: it used to
     * be driven here by stacking two tiers of EQUAL footprint, and the two-inch step rule now
     * forbids exactly that cake, so the weights it returns follow the stepped tins instead. Testing
     * the invariant through a path that is entitled to override it tests the override. */
    const r = 1.2;
    const side = Math.sqrt(Math.PI) * r;          // a square of exactly the circle's area
    expect(footprintArea(rect(side, side, 1.45))).toBeCloseTo(footprintArea(round(r, 1.45)), 3);
  });

  it('uses a heart\'s real footprint, not a guessed taper', () => {
    /* The old code had no branch for a heart: `r != null` failed and it fell through to a hardcoded
     * 0.62ⁿ taper, so two hearts returned the taper whatever their real sizes.
     *
     * Asserted on footprintArea for the same reason as the missing-π test above: the PLAN's final
     * weights follow the stepped tins, which are whole inches, so the ratio it returns is the ratio
     * of two snapped tins and not of two hearts. It agreed with the areas under the old calibration
     * by coincidence, and stopped agreeing the moment the anchor changed. */
    const ratio = footprintArea(heart(2.4, 2.4, 1.45)) / footprintArea(heart(1.8, 1.8, 1.45));
    expect(ratio).toBeCloseTo((2.4 / 1.8) ** 2, 2);   // area scales with the square
    expect(ratio).not.toBeCloseTo(1 / 0.62, 1);       // and NOT the old taper
  });
});

describe('the tin for a real order', () => {
  const twoTier = [round(1.2, 1.45), round(0.9, 1.37)];

  it('sizes a 5kg two-tier from the design\'s own proportions', () => {
    /* 9+7 at the measured anchor. ⚠️ This asserted 8+6, and before that 9+7 — it has now been each
     * twice, which is the honest signal that it tracks the anchor rather than the bakery's practice.
     * The bakery's stated 5kg TWO-tier is 8+6; this design is not that cake (its drawn proportions
     * are its own, and no preset is named here), so the two are not in conflict. The stated ladder
     * is pinned where it belongs, against the presets, in 'reproduces EVERY size this bakery gave'. */
    const { tiers } = computeTinPlan(twoTier, 5);
    expect(tiers[0].tinInch).toBe(9);
    expect(tiers[1].tinInch).toBe(7);
    // And it says how tall that makes them, which the old sheet never did.
    expect(tiers[0].heightIn).toBeGreaterThan(4);
    expect(tiers[0].heightIn).toBeLessThan(8);
    // The top is never taller than the base — the invert guard, on a real pair.
    expect(tiers[1].heightIn).toBeLessThanOrEqual(tiers[0].heightIn);
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
    const thick = computeTinPlan(tier, 3, { build: { ...CAKE_BUILD, targetLayerIn: 2.0 } }).tiers[0];
    const thin  = computeTinPlan(tier, 3, { build: { ...CAKE_BUILD, targetLayerIn: 1.0 } }).tiers[0];
    expect(thin.layers).toBeGreaterThan(thick.layers);     // thinner slices, more of them
    expect(thin.heightIn).toBeLessThan(thick.heightIn);    // and the tier is SHORTER for it
  });

  it('moves the tier less than a step of tin does', () => {
    // Which is the argument for the tall/wide handle being the control and layers being a trim.
    const thick = computeTinPlan(tier, 3, { build: { ...CAKE_BUILD, targetLayerIn: 2.0 } }).tiers[0];
    const thin  = computeTinPlan(tier, 3, { build: { ...CAKE_BUILD, targetLayerIn: 1.0 } }).tiers[0];
    expect(Math.abs(thin.heightIn - thick.heightIn)).toBeLessThan(1);
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
    // 500g houses exist; so do 100g ones. It is config, not a constant — one entry in the ladder
    // pins it exactly, which is what a house that only ever weighs to 500g wants.
    const half = computeTinPlan(two, 5, { build: { ...CAKE_BUILD, quantumLadder: [0.5] } });
    for (const t of half.tiers) expect((t.weightKg / 0.5) % 1).toBeCloseTo(0, 6);
  });

  it('uses a finer step for a small cake, because 250g of a 1.5kg cake is not a step', () => {
    /* ⚠️ The cake this was found on. A 1.5kg two-tier in 6+4 wants 1.08 / 0.42; on a 250g grid that
     * became 1.25 / 0.25 — a 5.3in base under a 2.3in token, which nobody builds. It read as the
     * no-inversion rule misbehaving and was only ever the grid: 250g is 2% of a 12kg order and
     * SEVENTEEN PERCENT of this one. */
    expect(quantumFor(1.5)).toBe(0.1);
    expect(quantumFor(2)).toBe(0.1);
    // And nothing a bakery already relies on moves: 3kg and up keep the 250g step.
    expect(quantumFor(3)).toBe(0.25);
    expect(quantumFor(5)).toBe(0.25);
    expect(quantumFor(12)).toBe(0.25);
  });
});

describe('the density, calibrated against a cake somebody baked', () => {
  /* ⚠️ The presets that used to be tested here are RETIRED — the tin comparison replaced them. What
   * they were calibrated against is not retired, because it is the only check that the model
   * describes real cakes, so it moved to `this bakery, as stated` below and is asserted against
   * `tinOptions`: the tin has to be among the options a baker is OFFERED, at the height this bakery
   * actually gets, rather than merely reachable by naming a build.
   *
   * ⚠️ And the presets are why that check has to be phrased carefully. Fitted against the batter
   * density they came out at 0.45 and 0.57 — far too flat — and reproduced the tin table anyway,
   * because with two free parameters an impossible density can be traded against an impossible
   * shape. The density is MEASURED now and there is no free shape, so the table cannot be reached
   * by a wrong model pretending.
   */
  const single = (r, h) => [round(r, h)];

  it('reproduces the cake the anchor was measured from', () => {
    // 3kg, 8in tin, 7in tall. Everything else in this file is geometry on top of this.
    const eight = tinOptions(single(1.2, 1.45), 3).find(o => o.tiers[0].tinInch === 8);
    expect(eight, '8in must be offered for a 3kg cake').toBeTruthy();
    expect(eight.tiers[0].heightIn).toBeCloseTo(7, 0);
  });

  it('offers a real spread, from flat to tall', () => {
    /* What the two presets were FOR, now a property of the row rather than two named guesses: the
     * same weight has to reach both a cake you would call flat and one you would call tall, or the
     * comparison is not offering a choice. */
    const opts = tinOptions(single(1.2, 1.45), 3);
    const ratios = opts.map(o => o.tiers[0].heightIn / o.tiers[0].tinInch);
    expect(Math.min(...ratios)).toBeLessThan(0.45);    // something properly flat
    expect(Math.max(...ratios)).toBeGreaterThan(1.0);  // and something properly tall
  });

  it('reports the exact diameter beside the tin, because some are near-ties', () => {
    /* ⚠️ Load-bearing, and the reason the sheet prints `exactInch`. A tin is snapped from an exact
     * figure, and where that figure sits near a boundary the answer could have gone either way. A
     * baker should be able to see that from the sheet rather than trusting a rounded number. */
    const t = computeTinPlan(single(1.2, 1.45), 3).tiers[0];
    expect(t.exactInch).toBeGreaterThan(0);
    expect(Math.abs(t.exactInch - t.tinInch)).toBeLessThan(1);
  });

  it('keeps the design\'s own proportions, since nothing overrides them any more', () => {
    const asDesigned = computeTinPlan(single(1.2, 1.45), 3);
    expect(asDesigned.tiers[0].aspect).toBe(asDesigned.tiers[0].designAspect);
  });
});

/* ── The bakery's own table, in one place ────────────────────────────────────────────────────────
 *
 * Every size below was given by the baker, not derived. This is the acceptance test for the whole
 * model: the tins come from these, so a change that still passes everything else and fails here has
 * moved the model off the bench it was built from.
 *
 * ⚠️ The two-tier rows were NEVER FITTED. Only the single-tier sizes went into the search; these
 * fall out of the same density and aspect. That is the only real evidence the model generalises,
 * so do not "fix" a failure here by fitting to it — find what the tins are actually saying.
 */
describe('this bakery, as stated', () => {
  const one = (r = 1.2) => [round(r, 1.45)];
  // A two-tier drawn with the top about two thirds of the base, which is what they build.
  const two = [round(1.2, 1.45), round(0.84, 1.45)];

  /* ⚠️ Asserted against what the baker is OFFERED, not against a preset that forced one answer.
   * That is a stronger claim: the bakery's tin has to survive the whole pipeline — solve, snap,
   * step, re-split, and the buildable filter — and still be on the row they choose from. */
  it.each([[1, 6], [1.5, 6], [2, 7], [2.5, 7], [3, 8], [5, 9]])(
    'single tier, %skg -> %s inch is offered', (kg, tin) => {
      expect(tinOptions(one(), kg).map(o => o.tiers[0].tinInch)).toContain(tin);
    });

  it('flat single tier, 5kg -> 10 or 11 inch is offered', () => {
    const tins = tinOptions(one(), 5).map(o => o.tiers[0].tinInch);
    expect(tins.some(t => t === 10 || t === 11)).toBe(true);
  });

  it.each([[3, '7+5'], [4, '8+6'], [5, '8+6']])(
    'two tier, %skg -> %s is offered', (kg, pair) => {
      expect(tinOptions(two, kg).map(o => o.key)).toContain(pair);
    });

  it('never names a height without saying how to build it', () => {
    /* ⚠️ THIS TEST USED TO ASSERT `h < 8`, AND THAT ASSERTION IS WHAT BROKE THE MODEL.
     *
     * It read as a sanity check — "no cake is nine inches tall" — and it is simply not true here.
     * This bakery's own anchor is an 8-inch tin standing 7, and a 9-inch holding 5kg comes out at
     * 9.2. When the correct density produced a tall answer, this test called it absurd, and the
     * density was raised until the tall answer went away. A bound asserted from intuition beat a
     * measurement, and took the whole file with it.
     *
     * The real invariant was never the number. It is that the sheet cannot name a height it has not
     * told the baker how to reach: no tin is nine inches deep, so a tall tier is several bakes and,
     * past `maxBarrelIn`, several barrels on their own dowelled boards. */
    for (const kg of [1, 1.5, 2, 2.5, 3, 5]) {
      for (const preset of ['tall', 'standard']) {
        const t = computeTinPlan(one(), kg, { preset }).tiers[0];
        const where = `${kg}kg ${preset}`;
        expect(t.heightIn, where).toBeGreaterThan(2);
        expect(t.heightIn, where).toBeLessThan(12);
        // Every named height is accounted for: enough bakes to hold the sponge, and enough
        // barrels that no stack stands taller than one board can carry.
        expect(t.bakes, where).toBeGreaterThanOrEqual(1);
        expect(t.bakes * CAKE_BUILD.maxBakeIn, where).toBeGreaterThanOrEqual(t.heightIn - t.fillings * CAKE_BUILD.fillingThicknessIn - 1e-9);
        expect(t.barrels * CAKE_BUILD.maxBarrelIn, where).toBeGreaterThanOrEqual(t.heightIn - 1e-9);
        // And the layering follows the cake rather than being one number for every one of them:
        // a real slice thickness, near the target, with a filling in every gap.
        expect(t.fillings, where).toBe(t.layers - 1);
        expect(t.layerIn, where).toBeGreaterThan(0.7);
        expect(t.layerIn, where).toBeLessThan(2.6);
      }
    }
  });
});

describe('tiers as a set, not one at a time', () => {
  const two = (rTop) => [round(1.2, 1.45), round(rTop, 1.45)];
  const single = (r, h) => [round(r, h)];

  it('steps adjacent tiers by at least two inches', () => {
    /* ⚠️ The defect this exists for: solved one at a time, a 4kg cake came back 8" + 7". Both
     * figures are right for their own weight and the PAIR is wrong — a 7" tier on an 8" base leaves
     * half an inch of ledge, with no room for a border. Nothing inside a single tier can see it. */
    for (const kg of [3, 4, 5, 6, 8]) {
      for (const rTop of [1.15, 1.05, 0.95, 0.8]) {
        const { tiers } = computeTinPlan(two(rTop), kg, { preset: 'tall' });
        expect(tiers[0].tinInch - tiers[1].tinInch).toBeGreaterThanOrEqual(MIN_TIER_STEP_IN);
      }
    }
  });

  it('never puts a taller tier on a shorter one', () => {
    /* Narrowing the top to clear the step, while it keeps its drawn share of the batter, made it
     * TALLER than its base — 9.3" on a 7.8" — and the 250g rounding put it over again even after
     * the weight was re-split. Both repairs are load-bearing; this is the property they exist for. */
    for (const kg of [3, 4, 5, 6, 8]) {
      for (const preset of ['tall', 'standard']) {
        for (const rTop of [1.15, 0.95, 0.8]) {
          const { tiers } = computeTinPlan(two(rTop), kg, { preset });
          expect(tiers[1].heightIn).toBeLessThanOrEqual(tiers[0].heightIn + 1e-6);
        }
      }
    }
  });

  it('reports the height of the tin that gets greased, not of the exact solve', () => {
    // 2kg solves to some fraction of an inch and snaps to a real tin; the same batter in a smaller
    // tin stands taller. Reporting the height at the unsnapped diameter describes a tin nobody owns.
    const { tiers } = computeTinPlan(single(1.2, 1.45), 2);
    const t = tiers[0];
    expect(t.heightIn).toBeCloseTo(heightFor(t.weightKg, t.tinInch), 1);
  });

  it('still bakes the whole order after the weight is moved about', () => {
    // Every repair above moves weight between tiers. None may lose or invent any.
    for (const kg of [3, 4, 5, 7]) {
      const p = computeTinPlan(two(0.95), kg, { preset: 'tall' });
      const sum = p.tiers.reduce((s, t) => s + t.weightKg, 0);
      expect(+sum.toFixed(3)).toBe(p.bakedKg);
      expect(sum).toBeGreaterThanOrEqual(kg - 1e-9);
    }
  });

  it('does not step a single tier, and does not step below the smallest tin', () => {
    expect(computeTinPlan(single(1.2, 1.45), 2, { preset: 'tall' }).tiers[0].tinInch).toBeGreaterThan(0);
    // Four tiers cannot all clear 2" inside the range of tins that exist; the floor holds.
    const four = [round(1.2, 1.45), round(1.0, 1.45), round(0.8, 1.45), round(0.6, 1.45)];
    for (const t of computeTinPlan(four, 6, { preset: 'tall' }).tiers) {
      expect(t.tinInch).toBeGreaterThanOrEqual(COMMON_TINS[0]);
    }
  });
});
