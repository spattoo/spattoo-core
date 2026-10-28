import { describe, it, expect } from 'vitest';
import { baseColourOf, BASE_BAND } from './studioBackdrop.js';

/* ── What the floor under a standing backdrop is ────────────────────────────────────────────────
 *
 * ⚠️ THE FAULT THIS PREVENTS IS A SEAM, and a seam is invisible to every other check. The board
 * renders, the gates pass, the picture is the right way up — and the cake stands on grey in front
 * of a photograph whose own floor stops in a hard line. The only thing that makes it right is the
 * ground taking the colour the picture ENDS on, so that is what is asserted.
 *
 * ⚠️ A FAKE CANVAS, NOT A REAL ONE. The function takes its canvas factory as an argument precisely
 * so this can be asked without a browser: the drawing is the DOM's job, the arithmetic is ours, and
 * only the arithmetic can be wrong in an interesting way.
 */

/** A canvas stub that records the crop it was asked for and returns pixels the test chose. */
function fakeCanvas(pixels, seen) {
  return (w, h) => ({
    width: w, height: h,
    getContext: () => ({
      drawImage: (...args) => { seen.push(args.slice(1)); },
      getImageData: () => ({ data: pixels(w, h) }),
    }),
  });
}
const solid = (r, g, b, a = 255) => (w, h) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; }
  return d;
};

describe('the colour a backdrop ends on', () => {
  it('reads the bottom band and reports it as a hex colour', () => {
    const seen = [];
    expect(baseColourOf({ width: 800, height: 600 }, fakeCanvas(solid(210, 180, 140), seen)))
      .toBe('#d2b48c');
  });

  /* ⚠️ THE BAND, NEVER THE WHOLE PICTURE. An average of a bakery is the average of shelves, plants
     and lamps — a beige that matches nothing on screen. The crop handed to drawImage must start at
     the bottom of the image, and must be a sliver of it. */
  it('crops from the bottom edge only', () => {
    const seen = [];
    baseColourOf({ width: 800, height: 600 }, fakeCanvas(solid(1, 2, 3), seen));
    const [sx, sy, sw, sh] = seen[0];
    const band = Math.round(600 * BASE_BAND);
    expect(sx).toBe(0);
    expect(sy, 'the crop starts one band above the bottom').toBe(600 - band);
    expect(sw, 'the full width, because a floor runs across').toBe(800);
    expect(sh).toBe(band);
    expect(band).toBeLessThan(600 * 0.1);
  });

  /* ⚠️ READ IT SMALL. A 4K backdrop at full width is a 40MB getImageData for a flat colour, which is
     the same bill `scanContentV` paid before it dropped to 256px. */
  it('samples a small canvas, whatever the image size', () => {
    const seen = [];
    let asked = null;
    const make = (w, h) => { asked = [w, h]; return fakeCanvas(solid(9, 9, 9), seen)(w, h); };
    baseColourOf({ width: 4096, height: 2160 }, make);
    expect(asked[0]).toBeLessThanOrEqual(64);
    expect(asked[1]).toBeGreaterThanOrEqual(1);
    expect(asked[0] * asked[1]).toBeLessThan(4096);
  });

  /* Transparent edges are not a colour; a PNG with an alpha margin must not pull the floor to black. */
  it('ignores fully transparent pixels', () => {
    const seen = [];
    const half = (w, h) => {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < d.length; i += 4) {
        const opaque = (i / 4) % 2 === 0;
        d[i] = opaque ? 255 : 0; d[i + 1] = opaque ? 255 : 0; d[i + 2] = opaque ? 255 : 0;
        d[i + 3] = opaque ? 255 : 0;
      }
      return d;
    };
    expect(baseColourOf({ width: 100, height: 100 }, fakeCanvas(half, seen))).toBe('#ffffff');
  });

  it('answers null rather than guessing', () => {
    const seen = [];
    expect(baseColourOf(null, fakeCanvas(solid(0, 0, 0), seen))).toBeNull();
    expect(baseColourOf({ width: 0, height: 0 }, fakeCanvas(solid(0, 0, 0), seen))).toBeNull();
    /* A cross-origin image taints the canvas and getImageData THROWS. It must not surface as a
       black floor, which would look deliberate. */
    const tainted = () => ({ getContext: () => ({
      drawImage: () => {}, getImageData: () => { throw new Error('tainted'); } }) });
    expect(baseColourOf({ width: 10, height: 10 }, tainted)).toBeNull();
    /* And a fully transparent band is "no answer", not #000000. */
    expect(baseColourOf({ width: 10, height: 10 }, fakeCanvas(solid(0, 0, 0, 0), seen))).toBeNull();
  });
});
