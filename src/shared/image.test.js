import { describe, it, expect } from 'vitest';
import { alphaBounds, ALPHA_FLOOR } from './image.js';

// Builds RGBA data for a w×h image and marks a solid opaque rect at (x,y,rw,rh).
function withRect(w, h, { x, y, w: rw, h: rh }, alpha = 255) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let py = y; py < y + rh; py++) {
    for (let px = x; px < x + rw; px++) data[(py * w + px) * 4 + 3] = alpha;
  }
  return data;
}

// The single definition of "where the artwork ends", shared by the upload crop
// (normalizeArtwork) and the render-time logo trim. If these two ever disagreed, a logo would
// change size the moment a baker re-uploaded it.
describe('alphaBounds — the opaque bounding box', () => {
  it('finds a rect inset in transparent padding', () => {
    expect(alphaBounds(withRect(20, 10, { x: 4, y: 2, w: 9, h: 5 }), 20, 10))
      .toEqual({ x: 4, y: 2, w: 9, h: 5 });
  });

  it('returns the whole image when it is fully opaque — callers treat this as "already tight"', () => {
    expect(alphaBounds(withRect(6, 4, { x: 0, y: 0, w: 6, h: 4 }), 6, 4))
      .toEqual({ x: 0, y: 0, w: 6, h: 4 });
  });

  it('returns null when nothing is opaque — a blank upload must not crop to a 0×0 canvas', () => {
    expect(alphaBounds(new Uint8ClampedArray(5 * 5 * 4), 5, 5)).toBe(null);
  });

  it('ignores alpha at or below the floor, so a soft cutout edge does not inflate the box', () => {
    // remove.bg leaves a faint halo; counting it would defeat the trim entirely.
    const data = withRect(10, 10, { x: 0, y: 0, w: 10, h: 10 }, ALPHA_FLOOR);   // all at the floor
    expect(alphaBounds(data, 10, 10)).toBe(null);
    const justOver = withRect(10, 10, { x: 3, y: 3, w: 2, h: 2 }, ALPHA_FLOOR + 1);
    expect(alphaBounds(justOver, 10, 10)).toEqual({ x: 3, y: 3, w: 2, h: 2 });
  });

  it('includes single opaque pixels at the extreme corners', () => {
    const data = new Uint8ClampedArray(8 * 6 * 4);
    data[(0 * 8 + 0) * 4 + 3] = 255;          // top-left
    data[(5 * 8 + 7) * 4 + 3] = 255;          // bottom-right
    expect(alphaBounds(data, 8, 6)).toEqual({ x: 0, y: 0, w: 8, h: 6 });
  });

  it('handles a 1px-tall mark — a rule or underline logo must not collapse', () => {
    expect(alphaBounds(withRect(12, 9, { x: 2, y: 4, w: 8, h: 1 }), 12, 9))
      .toEqual({ x: 2, y: 4, w: 8, h: 1 });
  });

  it('honours a custom floor', () => {
    const data = withRect(6, 6, { x: 1, y: 1, w: 3, h: 3 }, 40);
    expect(alphaBounds(data, 6, 6, 50)).toBe(null);
    expect(alphaBounds(data, 6, 6, 30)).toEqual({ x: 1, y: 1, w: 3, h: 3 });
  });
});
