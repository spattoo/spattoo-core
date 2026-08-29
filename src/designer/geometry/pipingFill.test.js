import { describe, it, expect } from 'vitest';
import { hatchPaths, fillShape, liftCount, FILL_PATTERNS } from './pipingFill.js';

/* What these protect is the difference between a fill and a mess: that the path stays INSIDE the
 * shape the baker drew, that it stays LACY rather than closing into a slab, and that a shape which
 * genuinely needs the nozzle lifted says so instead of drawing a line across the gap.
 */

const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
/* ⚠️ A U, NOT AN HOURGLASS, and the first version of this test got it wrong in an instructive way.
 * An hourglass pinched at the waist still returns ONE span per horizontal scanline — it narrows but
 * never separates — so it cannot demonstrate a lift at all. A shape splits a pass only when the SAME
 * scanline meets two disjoint runs of interior, which is a U (or a donut, or two lobes side by side).
 * The algorithm was right and the fixture was wrong. */
const uShape = [[0, 0], [1, 0], [1, 1], [0.7, 1], [0.7, 0.3], [0.3, 0.3], [0.3, 1], [0, 1]];

const flat = paths => paths.flat();
const inside = ([x, y]) => x >= -1e-6 && x <= 1 + 1e-6 && y >= -1e-6 && y <= 1 + 1e-6;

describe('hatching a shape', () => {
  it('fills a square with parallel passes', () => {
    const paths = hatchPaths(square, { spacing: 0.1 });
    expect(paths.length).toBe(1);              // convex: one continuous squeeze
    expect(flat(paths).length).toBeGreaterThan(10);
  });

  // ⚠️ THE ONE THAT MATTERS. A pass that leaves the outline is chocolate on the parchment.
  it('never leaves the shape', () => {
    for (const angle of [0, 0.4, Math.PI / 3, -1.1]) {
      for (const p of flat(hatchPaths(square, { spacing: 0.07, angle }))) expect(inside(p)).toBe(true);
    }
  });

  // It snakes: consecutive passes must run in opposite directions, or the nozzle is being lifted
  // and carried back to the same side for every single line.
  it('alternates direction so the path is continuous', () => {
    const [path] = hatchPaths(square, { spacing: 0.2 });
    const dirs = [];
    for (let i = 0; i + 1 < path.length; i++) {
      const dx = path[i + 1][0] - path[i][0];
      if (Math.abs(dx) > 1e-6) dirs.push(Math.sign(dx));
    }
    for (let i = 1; i < dirs.length; i++) expect(dirs[i]).toBe(-dirs[i - 1]);
  });

  it('spaces the passes as asked', () => {
    const rows = new Set(hatchPaths(square, { spacing: 0.25 })[0].map(p => p[1].toFixed(4)));
    expect(rows.size).toBe(4);                 // 1.0 / 0.25
  });

  /* ⚠️ A SHAPE WITH A WAIST NEEDS THE NOZZLE LIFTED, and the fill must say so rather than joining
   * the lobes with a line that crosses empty parchment. `liftCount` is what the build guide reads. */
  it('splits where the shape does, instead of drawing across the gap', () => {
    const paths = hatchPaths(uShape, { spacing: 0.06 });
    expect(liftCount(paths)).toBeGreaterThan(1);
    // and nothing was drawn across the notch: no point sits inside the cut-out.
    for (const [x, y] of flat(paths)) {
      const inNotch = x > 0.3 + 1e-6 && x < 0.7 - 1e-6 && y > 0.3 + 1e-6;
      expect(inNotch).toBe(false);
    }
  });

  it('insets so the fill meets the outline rather than crossing it', () => {
    const xs = flat(hatchPaths(square, { spacing: 0.2, inset: 0.05 })).map(p => p[0]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0.05 - 1e-6);
    expect(Math.max(...xs)).toBeLessThanOrEqual(0.95 + 1e-6);
  });

  it('returns nothing for a degenerate shape rather than throwing', () => {
    expect(hatchPaths([[0, 0], [1, 1]], { spacing: 0.1 })).toEqual([]);
    expect(hatchPaths(square, { spacing: 0 })).toEqual([]);
    expect(hatchPaths(null)).toEqual([]);
  });
});

describe('the patterns', () => {
  it('cross-hatch lays two passes, hatch one', () => {
    const one = fillShape(square, { pattern: 'hatch',  spacing: 0.1 });
    const two = fillShape(square, { pattern: 'cross',  spacing: 0.1 });
    expect(two.length).toBe(one.length * 2);
  });

  /* ⚠️ NOT 90° APART. At exactly a right angle the crossings line up into a grid and the piece reads
   * as woven fabric rather than as something piped by hand. */
  it('the woven pattern avoids a regular grid', () => {
    const [a, b] = FILL_PATTERNS.weave.passes;
    expect(Math.abs(Math.abs(a - b) - Math.PI / 2)).toBeGreaterThan(0.1);
  });

  it('scribble wobbles, and identically for the same seed', () => {
    const plain = fillShape(square, { pattern: 'hatch',    spacing: 0.1 });
    const a     = fillShape(square, { pattern: 'scribble', spacing: 0.1, seed: 7 });
    const b     = fillShape(square, { pattern: 'scribble', spacing: 0.1, seed: 7 });
    expect(a).toEqual(b);                                  // deterministic — no Math.random
    expect(a).not.toEqual(plain);
  });

  /* ⚠️ THE WOBBLE MUST NOT CLOSE THE LACE UP. Amplitude is capped at a third of the spacing so two
   * neighbouring passes cannot meet; if they could, a scribble fill would become a solid patch —
   * which is the one thing this feature must not produce. */
  it('scribble never lets neighbouring passes touch', () => {
    const spacing = 0.12;
    const path = fillShape(square, { pattern: 'scribble', spacing, seed: 3 })[0];
    const rows = new Map();
    for (const [, y] of path) {
      const k = Math.round(y / spacing);
      const r = rows.get(k) ?? [Infinity, -Infinity];
      rows.set(k, [Math.min(r[0], y), Math.max(r[1], y)]);
    }
    const ordered = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
    for (let i = 1; i < ordered.length; i++) expect(ordered[i][0]).toBeGreaterThan(ordered[i - 1][1]);
  });

  it('an unknown pattern falls back rather than throwing', () => {
    expect(fillShape(square, { pattern: 'nope', spacing: 0.2 }).length).toBeGreaterThan(0);
  });
});

describe('filling solid', () => {
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]];

  /* ⚠️ SOLID MEANS THE ROPES OVERLAP. If the step were >= the rope width the piece would come out
   * as tidy stripes labelled "solid", which is the one way this option can silently fail. */
  it('packs the passes closer together than the rope is wide', () => {
    const ropeWidth = 0.1;
    const [path] = fillShape(square, { pattern: 'solid', ropeWidth });
    const rows = [...new Set(path.map(p => +p[1].toFixed(6)))].sort((a, b) => a - b);
    for (let i = 1; i < rows.length; i++) expect(rows[i] - rows[i - 1]).toBeLessThan(ropeWidth);
  });

  // It ignores the gap control by design: "solid" that can be opened up is just a hatch.
  it('does not let the gap slider un-solid it', () => {
    const tight = fillShape(square, { pattern: 'solid', ropeWidth: 0.1, spacing: 0.01 });
    const loose = fillShape(square, { pattern: 'solid', ropeWidth: 0.1, spacing: 0.9 });
    expect(loose).toEqual(tight);
  });

  it('lays a cross pass, so no ridges are left along the lay direction', () => {
    expect(FILL_PATTERNS.solid.passes.length).toBe(2);
  });
});
