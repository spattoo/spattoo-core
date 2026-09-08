import { tierShape } from '../../designer/geometry/surface.js';

/* ── Which tin to bake each tier in ──────────────────────────────────────────────────────────────
 *
 * The order fixes the WEIGHT. The design fixes each tier's SHAPE — its footprint and how tall it is
 * relative to its width. Between them the finished tier has a definite size, and the tin is that
 * size. Nothing here is looked up.
 *
 * ── WHAT THIS REPLACED, AND WHY EVERY PART OF IT WAS WRONG ──────────────────────────────────────
 *
 * A hardcoded chart of tin → kg, which the file itself admitted was "a sensible starter … meant to
 * be reviewed/tuned". Four defects, all measured before this was written:
 *
 *   1. THE CHART WAS THE WRONG TOOL. Any weight→tin table bakes in a fixed cake height. The height
 *      is not free — it is in the design, and it differs per tier. The old code read `tier.height`
 *      to split the weight and then threw it away when picking the tin.
 *   2. THE PI WAS MISSING. Round tiers measured `r²·h` while rect measured `w·d·h`, so two tiers of
 *      identical real volume split 0.96 / 3.04 instead of 2 / 2 — off by exactly π.
 *   3. EVERY OTHER SHAPE FELL THROUGH. A heart is sized by width/depth, not radius, so `r != null`
 *      failed and it silently used `0.62ⁿ` — a guessed taper. Measured: heart tiers of 2.4 and 1.8
 *      returned exactly the fallback ratio, ignoring their real footprints.
 *   4. THE NUMBERS DRIFTED 38%. Its first three rows are the Indian trade convention (6/7/8in =
 *      1/1.5/2kg, sold as a pan set). Everything above 8in was extrapolated by eye, and by 14in it
 *      claimed a tin held 38% more than geometry allows — so it recommended tins TOO SMALL, worst
 *      on the big tiers where an overflow costs the most.
 *
 * ── THE ONE NUMBER THIS RESTS ON ────────────────────────────────────────────────────────────────
 *
 * Density. It is the whole difference between two believable answers for a 5kg two-tier: 9in+7in at
 * a filled sponge, 8in+6in at something much denser. So it is a parameter, not a constant, and the
 * sponge figure is DERIVED from the one datum anybody can check — a 6in × 4in pan makes a 1kg cake,
 * which is what the trade sells pans as. Pick a filling and the sponge follows; the model can never
 * drift from the anchor because it is solved against it.
 */

/* ⚠️ THIS BAKERY'S anchor is a cake they BAKED, measured — not a convention, and not a guess.
 *
 * 3 kg in an 8-inch tin, standing 7 inches. That is one of their own football cakes, and every
 * number in this file is solved against it.
 *
 * ── WHAT IT REPLACED, AND WHY THAT WAS WRONG ────────────────────────────────────────────────────
 *
 * A 6x4 assumed to weigh 1.5kg, which fixed the density at 0.809 kg/L. Nothing baked is 0.809 —
 * that is the density of BATTER, before it rises. The measured cake says 0.520, so the model was
 * 55% too dense and every cake it sized came out about a third too small. Asked for a 12kg cake it
 * answered "11 inch, 9.6 inch tall"; the real answer is nearer 14 inch and 9 inch tall.
 *
 * ⚠️ AND THE 1.5 WAS ITSELF A CORRECTION THAT WENT THE WRONG WAY. The file started at 1.0 — which
 * this anchor now says was RIGHT, since a 6x4 at 0.520 weighs 0.96 kg — and raised it because at a
 * realistic density "a 9-inch tier holding 5kg would have to stand 10.4 INCHES TALL", which read as
 * absurd. It is not absurd here: their 8-inch stands 7, and a 9-inch holding 5kg comes out at 9.2.
 * The tall answer was correct and was judged against a flat-cake assumption that this bakery does
 * not build to. The density was then bent until the tall answer disappeared, and the BUILD ASPECTS
 * were bent with it (they are now retired — see the note below). Two errors in the same
 * direction, each hiding the other.
 *
 * The lesson is the one this file already states and then broke: solve against a cake somebody
 * weighed. A number that cannot reproduce a real cake is wrong however plausible it reads.
 */
export const ANCHOR = Object.freeze({ diameterIn: 8, heightIn: 7, kg: 3 });

