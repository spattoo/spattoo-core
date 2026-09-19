import { describe, it, expect } from 'vitest';
import { freeTimeLabel, periodPrice, fullPeriodPrice, discountLabel } from './planPricing.js';

/* ── What a discount is worth, said in time ──────────────────────────────────────────────────────
 *
 * These are CLAIMS ABOUT MONEY shown to a baker deciding whether to commit for three months or
 * twelve, so they are pinned rather than eyeballed. The rule that matters: a claim may under-state
 * what the baker gets, never over-state it.
 */

const MONTHLY   = { name: 'monthly',   months: 1,  discount_pct: 0 };
const QUARTERLY = { name: 'quarterly', months: 3,  discount_pct: 10 };
const YEARLY    = { name: 'yearly',    months: 12, discount_pct: 17 };

describe('freeTimeLabel', () => {
  it('says months when the saving is a month or more', () => {
    // 12 × 17% = 2.04 months. The pricing page is built on this sentence.
    expect(freeTimeLabel(YEARLY)).toBe('2 months free');
  });

  /* ⚠️ A TRAP, pinned so it fails loudly rather than in copy nobody re-reads. `discount_pct` 17 is
     the INTENT; the prices are really 16.5–16.6% off (price_yearly is a round ₹9,999). Somebody
     "reconciling" the column to the arithmetic would take 12 × 16.5% = 1.98 months, floor it, and
     silently turn the yearly headline into "1 month free". Decided 2026-09-14: the two are meant to
     differ — the ladder is the intent, the card carries the exact percentage. */
  it('collapses to ONE month if discount_pct is edited down to match the real prices', () => {
    expect(freeTimeLabel({ ...YEARLY, discount_pct: 16.5 })).toBe('1 month free');
  });

  /* ⚠️ The reason this function exists. 3 × 10% = 0.30 months. Said in months it is a fraction
     nobody says out loud; said in days it is "9 days free" — accurate, and it undersells a tenth
     off, because nine is just a small number. Below a month the percentage is the bigger TRUE
     claim, and "10% off" beside "2 months free" invites no comparison, where 10 beside 17 would. */
  it('says DAYS when the saving is under a month', () => {
    expect(freeTimeLabel(QUARTERLY)).toBe('9 days free');
  });

  it('makes no claim at all when there is no discount', () => {
    expect(freeTimeLabel(MONTHLY)).toBeNull();
    expect(freeTimeLabel({ months: 12, discount_pct: 0 })).toBeNull();
  });

  /* ⚠️ ROUNDED DOWN, always. A discount claim may under-promise; it must never say "10 days free"
     and hand over nine and a half. 0.30 months × 30.44 = 9.13 days → nine. */
  it('rounds down, so the baker always gets at least what was claimed', () => {
    expect(freeTimeLabel({ months: 12, discount_pct: 25 })).toBe('3 months free'); // 3.0  → 3
    expect(freeTimeLabel({ months: 12, discount_pct: 20 })).toBe('2 months free'); // 2.4  → 2
    expect(freeTimeLabel({ months: 3, discount_pct: 10 })).toBe('9 days free');    // 9.13 → 9
  });

  // A whole number must not be dragged down by binary float noise: 12 × 0.17 is 2.0399999…, and
  // 12 × 0.25 is a case where a naive epsilon-free floor can land on 2 instead of 3.
  it('does not lose a whole month to floating point', () => {
    expect(freeTimeLabel({ months: 4, discount_pct: 25 })).toBe('1 month free');
    expect(freeTimeLabel({ months: 6, discount_pct: 50 })).toBe('3 months free');
  });

  it('is singular when it should be', () => {
    expect(freeTimeLabel({ months: 2, discount_pct: 50 })).toBe('1 month free');
  });

  /* The switch is at a whole month, in both directions — a fraction of a month is never printed. */
  it('crosses from days to months at exactly one month', () => {
    expect(freeTimeLabel({ months: 4, discount_pct: 24 })).toBe('29 days free'); // 0.96 mo
    expect(freeTimeLabel({ months: 4, discount_pct: 25 })).toBe('1 month free'); // 1.00 mo
  });

  // Below a day there is nothing worth saying — a badge reading "0 days free" is worse than none.
  it('says nothing rather than "0 days free"', () => {
    expect(freeTimeLabel({ months: 1, discount_pct: 1 })).toBeNull();
  });

  it('survives a missing or malformed period', () => {
    expect(freeTimeLabel(null)).toBeNull();
    expect(freeTimeLabel({})).toBeNull();
    expect(freeTimeLabel({ months: 'three', discount_pct: 'ten' })).toBeNull();
  });
});

/* The price the label is a claim ABOUT. Quarterly is the derived case — monthly × months ×
   (1 − discount) — and it is the one nothing had covered, because it was switched off. */
