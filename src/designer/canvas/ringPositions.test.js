import { describe, it, expect } from 'vitest';
import { ringPositions, buildSwagRing, angleAtPoint } from './ringPositions.js';

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

// ── angleAtPoint: the inverse, which is what makes single mode MOVABLE ──────────────────────────
// A single-mode piece lives on the ring as an angle, so a drag has to come back as an angle or the
// next rebuild discards it. Round-tripping is the only assertion worth making: forward through
// ringPositions, back through angleAtPoint, and land where you started. Anything else tests my
// arithmetic rather than the property that matters.
describe('angleAtPoint — round tier', () => {
  const radius = 1.2, off = -0.1, baseY = 1;

  it.each([0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 3, 2.7])('round-trips %f', (angle) => {
    const [x, , z] = ringPositions({
      A, radius, off, baseY, arrangement: 'single', instances: [{ id: 'a', angle }],
    })[0].pos;
    // atan2 returns (-π, π], so compare as points on the circle rather than as numbers — 
    // -π/3 and 5π/3 are the same place and only one of them comes back.
    const got = angleAtPoint({ x, z, radius, off });
    expect(Math.cos(got)).toBeCloseTo(Math.cos(angle), 6);
    expect(Math.sin(got)).toBeCloseTo(Math.sin(angle), 6);
  });

  // A drag lands NEAR the ring, never exactly on it — the finger is off by a few pixels and the
  // surface hit is wherever the ray met the mesh. The angle must come from the DIRECTION, so a
  // point at the wrong radius still reads as the right place on the ring.
  it('ignores how far from the ring the point is', () => {
    expect(angleAtPoint({ x: 0.3, z: 0.3, radius, off })).toBeCloseTo(Math.PI / 4, 6);
    expect(angleAtPoint({ x: 9,   z: 9,   radius, off })).toBeCloseTo(Math.PI / 4, 6);
  });
});

describe('angleAtPoint — shaped tier', () => {
  // A rectangle exercises the branch that CANNOT be inverted in closed form: the forward pass walks
  // the perimeter by arc length, so the inverse samples and takes the nearest.
  const shape = { kind: 'rect', halfW: 1, halfD: 0.6, cornerR: 0.15 };
  const radius = 1, off = 0, baseY = 0;

  it.each([0, 0.9, 2.2, 4.4, 5.9])('round-trips %f within a sample step', (angle) => {
    const [x, , z] = ringPositions({
      A, radius, off, baseY, arrangement: 'single', shape, instances: [{ id: 'a', angle }],
    })[0].pos;
    const got = angleAtPoint({ x, z, radius, off, shape });
    // 720 samples → half a degree; assert the POINT matches rather than the number, since two
    // angles either side of a corner can be a hair apart and still land on the same spot.
    const back = ringPositions({
      A, radius, off, baseY, arrangement: 'single', shape, instances: [{ id: 'b', angle: got }],
    })[0].pos;
    expect(back[0]).toBeCloseTo(x, 2);
    expect(back[2]).toBeCloseTo(z, 2);
  });

  // The two branches use DIFFERENT conventions — round is a bare atan2, the perimeter one is a
  // fraction measured from PIPING_FRONT_ANGLE. Passing a shape must therefore change the answer,
  // and this is the assertion that fails if someone "simplifies" them into one.
  it('is not the same function as the round case', () => {
    const at = { x: 0.4, z: 0.9, radius, off };
    expect(angleAtPoint({ ...at, shape })).not.toBeCloseTo(angleAtPoint(at), 3);
  });
});
