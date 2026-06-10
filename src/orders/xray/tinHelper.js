// Tin helper — given the ordered weight and the design's tiers, suggest which
// baking tins to use. We split the total weight across tiers by their REAL
// relative volumes (from the design geometry), then map each tier's weight to a
// tin size from a standard chart. Square tins hold ~27% more than a round tin of
// the same nominal size, so they're adjusted.
//
// The chart is a sensible starter (≈4-inch-tall filled buttercream cake) and is
// meant to be reviewed/tuned. All values in this file are intentionally simple.

// Round tin: nominal diameter (inch) → approx cake weight it yields (kg).
const ROUND_CHART = [
  { inch: 4,  kg: 0.5 },
  { inch: 5,  kg: 0.75 },
  { inch: 6,  kg: 1.0 },
  { inch: 7,  kg: 1.5 },
  { inch: 8,  kg: 2.0 },
  { inch: 9,  kg: 2.75 },
  { inch: 10, kg: 3.5 },
  { inch: 11, kg: 4.5 },
  { inch: 12, kg: 5.5 },
  { inch: 14, kg: 7.5 },
];
const COMMON_TINS = ROUND_CHART.map(c => c.inch);
const SQUARE_FACTOR = 1.27; // a square tin holds ~27% more than the round of the same size

function snapToCommon(inch) {
  return COMMON_TINS.reduce((best, t) => (Math.abs(t - inch) < Math.abs(best - inch) ? t : best), COMMON_TINS[0]);
}

// Map a tier weight (kg) to a tin size (inch), interpolating the chart then
// snapping to a common tin. `square` accounts for the extra capacity.
function weightToInch(kg, square = false) {
  const lookup = square ? kg / SQUARE_FACTOR : kg;
  const chart = ROUND_CHART;
  if (lookup <= chart[0].kg) return chart[0].inch;
  if (lookup >= chart[chart.length - 1].kg) return chart[chart.length - 1].inch;
  for (let i = 0; i < chart.length - 1; i++) {
    const a = chart[i], b = chart[i + 1];
    if (lookup >= a.kg && lookup <= b.kg) {
      const t = (lookup - a.kg) / (b.kg - a.kg);
      return snapToCommon(a.inch + t * (b.inch - a.inch));
    }
  }
  return chart[chart.length - 1].inch;
}

// Relative volume of a tier from its geometry (arbitrary design units — only the
// RATIO between tiers matters). Round: r²·h, rect: w·d·h. Falls back to a gentle
// top-ward taper when geometry is missing.
function isSquare(tier) {
  // Trust the explicit shape only — round tiers also carry width/depth defaults,
  // so presence of width must NOT imply square.
  return tier?.shape === 'rect' || tier?.shape === 'square';
}

function tierVolume(tier, indexFromBottom) {
  const h = tier?.height ?? 1;
  if (isSquare(tier)) {
    const w = tier?.width ?? 2, d = tier?.depth ?? 1.5;
    return w * d * h;
  }
  const r = tier?.radius;
  if (r != null) return r * r * h;
  return Math.pow(0.62, indexFromBottom); // no geometry → taper fallback
}

// Returns { totalKg, tiers: [{ index, label, weightKg, tinInch, shape, square }] }
// `tiers` is the design_snapshot.tiers array (bottom-first). weightKg may be null.
export function computeTinPlan(tiersInput, weightKg) {
  const tiers = Array.isArray(tiersInput) ? tiersInput : [];
  const n = tiers.length;
  if (n === 0) return { totalKg: weightKg ?? null, tiers: [] };

  const vols = tiers.map((t, i) => tierVolume(t, i));
  const totalVol = vols.reduce((s, v) => s + v, 0) || 1;
  const total = typeof weightKg === 'number' && weightKg > 0 ? weightKg : null;

  const out = tiers.map((t, i) => {
    const square = isSquare(t);
    const weight = total != null ? +(total * vols[i] / totalVol).toFixed(2) : null;
    return {
      index: i,
      label: n === 1 ? 'Single tier' : i === 0 ? 'Base tier' : i === n - 1 ? 'Top tier' : `Tier ${i + 1}`,
      weightKg: weight,
      tinInch: weight != null ? weightToInch(weight, square) : null,
      shape: square ? 'square' : 'round',
      square,
    };
  });

  return { totalKg: total, tiers: out };
}
