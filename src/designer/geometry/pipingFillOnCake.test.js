import { describe, it, expect } from 'vitest';
import { fillStrokeOnFlat, canFillStroke } from './pipingFillOnCake.js';

/* The join between a 2D fill and a 3D stroke. What these protect is that the fill lands in the same
 * plane as the outline it belongs to, and that a stroke which CANNOT honestly be filled says so
 * rather than producing something that floats.
 */

// A loop drawn on a tier top: constant height, closed.
const onTop = (y = 1.4, r = 0.4, gap = 0.02) => Array.from({ length: 40 }, (_, i) => {
  const t = (i / 40) * (Math.PI * 2 - gap);
  return [Math.cos(t) * r, y, Math.sin(t) * r];
});
// The same loop drawn down a tier WALL: height varies as it wraps.
const onWall = () => Array.from({ length: 40 }, (_, i) => {
  const t = (i / 40) * Math.PI * 2;
  return [Math.cos(t) * 0.6, 0.9 + Math.sin(t) * 0.3, Math.sin(t) * 0.6];
});

describe('filling a stroke drawn on the cake', () => {
  it('fills a closed loop on a flat top', () => {
    const out = fillStrokeOnFlat(onTop(), { pattern: 'hatch', thickness: 0.02 });
    expect(out.canFill).toBe(true);
    expect(out.paths.length).toBeGreaterThan(0);
    expect(out.paths.flat().length).toBeGreaterThan(6);
  });

  /* ⚠️ THE FILL MUST SHARE THE OUTLINE'S PLANE. A pass at the wrong height is chocolate hanging in
   * the air above the cake, or buried inside it — and either reads as a rendering bug, not as a
   * fill. Every generated point sits at the stroke's own height. */
  it('puts every pass at the height the stroke was drawn at', () => {
    const out = fillStrokeOnFlat(onTop(1.4), { thickness: 0.02 });
    for (const [, y] of out.paths.flat()) expect(Math.abs(y - 1.4)).toBeLessThan(1e-9);
  });

  /* ⚠️ A CURVED WALL IS REFUSED, not approximated. A straight pass across a shape wrapped round a
   * tier cuts through the cake and comes out the far side. Reporting it honestly is what lets the UI
   * withhold the control instead of offering one that produces a floating mess. */
  it('refuses a stroke that wraps a curved wall', () => {
    const out = fillStrokeOnFlat(onWall(), { thickness: 0.02 });
    expect(out.flat).toBe(false);
    expect(out.canFill).toBe(false);
    expect(out.paths).toEqual([]);
  });

  it('refuses an open stroke — a letter has no inside', () => {
    const line = Array.from({ length: 20 }, (_, i) => [-0.4 + i * 0.04, 1.4, 0.1]);
    const out = fillStrokeOnFlat(line, { thickness: 0.02 });
    expect(out.flat).toBe(true);
    expect(out.closed).toBe(false);
    expect(out.canFill).toBe(false);
  });

  // Judged against the shape's own size, in step with drawnShape.js.
  it('judges closure against the size of the shape', () => {
    expect(fillStrokeOnFlat(onTop(1.4, 0.4, 0.05), { thickness: 0.02 }).closed).toBe(true);
    expect(fillStrokeOnFlat(onTop(1.4, 0.4, 1.9),  { thickness: 0.02 }).closed).toBe(false);
  });

  /* Spacing is in ROPE WIDTHS, so a fine chocolate line and a fat cream one both read as piped —
   * one of them must not come out a solid blob and the other a few stray lines. */
  it('spaces the passes by the rope, so a fine pen packs more of them in', () => {
    const fine = fillStrokeOnFlat(onTop(), { thickness: 0.008 });
    const fat  = fillStrokeOnFlat(onTop(), { thickness: 0.05 });
    expect(fine.paths.flat().length).toBeGreaterThan(fat.paths.flat().length);
  });

  it('does not throw on nothing', () => {
    expect(fillStrokeOnFlat(null).canFill).toBe(false);
    expect(fillStrokeOnFlat([[0, 0, 0]]).canFill).toBe(false);
    expect(canFillStroke(null, 0.02)).toBe(false);
  });
});

describe('what a person calls closed', () => {
  /* ⚠️ THE BUG THIS EXISTS FOR. A loop drawn by hand on a cake, plainly closed to the eye, was judged
   * open — the tolerance was 9% of the shape or twice the rope, and with a 0.018 chocolate tip that is
   * a few millimetres. The card then hid the fill and advised the baker to close a shape they had
   * already closed. */
  const handLoop = (gapFrac) => {
    const r = 0.22, y = 1.55;
    const span = Math.PI * 2 * (1 - gapFrac);
    return Array.from({ length: 36 }, (_, i) => {
      const t = (i / 35) * span;
      return [Math.cos(t) * r, y, Math.sin(t) * r];
    });
  };

  it('accepts a loop a hand actually draws', () => {
    // ~8% of the way round left open — a visible gap, and unmistakably a loop.
    expect(fillStrokeOnFlat(handLoop(0.08), { thickness: 0.018 }).canFill).toBe(true);
  });

  it('still refuses things that are not loops', () => {
    // A third of the way round missing is a horseshoe, not a shape with an inside.
    expect(fillStrokeOnFlat(handLoop(0.42), { thickness: 0.018 }).closed).toBe(false);
    const ess = Array.from({ length: 30 }, (_, i) => {
      const t = i / 29;
      return [Math.sin(t * Math.PI * 1.9) * 0.2, 1.55, -0.25 + t * 0.5];
    });
    expect(fillStrokeOnFlat(ess, { thickness: 0.018 }).closed).toBe(false);
  });
});
