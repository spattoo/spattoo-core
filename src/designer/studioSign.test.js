import { describe, it, expect } from 'vitest';
import { paintSign, signFontSpec, SIGN_WIDTH_FRACTION } from './studioSign.js';

/* ── The bakery's name on the wall ───────────────────────────────────────────────────────────────
 *
 * ⚠️ THE CANVAS IS INJECTED SO THIS CAN BE ASKED WITHOUT A BROWSER — the same shape `baseColourOf`
 * uses, and for the same reason: the drawing is the DOM's job, the sizing is ours, and only the
 * sizing can be wrong in a way nobody notices.
 */
const stub = (perChar = 90) => (w, h) => ({
  width: w, height: h,
  getContext: () => ({
    font: '', fillStyle: '', textAlign: '', textBaseline: '',
    measureText: (t) => ({ width: t.length * perChar }),
    clearRect() {}, fillText() {},
  }),
});

describe('the sign painter', () => {
  /* ⚠️ THE FONT SPEC IS WHAT `document.fonts.load` IS GIVEN, and that call ignores a request with
     no size in it — so a spec that dropped the px would load nothing, the browser would fall back
     down the CSS stack, and a baker's Pacifico would quietly render as some default cursive. */
  it('names a size and a family, because the font loader needs both', () => {
    const spec = signFontSpec("'Pacifico', cursive", 102.4);
    expect(spec).toContain('102px');
    expect(spec).toContain("'Pacifico', cursive");
  });

  it('measures the name and reports a plane in world units', () => {
    const out = paintSign({ name: 'Sample Bakery', cssFamily: 'x', colour: '#6b8f7e',
                            wallWidth: 14, makeCanvas: stub(), measureOnly: true });
    expect(out.width).toBeGreaterThan(0);
    expect(out.height).toBeGreaterThan(0);
    expect(out.scale, 'a short name is not scaled at all').toBe(1);
  });

  /* ⚠️ A LONG NAME SHRINKS, IT DOES NOT RUN OFF THE WALL. Bakery names are not short and nobody is
     going to be told theirs is too long. */
  it('clamps a long name to its share of the wall', () => {
    const out = paintSign({ name: 'The Extremely Long Bakery Name Company Limited', cssFamily: 'x',
                            colour: '#000', wallWidth: 14, makeCanvas: stub(), measureOnly: true });
    expect(out.width).toBeCloseTo(14 * SIGN_WIDTH_FRACTION, 6);
    expect(out.scale).toBeLessThan(1);
    expect(out.height, 'it scales as a whole, so it cannot be squashed').toBeLessThan(
      paintSign({ name: 'Short', cssFamily: 'x', colour: '#000', wallWidth: 14,
                  makeCanvas: stub(), measureOnly: true }).height);
  });

  /* ⚠️ NO NAME MEANS NO SIGN, NOT AN EMPTY ONE. The bakery name is optional at signup — the reel
     caption's own note records that the blank field "is the case that actually happens". */
  it('paints nothing at all when there is no name', () => {
    for (const name of [undefined, null, '', '   ']) {
      expect(paintSign({ name, cssFamily: 'x', colour: '#000', wallWidth: 14, makeCanvas: stub() }))
        .toBeNull();
    }
  });

  it('returns a canvas to map, when asked for the real thing', () => {
    const out = paintSign({ name: 'Sample Bakery', cssFamily: 'x', colour: '#6b8f7e',
                            wallWidth: 14, makeCanvas: stub() });
    expect(out.canvas).not.toBeNull();
    expect(out.canvas.width).toBeGreaterThan(1);
    expect(out.canvas.height).toBeGreaterThan(1);
  });
});