describe('periodPrice', () => {
  const flame = { price_monthly: 99900, price_yearly: 999900 };   // paise
  const blaze = { price_monthly: 249900, price_yearly: 2499900 };

  it('derives quarterly from the monthly rate and the discount', () => {
    expect(periodPrice(flame, QUARTERLY)).toBe(2697);    // 999 × 3 × 0.9  = 2697.3 → 2697
    expect(periodPrice(blaze, QUARTERLY)).toBe(6747);    // 2499 × 3 × 0.9 = 6747.3 → 6747
  });

  it('takes yearly from its own column, not from the monthly rate', () => {
    expect(periodPrice(flame, YEARLY)).toBe(9999);
    expect(periodPrice(blaze, YEARLY)).toBe(24999);
  });

  it('is the plain monthly rate with no period at all', () => {
    expect(periodPrice(flame, MONTHLY)).toBe(999);
    expect(periodPrice(flame, null)).toBe(999);
  });

  // The saving a baker actually banks, against the label we print beside it.
  it('charges less than paying monthly for the same span, by the advertised amount', () => {
    const threeMonthsOfMonthly = periodPrice(flame, MONTHLY) * 3;
    expect(periodPrice(flame, QUARTERLY)).toBeLessThan(threeMonthsOfMonthly);
    expect(threeMonthsOfMonthly - periodPrice(flame, QUARTERLY)).toBe(300);   // ~9 days of ₹999/mo
  });
});

/* The struck-through figure: what the same span costs at the monthly rate. */
describe('fullPeriodPrice', () => {
  const flame = { price_monthly: 99900, price_yearly: 999900 };
  const blaze = { price_monthly: 249900, price_yearly: 2499900 };

  it('is three months at the monthly rate for quarterly', () => {
    expect(fullPeriodPrice(flame, QUARTERLY)).toBe(2997);
    expect(fullPeriodPrice(blaze, QUARTERLY)).toBe(7497);
  });

  it('is twelve months at the monthly rate for yearly', () => {
    expect(fullPeriodPrice(flame, YEARLY)).toBe(11988);
    expect(fullPeriodPrice(blaze, YEARLY)).toBe(29988);
  });

  // Nothing to strike: there is no saving to show against the monthly rate itself.
  it('is 0 for monthly, and for no period at all', () => {
    expect(fullPeriodPrice(flame, MONTHLY)).toBe(0);
    expect(fullPeriodPrice(flame, null)).toBe(0);
    expect(fullPeriodPrice(null, YEARLY)).toBe(0);
  });

  /* ⚠️ A struck number BELOW the real one reads as a price RISE, which is the opposite of the
     thing this is for. A period priced at or above the monthly run rate simply shows nothing. */
  it('shows nothing rather than a strike that implies a price rise', () => {
    const free = { price_monthly: 0, price_yearly: 0 };
    expect(fullPeriodPrice(free, YEARLY)).toBe(0);
    // A yearly price ABOVE twelve monthlies — misconfigured, but it must not advertise a saving.
    expect(fullPeriodPrice({ price_monthly: 99900, price_yearly: 1500000 }, YEARLY)).toBe(0);
    expect(fullPeriodPrice({ price_monthly: 99900, price_yearly: 1198800 }, YEARLY)).toBe(0);  // exactly equal
  });

  it('always sits above the price it is struck against', () => {
    for (const plan of [flame, blaze]) {
      for (const period of [QUARTERLY, YEARLY]) {
        expect(fullPeriodPrice(plan, period)).toBeGreaterThan(periodPrice(plan, period));
      }
    }
  });
});

/* The PER-TIER percentage, shown on the card beside the prices it comes from. */
describe('discountLabel', () => {
  const flame = { price_monthly: 99900, price_yearly: 999900 };
  const blaze = { price_monthly: 249900, price_yearly: 2499900 };

  it('is exactly 10% for quarterly on every tier — it is derived that way', () => {
    expect(discountLabel(flame, QUARTERLY)).toBe('10% off');
    expect(discountLabel(blaze, QUARTERLY)).toBe('10% off');
  });

  /* ⚠️ THE REASON IT IS PER TIER AND NOT PER PERIOD. billing_periods says yearly is 17%; the
     yearly prices are a round ₹9,999 / ₹24,999, which is 16.59% and 16.64% off the monthly run
     rate. A single badge could not state either without being wrong for the other tier. */
  it('differs by tier on yearly, and never claims the ladder\'s 17%', () => {
    expect(discountLabel(flame, YEARLY)).toBe('16.5% off');
    expect(discountLabel(blaze, YEARLY)).toBe('16.6% off');
  });

  it('drops a trailing .0 rather than printing "10.0% off"', () => {
    expect(discountLabel(flame, QUARTERLY)).not.toContain('.0');
  });

  it('makes no claim where there is no saving', () => {
    expect(discountLabel(flame, MONTHLY)).toBeNull();
    expect(discountLabel({ price_monthly: 0, price_yearly: 0 }, YEARLY)).toBeNull();
    expect(discountLabel(null, YEARLY)).toBeNull();
  });

  /* Floored to a tenth: under-state by at most 0.1 of a point, never over-state. */
  it('never claims more than the prices actually give', () => {
    for (const plan of [flame, blaze]) {
      for (const period of [QUARTERLY, YEARLY]) {
        const claimed = parseFloat(discountLabel(plan, period));
        const actual  = (fullPeriodPrice(plan, period) - periodPrice(plan, period)) / fullPeriodPrice(plan, period) * 100;
        expect(claimed).toBeLessThanOrEqual(actual + 1e-9);
        expect(claimed).toBeGreaterThan(actual - 0.1);
      }
    }
  });
});
