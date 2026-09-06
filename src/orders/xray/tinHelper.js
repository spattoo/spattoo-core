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

/* ⚠️ THIS BAKERY'S anchor, which is NOT the pan-set convention — and the convention was wrong here.
 *
 * A 6-inch round 4 inches tall is *sold* as a 1kg cake, and that figure sat here because it is the
 * one datum anybody can look up. It cannot be true of these cakes. It fixes the density at 0.54 kg/L,
 * and at 0.54 the bakery's own tin table is unreachable: a 9-inch tier holding 5kg would have to
 * stand 10.4 INCHES TALL. Asked directly, the answer was 1 to 1.5kg for that same 6x4 — and below
 * about 1.2 no aspect ratio reproduces their tins at all.
 *
 * 1.5 is the self-consistent end of that range: it makes a 1.5kg cake in a 6-inch exactly 4 inches
 * tall, and a 1kg one 2.6 — which is what "a 6-inch takes 1 to 1.5kg" means, the same tin filled
 * shallow or full. It also lands a 5kg 9-inch at 6 inches tall instead of ten.
 *
 * ⚠️ The two single-tier sizes the old model got wrong — 1kg and 2.5kg — were never a tuning problem.
 * They were this number. With it corrected, all six of their stated single-tier sizes hit exactly,
 * and no separate lookup ladder was needed.
 */
export const ANCHOR = Object.freeze({ diameterIn: 6, heightIn: 4, kg: 1.5 });

/* ── How tall this bakery builds ─────────────────────────────────────────────────────────────────
 *
 * ⚠️ "Long" here means TALL, not long along the bench. Every general baking reference uses "long" for
 * a loaf or a tray bake, so the code says `tall` and this note records that the trade word is long —
 * the same collision as two unrelated "Number topper" entries, caught before it was written in.
 *
 * A build says how tall a tier stands relative to its width, and NOTHING ELSE. Both are fitted
 * against this bakery's own sizes, sharing the one anchor above:
 *
 *   tall      1-1.5kg → 6in, 2-2.5kg → 7in, 3kg → 8in, 5kg → 9in   ("9 if you want height")
 *   standard  5kg → 10 or 11in                                     ("10 or 11 for flat")
 *
 * All six tall points hit exactly. Their three 2-tier points (7+5 for 3kg, 8+6 for 4 and 5kg) fall
 * out of the same numbers with no further fitting, which is the check that matters — they were never
 * part of the search.
 *
 * ⚠️ ONE DENSITY, TWO ASPECTS. An earlier version gave each build its own anchor and so its own
 * density, and defended it in a comment. That was backwards: baking a tier taller does not change
 * what the sponge is made of. It was fitting the density to absorb an aspect that had been forced to
 * 0.98 by the wrong anchor weight. Correct the anchor and one density serves both, which is what a
 * recipe is.
 */
export const BUILDS = Object.freeze({
  standard: Object.freeze({
    key: 'standard', label: 'Standard',
    aspect: 0.45,                      // flat: a 5kg spreads out to a 10in
    anchor: ANCHOR,
  }),
  tall: Object.freeze({
    key: 'tall', label: 'Long',        // the trade word; `tall` is what it means
    aspect: 0.57,                      // taller, so the same 5kg pulls in to a 9in
    anchor: ANCHOR,
  }),
});

