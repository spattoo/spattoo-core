import { describe, it, expect } from 'vitest';
import { numberGeometry } from './numberShape.js';
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
