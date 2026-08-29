import { describe, it, expect } from 'vitest';
import { analyse, autoFix, relight, blurSmall } from './photoEdit.js';

/* These protect the two things a screenshot cannot show reliably: that the corrections are
 * CLAMPED (so a warm photo is not dragged blue), and that the relight weight map is SMOOTH (so a
 * misjudged pixel along a sprinkle cannot become a halo). Both are the difference between a fix
 * and a disfigurement, and both are invisible until they are wrong on somebody's cake.
 */

// A tiny image builder: `px` is [r,g,b] per pixel, row-major.
const img = (w, h, px) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const [r, g, b] = typeof px === 'function' ? px(p % w, Math.floor(p / w)) : px[p];
    data[p*4] = r; data[p*4+1] = g; data[p*4+2] = b; data[p*4+3] = 255;
  }
  return { width: w, height: h, data };
};
const at = (im, x, y) => [im.data[(y*im.width+x)*4], im.data[(y*im.width+x)*4+1], im.data[(y*im.width+x)*4+2]];

describe('what the photograph got wrong', () => {
  // A green-biased grey wall: the cast this whole thing was written for.
  it('reads a cast off the highlights and corrects toward neutral', () => {
    const s = analyse(img(8, 8, () => [200, 214, 196]));
    expect(s.gain[1]).toBeLessThan(1);        // green pulled down
    expect(s.gain[2]).toBeGreaterThan(1);     // blue lifted
  });

  /* ⚠️ THE CLAMP, and it is the guard that stops this feature ruining the photos it likes least.
   * A candlelit cake or a gold one has legitimately warm highlights; an unclamped correction would
   * drag it blue and call that a fix. */
  it('never corrects further than the clamp, however extreme the cast', () => {
    const s = analyse(img(8, 8, () => [255, 40, 10]));    // violently orange
    for (const g of s.gain) {
      expect(g).toBeGreaterThanOrEqual(0.80);
      expect(g).toBeLessThanOrEqual(1.25);
    }
  });

  // Endpoints are what "dull" actually means: nothing reaching either end of the histogram.
  it('finds the real endpoints, not 0 and 255', () => {
    const s = analyse(img(16, 16, (x) => { const v = 60 + x * 6; return [v, v, v]; }));
    expect(s.lo[0]).toBeGreaterThan(0);
    expect(s.hi[0]).toBeLessThan(255);
  });

  it('does not throw on a single flat colour', () => {
    expect(() => analyse(img(4, 4, () => [128, 128, 128]))).not.toThrow();
  });
});

describe('the auto-fix', () => {
  const dull = img(16, 16, (x) => { const v = 90 + x * 4; return [v, v, v + 6]; });

  it('stretches a dull image toward both ends', () => {
    const before = analyse(dull);
    const after  = analyse(autoFix(dull));
    expect(after.lo[0]).toBeLessThanOrEqual(before.lo[0]);
    expect(after.hi[0]).toBeGreaterThanOrEqual(before.hi[0]);
  });

  // strength is what lets a baker have less of it, and 0 has to mean NONE — an editor whose
  // "off" still changes the picture is one nobody can trust.
  it('changes nothing at strength 0', () => {
    const out = autoFix(dull, { strength: 0 });
    expect([...out.data]).toEqual([...dull.data]);
  });

  it('keeps alpha untouched', () => {
    const out = autoFix(dull);
    for (let p = 0; p < 16 * 16; p++) expect(out.data[p*4+3]).toBe(255);
  });

  it('does not mutate the source', () => {
    const copy = Uint8ClampedArray.from(dull.data);
    autoFix(dull);
    expect([...dull.data]).toEqual([...copy]);
  });
});

describe('relighting the wall', () => {
  /* A grey wall, a saturated pink cake, and a near-black board — the three cases the weight has to
   * separate.
   *
   * ⚠️ 400px AND NOT 40, and the reason is worth knowing before anyone "speeds up" this test. The
   * weight map is computed at a fraction of the image and floored at 4×4, so on a 40px scene that
   * floor IS the whole map — one cell spans a tenth of the picture and the blur bleeds wall weight
   * straight over the cake. Measured across sizes: the cake shifted by 14 at 40px, 8 at 120px, 1 at
   * 400px and 0 at 1200px. The algorithm was right and the scene was a toy; a real photo arrives at
   * 1600px. Shrinking this back would reintroduce a failure that says nothing about the code. */
  const S = 400;
  const scene = img(S, S, (x, y) => {
    if (y > S * 0.8) return [12, 12, 14];                                       // board
    if (x > S * 0.3 && x < S * 0.7 && y > S * 0.25) return [235, 120, 170];     // cake
    return [150, 152, 148];                                                     // wall
  });

  it('lifts the wall', () => {
    const out = relight(scene);
    const [r] = at(out, 20, 20);
    expect(r).toBeGreaterThan(150);
  });

  // The cake is the thing being sold. If this ever fails, the feature is worse than not existing.
  it('leaves the cake essentially alone', () => {
    const out = relight(scene);
    const [r, g, b] = at(out, S / 2, S / 2);
    expect(Math.abs(r - 235)).toBeLessThan(4);
    expect(Math.abs(g - 120)).toBeLessThan(4);
    expect(Math.abs(b - 170)).toBeLessThan(4);
  });

  /* ⚠️ THE BOARD MUST STAY DARK. It is excluded by the not-dark test, and it matters: lifting the
   * board removes the one thing giving the cake a base to stand on, and a floating cake is the
   * single tell that separates an edited photo from a photograph. */
  it('leaves a dark board dark', () => {
    const out = relight(scene);
    const [r] = at(out, S / 2, S * 0.92);
    expect(r).toBeLessThan(40);
  });

  it('changes nothing at strength 0', () => {
    const out = relight(scene, { strength: 0 });
    expect([...out.data]).toEqual([...scene.data]);
  });
});

describe('the weight blur', () => {
  /* ⚠️ SMOOTHNESS IS THE WHOLE JOB. The relight weight is built per pixel from three hard-edged
   * tests, so before blurring it has cliffs — and a cliff in the weight map is a halo in the
   * photo. This asserts no neighbouring pair jumps, which is the property, rather than asserting
   * a particular blur radius, which is an implementation detail. */
  it('turns a hard step into a gradient with no cliff left in it', () => {
    const w = 200, h = 40;
    const step = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) step[y*w+x] = x < w / 2 ? 0 : 1;

    const out = blurSmall(step, w, h, 0.05);
    let worst = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 1; x < w; x++) worst = Math.max(worst, Math.abs(out[y*w+x] - out[y*w+x-1]));
    }
    expect(worst).toBeLessThan(0.12);          // the original step jumps 1.0
  });

  it('keeps the ends where they were', () => {
    const w = 200, h = 20;
    const step = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) step[y*w+x] = x < w / 2 ? 0 : 1;
    const out = blurSmall(step, w, h, 0.05);
    expect(out[10 * w + 4]).toBeLessThan(0.15);
    expect(out[10 * w + (w - 5)]).toBeGreaterThan(0.85);
  });

  it('survives an image smaller than the working size', () => {
    expect(() => blurSmall(new Float32Array(9), 3, 3, 0.03)).not.toThrow();
  });
});
