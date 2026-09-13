import { describe, it, expect } from 'vitest';
import { freeTimeLabel, periodPrice, fullPeriodPrice } from './planPricing.js';

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

  /* ⚠️ The reason this function exists. 3 × 10% = 0.30 months. Said in months it is a fraction
     nobody says out loud; said in days it is "9 days free" — accurate, and it undersells a tenth
     off, because nine is just a small number. Below a month the percentage is the bigger TRUE
     claim, and "10% off" beside "2 months free" invites no comparison, where 10 beside 17 would. */
  it('says the PERCENTAGE when the saving is under a month', () => {
    expect(freeTimeLabel(QUARTERLY)).toBe('10% off');
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
    expect(freeTimeLabel({ months: 3, discount_pct: 12.9 })).toBe('12% off');      // 0.39 mo → 12
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
  it('crosses from percent to months at exactly one month', () => {
    expect(freeTimeLabel({ months: 4, discount_pct: 24 })).toBe('24% off');      // 0.96 mo
    expect(freeTimeLabel({ months: 4, discount_pct: 25 })).toBe('1 month free'); // 1.00 mo
  });

  // Below 1% there is nothing worth saying — a badge reading "0% off" is worse than none.
  it('says nothing rather than "0% off"', () => {
    expect(freeTimeLabel({ months: 1, discount_pct: 0.4 })).toBeNull();
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
