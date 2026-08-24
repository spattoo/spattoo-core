import { describe, it, expect } from 'vitest';
import {
  MAX_STRIPES, expandPalette, stripeColors, areStripesActive,
  stripeBoundaries, thinnestStripe, blendWidth, wobbleAmplitude, applyStripes,
} from './stripeMaterial.js';
import { STRIPE_PRESETS } from '../../stripePresets.js';

describe('expandPalette', () => {
  it('cycles the palette to fill the count', () => {
    expect(expandPalette(['A', 'B'], 5)).toEqual(['A', 'B', 'A', 'B', 'A']);
    expect(expandPalette(['A', 'B', 'C'], 3)).toEqual(['A', 'B', 'C']);
  });

  it('puts the SAME colour top and bottom on an odd count — the case a multiplier cannot reach', () => {
    // This is why the model is a count and not a "repeat × palette". A multiplier of two colours can
    // only produce 2, 4, 6, 8 — always ending on the other colour. A striped cake usually wants to
    // start and finish on the same one.
    const s = expandPalette(['green', 'white'], 5);
    expect(s[0]).toBe(s[s.length - 1]);
  });

  it('never exceeds the shader array', () => {
    expect(expandPalette(['A', 'B'], 999)).toHaveLength(MAX_STRIPES);
  });

  it('survives an empty or absent palette rather than throwing', () => {
    expect(expandPalette([], 6)).toEqual([]);
    expect(expandPalette(undefined, 6)).toEqual([]);
    expect(expandPalette(['A', null, undefined], 2)).toEqual(['A', 'A']);
  });
});

describe('stripeColors / areStripesActive', () => {
  it('reads the palette shape and the literal-colours shape', () => {
    expect(stripeColors({ palette: ['A', 'B'], count: 4 })).toEqual(['A', 'B', 'A', 'B']);
    expect(stripeColors({ colors: ['A', 'B', 'C'] })).toEqual(['A', 'B', 'C']);
  });

  it('defaults the count to one stripe per colour', () => {
    expect(stripeColors({ palette: ['A', 'B', 'C'] })).toEqual(['A', 'B', 'C']);
  });

  it('is inactive below two stripes — one colour is just a solid wall', () => {
    // The material paints a solid colour perfectly well on its own; a one-stripe "stripe set" would
    // be a shader doing nothing at the cost of a recompile.
    expect(areStripesActive(null)).toBe(false);
    expect(areStripesActive({ palette: ['A'], count: 1 })).toBe(false);
    // ⚠️ ONE COLOUR IS NEVER STRIPES, however many it is asked to fill. expandPalette floors the
    // count at 2, so this used to expand to two identical stripes and patch the shader to paint a
    // solid wall — a recompile and an extra draw path for a look `color` already renders.
    expect(areStripesActive({ palette: ['A'], count: 4 })).toBe(false);
    expect(areStripesActive({ palette: ['A', 'B'] })).toBe(true);
    expect(areStripesActive({ palette: ['A', 'B'], count: 16 })).toBe(true);
  });
});

describe('stripeBoundaries', () => {
  it('divides evenly by default', () => {
    expect(stripeBoundaries(4)).toEqual([0.25, 0.5, 0.75]);
  });

  it('cycles the weights with the palette', () => {
    // ⚠️ Weights repeat WITH the palette, so a thick/thin alternation is one pair of numbers rather
    // than sixteen. Indexed straight, every stripe past the palette would sit at 1 and the
    // alternation would stop a third of the way up the cake.
    const b = stripeBoundaries(4, [2, 1]);
    // widths 2,1,2,1 of 6 → 0.333, 0.5, 0.833
    expect(b.map(v => +v.toFixed(3))).toEqual([0.333, 0.5, 0.833]);
  });

  it('ignores junk weights instead of producing NaN boundaries', () => {
    expect(stripeBoundaries(3, [0, -1, null]).every(Number.isFinite)).toBe(true);
    expect(stripeBoundaries(3, [])).toEqual([1 / 3, 2 / 3]);
  });
});

describe('blendWidth', () => {
  it('scales by the thinnest stripe, so softness means the same at any count', () => {
    // Scaled by a constant instead, a blend that looked gentle across three stripes washed all
    // sixteen into mud.
    expect(blendWidth(1, 4)).toBeCloseTo(0.25, 6);
    expect(blendWidth(1, 16)).toBeCloseTo(0.0625, 6);
    expect(blendWidth(0.5, 4)).toBeCloseTo(0.125, 6);
  });

  it('reaches a true zero, because crisp stripes are the first thing anyone tries', () => {
    expect(blendWidth(0, 6)).toBe(0);
  });

  it('clamps out-of-range softness', () => {
    expect(blendWidth(-1, 4)).toBe(0);
    expect(blendWidth(9, 4)).toBeCloseTo(0.25, 6);
  });
});