/* ── The tall/flat presets are GONE, and the reason is worth keeping ────────────────────────────
 *
 * There were two: `standard` (flat) and `tall`, each an aspect the tier was forced to whatever the
 * customer had drawn. They were a control for one question — how tall should this cake stand? — and
 * the tin comparison is a better answer to it: the baker sees the actual options, drawn to scale,
 * and picks the one that matches the customer's picture. Two named guesses cannot beat that, and
 * keeping them would leave two ways to decide the same thing.
 *
 * ⚠️ Their FIT is not gone, because it is the calibration. The presets existed to reproduce this
 * bakery's own tin table — 1 and 1.5kg → 6in, 2 and 2.5kg → 7in, 3kg → 8in, 5kg → 9in — and that
 * table is still the check that the density is right. It is asserted against `tinOptions` now, which
 * is a stronger form of the same test: the tin must be among the options a baker is offered, at the
 * height that bakery actually gets, rather than only reachable by naming a preset.
 *
 * ⚠️ And the fit is why the presets were dangerous. Fitted against the batter density, they came out
 * at 0.45 and 0.57 — far too flat — and each error concealed the other, because with two free
 * parameters an impossible density can always be traded against an impossible shape and still
 * reproduce the tins. One measured density and no free shape is what makes the model checkable.
 */

export const CAKE_BUILD = Object.freeze({
  /* ⚠️ LAYERS ARE NOT A CONSTANT. They were — fixed at 2 — so a 3-inch cake and a 9-inch one were
   * both reported as "2 layers, 1 filling". Nobody builds a nine-inch cake as two slabs with one
   * scrape of buttercream between them; the sponge is torted and filled every inch and a half.
   *
   * So the count comes from the HEIGHT (see layersFor) and this is the target thickness of one
   * slice of sponge, which is the number a baker actually holds in their head.
   *
   * ⚠️ It makes the tier SHORTER, not taller, and that surprises people. Buttercream is twice the
   * density of sponge, so at a FIXED order weight every gap you add buys its height by taking more
   * than that much away from the sponge. Adding filling only makes a cake taller if it may also get
   * heavier, and an order fixes the weight. */
  targetLayerIn: 1.5,        // one slice of sponge, before filling
  fillingThicknessIn: 0.4,   // per gap
  fillingDensity: 0.90,      // kg/L — buttercream. Ganache and fresh cream differ.

  /* ── How it is BAKED, which is not how it is built ────────────────────────────────────────────
   *
   * ⚠️ NO TIN IS NINE INCHES DEEP. The sheet used to name a tin and a finished height and stop,
   * which reads as one impossible bake. A tall cake is several bakes, torted and stacked.
   *
   * `maxBakeIn` is the sponge one tin yields in a single bake. `maxBarrelIn` is how tall a stack
   * can stand on one board before it needs its own: past roughly six inches the bottom layers
   * compress under the weight, so the cake is built as BARRELS — each on a board, the lower one
   * dowelled to carry the upper — and iced as one. That is the standard double-barrel build. */
  maxBakeIn: 3,              // sponge per bake; deep tins go to ~4, this is the safe figure
  maxBarrelIn: 6,            // taller than this and it needs a board + dowels under the next barrel

  /* ── What counts as a cake at all ─────────────────────────────────────────────────────────────
   * The comparison offers every tin that could hold the weight, and most of them are not offers.
   * A 1.5kg in a 12in tin stands under an inch — you cannot torte that, let alone fill it — and the
   * same weight in a 4in stands about fourteen, which nobody carries to a party. Bounds, so the row
   * shows choices instead of arithmetic. */
  minTierIn: 2,              // shorter than this and there is nothing to slice
  /* ⚠️ A RATIO, NOT INCHES, and the first attempt at inches got it exactly backwards. A 12in cap
   * threw out a 12in tin standing 12.2 — a tall cake, but a perfectly ordinary one, and the very
   * option a baker matching a tall photo needs — while happily keeping a 1kg baked in a 4in tin at
   * 9.3in, which is a column. Height alone says nothing; height against WIDTH is what makes a cake
   * look like a cake. This bakery's own anchor is 0.875 and their tall builds reach about 1.0. */
  maxTierAspect: 1.3,        // taller than this against its own width and it reads as a column
  /* ⚠️ 18, NOT 14, and the bakery's own table is what corrected it. Their 5kg two-tier is 8+6 —
   * stated, never fitted — and at the measured density that cake is 14.4in tall: an 8in base near
   * eight inches with a 6in top of six on top of it, which is exactly the way they build (their
   * 8in single tier stands 7). A 14in ceiling quietly deleted one of the three points the model is
   * checked against, and a filter that removes the evidence is worse than no filter. */
  maxTotalIn: 18,            // taller than this and it stops being a cake somebody can move

  /* ⚠️ Nobody bakes 3.26 kg. Batter is weighed out in round amounts, and a tier's share of the
   * order has to land on one — 3.25 and 1.75, not 3.26 and 1.74. Pure arithmetic produces a number
   * that is exactly right and cannot be followed.
   *
   * ⚠️ BUT A FIXED STEP IS TOO COARSE FOR A SMALL CAKE, and it showed as a cake nobody would build.
   * 250g is 2% of a 12kg order and SEVENTEEN PERCENT of a 1.5kg one. On a 1.5kg two-tier in 6+4 the
   * honest split is 1.08 / 0.42; forced onto a 250g grid it became 1.25 / 0.25, which is a 5.3in
   * base under a 2.3in token — and it looked like the no-inversion rule misbehaving when it was
   * only ever the grid. At 100g the same cake is 4.5 + 4.0, which is what a baker would make.
   *
   * So the step is chosen per order: the coarsest one a baker would weigh to that still leaves
   * enough of them to divide. `minSteps` is what "enough" means. Nothing at 3kg and above moves. */
  quantumLadder: [0.05, 0.1, 0.25],   // steps a baker will actually weigh to, finest first
  minSteps: 12,                       // at least this many to share out, or the grid drives the cake
});

