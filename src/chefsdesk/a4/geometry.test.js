import { describe, it, expect } from 'vitest';
import { sized, resized, moved, MIN_W } from './geometry.js';

// These are the rules that stand between a baker and a wasted edible sheet: what shape an item is
// born at, and whether dragging a corner can change that shape. Both were once implied by a literal
// `aspectRatio: '1 / 1'` inside the component, which is correct for a photo cut to a square mask and
// wrong for the name banners the standalone tool exists to print.
//
// Tested here rather than through a render because the sheet places items in an effect, and effects
// do not run under renderToStaticMarkup — a markup assertion would have been checking for something
// that could never appear, and passing tests would have meant nothing.

describe('sized — the shape an item is born at', () => {
  it('is square for a masked frame', () => {
    expect(sized({ aspect: 1 }, 0.4)).toEqual({ w: 0.4, h: 0.4 });
  });

  it('is half as tall as it is wide for a 2:1 banner', () => {
    expect(sized({ aspect: 2 }, 0.4)).toEqual({ w: 0.4, h: 0.2 });
  });

  it('is twice as tall as it is wide for a portrait image', () => {
    expect(sized({ aspect: 0.5 }, 0.4)).toEqual({ w: 0.4, h: 0.8 });
  });

  // An adapter written before `aspect` existed keeps its old behaviour rather than dividing by
  // undefined and laying out NaN — which CSS drops silently, so the item would render at some
  // browser default rather than visibly failing.
  it('treats a source that declares no aspect as square', () => {
    expect(sized({}, 0.4)).toEqual({ w: 0.4, h: 0.4 });
    expect(sized(undefined, 0.4)).toEqual({ w: 0.4, h: 0.4 });
  });

  it('never produces NaN from a nonsense aspect', () => {
    for (const bad of [0, null, undefined, NaN]) {
      expect(sized({ aspect: bad }, 0.4).h).toBe(0.4);
    }
  });
});

describe('resized — a corner drag keeps the proportions', () => {
  it('scales height with width for a square', () => {
    const { w, h } = resized({ x: 0.1, w: 0.4, h: 0.4 }, 0.2);
    expect(w).toBeCloseTo(0.6);
    expect(h).toBeCloseTo(0.6);
  });

  // THE assertion this whole change exists for. Widen a 2:1 banner and it must stay 2:1; a version
  // that moved only `w` would print a stretched name and look plausible while doing it.
  it('keeps a 2:1 banner at 2:1 when widened', () => {
    const { w, h } = resized({ x: 0, w: 0.4, h: 0.2 }, 0.2);
    expect(w / h).toBeCloseTo(2);
  });

  it('keeps a portrait image portrait when shrunk', () => {
    const { w, h } = resized({ x: 0, w: 0.4, h: 0.8 }, -0.2);
    expect(w / h).toBeCloseTo(0.5);
  });

  it('will not shrink below the size the handles stop being grabbable at', () => {
    expect(resized({ x: 0, w: 0.4, h: 0.4 }, -10).w).toBe(MIN_W);
  });

  // The right edge is the page's, so an item cannot be dragged wider than the room left beside it.
  it('stops at the right edge of the sheet', () => {
    expect(resized({ x: 0.7, w: 0.2, h: 0.2 }, 10).w).toBeCloseTo(0.3);
  });

  // Proportion is preserved even when the clamp is what decided the width — otherwise an item
  // resized against the edge would come out a different shape than the one dragged.
  it('holds the ratio even when clamped', () => {
    const { w, h } = resized({ x: 0.7, w: 0.2, h: 0.1 }, 10);
    expect(w / h).toBeCloseTo(2);
  });
});

describe('moved — the item stays on the page', () => {
  // A4 portrait: width ÷ height.
  const PAGE = 210 / 297;

  it('applies the delta when there is room', () => {
    const { x, y } = moved({ x: 0.2, y: 0.2 }, { dx: 0.1, dy: 0.1, w: 0.2, h: 0.2 }, PAGE);
    expect(x).toBeCloseTo(0.3);
    expect(y).toBeCloseTo(0.3);
  });

  it('stops at the left and top edges', () => {
    expect(moved({ x: 0.1, y: 0.1 }, { dx: -5, dy: -5, w: 0.2, h: 0.2 }, PAGE))
      .toEqual({ x: 0, y: 0 });
  });

  it('stops at the right edge, leaving the item’s own width', () => {
    expect(moved({ x: 0.1, y: 0.1 }, { dx: 5, dy: 0, w: 0.2, h: 0.2 }, PAGE).x).toBeCloseTo(0.8);
  });

  // h is a WIDTH-fraction, so the bottom clamp has to convert it before comparing against y. Without
  // the page aspect a tall item would be allowed to hang off the bottom of the sheet — and the PDF
  // would simply cut it off, with nothing on screen having said so.
  it('converts the item’s height to a height-fraction at the bottom edge', () => {
    const y = moved({ x: 0, y: 0 }, { dx: 0, dy: 5, w: 0.4, h: 0.4 }, PAGE).y;
    expect(y).toBeCloseTo(1 - 0.4 * PAGE);   // ≈ 0.717, not 0.6
  });

  it('does not push an oversized item off the top while clamping the bottom', () => {
    expect(moved({ x: 0, y: 0.5 }, { dx: 0, dy: 0, w: 2, h: 2 }, PAGE))
      .toEqual({ x: 0, y: 0 });
  });
});
