import { describe, it, expect } from 'vitest';
import { freeTimeLabel, periodPrice } from './planPricing.js';

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

  /* ⚠️ The reason this function exists. 3 × 10% = 0.30 months, and "0.3 months free" is not a
     sentence — a third of a month is a number the reader has to convert before it means anything. */
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
    expect(freeTimeLabel({ months: 3, discount_pct: 10 })).toBe('9 days free');    // 9.13 → 9
    expect(freeTimeLabel({ months: 12, discount_pct: 25 })).toBe('3 months free'); // 3.0  → 3
    expect(freeTimeLabel({ months: 12, discount_pct: 20 })).toBe('2 months free'); // 2.4  → 2
  });

  // A whole number must not be dragged down by binary float noise: 12 × 0.17 is 2.0399999…, and
  // 12 × 0.25 is a case where a naive epsilon-free floor can land on 2 instead of 3.
  it('does not lose a whole month to floating point', () => {
    expect(freeTimeLabel({ months: 4, discount_pct: 25 })).toBe('1 month free');
    expect(freeTimeLabel({ months: 6, discount_pct: 50 })).toBe('3 months free');
  });

  it('is singular when it should be', () => {
    expect(freeTimeLabel({ months: 2, discount_pct: 50 })).toBe('1 month free');
    expect(freeTimeLabel({ months: 1, discount_pct: 4 })).toBe('1 day free');   // 0.04 × 30.44 = 1.2
  });

  // Below a day there is nothing worth saying — a badge reading "0 days free" is worse than none.
  it('says nothing rather than "0 days free"', () => {
    expect(freeTimeLabel({ months: 1, discount_pct: 1 })).toBeNull();           // 0.3 days
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