/* The batter step for an order of `totalKg`. See the note above for why it is not a constant.
 *
 * A bakery that weighs to its own step sets `quantumLadder` — one entry pins it exactly, which is
 * what a 500g house wants.
 */
export function quantumFor(totalKg, build = CAKE_BUILD) {
  const ladder = build.quantumLadder ?? [0.25];
  if (!(totalKg > 0)) return ladder[ladder.length - 1];
  const cap = totalKg / (build.minSteps ?? 12);
  const fits = ladder.filter(q => q <= cap + 1e-9);
  return fits.length ? fits[fits.length - 1] : ladder[0];
}

/* How many slices of sponge a tier of `heightIn` is built from, and the gaps that go with them.
 *
 * Closed form rather than a loop. With L slices there are L-1 gaps, so the sponge left is
 * h - t(L-1) and each slice is (h - t(L-1))/L. Setting that to the target and solving:
 *
 *     L = (h + t) / (target + t)
 *
 * Rounded, and never below 2 — one slab is not a layer cake. The anchor's own 7 inches comes out
 * at 4 slices of 1.45in with 3 fillings, which is what that cake is.
 *
 * ⚠️ FOR A HEIGHT THAT IS ALREADY KNOWN — the anchor, or a cake somebody has measured. When the
 * height is still being solved for, the height MOVES with the layer count and this closed form is
 * the wrong question; see the search in tierBuild, and do not expect the two to agree.
 */
export function layersFor(heightIn, build = CAKE_BUILD) {
  const t = build.fillingThicknessIn, target = build.targetLayerIn;
  if (!(heightIn > 0) || !(target > 0)) return 2;
  return Math.max(2, Math.round((heightIn + t) / (target + t)));
}

/* ⚠️ The build the ANCHOR describes, which is NOT whatever this order asked for.
 *
 * A pan set sold as "6in = 1kg" means a 1kg cake as the trade typically builds it. Deriving the
 * sponge density from the CALLER's build instead made the recipe follow the slicing: ask for four
 * layers and the sponge quietly became lighter, because something had to give to keep a 6×4 at
 * exactly 1kg. That is backwards — cutting a sponge does not change what it is made of, and the
 * model then said more filling makes a tier TALLER, which is only true if the weight may grow.
 *
 * Caught by a test, not by reading. The anchor is a calibration point at a stated build; departing
 * from that build legitimately changes what a 6×4 weighs, and that is the honest behaviour. */
export const ANCHOR_BUILD = CAKE_BUILD;

const IN3_PER_L = 61.0237;
const areaOf = (d) => Math.PI * (d / 2) ** 2;

/* Sponge density, SOLVED so the model reproduces the anchor rather than asserting a number.
 *
 * ⚠️ This is the guard that catches the class of error the old chart died of. Component densities
 * picked independently look plausible one at a time and disagree together: 0.40 for sponge — a
 * perfectly reasonable figure for a light bake — produced a 7-inch tier standing twelve inches tall.
 * Anything that cannot make a 6×4 into 1kg is wrong, whatever it says on a bag of flour.
 */
