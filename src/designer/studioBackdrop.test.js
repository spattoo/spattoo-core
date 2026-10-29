import { describe, it, expect } from 'vitest';
import { baseColourOf, BASE_BAND, wallTilt } from './studioBackdrop.js';

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

describe('the lean that stops a backdrop fanning out', () => {
  /* ⚠️ ASKED AS GEOMETRY, NOT AS ARITHMETIC. `asin(dir.y)` and `asin(-dir.y)` are both plausible
     one-liners and only one of them points the board at the camera; the wrong one rendered a
     sunburst that looked entirely intentional. So the test builds the board's normal, applies the
     tilt, and checks it actually AIMS AT THE LENS. */
  /* A +Z normal rotated about +X by t becomes (0, -sin t, cos t) — the minus is the same right-hand
     rule that made the board lean the wrong way in the first place, and it caught this test out
     before it caught the code. */
  const normalAfter = (tilt) => ({ y: -Math.sin(tilt), z: Math.cos(tilt) });

  it('aims the board at a camera that is looking down', () => {
    /* A camera pitched 20° below horizontal: its forward direction dips, so the board's face must
       rise by the same 20° to meet it. */
    const pitch = -20 * Math.PI / 180;
    const n = normalAfter(wallTilt(Math.sin(pitch)));
    /* The camera's view direction is (0, sin(pitch), -1·cos(pitch)); the board's normal must be its
       exact opposite, so the dot product is -1. */
    const dot = n.y * Math.sin(pitch) + n.z * -Math.cos(pitch);
    expect(dot).toBeCloseTo(-1, 6);
  });

  it('leans back, never forward — the wrong sign doubles the fan instead of cancelling it', () => {
    expect(wallTilt(Math.sin(-20 * Math.PI / 180))).toBeLessThan(0);
    expect(wallTilt(Math.sin(-40 * Math.PI / 180)))
      .toBeLessThan(wallTilt(Math.sin(-20 * Math.PI / 180)));
  });

  it('stands straight up for a camera at eye level', () => {
    expect(wallTilt(0)).toBe(0);
  });

  it('survives a direction that is a hair outside the unit range', () => {
    expect(Number.isNaN(wallTilt(-1.0000001))).toBe(false);
    expect(wallTilt(-1.0000001)).toBeCloseTo(-Math.PI / 2, 6);
  });
});
