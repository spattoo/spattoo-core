import { describe, it, expect } from 'vitest';
import { traceAlpha, simplify, signedArea, outlineMm, toPathData } from './traceOutline.js';

// A tiny RGBA bitmap from an ASCII picture. '#' is opaque, '.' is transparent — so a test reads as
// the shape it is testing, and a failure is looked at rather than deciphered.
function bitmap(rows) {
  const height = rows.length, width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      data[(y * width + x) * 4 + 3] = ch === '#' ? 255 : 0;
    });
  });
  return { data, width, height };
}

describe('traceAlpha', () => {
  it('traces a square as one loop of the right area', () => {
    const loops = traceAlpha(bitmap([
      '.....',
      '.###.',
      '.###.',
      '.###.',
      '.....',
    ]));
    expect(loops).toHaveLength(1);
    expect(loops[0].hole).toBe(false);
    expect(loops[0].area).toBe(9);          // 3×3 pixels
  });

  it('finds a hole, and calls it a hole', () => {
    const loops = traceAlpha(bitmap([
      '.....',
      '.###.',
      '.#.#.',
      '.###.',
      '.....',
    ]));
    expect(loops).toHaveLength(2);
    const [outer, inner] = loops;           // sorted largest first
    expect(outer.hole).toBe(false);
    expect(outer.area).toBe(9);
    expect(inner.hole).toBe(true);
    expect(inner.area).toBe(1);
  });

  it('separates two shapes into two loops, neither a hole', () => {
    const loops = traceAlpha(bitmap([
      '##..##',
      '##..##',
    ]));
    expect(loops).toHaveLength(2);
    expect(loops.every(l => !l.hole)).toBe(true);
  });

  // A shape running off the canvas is the normal case for a tightly-cropped PNG. The boundary has to
  // close along the image border rather than leaving an open chain.
  it('closes a shape that touches the image edge', () => {
    const loops = traceAlpha(bitmap([
      '###',
      '###',
    ]));
    expect(loops).toHaveLength(1);
    expect(loops[0].area).toBe(6);
    const p = loops[0].points;
    expect(p[0]).toEqual(p[p.length - 1]);   // explicitly closed
  });

  it('reads the alpha threshold, not merely non-zero', () => {
    const img = bitmap(['##']);
    img.data[3] = 200;    // first pixel
    img.data[7] = 40;     // second — faint
    expect(traceAlpha(img).length).toBe(1);
    expect(traceAlpha(img)[0].area).toBe(1);
    expect(traceAlpha(img, { alphaThreshold: 20 })[0].area).toBe(2);
  });

  it('returns nothing for a fully transparent image', () => {
    expect(traceAlpha(bitmap(['...', '...']))).toEqual([]);
  });
});

describe('signedArea', () => {
  it('is zero for a degenerate ring and signed by winding', () => {
    const square = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
    const reversed = [...square].reverse();
    expect(Math.abs(signedArea(square))).toBe(4);
    expect(Math.sign(signedArea(square))).toBe(-Math.sign(signedArea(reversed)));
  });
});

describe('simplify', () => {
  it('drops collinear staircase points but keeps the corners', () => {
    // A straight run of points along y=0, then a corner.
    const line = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]];
    const out = simplify(line, 0.5);
    expect(out).toEqual([[0, 0], [3, 0], [3, 1]]);
  });

  it('keeps a closed ring closed, and does not collapse it', () => {
    const ring = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
    const out = simplify(ring, 0.5);
    expect(out[0]).toEqual(out[out.length - 1]);
    expect(out.length).toBeGreaterThanOrEqual(5);   // all four corners survive
  });

  // The reason the closed case is special-cased at all: RDP anchors both endpoints, and on a ring
  // they are the same point, so a naive call folds the whole loop into a line.
  it('does not fold a traced square into nothing', () => {
    const [loop] = traceAlpha(bitmap([
      '.....',
      '.###.',
      '.###.',
      '.###.',
      '.....',
    ]));
    const out = simplify(loop.points, 1);
    expect(out.length).toBeGreaterThanOrEqual(5);
    expect(Math.abs(signedArea(out))).toBeCloseTo(9, 5);
  });
});

describe('outlineMm', () => {
  // Holes here are deliberately larger than the 4 px speckle floor. A real 512² decoration's eye is
  // hundreds of pixels; a 2 px hole in a 6 px test image is noise by any honest measure, so a
  // fixture built at that scale would be testing the filter's failure rather than its job.
  const shape = bitmap([
    '........',
    '.######.',
    '.#....#.',
    '.#....#.',
    '.######.',
    '........',
  ]);

  it('scales to the width asked for, measured from the SHAPE not the canvas', () => {
    const out = outlineMm(shape, 40);
    expect(out.widthMm).toBe(40);
    // Traced span is 6 px wide × 4 px tall → 40 mm wide, ~26.7 mm tall. The transparent padding must
    // not count, or every printed shape comes out short.
    expect(out.heightMm).toBeCloseTo(40 * 4 / 6, 5);
  });

  it('separates lines to cut from lines to draw', () => {
    const out = outlineMm(shape, 40);
    expect(out.cut).toHaveLength(1);
    expect(out.mark).toHaveLength(1);       // the hole — drawn, not cut
  });

  it('can be told to leave the holes out', () => {
    expect(outlineMm(shape, 40, { holes: false }).mark).toEqual([]);
  });

  it('starts the shape at the origin so a caller can place it', () => {
    const out = outlineMm(shape, 40);
    const xs = out.cut[0].map(([x]) => x);
    const ys = out.cut[0].map(([, y]) => y);
    expect(Math.min(...xs)).toBeCloseTo(0, 5);
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
  });

  // Measured against the real catalogue: a grass clump traced to 46 "holes", a leaf branch to 39, a
  // lion to 3 — every one of them anti-aliasing speckle a few pixels across. On paper those are
  // marks a baker has to stop and think about, which is worse than not printing them.
  it('drops speckle but keeps a real hole', () => {
    // One solid block, one real hole (3×3), one single-pixel speck — the shape of every false hole
    // the catalogue turned up.
    const speckled = bitmap([
      '..........',
      '.########.',
      '.########.',
      '.########.',
      '.##....##.',
      '.##....##.',
      '.########.',
      '.########.',
      '.########.',
      '..........',
    ]);
    // The speck must sit with solid pixels on ALL FOUR sides. On an edge it is a notch in the
    // outline, not an enclosed loop, and nothing separate is traced at all.
    speckled.data[(2 * 10 + 3) * 4 + 3] = 0;

    const raw = outlineMm(speckled, 40, { minAreaRatio: 0, minAreaPx: 0 });
    expect(raw.mark.length).toBe(2);        // the genuine 5×3 hole AND the speck

    const clean = outlineMm(speckled, 40);  // default filter
    expect(clean.mark.length).toBe(1);      // the speck is gone, the real hole survives
    expect(clean.cut.length).toBe(1);
  });

  it('survives an empty image without dividing by zero', () => {
    const out = outlineMm(bitmap(['..', '..']), 40);
    expect(out.cut).toEqual([]);
    expect(out.heightMm).toBe(0);
  });
});

describe('toPathData', () => {
  it('writes a closed SVG path', () => {
    expect(toPathData([[0, 0], [2, 0], [2, 2], [0, 0]])).toBe('M0,0 L2,0 L2,2 L0,0 Z');
  });

  it('is empty for no points, rather than a stray Z', () => {
    expect(toPathData([])).toBe('');
  });
});