export function spongeDensity(anchor = ANCHOR) {
  const b = ANCHOR_BUILD;   // the filling the anchor was built with — never the order's
  const A = areaOf(anchor.diameterIn);
  // The anchor's own height decides how it was layered — 7in comes out at 4 slices, 3 fillings.
  const hFill = Math.max(0, (layersFor(anchor.heightIn, b) - 1) * b.fillingThicknessIn);
  const hSponge = Math.max(0.1, anchor.heightIn - hFill);
  const litres = (h) => (A * h) / IN3_PER_L;
  return (anchor.kg - litres(hFill) * b.fillingDensity) / litres(hSponge);
}

/* The tier's footprint, in design units², for ANY shape.
 *
 * `tierShape` already resolves every family the designer can make and hands back a polygon for the
 * ones that are not analytic — so a heart is measured, not approximated by the circle around it.
 * Nothing here needs to know the list of shapes, which is the point: a new shape is a DB row.
 */
export function footprintArea(tier) {
  const s = tierShape(tier);
  if (s.outline?.length > 2) {
    // Shoelace over {x, z}. The sign depends on winding and is not interesting; the magnitude is.
    let sum = 0;
    for (let i = 0; i < s.outline.length; i++) {
      const a = s.outline[i], b = s.outline[(i + 1) % s.outline.length];
      sum += a.x * b.z - b.x * a.z;
    }
    return Math.abs(sum) / 2;
  }
  if (s.kind === 'rect') {
    const w = s.halfW * 2, d = s.halfD * 2;
    // A rounded corner removes (4 - π)r² between them, which is small but free to be right about.
    return w * d - (4 - Math.PI) * (s.cornerR ?? 0) ** 2;
  }
  return Math.PI * (s.radius ?? tier?.radius ?? 1.2) ** 2;
}

/* The real diameter of a tier that weighs `kg`, built to `aspect` (height ÷ diameter).
 *
 * Solved rather than looked up, and by bisection rather than algebra: the filling contributes a
 * fixed HEIGHT and the sponge takes what is left, so the weight is not a clean cubic in d once the
 * sponge height is clamped at zero. Bisection is a dozen lines and cannot be wrong about a case
 * nobody thought of.
 */
