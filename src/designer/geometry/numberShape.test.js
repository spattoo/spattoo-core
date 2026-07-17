import { describe, it, expect } from 'vitest';
import {
  numberGeometry, numberSizeForCount, numberTierDims, numberDigitCount,
  NUMBER_SIZE_DEFAULTS,
} from './numberShape.js';
import { tierShape, pipingPerimeters, boundingRadius } from './surface.js';
import { asRings } from './shapes.js';

// The multi-digit number cake: a "10" is a "1" and a "0" — two DISJOINT footprints. The piping garland
// must ring each digit on its own and never bridge a shell across the gap between them (the reported
// "connecting piping between 1 and 0"). The fix models the footprint as a LIST OF RINGS (one per glyph)
// and walks each ring as its own closed loop.
describe('number cake — multi-digit footprint is disjoint rings (no piping bridge)', () => {
  const shapeOf = digits => tierShape({ shapeFamily: 'number', shapeConfig: { digits }, width: 2 });

  it('a single digit is one ring (unchanged)', () => {
    expect(asRings(numberGeometry('7').outline).length).toBe(1);
    expect(pipingPerimeters(shapeOf('7')).length).toBe(1);
  });

  it('a two-digit number is two rings / two piping loops', () => {
    expect(asRings(numberGeometry('10').outline).length).toBe(2);
    expect(pipingPerimeters(shapeOf('10')).length).toBe(2);
  });

  it('the digits occupy DISJOINT x-ranges — no loop spans the gap between them', () => {
    const loops = pipingPerimeters(shapeOf('10'));
    // Sample every loop densely and take each loop's x-extent.
    const extents = loops.map(l => {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < 200; i++) { const p = l.at((i / 200) * l.length); lo = Math.min(lo, p.x); hi = Math.max(hi, p.x); }
      return { lo, hi };
    }).sort((a, b) => a.lo - b.lo);
    // Left digit ends strictly before the right digit begins → a real gap, so no single loop bridges it.
    const [left, right] = extents;
    expect(left.hi).toBeLessThan(right.lo);
    // And no sampled shell position lands INSIDE that gap band (the bottom "1—0" join in the report).
    const gapLo = left.hi, gapHi = right.lo;
    const inGap = loops.some(l => {
      for (let i = 0; i < 400; i++) { const p = l.at((i / 400) * l.length); if (p.x > gapLo && p.x < gapHi) return true; }
      return false;
    });
    expect(inGap).toBe(false);
  });

  it('bounding radius still contains both digits (board/camera framing unbroken)', () => {
    const r = boundingRadius(shapeOf('10'));
    const loops = pipingPerimeters(shapeOf('10'));
    for (const l of loops) for (let i = 0; i < 100; i++) {
      const p = l.at((i / 100) * l.length);
      expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(r + 1e-6);
    }
  });
});

// A number cake is sized by HOW TALL THE DIGIT STANDS, chosen by digit count — NOT by a fixed width. This is
// the whole point of the per-count model: within a count every number renders the same height (so a "1", an
// "8" and a "21" that the customer types are on ONE calibration), and each count is authored independently.
describe('number cake — sized by height, per digit count', () => {
  it('numberDigitCount counts the cleaned digits (1..4)', () => {
    expect(numberDigitCount('1')).toBe(1);
    expect(numberDigitCount('21')).toBe(2);
    expect(numberDigitCount('2027')).toBe(4);
    expect(numberDigitCount('20279')).toBe(4);   // capped at MAX_DIGITS
    expect(numberDigitCount('')).toBe(1);          // cleanDigits floors to '1'
  });

  it('numberGeometry sizes to the target HEIGHT, deriving width from the glyph aspect', () => {
    const g = numberGeometry('1', 2.4);
    expect(g.worldH).toBeCloseTo(2.4, 6);
    expect(g.halfD).toBeCloseTo(1.2, 6);           // depth half = height/2 (the digit stands in Z)
    // A wider number at the SAME height stays the same height and only grows wider.
    const wide = numberGeometry('2027', 2.4);
    expect(wide.worldH).toBeCloseTo(2.4, 6);
    expect(wide.worldW).toBeGreaterThan(g.worldW);
  });

  it('every number of a given count comes out the SAME height (one calibration)', () => {
    // depth (world Z) == the authored stand-height, independent of WHICH digits, for a fixed count.
    const d1 = numberTierDims({ digits: '1' }).depth;
    const d8 = numberTierDims({ digits: '8' }).depth;
    expect(d8).toBeCloseTo(d1, 6);
    const d21 = numberTierDims({ digits: '21' }).depth;
    const d99 = numberTierDims({ digits: '99' }).depth;
    expect(d99).toBeCloseTo(d21, 6);
    // 2-digit default height differs from 1-digit → the two counts are independently sized.
    expect(d21).not.toBeCloseTo(d1, 3);
  });

  it('numberSizeForCount reads byCount, clamps 1..4, and falls back to the defaults', () => {
    const cfg = { byCount: { 1: { height: 3, thickness: 0.5 }, 3: { height: 1.1, thickness: 0.9 } } };
    expect(numberSizeForCount(cfg, 1)).toEqual({ height: 3, thickness: 0.5 });
    expect(numberSizeForCount(cfg, 3)).toEqual({ height: 1.1, thickness: 0.9 });
    expect(numberSizeForCount(cfg, 2)).toEqual(NUMBER_SIZE_DEFAULTS[2]);   // count missing → default
    expect(numberSizeForCount({}, 4)).toEqual(NUMBER_SIZE_DEFAULTS[4]);    // no byCount → default
    expect(numberSizeForCount(cfg, 9)).toEqual(NUMBER_SIZE_DEFAULTS[4]);   // out-of-range count clamps to 4
  });

  it('the tier descriptor carries the resolved thickness, chosen by the typed count', () => {
    const one   = tierShape({ shapeFamily: 'number', shapeConfig: { digits: '1',    byCount: { 1: { height: 2, thickness: 0.4 }, 4: { height: 1.5, thickness: 1.1 } } } });
    const four  = tierShape({ shapeFamily: 'number', shapeConfig: { digits: '2027', byCount: { 1: { height: 2, thickness: 0.4 }, 4: { height: 1.5, thickness: 1.1 } } } });
    expect(one.kind).toBe('number');
    expect(one.thickness).toBeCloseTo(0.4, 6);
    expect(four.thickness).toBeCloseTo(1.1, 6);     // 4-digit → the 4-count thickness
    // numberTierDims agrees with the descriptor's vertical thickness.
    expect(numberTierDims({ digits: '2027', byCount: { 4: { height: 1.5, thickness: 1.1 } } }).height).toBeCloseTo(1.1, 6);
  });
});