describe('wobbleAmplitude', () => {
  it('is proportional to stripe height, so thin stripes cannot braid', () => {
    // ⚠️ As a flat fraction of the wall this was harmless across six stripes and made sixteen thin
    // ones visibly BRAID — joins wandering far enough to cross each other. The amplitude must always
    // be a fraction of the stripe it belongs to.
    const six = wobbleAmplitude(1, 6);
    const sixteen = wobbleAmplitude(1, 16);
    expect(sixteen).toBeLessThan(six);
    expect(sixteen).toBeLessThan(thinnestStripe(16) / 2);   // cannot reach a neighbour's centre
  });

  it('is zero when the baker wants dead-straight joins', () => {
    expect(wobbleAmplitude(0, 8)).toBe(0);
    expect(wobbleAmplitude(undefined, 8)).toBe(0);
  });
});

describe('applyStripes', () => {
  // Duck-typed stand-in: the module only ever touches these fields.
  const fakeMat = () => ({ userData: {}, needsUpdate: false, onBeforeCompile: undefined });
  const bbox = { min: { clone: () => ({ x: 0, y: 0, z: 0 }) },
                 size: { clone: () => ({ x: 2, y: 1.45, z: 2 }) },
                 center: { clone: () => ({ x: 0, y: 0.7, z: 0 }) } };

  it('patches the material and marks it for recompile', () => {
    const m = fakeMat();
    applyStripes(m, { palette: ['#fff', '#0f0'], count: 6 }, bbox);
    expect(m.userData.__stripesPatched).toBe(true);
    expect(typeof m.onBeforeCompile).toBe('function');
    expect(m.needsUpdate).toBe(true);
  });

  it('UNPATCHES cleanly when the stripes are removed', () => {
    // A stale onBeforeCompile keeps injecting long after the stripes are gone, and the wall stays
    // striped with nothing in the design to explain it.
    const m = fakeMat();
    const original = () => {};
    m.onBeforeCompile = original;
    applyStripes(m, { palette: ['#fff', '#0f0'], count: 6 }, bbox);
    applyStripes(m, null, bbox);
    expect(m.userData.__stripesPatched).toBe(false);
    expect(m.onBeforeCompile).toBe(original);
  });

  it('does nothing without a bbox — the shader needs to know where the wall starts', () => {
    const m = fakeMat();
    applyStripes(m, { palette: ['#fff', '#0f0'], count: 6 }, null);
    expect(m.userData.__stripesPatched).toBeFalsy();
  });

  it('survives a null material rather than throwing', () => {
    expect(() => applyStripes(null, { palette: ['#fff', '#0f0'] }, bbox)).not.toThrow();
  });
});

describe('the shipped presets', () => {
  const entries = Object.entries(STRIPE_PRESETS);

  it('every preset sets EVERY field', () => {
    // ⚠️ The load-bearing test. A preset carrying only colours leaves the previous cake's softness
    // behind, and the baker gets a look they did not choose and cannot account for.
    for (const [key, p] of entries) {
      expect(Array.isArray(p.palette), `${key}.palette`).toBe(true);
      expect(typeof p.count, `${key}.count`).toBe('number');
      expect(Array.isArray(p.weights), `${key}.weights`).toBe(true);
      expect(typeof p.softness, `${key}.softness`).toBe('number');
      expect(typeof p.wobble, `${key}.wobble`).toBe('number');
      expect(typeof p.label, `${key}.label`).toBe('string');
    }
  });

  it('every preset renders as stripes and fits the shader', () => {
    for (const [key, p] of entries) {
      expect(areStripesActive(p), key).toBe(true);
      expect(stripeColors(p).length, key).toBeLessThanOrEqual(MAX_STRIPES);
      expect(p.count, key).toBeGreaterThanOrEqual(p.palette.length ? 2 : 0);
    }
  });

  it('every colour is a hex string the shader can take', () => {
    for (const [key, p] of entries) {
      for (const c of p.palette) expect(c, `${key}: ${c}`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('keeps a preset at each end of the softness range and something in the middle', () => {
    // The range is the feature. If every preset clustered at one end, nobody would discover that the
    // same control produces both crisp stripes and an ombre.
    const s = entries.map(([, p]) => p.softness);
    expect(Math.min(...s)).toBeLessThan(0.1);
    expect(Math.max(...s)).toBeGreaterThan(0.9);
    expect(s.some(v => v > 0.3 && v < 0.7)).toBe(true);
  });
});
