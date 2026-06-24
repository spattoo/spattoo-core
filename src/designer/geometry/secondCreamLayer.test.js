import { describe, it, expect } from 'vitest';
import { paintProfile, sampleProfile, flatProfile, SECOND_CREAM_PRESETS } from './secondCreamLayer.js';

describe('paintProfile — spin-paint writes the torn edge', () => {
  it('writes the target height at the hit angle (brush 0)', () => {
    const edge = flatProfile(8, 0.5);
    const out = paintProfile(edge, 2 / 8, 0.9, { brush: 0 });
    expect(out[2]).toBeCloseTo(0.9, 6);
    // untouched samples stay put
    expect(out[5]).toBeCloseTo(0.5, 6);
  });

  it('is pure — returns a new array, leaves the input untouched', () => {
    const edge = flatProfile(8, 0.5);
    const out = paintProfile(edge, 0, 1, { brush: 1 });
    expect(out).not.toBe(edge);
    expect(edge.every(v => v === 0.5)).toBe(true);
  });

  it('feathers neighbours (soft brush) — strongest at the hit, weaker outward', () => {
    const edge = flatProfile(16, 0);
    const out = paintProfile(edge, 4 / 16, 1, { brush: 2 });
    expect(out[4]).toBeCloseTo(1, 6);              // centre = full target
    expect(out[5]).toBeGreaterThan(out[6]);        // falls off with distance
    expect(out[3]).toBeCloseTo(out[5], 6);         // symmetric
    expect(out[6]).toBeGreaterThan(0);             // still within brush radius
  });

  it('wraps around the seam (angle 0 paints index 0)', () => {
    const edge = flatProfile(10, 0.2);
    const out = paintProfile(edge, 1.0, 0.8, { brush: 1 });   // theta01=1 wraps to 0
    expect(out[0]).toBeCloseTo(0.8, 6);
    expect(out[9]).toBeGreaterThan(0.2);           // neighbour across the seam feathered
  });

  it('clamps the painted height to 0..1', () => {
    const edge = flatProfile(4, 0.5);
    expect(paintProfile(edge, 0, 5, { brush: 0 })[0]).toBeCloseTo(1, 6);
    expect(paintProfile(edge, 0, -3, { brush: 0 })[0]).toBeCloseTo(0, 6);
  });
});

describe('sampleProfile / presets — render input is stable', () => {
  it('resamples a preset to N angular samples in 0..1', () => {
    const edge = SECOND_CREAM_PRESETS['Gentle wave']();
    const prof = sampleProfile(edge, 256, 0, 1);
    expect(prof).toHaveLength(256);
    expect(Math.min(...prof)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...prof)).toBeLessThanOrEqual(1);
  });

  it('same seed → identical torn jitter (deterministic render)', () => {
    const edge = flatProfile(96, 0.5);
    expect(sampleProfile(edge, 128, 0.1, 7)).toEqual(sampleProfile(edge, 128, 0.1, 7));
  });
});