export const CAKE_BUILD = Object.freeze({
  layers: 2,                 // slices of sponge; layers - 1 gaps of filling between them
  fillingThicknessIn: 0.4,   // per gap
  fillingDensity: 0.90,      // kg/L — buttercream. Ganache and fresh cream differ.
  /* ⚠️ Nobody bakes 3.26 kg. Batter is weighed out in round amounts, and a tier's share of the
   * order has to land on one — 3.25 and 1.75, not 3.26 and 1.74. Pure arithmetic produces a number
   * that is exactly right and cannot be followed. */
  quantumKg: 0.25,
});

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
  const hFill = Math.max(0, (b.layers - 1) * b.fillingThicknessIn);
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
  const hFill = Math.max(0, (build.layers - 1) * build.fillingThicknessIn);
  const weightAt = (d) => {
    const A = areaOf(d);
    const hSponge = Math.max(0, aspect * d - hFill);
    return (A * (hSponge * rhoS + hFill * build.fillingDensity)) / IN3_PER_L;
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

// The tins a baker actually owns. Snapping is a convenience, so the exact figure travels too.
export const COMMON_TINS = Object.freeze([4, 5, 6, 7, 8, 9, 10, 11, 12, 14]);
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
 * Algebraic, unlike diameterFor: with the diameter fixed the area is known, so the sponge height
 * falls straight out. Filling contributes a fixed height regardless.
 */
export function heightFor(kg, diameterIn, build = CAKE_BUILD, anchor = ANCHOR) {
  if (!(kg > 0) || !(diameterIn > 0)) return null;
  const rhoS = spongeDensity(anchor);
  const hFill = Math.max(0, (build.layers - 1) * build.fillingThicknessIn);
  const A = areaOf(diameterIn);
  const hSponge = Math.max(0, (kg * IN3_PER_L / A - hFill * build.fillingDensity) / rhoS);
  return hSponge + hFill;
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

/* Returns { totalKg, build, tiers: [{ index, label, weightKg, tinInch, exactInch, heightIn,
 *           layers, shape, square, aspect }] }
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
  const bias = opts.shapeBias ?? 1;
  /* A named build, or none. With none the tier keeps the proportions the CUSTOMER WAS SHOWN, which
   * is the conservative default and what shipped before presets existed. Naming one says "however it
   * was drawn, we bake them this tall", which is what a bakery with a house style actually wants. */
  const preset = opts.preset ? BUILDS[opts.preset] ?? null : null;
  const anchor = preset?.anchor ?? ANCHOR;
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
  const weights = total != null ? apportion(vols.map(v => v / totalVol), total, build.quantumKg) : null;

  // Pass 1 — each tier solved on its own terms.
  const solved = tiers.map((t, i) => {
    const s = tierShape(t);
    const weight = weights ? weights[i] : null;

    // The design's own proportion: height over the diameter of a circle with the same footprint, so
    // a heart and a round tier are compared on the space they actually occupy.
    const equivDia = 2 * Math.sqrt(areas[i] / Math.PI);
    const designAspect = (t?.height ?? 1) / equivDia;
    const aspect = (preset?.aspect ?? designAspect) * bias;
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
    ? apportion(tinVols.map(v => v / tinVolTotal), total, build.quantumKg)
    : weights;

  /* Pass 4 — and the ROUNDING can still invert them. Sharing by volume gets the heights close, then
   * quantising to 250g pushes one tier over: a 4kg long cake splits 2.56/1.44, rounds to 2.5/1.5,
   * and the 60g the top gained is half an inch of height on a 6" tin. Close is not enough when the
   * question is "is the top taller than the base", because that reads as a mistake at any margin.
   *
   * So: hand a quantum down until it is not. Always downward, so the total is untouched, and each
   * move strictly reduces the gap — it cannot cycle. */
  if (finalWeights && build.quantumKg > 0) {
    const q = build.quantumKg;
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
    // Height comes from the tin that will actually be greased — see heightFor.
    const height = tin != null && weight != null ? heightFor(weight, tin, build, anchor) : null;
    return {
      index: i,
      label: n === 1 ? 'Single tier' : i === 0 ? 'Base tier' : i === n - 1 ? 'Top tier' : `Tier ${i + 1}`,
      weightKg: weight,
      exactInch: exact != null ? +exact.toFixed(1) : null,
      tinInch: tin,
      // Was this tier narrowed to clear the one below it, rather than being its own best answer?
      stepped: wanted != null && tin != null && tin < wanted,
      heightIn: height != null ? +height.toFixed(1) : null,
      layers: build.layers,
      aspect: +aspect.toFixed(3),
      designAspect: +designAspect.toFixed(3),
      shape: square ? 'square' : 'round',
      square,
    };
  });

  const baked = weights ? +weights.reduce((a, b) => a + b, 0).toFixed(3) : null;
  return { totalKg: total, bakedKg: baked, build, preset: preset?.key ?? null, tiers: out };
}
