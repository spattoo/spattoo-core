import { describe, it, expect } from 'vitest';
import {
  BACKDROP_LOOKS, BACKDROP_DEFAULT, BACKDROP_STRENGTH_DEFAULT,
  shade, hueShift, backdropPlan, paintBackdrop,
} from './takeBackdrop.js';
import { TAKE_GROUNDS } from '../constants.js';
import { hexToRgb, rgbToHsl } from '../shared/color/imageRecolor.js';

const sat = (hex) => rgbToHsl(...hexToRgb(hex))[1];
const lum = (hex) => { const [r, g, b] = hexToRgb(hex); return r * 0.299 + g * 0.587 + b * 0.114; };

describe('shading a ground towards light or shadow', () => {
  /* ⚠️ THE BUG THIS FUNCTION WAS REWRITTEN FOR. The first cut moved lightness in HSL, which keeps
     saturation while it takes lightness away — and a pale warm ground has enough of it that the hue
     comes screaming out of the shadows. Cream (#FBF3E7) came out **#e2a953**, a strong amber, for a
     backdrop meant to be the same colour a shade deeper. */
  it('does not turn a pale warm ground orange on the way down', () => {
    const cream = '#FBF3E7';
    const dark = shade(cream, -0.6);
    expect(lum(dark)).toBeLessThan(lum(cream));
    // A shadow DESATURATES. The HSL version held saturation flat and that was the whole fault.
    expect(sat(dark)).toBeLessThan(sat(cream));
  });

  it('lifts a near-black ground enough to see, which is where a glow matters most', () => {
    const ink = TAKE_GROUNDS.find(g => g.key === 'ink').value;
    const lit = shade(ink, 0.6);
    // Proportional-only shading leaves almost nothing here; the floor under it is what buys this.
    expect(lum(lit) - lum(ink)).toBeGreaterThan(30);
  });

  it('stays inside the gamut and always returns a usable hex', () => {
    for (const g of TAKE_GROUNDS) {
      for (const d of [-1, -0.5, 0, 0.5, 1]) expect(shade(g.value, d)).toMatch(/^#[0-9a-f]{6}$/i);
    }
    for (const bad of [null, undefined, '', 'nonsense', '#ggg']) {
      expect(shade(bad, 0.5)).toMatch(/^#[0-9a-f]{6}$/i);
      expect(hueShift(bad, 30)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('moves further the more it is asked for, in both directions', () => {
    const base = '#2E3A36';
    expect(lum(shade(base, 0.8))).toBeGreaterThan(lum(shade(base, 0.3)));
    expect(lum(shade(base, -0.8))).toBeLessThan(lum(shade(base, -0.3)));
  });
});

describe('the plan a look produces', () => {
  it('offers Flat, and Flat is exactly the colour with nothing done to it', () => {
    expect(BACKDROP_LOOKS.map(l => l.key)).toContain('flat');
    const p = backdropPlan('#FBF3E7', 'flat');
    expect(p.kind).toBe('flat');
    expect(p.stops).toEqual([{ at: 0, color: '#FBF3E7' }]);
  });

  /* ⚠️ A DIAL AT NOTHING MUST BE INDISTINGUISHABLE FROM OFF. Otherwise "Background depth 0%" still
     grades the frame and the control is lying about its own bottom end. */
  it('at zero depth is the flat colour, whatever look is chosen', () => {
    for (const l of BACKDROP_LOOKS) expect(backdropPlan('#14181A', l.key, 0).kind).toBe('flat');
  });

  it('builds ordered, in-gamut stops for every look on every ground', () => {
    for (const g of TAKE_GROUNDS) {
      for (const l of BACKDROP_LOOKS.filter(x => x.key !== 'flat')) {
        const p = backdropPlan(g.value, l.key);
        expect(p.stops.length, `${g.key}/${l.key}`).toBeGreaterThan(1);
        let prev = -1;
        for (const s of p.stops) {
          expect(s.at).toBeGreaterThanOrEqual(prev);
          expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
          prev = s.at;
        }
        expect(p.stops[0].at).toBe(0);
        expect(p.stops[p.stops.length - 1].at).toBe(1);
      }
    }
  });

  /* ⚠️ THE GLOW SITS ABOVE THE MIDDLE BECAUSE THE CAKE DOES. The fit aims below the cake to lift it
     in frame, so a pool centred on the frame would sit behind the BOARD. */
  it('puts the pool behind the cake, not behind the board', () => {
    const p = backdropPlan('#F2F0EB', 'pool');
    expect(p.kind).toBe('radial');
    expect(p.centre.y).toBeLessThan(0.5);
  });

  it('is brighter in the middle than at the edge, which is what reads as depth', () => {
    const p = backdropPlan('#2E3A36', 'pool');
    expect(lum(p.stops[0].color)).toBeGreaterThan(lum(p.stops[p.stops.length - 1].color));
  });

  it('falls back rather than throwing on rubbish', () => {
    expect(backdropPlan(null, 'pool').stops.every(s => /^#[0-9a-f]{6}$/i.test(s.color))).toBe(true);
    expect(backdropPlan('#FBF3E7', 'nonsense').kind).toBe('radial');   // the default look
    expect(BACKDROP_LOOKS.some(l => l.key === BACKDROP_DEFAULT)).toBe(true);
    expect(BACKDROP_STRENGTH_DEFAULT).toBeGreaterThan(0);
    expect(BACKDROP_STRENGTH_DEFAULT).toBeLessThanOrEqual(1);
  });
});

describe('painting it', () => {
  /** A context that records what it was asked to do — no DOM needed. */
  const spyCtx = () => {
    const calls = { stops: [], fills: 0, radial: null, linear: null };
    const grad = { addColorStop: (at, color) => calls.stops.push({ at, color }) };
    return [{
      createRadialGradient: (...a) => { calls.radial = a; return grad; },
      createLinearGradient: (...a) => { calls.linear = a; return grad; },
      fillRect: () => { calls.fills++; },
      set fillStyle(_v) {}, get fillStyle() { return ''; },
    }, calls];
  };

  it('fills the whole frame for every look', () => {
    for (const l of BACKDROP_LOOKS) {
      const [ctx, calls] = spyCtx();
      paintBackdrop(ctx, 512, 512, backdropPlan('#FBF3E7', l.key));
      expect(calls.fills, l.key).toBe(1);
    }
  });

  /* ⚠️ SIZED OFF THE DIAGONAL, NOT THE WIDTH. Sized off the width the pool stops short of the
     corners on a tall frame and leaves two hard bands across the top and bottom — its own edge
     becomes the thing you notice, which is the opposite of the point. */
  it('reaches the corners of a tall frame', () => {
    const [ctx, calls] = spyCtx();
    paintBackdrop(ctx, 360, 640, backdropPlan('#14181A', 'pool'));
    const [, , , , , r] = calls.radial;
    const furthest = Math.hypot(360 * 0.5, 640 * (1 - 0.42));
    expect(r).toBeGreaterThanOrEqual(furthest - 0.5);
  });

  it('survives rubbish rather than throwing into a render loop', () => {
    const [ctx] = spyCtx();
    expect(() => paintBackdrop(null, 10, 10, backdropPlan('#fff', 'pool'))).not.toThrow();
    expect(() => paintBackdrop(ctx, 0, 0, backdropPlan('#fff', 'pool'))).not.toThrow();
    expect(() => paintBackdrop(ctx, 10, 10, null)).not.toThrow();
  });
});
