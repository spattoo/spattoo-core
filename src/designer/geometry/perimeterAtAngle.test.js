import { describe, it, expect } from 'vitest';
import { perimeterAtAngle } from './surface.js';

const RECT = { kind: 'rect', halfW: 1.1, halfD: 0.8, cornerR: 0.05 };

describe('the wall point in a direction from the centre', () => {
  it('lands on the face the angle points at, with that face\'s normal', () => {
    const east = perimeterAtAngle(RECT, 0);
    expect(east.x).toBeCloseTo(1.1, 3); expect(east.z).toBeCloseTo(0, 3); expect(east.nx).toBeCloseTo(1, 3);
    const front = perimeterAtAngle(RECT, Math.PI / 2);
    expect(front.z).toBeCloseTo(0.8, 3); expect(front.x).toBeCloseTo(0, 3); expect(front.nz).toBeCloseTo(1, 3);
  });

  it('matches the circle on a round tier', () => {
    const p = perimeterAtAngle({ kind: 'round', radius: 1.2 }, 0.7);
    expect(p.x).toBeCloseTo(1.2 * Math.cos(0.7), 2);
    expect(p.z).toBeCloseTo(1.2 * Math.sin(0.7), 2);
  });

  it('pushes the point proud of the wall along its normal', () => {
    const p = perimeterAtAngle(RECT, 0, 0.05);
    expect(p.x).toBeCloseTo(1.15, 3);
  });

  /* ⚠️ NO DEAD PATCH OFF A CORNER. Nearest-point would park every angle in the corner's wedge on the
   * corner; a ray keeps moving. Sweep through the corner and require every step to move the point. */
  it('keeps moving through a corner as the angle sweeps', () => {
    const corner = Math.atan2(0.8, 1.1);
    let prev = perimeterAtAngle(RECT, corner - 0.2);
    for (let a = corner - 0.19; a <= corner + 0.2; a += 0.01) {
      const cur = perimeterAtAngle(RECT, a);
      expect(Math.hypot(cur.x - prev.x, cur.z - prev.z)).toBeGreaterThan(1e-4);
      prev = cur;
    }
  });
});
