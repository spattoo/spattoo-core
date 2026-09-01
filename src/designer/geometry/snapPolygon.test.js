import { describe, it, expect } from 'vitest';
import { snapPolygon } from './snapPolygon.js';

/* A hand-drawn version of a shape: every point nudged off the true line, the way a hand does. */
const wobble = (pts, amp, seed = 1) => {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return (s / 2147483648) * 2 - 1; };
  return pts.map(([x, y]) => [x + rnd() * amp, y + rnd() * amp]);
};

/* Walk a polygon, sampling along each edge — which is what a drawn stroke actually is. */
const walk = (corners, per = 14) => {
  const out = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    for (let k = 0; k < per; k++) {
      out.push([a[0] + (b[0] - a[0]) * (k / per), a[1] + (b[1] - a[1]) * (k / per)]);
    }
  }
  out.push([...out[0]]);
  return out;
};

const TRI = [[200, 40], [340, 300], [60, 300]];
const SQUARE = [[60, 60], [300, 60], [300, 300], [60, 300]];

describe('straightening a drawn polygon', () => {
  /* ⚠️ THE CASE THAT WAS BROKEN. Auto-correct knew circles and lines only, so a hand-drawn triangle
     was left exactly as drawn — the tick was on and nothing happened. */
  it('finds the three corners of a wobbly triangle', () => {
    const snapped = snapPolygon(wobble(walk(TRI), 7));
    expect(snapped).not.toBeNull();
    expect(snapped.corners).toBe(3);
  });

  it('finds the four corners of a wobbly square', () => {
    expect(snapPolygon(wobble(walk(SQUARE), 7)).corners).toBe(4);
  });

  it('gives back a closed ring, so the shape can still be filled', () => {
    const { points } = snapPolygon(wobble(walk(TRI), 7));
    expect(points[0]).toEqual(points[points.length - 1]);
  });

  it('actually straightens: no point sits far off its edge afterwards', () => {
    const { points } = snapPolygon(wobble(walk(TRI), 7));
    // Three corners plus the repeat — every wobble between them is gone, not smoothed.
    expect(points).toHaveLength(4);
  });

  /* ⚠️ IT MUST REFUSE MORE OFTEN THAN IT FIRES. Most of what gets piped is a swirl, a letter or a
     scribble; forcing corners onto those turns a signature into a scrawl of triangles. */
  it('leaves a circle alone', () => {
    const circle = Array.from({ length: 60 }, (_, i) => {
      const a = (i / 59) * Math.PI * 2;
      return [200 + Math.cos(a) * 120, 200 + Math.sin(a) * 120];
    });
    expect(snapPolygon(circle)).toBeNull();
  });

  it('leaves an open stroke alone — a letter is not a polygon', () => {
    expect(snapPolygon(walk(TRI).slice(0, 20))).toBeNull();
  });

  it('leaves a scribble alone', () => {
    const scribble = Array.from({ length: 80 }, (_, i) => [
      60 + i * 3, 200 + Math.sin(i * 1.7) * 60 + Math.cos(i * 0.9) * 30,
    ]);
    expect(snapPolygon(scribble)).toBeNull();
  });

  it('has nothing to say about too few points', () => {
    expect(snapPolygon([[0, 0], [1, 1]])).toBeNull();
    expect(snapPolygon(null)).toBeNull();
  });
});
