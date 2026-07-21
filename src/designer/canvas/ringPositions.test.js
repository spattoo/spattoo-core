import { describe, it, expect } from 'vitest';
import { ringPositions, buildSwagRing } from './ringPositions.js';

// A measured instance ~0.2 wide/deep, normalised scale 1 → step = 0.2 * 0.9 = 0.18.
const A = { shellScale: 1, bbWidth: 0.2, bbDepth: 0.2 };

describe('ringPositions — round tier (no shape)', () => {
  it('distributes count = round(perimeter / step) instances evenly', () => {
    const pts = ringPositions({ A, radius: 1.2, off: -0.1, baseY: 1.0, arrangement: 'ring' });
    // r = 1.1, step = 0.18 → count = round(2π·1.1 / 0.18) = round(38.4) = 38
    expect(pts).toHaveLength(38);
    // First instance sits on +x at the anchor height, facing outward (rotY 0).
    expect(pts[0].pos[0]).toBeCloseTo(1.1, 6);
    expect(pts[0].pos[1]).toBeCloseTo(1.0, 6);
    expect(pts[0].pos[2]).toBeCloseTo(0, 6);
    expect(pts[0].rotY).toBeCloseTo(0, 6);
    // Even angular spacing.
    expect(pts[1].rotY).toBeCloseTo((2 * Math.PI) / 38, 6);
    // All on the ring radius r = 1.1.
    for (const p of pts) expect(Math.hypot(p.pos[0], p.pos[2])).toBeCloseTo(1.1, 6);
  });

  it('never drops below the floor of 6 instances', () => {
    const pts = ringPositions({ A: { shellScale: 1, bbWidth: 5, bbDepth: 5 }, radius: 1.2, off: 0, baseY: 0, arrangement: 'ring' });
    expect(pts).toHaveLength(6);
  });

  it('rounds the count up to a whole number of A/B pattern cycles', () => {
    // count would be 38 (even) → already a whole number of "AB" cycles; use "ABC" to force rounding.
    const pts = ringPositions({ A, radius: 1.2, off: -0.1, baseY: 1.0, arrangement: 'ring', altActive: true, pattern: 'ABC' });
    expect(pts.length % 3).toBe(0);
    expect(pts.length).toBeGreaterThanOrEqual(38);
  });
});

describe('ringPositions — single mode', () => {
  it('places exactly one instance at the configured angle', () => {
    const pts = ringPositions({ A, radius: 1.2, off: -0.1, baseY: 1.0, arrangement: 'single' });
    expect(pts).toHaveLength(1);
    expect(pts[0].pos[0]).toBeCloseTo(1.1, 6);
    expect(pts[0].pos[2]).toBeCloseTo(0, 6);
  });

  it('honours an explicit instances list + angles + keys', () => {
    const pts = ringPositions({
      A, radius: 1.2, off: 0, baseY: 0.5, arrangement: 'single',
      instances: [{ id: 'a', angle: 0 }, { id: 'b', angle: Math.PI / 2 }],
    });
    expect(pts.map(p => p.key)).toEqual(['a', 'b']);
    expect(pts[1].pos[0]).toBeCloseTo(0, 6);
    expect(pts[1].pos[2]).toBeCloseTo(1.2, 6);
  });
});

describe('buildSwagRing', () => {
  it('drapes instances with a vertical dip and radial-axis tilt quaternion', () => {
    const pts = buildSwagRing({ r: 1.1, baseY: 1.0, step: 0.18, swagCount: 6, swagDepth: 0.2, swagTilt: 0.5 });
    expect(pts.length).toBeGreaterThanOrEqual(6);
    // Every instance carries a tilt quaternion (length 4) and sits at or below the anchor.
    for (const p of pts) {
      expect(p.tq).toHaveLength(4);
      expect(p.pos[1]).toBeLessThanOrEqual(1.0 + 1e-9);
    }
  });
});
