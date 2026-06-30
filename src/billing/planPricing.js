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

export const PERIOD_SUFFIX = { monthly: '/mo', quarterly: '/qtr', yearly: '/yr' };
