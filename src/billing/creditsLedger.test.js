import { describe, it, expect } from 'vitest';
import { bucketOf } from './BuyCreditsPanel.jsx';

// The one line on each ledger row that says WHICH credits paid. It is the whole reason the history
// exists — a list of dates and amounts without it is just a smaller version of the balance.
describe('bucketOf', () => {
  it('names the monthly allowance when that alone paid', () => {
    expect(bucketOf({ allowance: 15, wallet: 0 })).toBe('monthly credits');
  });

  it('names bought credits when the allowance was already gone', () => {
    expect(bucketOf({ allowance: 0, wallet: 15 })).toBe('bought credits');
  });

  // The case worth having a test for. A spend that crosses the boundary mid-action is the ONLY
  // place a baker can see the "monthly first" rule actually working, so it must be spelled out
  // rather than rounded to whichever half was larger.
  it('spells out a straddle instead of picking the bigger half', () => {
    expect(bucketOf({ allowance: 10, wallet: 5 })).toBe('10 monthly + 5 bought');
    expect(bucketOf({ allowance: 2, wallet: 13 })).toBe('2 monthly + 13 bought');
  });

  // A grant or a purchase ADDS credits and came from no bucket. Returning null hides the line
  // rather than printing a bucket that did not pay for anything.
  it('has nothing to say about a row that took nothing', () => {
    expect(bucketOf({ allowance: 0, wallet: 0 })).toBeNull();
  });
});
