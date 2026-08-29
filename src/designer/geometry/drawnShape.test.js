import { describe, it, expect } from 'vitest';
import { tidyDrawn, fillWorthwhile } from './drawnShape.js';

/* A pointer fires far faster than a hand moves, so what arrives is not a shape. These cover turning
 * one into the other — and above all that an OPEN stroke stays open, because most of what gets
 * piped is a letter, a number or a swirl rather than a loop.
 */

// A hand-drawn loop, dense samples, stopping `gap` radians short of where it began.
const loop = (gapRad = 0.05, r = 60, n = 200) => Array.from({ length: n }, (_, i) => {
  const t = (i / n) * (Math.PI * 2 - gapRad);
  return [100 + Math.cos(t) * r, 100 + Math.sin(t) * r];
});
// The figure-8 from the bug report: two lobes, ends nowhere near each other.
const eight = () => Array.from({ length: 160 }, (_, i) => {
  const t = (i / 160) * Math.PI * 1.9;
  return [100 + Math.sin(t * 2) * 40, 100 + Math.sin(t) * 70];
});

describe('an open stroke stays open', () => {
  /* ⚠️ THE BUG THIS EXISTS FOR. The first version joined the ends whatever the distance, so drawing
   * an "8" got a 97px chord slapped across it — something the baker never drew. Letters, numbers and
   * swirls are most of what gets piped, and none of them close. */
  it('never joins up a figure-8', () => {
    const out = tidyDrawn(eight());
    expect(out.closed).toBe(false);
    expect(out.ring).toBeNull();
    expect(out.path[0]).not.toEqual(out.path[out.path.length - 1]);
  });

  it('keeps a wide-open arc open', () => {
    expect(tidyDrawn(loop(2.5)).closed).toBe(false);
  });

  /* ⚠️ NO MINIMUM AREA. A "1" encloses nothing and is a perfectly good thing to pipe; an earlier
   * version threw it away as a stray tap, and so could not draw numbers. */
  it('accepts a stroke that encloses nothing at all', () => {
    const one = Array.from({ length: 40 }, (_, i) => [100, 40 + i * 2]);
    const out = tidyDrawn(one);
    expect(out).not.toBeNull();
    expect(out.area).toBe(0);
    expect(out.path.length).toBeGreaterThan(1);
  });
});

describe('closure is detected, not imposed', () => {
  it('recognises a loop the baker did close', () => {
    const out = tidyDrawn(loop(0.03));
    expect(out.closed).toBe(true);
    expect(out.ring[0]).toEqual(out.ring[out.ring.length - 1]);   // exactly shut, so a fill cannot leak
  });

  /* ⚠️ RELATIVE TO THE SHAPE, NEVER A FIXED PIXEL COUNT. The same 18px gap is a wide horseshoe on a
   * tiny loop and a closed shape on a large one; a fixed threshold gets one of them wrong. */
  it('judges the gap against the size of what was drawn', () => {
    const small = tidyDrawn(loop(0.55, 18));    // ~18px across, gap is a big fraction of it
    const large = tidyDrawn(loop(0.09, 200));   // much bigger, similar absolute gap
    expect(large.gap).toBeGreaterThan(small.gap);
    expect(small.closed).toBe(false);
    expect(large.closed).toBe(true);
  });
});

describe('tidying the trail', () => {
  it('thins hundreds of samples to a handful of corners', () => {
    const out = tidyDrawn(loop());
    expect(out.path.length).toBeLessThan(40);
    expect(out.path.length).toBeGreaterThan(5);
  });

  it('drops duplicates from a hand that paused', () => {
    const held = [...Array(60)].map(() => [50, 50]);
    expect(tidyDrawn(held)).toBeNull();
    expect(tidyDrawn([...held, ...loop(), ...held])).not.toBeNull();
  });

  it('returns nothing for a tap rather than throwing', () => {
    expect(tidyDrawn(null)).toBeNull();
    expect(tidyDrawn([[1, 1], [1, 1]])).toBeNull();
  });
});

describe('is a fill a good idea here', () => {
  it('says yes to a blob', () => {
    expect(fillWorthwhile(tidyDrawn(loop(0.03)).ring)).toBe(true);
  });

  it('says no to a long thin squiggle that happens to close', () => {
    const squiggle = Array.from({ length: 120 }, (_, i) => [i * 3, 100 + Math.sin(i / 4) * 20]);
    expect(fillWorthwhile([...squiggle, [0, 99], squiggle[0]])).toBe(false);
  });

  it('does not throw on nothing', () => {
    expect(fillWorthwhile(null)).toBe(false);
  });
});
