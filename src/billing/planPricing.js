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

/* ── What the discount is WORTH, in the unit that reads biggest and is still TRUE ────────────────
 *
 * A baker does not price a decision in percentages — "2 months free" is a sentence somebody
 * repeats, "-17%" is arithmetic they have to do first. So time wins wherever there is enough of it.
 *
 * ⚠️ BUT ONLY WHERE THERE IS ENOUGH OF IT. Quarterly's 10% is 0.30 months. Said in months it is a
 * fraction nobody says out loud; said in days it is "9 days free", which is accurate, unexciting,
 * and undersells an offer that is really "a tenth off". Nine is just a small number, and a small
 * number is what the reader remembers.
 *
 * So: a month or more is said in MONTHS, and anything less is said as a PERCENTAGE. One rule, no
 * per-period special case, and each interval gets its own strongest honest claim — "2 months free"
 * against "10% off", which are not the same kind of thing and so invite no unflattering comparison
 * (10 beside 17 is exactly the weak-middle-rung reading that SUBSCRIPTION_TIERS warns about).
 *
 * The concrete money is carried by the struck price beside it (`fullPeriodPrice`), so this badge is
 * a headline rather than the whole claim.
 *
 * Both branches round DOWN: a discount claim may under-promise, never over-promise. 30.44 = 365.25/12
 * — kept because the months branch still needs an honest month.
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
  const pct = Math.floor(discount * 100 + 1e-9);
  return pct >= 1 ? `${pct}% off` : null;                // below 1% there is nothing worth saying
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
