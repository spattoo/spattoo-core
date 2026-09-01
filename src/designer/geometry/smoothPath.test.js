import { describe, it, expect } from 'vitest';
import { smoothPath } from './smoothPath.js';

const L = [[0, 0], [100, 0], [100, 100]];         // a right angle
const corner = pts => {
  // How sharp is the sharpest turn in the path? Softening must reduce it.
  let worst = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const d = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
    worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(d), Math.cos(d))));
  }
  return worst;
};

describe('softening a drawn stroke', () => {
  it('rounds a sharp corner', () => {
    expect(corner(smoothPath(L, { passes: 2 }))).toBeLessThan(corner(L) / 2);
  });

  it('softens further with more passes', () => {
    expect(corner(smoothPath(L, { passes: 4 }))).toBeLessThan(corner(smoothPath(L, { passes: 1 })));
  });

  /* ⚠️ Cutting the ends walks the whole line inwards on every pass, so a swirl piped to a point
     loses its point and a letter shrinks away from where it was drawn. */
  it('pins the ends of an open stroke', () => {
    const s = smoothPath(L, { passes: 3 });
    expect(s[0]).toEqual([0, 0]);
    expect(s[s.length - 1]).toEqual([100, 100]);
  });

  it('keeps a ring closed, so it can still be filled', () => {
    const ring = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
    const s = smoothPath(ring, { passes: 2, closed: true });
    expect(s[0]).toEqual(s[s.length - 1]);
  });

  it('leaves something too short to have a corner alone', () => {
    expect(smoothPath([[0, 0], [1, 1]])).toEqual([[0, 0], [1, 1]]);
    expect(smoothPath(null)).toEqual([]);
  });
});
