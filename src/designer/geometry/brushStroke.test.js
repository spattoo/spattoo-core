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

  it('has nothing to say about a gesture too short to be one', () => {
    expect(brushStroke([[0, 0]])).toBeNull();
    expect(brushStroke([[5, 5], [5, 5]])).toBeNull();
  });
});
