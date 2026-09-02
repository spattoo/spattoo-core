import { describe, it, expect } from 'vitest';
import { brushStroke } from './brushStroke.js';

const straight = Array.from({ length: 24 }, (_, i) => [20 + i * 12, 200]);
const widthAt = (b, x) => {
  // How tall is the outline at this x? Sample the polygon's vertical extent nearby.
  const near = b.outline.filter(p => Math.abs(p[0] - x) < 7).map(p => p[1]);
  return near.length ? Math.max(...near) - Math.min(...near) : 0;
};

describe('a chocolate brushstroke', () => {
  /* ⚠️ ASYMMETRY IS THE WHOLE TELL. A stroke tapering equally at both ends reads as a leaf or a
     petal; a real one is blunt where the spatula lands and runs out to a ragged point. */
  it('is blunt where it starts and pulls out to a point', () => {
    const b = brushStroke(straight, { width: 60 });
    const start = widthAt(b, 30), end = widthAt(b, 290);
    expect(start).toBeGreaterThan(30);         // lands already wide
    expect(end).toBeLessThan(start / 3);       // and runs dry
  });

  it('is broadest through the first half, not in the middle', () => {
    const b = brushStroke(straight, { width: 60 });
    expect(widthAt(b, 100)).toBeGreaterThan(widthAt(b, 220));
  });

  it('closes its outline, so it can be extruded as a piece', () => {
    const { outline } = brushStroke(straight, { width: 40 });
    expect(outline[0]).toEqual(outline[outline.length - 1]);
  });

  /* ⚠️ The knife's striations are most of what says "chocolate smear" rather than "coloured shape". */
  it('carries ridges along its length that stop before the tip', () => {
    const { ridges } = brushStroke(straight, { width: 60 });
    expect(ridges.length).toBeGreaterThan(2);
    const lastX = Math.max(...ridges.flat().map(p => p[0]));
    expect(lastX).toBeLessThan(20 + 23 * 12);
  });

  /* ⚠️ The same drawing must come back the same after a save. Math.random() in the edge would make a
     piece that changed shape every time the cake was opened. */
  it('is the same stroke every time', () => {
    const a = brushStroke(straight, { width: 60, seed: 7 });
    const b = brushStroke(straight, { width: 60, seed: 7 });
    expect(a.outline).toEqual(b.outline);
  });

  /* ⚠️ THE VANISHING LOOP. Offsetting a curve by more than its radius of curvature folds the inner
     edge through the centre; the outline becomes a bowtie and a bowtie filled by the non-zero rule
     cancels its own area — the piece is not mis-shaped, it is gone. */
  it('survives a tight turn instead of folding through itself', () => {
    const loop = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 39) * Math.PI * 1.7;
      return [200 + Math.cos(a) * 45, 200 + Math.sin(a) * 45];      // radius well under the width
    });
    const b = brushStroke(loop, { width: 120 });
    expect(b).not.toBeNull();
    // Shoelace area: a bowtie cancels to near nothing, a real band does not.
    const o = b.outline;
    let area = 0;
    for (let i = 0; i < o.length - 1; i++) area += o[i][0] * o[i + 1][1] - o[i + 1][0] * o[i][1];
    expect(Math.abs(area / 2)).toBeGreaterThan(1000);
  });

  /* ⚠️ WHERE A STROKE DOUBLES BACK, ITS OUTLINE CROSSES — two lobes of opposite winding, and the
     non-zero fill rule cancels one against the other. Half the piece filled and half came out as an
     empty outline. The band is filled section by section instead, which cannot cancel. */
  it('gives a band of cross-sections, not only an outline', () => {
    const b = brushStroke(straight, { width: 60 });
    expect(b.band).toHaveLength(straight.length);
    expect(b.band[0]).toHaveLength(2);
    // Each pair straddles the spine: the two sides are on opposite sides of the path point.
    const [l, r] = b.band[5];
    expect((l[1] - straight[5][1]) * (r[1] - straight[5][1])).toBeLessThan(0);
  });

  /* ⚠️ A RING IS NOT A PULL. A brushstroke tapers where the spatula lifts — right for a pull, fatal
     for a loop, because the thin tail can never meet the blunt start and the ring always came out
     with a gap in it. A spatula taken round a ring never lifts, so it lays an even band. */
  describe('a closed loop', () => {
    const ring = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 39) * Math.PI * 2;
      return [200 + Math.cos(a) * 90, 200 + Math.sin(a) * 90];
    });

    it('is recognised from the gesture, not asked for', () => {
      expect(brushStroke(ring, { width: 40 }).closed).toBe(true);
      expect(brushStroke(straight, { width: 40 }).closed).toBe(false);
    });

    it('keeps an even width all the way round, so the ends meet', () => {
      const b = brushStroke(ring, { width: 40 });
      const widths = b.band.map(([l, r]) => Math.hypot(l[0] - r[0], l[1] - r[1]));
      const min = Math.min(...widths), max = Math.max(...widths);
      expect(min).toBeGreaterThan(max * 0.8);      // no taper to a point
    });

    it('joins the last section back to the first', () => {
      const b = brushStroke(ring, { width: 40 });
      expect(b.band[b.band.length - 1]).toEqual(b.band[0]);
    });
  });

  it('has nothing to say about a gesture too short to be one', () => {
    expect(brushStroke([[0, 0]])).toBeNull();
    expect(brushStroke([[5, 5], [5, 5]])).toBeNull();
  });
});
