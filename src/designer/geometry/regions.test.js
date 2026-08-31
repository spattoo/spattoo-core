import { describe, it, expect } from 'vitest';
import { findRegions, weldTolerance, isInside } from './regions.js';

/* The point of this module: a region is what has an INSIDE, and a region is often several strokes.
 * The old per-stroke test could only ever see a shape drawn in one unbroken gesture.
 */

// A triangle as three separate lines, with the small gaps a hand actually leaves.
const triangle = (gap = 4) => [
  [[100, 100], [300, 100 + gap]],
  [[300 + gap, 100], [200, 280]],
  [[200 - gap, 280], [100, 100 + gap]],
];

describe('finding regions', () => {
  /* ⚠️ THE WHOLE REASON THIS EXISTS. Nobody draws a triangle in one gesture, and under the old model
   * three lines that plainly enclose an area had no inside at all — no fill, no colour. */
  it('finds the triangle three separate strokes make', () => {
    const { regions, openPaths } = findRegions(triangle());
    expect(regions).toHaveLength(1);
    expect(regions[0].paths.sort()).toEqual([0, 1, 2]);
    expect(openPaths).toEqual([]);
  });

  it('still finds a shape drawn in one unbroken loop', () => {
    const loop = [Array.from({ length: 24 }, (_, i) => {
      const t = (i / 23) * Math.PI * 2;
      return [200 + Math.cos(t) * 80, 200 + Math.sin(t) * 80];
    })];
    expect(findRegions(loop).regions).toHaveLength(1);
  });

  /* ⚠️ AN OPEN STROKE IS NOT A FAILURE. A vein, a swirl, a letter — most of what gets piped — has no
   * inside, and must come back as itself rather than being forced into a region. */
  it('leaves an open stroke open', () => {
    const { regions, openPaths } = findRegions([[[0, 0], [50, 0], [100, 40]]]);
    expect(regions).toEqual([]);
    expect(openPaths).toEqual([0]);
  });

  it('keeps a shape and a stray line apart', () => {
    const { regions, openPaths } = findRegions([...triangle(), [[500, 500], [560, 540]]]);
    expect(regions).toHaveLength(1);
    expect(openPaths).toEqual([3]);
  });

  /* ⚠️ THE WELD TOLERANCE IS THE DESIGN. Too tight and a hand-drawn triangle stays three lines; too
   * loose and shapes that merely pass near each other fuse. It scales with the drawing, because the
   * same gap is a rounding error on a large piece and deliberate space on a small one. */
  it('scales its tolerance with the size of the drawing', () => {
    const small = weldTolerance([[[0, 0], [40, 40]]]);
    const large = weldTolerance([[[0, 0], [900, 900]]]);
    expect(large).toBeGreaterThan(small);
  });

  it('does not fuse two shapes that merely sit near each other', () => {
    const a = triangle(2);
    const b = a.map(seg => seg.map(([x, y]) => [x + 420, y]));   // well clear
    expect(findRegions([...a, ...b]).regions).toHaveLength(2);
  });

  it('returns nothing rather than throwing on nothing', () => {
    expect(findRegions(null).regions).toEqual([]);
    expect(findRegions([]).regions).toEqual([]);
    expect(findRegions([[[1, 1]]]).regions).toEqual([]);
  });
});

describe('nesting', () => {
  /* One test answers two features: a region inside a region is white chocolate inside dark, and on a
   * cut panel it is a HOLE. */
  it('knows one region sits inside another', () => {
    const outer = [[0, 0], [200, 0], [200, 200], [0, 200], [0, 0]];
    const inner = [[80, 80], [120, 80], [120, 120], [80, 120], [80, 80]];
    expect(isInside(inner, outer)).toBe(true);
    expect(isInside(outer, inner)).toBe(false);
  });

  it('does not call an overlapping shape nested', () => {
    const outer = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
    const across = [[50, 50], [300, 50], [300, 90], [50, 90], [50, 50]];
    expect(isInside(across, outer)).toBe(false);
  });
});