export function diameterFor(kg, aspect, build = CAKE_BUILD, anchor = ANCHOR) {
  const rhoS = spongeDensity(anchor);
  // No iteration here: the aspect pins the height at every candidate diameter, so the layer count
  // falls straight out of it. Only heightFor, where the diameter is fixed instead, has to settle.
  const weightAt = (d) => {
    const h = aspect * d;
    const hFill = Math.max(0, (layersFor(h, build) - 1) * build.fillingThicknessIn);
    const hSponge = Math.max(0, h - hFill);
    return (areaOf(d) * (hSponge * rhoS + hFill * build.fillingDensity)) / IN3_PER_L;
  };
  let lo = 0.5, hi = 40;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (weightAt(mid) < kg) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* Split `totalKg` across tiers in whole quanta, by share, summing to the total.
 *
 * Largest remainder (Hamilton): floor everything, then hand the leftover quanta to the tiers that
 * lost the most in the rounding. Rounding each tier on its own is what breaks the sum — three tiers
 * at .17 each round down and the cake is a quarter-kilo light, with nothing saying so.
 *
 * ⚠️ Rounds the TOTAL up, never down. A baker can trim a cake that came out heavy; they cannot add
 * to one that came out light without baking again. So an order that is not a whole number of quanta
 * bakes slightly over, and `bakedKg` says by how much rather than quietly restating the order.
 *
 * Every tier gets at least one quantum: a tier of zero is not a tier.
 */
export function apportion(shares, totalKg, quantumKg) {
  const n = shares.length;
  if (!n) return [];
  if (!(quantumKg > 0)) return shares.map(s => totalKg * s);
  const units = Math.max(n, Math.ceil(totalKg / quantumKg - 1e-9));
  const exact = shares.map(s => s * units);
  const base = exact.map(e => Math.max(1, Math.floor(e)));
  let left = units - base.reduce((a, b) => a + b, 0);
  // Give out (or claw back) one quantum at a time, worst-rounded first.
  const order = exact.map((e, i) => ({ rem: e - Math.floor(e), i }))
                     .sort((a, b) => (left > 0 ? b.rem - a.rem : a.rem - b.rem));
  for (let k = 0; left !== 0 && k < order.length * units; k++) {
    const i = order[k % n].i;
    if (left > 0) { base[i]++; left--; }
    else if (base[i] > 1) { base[i]--; left++; }
  }
  return base.map(u => +(u * quantumKg).toFixed(3));
}

/* The tins a baker actually owns. Snapping is a convenience, so the exact figure travels too.
 *
 * ⚠️ 16 and 18 ARE ORDINARY PROFESSIONAL SIZES and stopping at 14 was costing real answers. With a
 * 14-inch ceiling a big cake has nowhere to spread, so it climbs: a 12kg came back at 11 inches
 * across and nearly ten tall. At 16 the same cake is 7 inches tall, which is a cake somebody can
 * carry. Both want a heating core (two for an 18) and a long bake — see the bake notes.
 *
 * ⚠️ STILL HARDCODED, and it should not be. Every bakery owns a different set, and this is exactly
 * the kind of value the root CLAUDE.md says an admin must be able to change without a deploy. It is
 * seeded here ready to be overlaid; the API route and the admin screen are not written yet. */
export const COMMON_TINS = Object.freeze([4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18]);
export const snapToCommon = (inch) =>
  COMMON_TINS.reduce((best, t) => (Math.abs(t - inch) < Math.abs(best - inch) ? t : best), COMMON_TINS[0]);

/* ── Adjacent tiers step by at least this much ───────────────────────────────────────────────────
 *
 * ⚠️ A 7-inch tier on an 8-inch base is not a tiered cake. It leaves half an inch of ledge all the
 * way round — no room for a border, a ribbon or a shell, and from the front the step reads as a
 * mistake rather than a design. Every real two-tier steps by two inches or more.
 *
 * Solving each tier on its own could never see this: both answers are individually correct for their
 * own weight, and the pair is wrong. The step is a property of the CAKE, so it is enforced after the
 * tiers are solved, not inside the solve.
 */
export const MIN_TIER_STEP_IN = 2;

/* The height a given weight fills a given tin to — the inverse of `diameterFor`.
 *
 * ⚠️ Needed because the tin a baker uses is not the diameter the solve returned. `diameterFor` gives
 * an exact figure like 7.4″, which snaps to a 7″ tin, and the same batter in a smaller tin stands
 * TALLER. Reporting the height at the exact diameter — which is what shipped — describes a tin
 * nobody owns. Once a tier is also pushed down to clear the step below it, the gap stops being a
 * rounding difference and becomes a whole inch of height.
 *
 * ⚠️ NO LONGER ALGEBRAIC. With the layer count following the height it is a fixed point, so this
 * returns the whole build — height, layers, fillings, and how many bakes and barrels it takes.
 */
export function tierBuild(kg, diameterIn, build = CAKE_BUILD, anchor = ANCHOR) {
  if (!(kg > 0) || !(diameterIn > 0)) return null;
  const rhoS = spongeDensity(anchor);
  const A = areaOf(diameterIn);
  const at = (layers) => {
    const hFill = Math.max(0, (layers - 1) * build.fillingThicknessIn);
    const hSponge = Math.max(0, (kg * IN3_PER_L / A - hFill * build.fillingDensity) / rhoS);
    return { heightIn: hSponge + hFill, hSponge, layers, layerIn: hSponge / layers };
  };

  /* ⚠️ SEARCHED, NOT ITERATED, and the difference is a bug that shipped in the first draft.
   *
   * The obvious way is a fixed point: guess the layers, get a height, re-read the layers off that
   * height, repeat. It does not settle. Adding a layer adds filling, which makes the tier SHORTER,
   * which asks for fewer layers, which makes it taller again — a 1kg cake flips between 2 and 3
   * forever. Stopping after n turns leaves whatever the last turn held, so the sheet could name a
   * height and a layer count that disagree with each other.
   *
   * The weight is what is actually fixed, so every candidate count is evaluated on its own terms —
   * each gives a real height and a real slice — and the one whose slice lands nearest the target
   * wins. No oscillation, because nothing is fed back. Ties go to MORE layers: thinner slices are
   * the safer bake, and a baker would rather torte once more than serve a slab.
   */
  let best = null;
  for (let L = 2; L <= 40; L++) {
    const cand = at(L);
    if (cand.hSponge <= 0) break;                      // filling alone already exceeds the weight
    const miss = Math.abs(cand.layerIn - build.targetLayerIn);
    if (!best || miss <= best.miss) best = { ...cand, miss };
    else break;                                        // miss is convex in L — past the turn
  }
  if (!best) best = at(2);

  return {
    heightIn: best.heightIn,
    layers: best.layers,
    fillings: Math.max(0, best.layers - 1),
    layerIn: best.layerIn,
    // Sponge only — the filling is spread, not baked, so it is not part of what goes in the oven.
    bakes: Math.max(1, Math.ceil(best.hSponge / build.maxBakeIn - 1e-9)),
    // 1 = one board under the whole cake. 2+ = a double barrel, each on its own dowelled board.
    barrels: Math.max(1, Math.ceil(best.heightIn / build.maxBarrelIn - 1e-9)),
  };
}

/* The height alone — kept because it is the question most callers ask, and because the step and
 * inversion passes below compare heights and have no use for the rest. */
export function heightFor(kg, diameterIn, build = CAKE_BUILD, anchor = ANCHOR) {
  return tierBuild(kg, diameterIn, build, anchor)?.heightIn ?? null;
}

/* Push each tier down until it clears the one below it by MIN_TIER_STEP_IN.
 *
 * Bottom-first, and it only ever goes DOWN: the base is the tier whose size the customer effectively
 * chose by ordering the weight, and growing it would make the cake bigger than what was ordered.
 * Narrowing the top instead keeps the total right and makes it taller, which is what a baker does.
 *
 * The smallest tin anyone owns is the floor. A design that cannot be stepped inside that floor —
 * four tiers, say — comes back with the step unmet on the tiers that ran out of room, and says so
 * through `stepped` rather than silently returning sizes that do not exist.
 */
export function enforceStep(tins, minStep = MIN_TIER_STEP_IN) {
  const floor = COMMON_TINS[0];
  const out = [];
  let ceiling = Infinity;
  for (const tin of tins) {
    if (tin == null) { out.push(null); continue; }
    let pick = Math.min(tin, ceiling);
    // Snap DOWN to a tin that exists, never up — up would breach the step we just made room for.
    const owned = COMMON_TINS.filter(t => t <= pick + 1e-9);
    pick = owned.length ? owned[owned.length - 1] : floor;
    out.push(pick);
    ceiling = pick - minStep;
  }
  return out;
}

/* ── Every tin this weight could be baked in, as whole cakes ─────────────────────────────────────
 *
 * ⚠️ A COMPARISON, NOT A RECOMMENDATION, and that is the point of the feature rather than a hedge.
 * Which tin to use is a question about how the finished cake should LOOK, and the customer's own
 * picture is the only thing that answers it. The model is good at the geometry — this weight in
 * that tin gives this height and these layers — and has no business guessing the taste. So it lays
 * the options out and the baker matches the picture.
 *
 * ⚠️ It also makes the model checkable. A recommendation hides its own errors: it was 55% too dense
 * for months and surfaced only when somebody finally said so. Five options side by side are wrong
 * in front of you the first time you bake one.
 *
 * ONE DEGREE OF FREEDOM, even for a stack. The pairs are not free — the design's own footprint ratio
 * decides how far the top steps in, and MIN_TIER_STEP_IN and the no-inversion rule finish it — so
 * picking an option picks every tin in it. A two-tier 5kg has about eight real answers, not the
 * dozens a per-tier chooser would imply, which is why an option is a whole CAKE and not a tier.
 *
 * Swept through `shapeBias` rather than by choosing tins directly: the bias is the existing handle
 * on proportion, so every option this produces is one the solver can actually reach, including the
 * step and re-split passes. Generating tin sets directly would invent combinations the rest of the
 * pipeline would then quietly refuse.
 */
export function tinOptions(tiersInput, weightKg, opts = {}) {
  const build = { ...CAKE_BUILD, ...(opts.build ?? {}) };
  const out = [];
  const seen = new Set();
  for (let bias = 0.4; bias <= 2.6; bias += 0.01) {
    const plan = computeTinPlan(tiersInput, weightKg, { ...opts, shapeBias: bias });
    const tiers = plan.tiers;
    if (!tiers.length || tiers.some(t => t.tinInch == null || t.heightIn == null)) continue;
    const key = tiers.map(t => t.tinInch).join('+');
    if (seen.has(key)) continue;
    seen.add(key);

    const totalIn = +tiers.reduce((s, t) => s + t.heightIn, 0).toFixed(1);
    // Unbuildable is not an option. Kept out here rather than greyed out in the UI: a row of five
    // real choices is the feature, and a row of twelve with seven struck through is a puzzle.
    if (totalIn > build.maxTotalIn) continue;
    if (tiers.some(t => t.heightIn < build.minTierIn)) continue;
    if (tiers.some(t => t.heightIn / t.tinInch > build.maxTierAspect + 1e-9)) continue;
    /* ⚠️ AND NOT A STACK THAT IS NOT A STACK. When the step rule runs out of tins it gives up and
     * repeats the smallest one, so a small cake can produce 4+4 — two discs of the same size with
     * no ledge for a border, which is not a tiered cake. `stepped` does not catch it (it detects
     * narrowing, not running out), so it is caught here on the geometry itself. */
    if (tiers.some((t, i) => i > 0 && t.tinInch > tiers[i - 1].tinInch - MIN_TIER_STEP_IN + 1e-9)) continue;

    out.push({ key, tiers, totalIn, bakedKg: plan.bakedKg });
  }
  // Widest base first, so the row reads flat → tall, which is the axis the baker is choosing on.
  out.sort((a, b) => b.tiers[0].tinInch - a.tiers[0].tinInch);
  return out;
}

/* Returns { totalKg, build, tiers: [{ index, label, weightKg, tinInch, exactInch, heightIn,
 *           layers, fillings, layerIn, bakes, barrels, shape, square, aspect }] }
 *
 * `tiers` is design_snapshot.tiers, bottom-first. weightKg may be null — with no weight there is no
 * scale, and the report says so rather than inventing one.
 *
 * `opts.shapeBias` is the tall/wide control: 1 keeps the proportions the customer was shown, above 1
 * is taller and narrower, below is wider and flatter. It multiplies the aspect, so the handle starts
 * on the design and every other position is a stated departure from it.
 */
export function computeTinPlan(tiersInput, weightKg, opts = {}) {
  const build = { ...CAKE_BUILD, ...(opts.build ?? {}) };
  /* ⚠️ INTERNAL NOW. `shapeBias` was the baker's tall/wide handle and is no longer offered — the tin
   * comparison replaced it. It stays because `tinOptions` sweeps it to ENUMERATE the options, and
   * sweeping the real handle guarantees every option it produces is one this solver can actually
   * reach, step rule and re-split included. Generating tin sets directly would invent combinations
   * the rest of the pipeline would then quietly refuse. Callers other than tinOptions leave it at 1. */
  const bias = opts.shapeBias ?? 1;
  const anchor = ANCHOR;
  const tiers = Array.isArray(tiersInput) ? tiersInput : [];
  const n = tiers.length;
  if (n === 0) return { totalKg: weightKg ?? null, build, tiers: [] };

  // TRUE volume per tier — the same units for every shape, so the ratio between a round tier and a
  // rect one is finally the ratio of the cakes rather than of two different formulas.
  const areas = tiers.map(t => footprintArea(t));
  const vols = tiers.map((t, i) => areas[i] * (t?.height ?? 1));
  const totalVol = vols.reduce((s, v) => s + v, 0) || 1;
  const total = typeof weightKg === 'number' && weightKg > 0 ? weightKg : null;

  // Weights a baker can actually weigh out, summing to what was ordered.
  const quantum = quantumFor(total, build);
  const weights = total != null ? apportion(vols.map(v => v / totalVol), total, quantum) : null;

  // Pass 1 — each tier solved on its own terms.
  const solved = tiers.map((t, i) => {
    const s = tierShape(t);
    const weight = weights ? weights[i] : null;

    // The design's own proportion: height over the diameter of a circle with the same footprint, so
    // a heart and a round tier are compared on the space they actually occupy.
    const equivDia = 2 * Math.sqrt(areas[i] / Math.PI);
    const designAspect = (t?.height ?? 1) / equivDia;
    // The tier's own drawn proportion, moved by the sweep. No named build overrides it any more.
    const aspect = designAspect * bias;
    const exact = weight != null ? diameterFor(weight, aspect, build, anchor) : null;
    return { shape: s, weight, designAspect, aspect, exact,
             wanted: exact != null ? snapToCommon(exact) : null };
  });

  /* Pass 2 — the tiers as a SET. A step is a relationship between two tiers, so it cannot be seen
   * from inside one of them, and this is the only place that has them all. */
  const finalTins = enforceStep(solved.map(s => s.wanted));

  /* Pass 3 — RE-SPLIT the weight across the tins that were actually chosen.
   *
   * ⚠️ Without this the sheet asks for a top tier TALLER THAN ITS BASE. The first split comes from
   * the drawn footprint; the tin then comes from the step rule, and once a tier is narrowed by a
   * whole inch its drawn share of the batter has nowhere to go but up. Measured on a 5kg long cake:
   * a 7.8" base under a 9.3" top.
   *
   * So the tins lead and the weight follows, which is also the order a baker works in — you own the
   * tins, and you divide the batter between them. Share is the tin's own area times how tall that
   * tier is drawn, with each height held to the tier below it: heights then come out in the same
   * proportion as the drawing, and a cake can no longer widen as it goes up.
   */
  const heightShares = [];
  let cap = Infinity;
  for (let i = 0; i < n; i++) {
    const h = Math.min(tiers[i]?.height ?? 1, cap);
    heightShares.push(h);
    cap = h;
  }
  const tinVols = finalTins.map((tin, i) => (tin != null ? areaOf(tin) : 0) * heightShares[i]);
  const tinVolTotal = tinVols.reduce((s, v) => s + v, 0);
  const finalWeights = total != null && tinVolTotal > 0
    ? apportion(tinVols.map(v => v / tinVolTotal), total, quantum)
    : weights;

  /* Pass 4 — and the ROUNDING can still invert them. Sharing by volume gets the heights close, then
   * quantising to 250g pushes one tier over: a 4kg long cake splits 2.56/1.44, rounds to 2.5/1.5,
   * and the 60g the top gained is half an inch of height on a 6" tin. Close is not enough when the
   * question is "is the top taller than the base", because that reads as a mistake at any margin.
   *
   * So: hand a quantum down until it is not. Always downward, so the total is untouched, and each
   * move strictly reduces the gap — it cannot cycle. */
  if (finalWeights && quantum > 0) {
    const q = quantum;
    const hAt = (i) => (finalTins[i] != null ? heightFor(finalWeights[i], finalTins[i], build, anchor) : 0);
    for (let i = 1; i < n; i++) {
      for (let guard = 0; guard < 64; guard++) {
        if (!(hAt(i) > hAt(i - 1) + 1e-6) || finalWeights[i] <= q + 1e-9) break;
        finalWeights[i] = +(finalWeights[i] - q).toFixed(3);
        finalWeights[i - 1] = +(finalWeights[i - 1] + q).toFixed(3);
      }
    }
  }

  const out = tiers.map((t, i) => {
    const { shape: s, designAspect, aspect, exact, wanted } = solved[i];
    const square = s.kind === 'rect';
    const tin = finalTins[i];
    const weight = finalWeights ? finalWeights[i] : null;
    // The whole build comes from the tin that will actually be greased — see tierBuild.
    const b = tin != null && weight != null ? tierBuild(weight, tin, build, anchor) : null;
    return {
      index: i,
      label: n === 1 ? 'Single tier' : i === 0 ? 'Base tier' : i === n - 1 ? 'Top tier' : `Tier ${i + 1}`,
      weightKg: weight,
      exactInch: exact != null ? +exact.toFixed(1) : null,
      tinInch: tin,
      // Was this tier narrowed to clear the one below it, rather than being its own best answer?
      stepped: wanted != null && tin != null && tin < wanted,
      heightIn: b ? +b.heightIn.toFixed(1) : null,
      /* PER TIER, not per cake. A 9in tier and a 3in one are not layered the same way, and the
       * sheet said they were — one number at the top of the page covering every tier below it. */
      layers: b?.layers ?? null,
      fillings: b?.fillings ?? null,
      // How thick one slice of sponge is — the number a baker tortes to.
      layerIn: b ? +b.layerIn.toFixed(2) : null,
      // How it reaches that height: how many times the tin goes in the oven, and whether the
      // stack needs splitting onto its own boards. See CAKE_BUILD.
      bakes: b?.bakes ?? null,
      barrels: b?.barrels ?? null,
      aspect: +aspect.toFixed(3),
      designAspect: +designAspect.toFixed(3),
      shape: square ? 'square' : 'round',
      square,
    };
  });

  const baked = weights ? +weights.reduce((a, b) => a + b, 0).toFixed(3) : null;
  return { totalKg: total, bakedKg: baked, build, tiers: out };
}
