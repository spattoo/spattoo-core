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

// A numeric amount → display label. 0 (free) → 'Free'.
export function formatPlanPrice(amount, { currency = 'INR' } = {}) {
  if (!amount) return 'Free';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `₹${amount}`;
  }
}

/* ── What the discount is WORTH, said in time rather than percent ────────────────────────────────
 *
 * A baker does not price a decision in percentages. "Pay yearly, get two months free" is a sentence
 * somebody repeats; "-17%" is a number they have to do arithmetic on to believe.
 *
 * ⚠️ THE UNIT CHANGES WITH THE PERIOD, and that is the whole reason this is a function rather than a
 * format string. Yearly at 17% is 2.04 months — "2 months free", which is the line the pricing page
 * is built around. Quarterly at 10% is 0.30 months, and "0.3 months free" is not something anybody
 * says: a third of a month is a number you have to convert before it means anything. In days it is
 * plain — "9 days free" — and nine free days on a three-month commitment reads as a real, if small,
 * thing, which is exactly what it is.
 *
 * So: a month or more is said in months, less than a month is said in days. The switch is at the
 * point where the fraction starts needing a decimal place, not at a tuned threshold.
 *
 * 30.44 = 365.25/12, the average month. A quarter is 91 days, not 90, and using 30 would under-count
 * the free time we are advertising — which is the one direction a discount claim must never be wrong
 * in. Rounded DOWN for the same reason: promise nine days and give nine and a bit.
 */
const DAYS_PER_MONTH = 365.25 / 12;

export function freeTimeLabel(period) {
  const months   = Number(period?.months) || 0;
  const discount = (Number(period?.discount_pct) || 0) / 100;
  const free     = months * discount;                    // free time, in months
  if (free <= 0) return null;                            // monthly, or any period at 0% — no claim to make
  if (free >= 1) {
    const m = Math.floor(free + 1e-9);                   // 2.04 → 2, and 2.0 is not dragged to 1 by float noise
    return `${m} month${m === 1 ? '' : 's'} free`;
  }
  const d = Math.floor(free * DAYS_PER_MONTH);
  return d >= 1 ? `${d} day${d === 1 ? '' : 's'} free` : null;
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
