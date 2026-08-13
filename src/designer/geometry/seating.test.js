import { describe, it, expect } from 'vitest';
import { seatHalfDepth } from './seating.js';

// The seat rule is HALF the model's rendered depth — shared by the side-sticker proud seat and the
// piping-shell edge seat so the two paths can't drift. Guards the byte-identical refactor: piping's
// old `(bbDepth/2)*scale` and the sticker's old `depthScaled/2` must both equal this.
describe('seatHalfDepth', () => {
  it('is half the scaled depth', () => {
    expect(seatHalfDepth(1)).toBe(0.5);
    expect(seatHalfDepth(0.4)).toBe(0.2);
    expect(seatHalfDepth(3.2)).toBeCloseTo(1.6, 10);
  });

  it('matches the piping form (bbDepth * shellScale) / 2', () => {
    const bbDepth = 0.86, shellScale = 0.42;
    expect(seatHalfDepth(bbDepth * shellScale)).toBeCloseTo((bbDepth / 2) * shellScale, 12);
  });

  it('treats missing depth as zero (no offset)', () => {
    expect(seatHalfDepth(undefined)).toBe(0);
    expect(seatHalfDepth(null)).toBe(0);
    expect(seatHalfDepth(0)).toBe(0);
  });
});
