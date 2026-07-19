import { describe, it, expect } from 'vitest';
import {
  letterGeometry, letterSizeForCount, letterTierDims, letterCount,
  LETTER_SIZE_DEFAULTS, LETTER_COUNTS,
} from './letterShape.js';
import { tierShape, pipingPerimeters, boundingRadius, isRoundWall } from './surface.js';
import { asRings } from './shapes.js';

// A letter cake is the same glyph engine as a number cake, on the A–Z charset (uppercased, up to 3). These
// mirror numberShape.test.js — the contract is: a multi-letter string is DISJOINT rings (no piping bridge),
// sizing is by HEIGHT per letter-count, and the tier renders as the shared `glyph` kind.

describe('letter cake — charset, cleaning and count', () => {
  it('cleanLetters keeps A–Z, uppercases, caps at 3, floors empty to "A"', () => {
    expect(letterCount('a')).toBe(1);
    expect(letterCount('Ab')).toBe(2);
    expect(letterCount('mom')).toBe(3);
    expect(letterCount('spattoo')).toBe(3);   // capped at MAX_LETTERS
    expect(letterCount('12!')).toBe(1);        // non-letters stripped → floors to 'A'
    expect(letterCount('')).toBe(1);
  });

  it('lowercase is folded to uppercase (caps read best as cakes)', () => {
    // Same string upper/lower → identical geometry, because cleanLetters uppercases both.
    const lo = letterGeometry('ab', 2.4), up = letterGeometry('AB', 2.4);
    expect(lo.worldW).toBeCloseTo(up.worldW, 6);
    expect(lo.halfD).toBeCloseTo(up.halfD, 6);
  });
});

describe('letter cake — multi-letter footprint is disjoint rings (no piping bridge)', () => {
  const shapeOf = letters => tierShape({ shapeFamily: 'letter', shapeConfig: { letters }, width: 2 });

  it('a single letter is one ring', () => {
    expect(asRings(letterGeometry('A').outline).length).toBe(1);
    expect(pipingPerimeters(shapeOf('A')).length).toBe(1);
  });

  it('a two-letter word is two rings / two piping loops', () => {
    expect(asRings(letterGeometry('AB').outline).length).toBe(2);
    expect(pipingPerimeters(shapeOf('AB')).length).toBe(2);
  });

  it('the letters occupy DISJOINT x-ranges — no loop spans the gap between them', () => {
    const loops = pipingPerimeters(shapeOf('AB'));
    const extents = loops.map(l => {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < 200; i++) { const p = l.at((i / 200) * l.length); lo = Math.min(lo, p.x); hi = Math.max(hi, p.x); }
      return { lo, hi };
    }).sort((a, b) => a.lo - b.lo);
    const [left, right] = extents;
    expect(left.hi).toBeLessThan(right.lo);
  });

  it("a counter letter (A/B/D/O/P/Q/R) keeps its hole", () => {
    // 'O' has one outer contour + one inner counter → the shape carries a hole.
    const g = letterGeometry('O', 2.4);
    expect(g.shapes.length).toBe(1);
    expect(g.shapes[0].holes.length).toBe(1);
  });
});

describe('letter cake — sized by height, per letter count', () => {
  it('letterGeometry sizes to the target HEIGHT, deriving width from the glyph aspect', () => {
    const g = letterGeometry('A', 2.4);
    expect(g.worldH).toBeCloseTo(2.4, 6);
    expect(g.halfD).toBeCloseTo(1.2, 6);
    const wide = letterGeometry('ABC', 2.4);
    expect(wide.worldH).toBeCloseTo(2.4, 6);
    expect(wide.worldW).toBeGreaterThan(g.worldW);
  });

  it('every word of a given count comes out the SAME height (one calibration)', () => {
    const a = letterTierDims({ letters: 'A' }).depth;
    const m = letterTierDims({ letters: 'M' }).depth;
    expect(m).toBeCloseTo(a, 6);
    const ab = letterTierDims({ letters: 'AB' }).depth;
    const mn = letterTierDims({ letters: 'MN' }).depth;
    expect(mn).toBeCloseTo(ab, 6);
    expect(ab).not.toBeCloseTo(a, 3);   // counts sized independently
  });

  it('letterSizeForCount reads byCount, clamps 1..3, falls back to defaults', () => {
    const cfg = { byCount: { 1: { height: 3, thickness: 0.5, pipingScale: 1.2 }, 3: { height: 1.1, thickness: 0.9 } } };
    expect(letterSizeForCount(cfg, 1)).toEqual({ height: 3, thickness: 0.5, pipingScale: 1.2 });
    expect(letterSizeForCount(cfg, 3)).toEqual({ height: 1.1, thickness: 0.9, pipingScale: 1 });
    expect(letterSizeForCount(cfg, 2)).toEqual({ ...LETTER_SIZE_DEFAULTS[2], pipingScale: 1 });
    expect(letterSizeForCount({}, 3)).toEqual({ ...LETTER_SIZE_DEFAULTS[3], pipingScale: 1 });
    expect(letterSizeForCount(cfg, 9)).toEqual({ height: 1.1, thickness: 0.9, pipingScale: 1 });   // clamps to 3 → authored byCount[3]
  });

  it('LETTER_COUNTS is 1..3 (max 3-letter cakes)', () => {
    expect(LETTER_COUNTS).toEqual([1, 2, 3]);
  });
});

describe('letter cake — renders as the shared glyph kind, on the perimeter wall', () => {
  const abc = tierShape({ shapeFamily: 'letter', shapeConfig: { letters: 'ABC', byCount: { 3: { height: 1.9, thickness: 0.8 } } } });

  it('descriptor is kind:glyph with resolved thickness + stroke-scaled shellRadius', () => {
    expect(abc.kind).toBe('glyph');
    expect(abc.thickness).toBeCloseTo(0.8, 6);
    // The piping bead scales to the STROKE width (so a shell border hugs the strokes), well below the
    // glyph half-height it used to size to (which swamped thin strokes and ringed the counters).
    expect(abc.strokeW).toBeGreaterThan(0);
    expect(abc.shellRadius).toBeCloseTo(abc.strokeW * 1.4, 6);   // strokeW × PIPING_STROKE_MUL (pipingScale 1)
    expect(abc.shellRadius).toBeLessThan(abc.halfD);
  });

  it('a letter wall is NOT a round cylinder (side decor traces the perimeter)', () => {
    expect(isRoundWall(abc)).toBe(false);
    expect(boundingRadius(abc)).toBeGreaterThan(0);
  });
});
