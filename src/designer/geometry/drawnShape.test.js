import { describe, it, expect } from 'vitest';
import { tidyDrawn, fillWorthwhile } from './drawnShape.js';

/* A pointer fires far faster than a hand moves, so what arrives is not a shape: hundreds of
 * near-identical points, and two ends that never quite meet. These cover the turning of one into
 * the other, and the two judgements the UI needs to make afterwards.
 */

// A hand-drawn blob: dense samples, deliberately stopping short of where it began.
const blob = (n = 200, gap = 0.45) => Array.from({ length: n }, (_, i) => {
  const t = (i / n) * (Math.PI * 2 - gap);
  return [100 + Math.cos(t) * 60, 100 + Math.sin(t) * 52];
});

describe('turning a trail into a shape', () => {
  it('thins hundreds of samples down to a handful of corners', () => {
    const out = tidyDrawn(blob());
    expect(out.ring.length).toBeLessThan(40);
    expect(out.ring.length).toBeGreaterThan(6);
  });

  /* ⚠️ THE RING IS ALWAYS CLOSED, because a scanline fill needs a closed boundary — an open one
   * leaks along the missing edge. Whether the BAKER closed it is reported separately. */
  it('always returns a closed ring, and says whether the baker closed it', () => {
    const open = tidyDrawn(blob(200, 0.9));
    expect(open.ring[0]).toEqual(open.ring[open.ring.length - 1]);
    expect(open.closed).toBe(false);
    expect(open.gap).toBeGreaterThan(12);

    const shut = tidyDrawn(blob(200, 0.02));
    expect(shut.closed).toBe(true);
  });

  // A still hand emits a pile of identical points, and duplicates make zero-length fill spans.
  it('drops duplicate samples from a hand that paused', () => {
    const held = [...Array(60)].map(() => [50, 50]);
    expect(tidyDrawn([...held, ...blob(), ...held])).not.toBeNull();
    expect(tidyDrawn(held)).toBeNull();
  });

  it('refuses a stray tap or a scrub rather than making a shape from it', () => {
    expect(tidyDrawn(null)).toBeNull();
    expect(tidyDrawn([[1, 1], [2, 2]])).toBeNull();
    expect(tidyDrawn([[0, 0], [3, 0], [3, 2], [0, 2]])).toBeNull();   // real, but tiny
  });

  it('keeps the shape it was given', () => {
    const { ring } = tidyDrawn(blob());
    const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
    expect(Math.min(...xs)).toBeGreaterThan(34);     // the blob spans 40..160 x, 48..152 y
    expect(Math.max(...xs)).toBeLessThan(166);
    expect(Math.max(...ys)).toBeLessThan(158);
  });
});

describe('is a fill a good idea here', () => {
  it('says yes to a blob', () => {
    expect(fillWorthwhile(tidyDrawn(blob()).ring)).toBe(true);
  });

  /* ⚠️ A SIGNATURE HAS AREA BUT IS A LINE. Hatching a treble clef or a spiral produces a smear of
   * disconnected dashes, not a filled shape — the UI warns rather than forbids, but it has to know. */
  it('says no to a long thin squiggle', () => {
    const squiggle = Array.from({ length: 120 }, (_, i) => [i * 3, 100 + Math.sin(i / 4) * 26]);
    const tidy = tidyDrawn(squiggle);
    expect(tidy).not.toBeNull();
    expect(fillWorthwhile(tidy.ring)).toBe(false);
  });

  it('does not throw on nothing', () => {
    expect(fillWorthwhile(null)).toBe(false);
    expect(fillWorthwhile([[0, 0], [1, 1]])).toBe(false);
  });
});
