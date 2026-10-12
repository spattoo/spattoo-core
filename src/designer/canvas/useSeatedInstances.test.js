import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { layAxis, instancedTriangleCount } from './useSeatedInstances.js';

/* ⚠️ THIS IS THE SIGN THE WAFER SKIRT GOT WRONG, and it cost a day. `fin` mounting sent every strip
 * INWARD through the cake instead of outward, which a render could not show (the strips were simply
 * gone) and a test found in one line. Laying a sprig down on a board is the same operation: tip +Y
 * toward the seat's outward bearing. Inward, a board ring would grow into the cake. */
describe('layAxis — tipping a piece AWAY from the cake', () => {
  const tipped = (out, angle) =>
    new THREE.Vector3(0, 1, 0).applyQuaternion(
      new THREE.Quaternion().setFromAxisAngle(layAxis(out), angle));

  it('laid flat, a piece points along its own outward bearing', () => {
    for (const out of [0, Math.PI / 2, Math.PI, -Math.PI / 3, 2.4]) {
      const v = tipped(out, Math.PI / 2);
      // Fully laid over, +Y should be the horizontal outward direction (sin out, 0, cos out).
      expect(v.x, `out ${out}`).toBeCloseTo(Math.sin(out), 5);
      expect(v.z, `out ${out}`).toBeCloseTo(Math.cos(out), 5);
      expect(v.y, `out ${out}`).toBeCloseTo(0, 5);
    }
  });

  it('part way over, it leans outward and is still standing', () => {
    const out = 0.9;
    const v = tipped(out, Math.PI / 4);
    expect(v.y).toBeGreaterThan(0.6);                       // still mostly upright
    const outward = new THREE.Vector3(Math.sin(out), 0, Math.cos(out));
    expect(v.dot(outward)).toBeGreaterThan(0.5);            // and leaning the right way
  });

  it('never leans inward, at any bearing or angle', () => {
    for (let out = -Math.PI; out < Math.PI; out += 0.37) {
      for (const a of [0.2, 0.8, 1.4, Math.PI / 2]) {
        const v = tipped(out, a);
        const outward = new THREE.Vector3(Math.sin(out), 0, Math.cos(out));
        expect(v.dot(outward), `out ${out.toFixed(2)} angle ${a}`).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('upright is untouched', () => {
    const v = tipped(1.1, 0);
    expect(v.y).toBeCloseTo(1, 6);
  });
});

describe('instancedTriangleCount — what a MERGED field would cost', () => {
  it('counts off the geometry rather than a formula', () => {
    const g = new THREE.BoxGeometry(1, 1, 1);             // 12 triangles, unindexed in three
    const { per, total } = instancedTriangleCount(g, 10);
    expect(per).toBe(12);
    expect(total).toBe(120);
  });

  it('survives a geometry that is not there yet', () => {
    expect(instancedTriangleCount(null, 5).total).toBe(0);
  });
});
