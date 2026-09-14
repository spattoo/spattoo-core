// ── Plan pricing ────────────────────────────────────────────────────────────────────────────────
// Derive a plan's price for a billing period from the DB catalog (price_monthly / price_yearly) +
// the period's discount. monthly/yearly are explicit columns; any other period (e.g. quarterly)
// derives from the monthly rate × months × (1 − discount). Keeps ALL pricing out of the UI — the
// billing picker and the onboarding wizard format from the same numbers.

export function periodPrice(plan, period) {
  if (!plan) return 0;
  // Prices are stored in paise (Razorpay's subunit format) — convert to rupees for display.
  const monthly = (Number(plan.price_monthly) || 0) / 100;
  if (!period || period.name === 'monthly') return monthly;
  if (period.name === 'yearly') return (Number(plan.price_yearly) || 0) / 100 || monthly * 12;
  const months = period.months ?? 1;
  const discount = (period.discount_pct ?? 0) / 100;
  return Math.round(monthly * months * (1 - discount));
}

/* What the SAME SPAN costs at the monthly rate — the struck-through figure beside the price.
 *
 * DERIVED, never a stored column: monthly × months. The saving is then the gap between two numbers
 * the customer can see, which is a thing you notice without doing arithmetic — "₹2,997 → ₹2,697" in
 * a way that "10% off" never is, because a percentage asks what it is a percentage OF.
 *
 * 0 when there is nothing to strike: the monthly period itself, a free plan, or a period whose
 * price is not actually lower (which would otherwise print a struck number BELOW the real one and
 * read as a price rise).
 */
export function fullPeriodPrice(plan, period) {
  if (!plan || !period || period.name === 'monthly') return 0;
  const monthly = (Number(plan.price_monthly) || 0) / 100;
  const full = monthly * (period.months ?? 1);
  return full > periodPrice(plan, period) ? full : 0;
}

// A numeric amount → display label. 0 (free) → 'Free'.
export function formatPlanPrice(amount, { currency = 'INR' } = {}) {
  if (!amount) return 'Free';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `₹${amount}`;
  }
}

/* ── What the discount is WORTH, said in TIME ────────────────────────────────────────────────────
 *
 * This is the PERIOD badge, so it must be true for every tier — which is exactly why it says time
 * and not a percentage. Quarterly is 10% on all tiers by construction, but yearly is 16.59% on
 * Flame and 16.64% on Blaze (price_yearly is a round ₹9,999 / ₹24,999, not derived from the
 * ladder), so one number here would be wrong for somebody. "2 months free" is right for both.
 *
 * The per-tier percentage is shown on the CARD instead, beside the two prices it comes from —
 * see `discountLabel`. Between them the baker gets both readings, each exact where it sits.
 *
 * A baker does not price a decision in percentages anyway: "2 months free" is a sentence somebody
 * repeats, "-17%" is arithmetic they have to do first.
 *
 * Rounded DOWN. 30.44 = 365.25/12, the average month — a quarter is 91 days, and using 30 would
 * under-count the free time advertised.
 *
 * ⚠️ IT ROUNDS THE INTENT, NOT THE ARITHMETIC, and on yearly those differ. `discount_pct` is 17, so
 * this says "2 months free"; the real saving from the prices is 1.99 months, because `price_yearly`
 * is a round ₹9,999 rather than 83% of twelve monthlies. Rounding 1.99 up to 2 is ordinary
 * commercial rounding and the EXACT figure is on the card beside it (`discountLabel`, 16.5% / 16.6%)
 * — decided 2026-09-14: keep the real percentage rather than move the price to make 17% true.
 *
 * ⚠️ SO DO NOT "RECONCILE" `discount_pct` TO 16.5 TO MATCH THE PRICES. It is not a stray number, it
 * is what this badge reads: 12 × 16.5% = 1.98 months, which floors to **"1 month free"** — the
 * headline the whole yearly offer is built on, silently halved by a data edit that looks like a
 * correction. The two figures are meant to differ: the ladder is the INTENT, the card is the
 * ARITHMETIC, and each is shown where it is the useful one.
 */
const DAYS_PER_MONTH = 365.25 / 12;

export function freeTimeLabel(period) {
  const months   = Number(period?.months) || 0;
  const discount = (Number(period?.discount_pct) || 0) / 100;
  const free     = months * discount;                    // free time, in months
  if (free <= 0) return null;                            // monthly, or any period at 0% — no claim
  if (free >= 1) {
    const m = Math.floor(free + 1e-9);                   // 2.04 → 2, and 2.0 is not dragged to 1
    return `${m} month${m === 1 ? '' : 's'} free`;
  }
  const d = Math.floor(free * DAYS_PER_MONTH);
  return d >= 1 ? `${d} day${d === 1 ? '' : 's'} free` : null;
}

/* ── The discount as a percentage, PER TIER, from the two prices on the card ─────────────────────
 *
 * ⚠️ NOT `period.discount_pct`, and the difference is the whole point. That column says yearly is
 * 17%; the yearly prices beside it are 16.59% (Flame) and 16.64% (Blaze) off twelve months at the
 * monthly rate, because price_yearly was set as a round number rather than derived from the ladder.
 * Printing 17 next to a struck ₹11,988 and a ₹9,999 invites the reader to do the subtraction and
 * catch us over-claiming.
 *
 * So it is computed from what is actually shown, and FLOORED to one decimal — under-stating by at
 * most a tenth of a point rather than over-stating by any. A whole number loses its ".0", because
 * "10.0% off" reads like a number that was calculated AT you.
 */
export function discountLabel(plan, period) {
  const full = fullPeriodPrice(plan, period);
  if (!full) return null;
  const pct = Math.floor(((full - periodPrice(plan, period)) / full) * 1000) / 10;
  if (pct < 0.1) return null;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}% off`;
}

export const PERIOD_SUFFIX = { monthly: '/mo', quarterly: '/qtr', yearly: '/yr' };

// SaaS GST rate (India). This is a PRESENTATION figure for the checkout breakup only — the authoritative
// CGST/SGST vs IGST split + place of supply live in the accounting system / on the tax invoice, never here.
export const GST_RATE_PCT = 18;

// base amount (rupees) → { base, gst, total } for the checkout breakup. A single flat GST line; no split.
export function gstBreakup(base, ratePct = GST_RATE_PCT) {
  const b = Number(base) || 0;
  const gst = b * ratePct / 100;
  return { base: b, gst, total: b + gst, ratePct };
}
