import { describe, it, expect } from 'vitest';
import {
  computeTinPlan, footprintArea, diameterFor, spongeDensity, ANCHOR, CAKE_BUILD, BUILDS,
  heightFor, enforceStep, MIN_TIER_STEP_IN, COMMON_TINS,
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
     * perfectly reasonable figure, and it produced a 7-inch tier twelve inches tall.
     *
     * 0.80 rather than the 0.50 this asserted while the anchor said a 6x4 was 1kg. That figure came
     * from a pan set, not from this bakery, and it made a 9-inch tier holding 5kg stand 10.4 inches
     * tall. Asked directly: 1 to 1.5kg for the same tin. */
    expect(spongeDensity()).toBeCloseTo(0.8, 2);
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
    /* 8+6, where this asserted 9+7 while the anchor said a 6x4 was 1kg. The bakery's own answer for
     * a 5kg two-tier is 8+6, so the correction moved this ONTO their practice, not away from it. */
    const { tiers } = computeTinPlan(twoTier, 5);
    expect(tiers[0].tinInch).toBe(8);
    expect(tiers[1].tinInch).toBe(6);
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
   * These numbers are not chosen. A grid search over density and height-to-width against this
   * bakery's own SIX single-tier sizes — 1 and 1.5kg → 6in, 2 and 2.5kg → 7in, 3kg → 8in, 5kg → 9in
   * — hits all six exactly at h/d 0.57 and 0.80 kg/L, and their three two-tier points fall out of
   * the same figures without further fitting. If a change here stops reproducing these, it is wrong.
   *
   * ⚠️ An earlier fit reached only four of six and blamed the bakery, in a comment right here: it
   * called 1kg and 2.5kg "ties" the bakery broke inconsistently, and concluded that forcing them
   * would be overfitting. It was not a tie-break. It was the ANCHOR — a 6x4 taken as 1kg from a pan
   * set, when the answer for these cakes is 1.5. Fix the anchor and both "ties" land on the
   * bakery's own choice with nothing forced. A model that cannot reach the data is a model to
   * re-examine before it is a bakery to explain away.
   */
  const single = (r, h) => [round(r, h)];
  const tinFor = (kg) => computeTinPlan(single(1.2, 1.45), kg, { preset: 'tall' }).tiers[0].tinInch;

  const exactFor = (kg) => computeTinPlan(single(1.2, 1.45), kg, { preset: 'tall' }).tiers[0].exactInch;

  it('reproduces EVERY size this bakery gave, not the comfortable ones', () => {
    for (const [kg, theirs] of [[1, 6], [1.5, 6], [2, 7], [2.5, 7], [3, 8], [5, 9]]) {
      expect(tinFor(kg), `${kg}kg`).toBe(theirs);
    }
  });

  it('reports the exact diameter beside the tin, because three of six are near-ties', () => {
    /* ⚠️ Load-bearing, and the reason the sheet prints `exactInch`. 1kg lands on 5.5in, 2.5kg on
     * 7.5in and 5kg on 9.5in — each a hair from a snap boundary, each currently falling the
     * bakery's way. The fit is exact but it is NOT robust: a small move in density flips these
     * three. Anyone changing the anchor should expect to re-check them, and a baker should be able
     * to see from the sheet when a tin could have gone either way. */
    expect(exactFor(1)).toBeCloseTo(5.5, 1);
    expect(exactFor(2.5)).toBeCloseTo(7.5, 1);
    expect(exactFor(5)).toBeCloseTo(9.5, 1);
  });

  it('makes a long cake taller than a flat one at the same weight', () => {
    /* ⚠️ NOT "as tall as it is wide" — this asserted h/d ~ 0.98, which was never observed. It was
     * the aspect the wrong anchor forced: too little density means too much volume, so the tier had
     * to grow upward to hold the weight. At 0.80 kg/L the same cakes come out at 0.57. What
     * separates the builds is that one is taller than the other, and that is what is asserted. */
    const long = computeTinPlan(single(1.2, 1.45), 3, { preset: 'tall' }).tiers[0];
    const flat = computeTinPlan(single(1.2, 1.45), 3, { preset: 'standard' }).tiers[0];
    expect(long.heightIn / long.exactInch).toBeCloseTo(0.57, 1);
    expect(long.heightIn).toBeGreaterThan(flat.heightIn);
    expect(long.tinInch).toBeLessThan(flat.tinInch);
  });

  it('spreads a flat cake out to the bakery\'s own answer', () => {
    // Their words: "9 inch if you want height, 10 or 11 for flat" — of the same 5kg cake.
    const flat = computeTinPlan(single(1.2, 1.45), 5, { preset: 'standard' }).tiers[0];
    expect([10, 11]).toContain(flat.tinInch);
    expect(computeTinPlan(single(1.2, 1.45), 5, { preset: 'tall' }).tiers[0].tinInch).toBe(9);
    expect(flat.heightIn / flat.exactInch).toBeCloseTo(0.45, 1);
  });

  it('uses ONE density for both builds — a build is a shape, not a recipe', () => {
    /* ⚠️ This test asserted the OPPOSITE, and defended it: "a taller tier carries proportionally
     * more filling and less sponge, so one density cannot serve both builds."
     *
     * That was rationalising a fitting artefact. Each build had been given its own anchor, so each
     * got its own density, and the second density existed only to absorb an aspect (0.98) that the
     * wrong anchor weight had forced. Baking a tier taller does not change what the sponge is made
     * of. With the anchor corrected, one density reproduces every size in this bakery's table under
     * both builds, and the builds differ by exactly what a build is: how tall it stands. */
    expect(spongeDensity(BUILDS.tall.anchor)).toBeCloseTo(spongeDensity(BUILDS.standard.anchor), 6);
    expect(BUILDS.tall.aspect).toBeGreaterThan(BUILDS.standard.aspect);
  });

  it('leaves the design\'s own proportions alone when no build is named', () => {
    // The conservative default: no preset means the tier keeps what the customer was shown.
    const asDesigned = computeTinPlan(single(1.2, 1.45), 3);
    expect(asDesigned.preset).toBeNull();
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

  it.each([[1, 6], [1.5, 6], [2, 7], [2.5, 7], [3, 8], [5, 9]])(
    'long single tier, %skg -> %s inch', (kg, tin) => {
      expect(computeTinPlan(one(), kg, { preset: 'tall' }).tiers[0].tinInch).toBe(tin);
    });

  it('flat single tier, 5kg -> 10 or 11 inch', () => {
    expect([10, 11]).toContain(computeTinPlan(one(), 5, { preset: 'standard' }).tiers[0].tinInch);
  });

  it.each([[3, [7, 5]], [4, [8, 6]], [5, [8, 6]]])(
    'long two tier, %skg -> %s', (kg, tins) => {
      expect(computeTinPlan(two, kg, { preset: 'tall' }).tiers.map(t => t.tinInch)).toEqual(tins);
    });

  it('gives every one of them a height a cake could actually be', () => {
    // The check that caught the wrong anchor: it reproduced the tins and asked for a 10.4in tier.
    for (const kg of [1, 1.5, 2, 2.5, 3, 5]) {
      for (const preset of ['tall', 'standard']) {
        const h = computeTinPlan(one(), kg, { preset }).tiers[0].heightIn;
        expect(h, `${kg}kg ${preset}`).toBeGreaterThan(2);
        expect(h, `${kg}kg ${preset}`).toBeLessThan(8);
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
    const { tiers } = computeTinPlan(single(1.2, 1.45), 2, { preset: 'tall' });
    const t = tiers[0];
    expect(t.heightIn).toBeCloseTo(heightFor(t.weightKg, t.tinInch, CAKE_BUILD, BUILDS.tall.anchor), 1);
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
