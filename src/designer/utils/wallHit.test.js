import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { wallSamples } from '../geometry/surface.js';
import { wallHitPoint, cylinderHitPoint } from '../utils/raycasting.js';

// A real THREE.Ray: cylinderHitPoint calls ray.at(), and comparing against it is the point.
const rayTo = (from, at) => {
  const o = new THREE.Vector3(...from);
  const d = new THREE.Vector3(...at).sub(o).normalize();
  return new THREE.Ray(o, d);
};

describe('hitting a wall that is not a cylinder', () => {
  const RECT = { kind: 'rect', halfW: 1.8, halfD: 1.2, cornerR: 0.3 };

  it('⚠️ agrees with the cylinder on a round tier — nothing already drawn may move', () => {
    const ROUND = { kind: 'round', radius: 1.5 };
    const w = wallSamples(ROUND, 2048);
    for (const target of [[0, 0.5, 1.5], [1.5, 0.3, 0], [-1.06, 0.6, 1.06]]) {
      const ray = rayTo([target[0] * 4, 0.5, target[2] * 4], target);
      const a = cylinderHitPoint(ray, 1.5);
      const b = wallHitPoint(ray, w, { baseY: 0, wallH: 1 });
      expect(b).toBeTruthy();
      expect(b.x).toBeCloseTo(a.x, 2);
      expect(b.z).toBeCloseTo(a.z, 2);
    }
  });

  it('lands on the FLAT of a sheet, where a cylinder would miss by a lot', () => {
    const w = wallSamples(RECT);
    // Looking straight at the front face from outside.
    const ray = rayTo([0, 0.5, 6], [0, 0.5, 0]);
    const hit = wallHitPoint(ray, w, { baseY: 0, wallH: 1 });
    expect(hit).toBeTruthy();
    expect(hit.z).toBeCloseTo(1.2, 2);              // the real front wall
    const cyl = cylinderHitPoint(ray, 1.5);         // what the old code answered
    expect(Math.abs(cyl.z - hit.z)).toBeGreaterThan(0.25);
  });

  it('answers the arc length of the hit, not an angle', () => {
    const w = wallSamples(RECT);
    const hit = wallHitPoint(rayTo([0, 0.5, 6], [0, 0.5, 0]), w, { baseY: 0, wallH: 1 });
    // front-centre is where the rounded-rect walk starts
    const u = (hit.s / w.length) % 1;
    expect(Math.min(u, 1 - u)).toBeLessThan(0.02);
  });

  it('misses above the rim and below the board', () => {
    const w = wallSamples(RECT);
    expect(wallHitPoint(rayTo([0, 3, 6], [0, 3, 0]), w, { baseY: 0, wallH: 1 })).toBeNull();
    expect(wallHitPoint(rayTo([0, -2, 6], [0, -2, 0]), w, { baseY: 0, wallH: 1 })).toBeNull();
  });

  it('takes the NEAR wall, so the back of the cake is not clickable', () => {
    const w = wallSamples(RECT);
    const hit = wallHitPoint(rayTo([0, 0.5, 6], [0, 0.5, -6]), w, { baseY: 0, wallH: 1 });
    expect(hit.z).toBeGreaterThan(0);               // front, not the far side
  });
});

/* ── Where you press is where the cream lands ────────────────────────────────────────────────────
 *
 * The two halves were fixed hours apart: the renderer walks the tier's outline (wallPlacer), the
 * hit-test now does too. Either alone is useless — a stroke placed correctly from a point taken
 * from an imaginary circle is still in the wrong place. This drives the whole chain a hand does
 * (ray → hit → wall coordinates → gesture → geometry) and asks where the cream actually came out.
 */
import { wallCoordsOf, brushGestureFromDrag, brushGesture, buildBrushStrokeOnWall } from '../geometry/brushStrokeOnCake.js';

describe('the hand and the cream agree', () => {
  const RECT = { kind: 'rect', halfW: 1.8, halfD: 1.2, cornerR: 0.3 };
  const W = wallSamples(RECT);

  const press = (from, at) => wallHitPoint(rayTo(from, at), W, { baseY: 0, wallH: 1 });

  it('lays the stroke on the wall the pointer touched — on a sheet', () => {
    // Drag down the RIGHT-HAND flat: x = +1.8, a face a cylinder of R ≈ 1.5 does not even reach.
    const a = press([7, 0.85, 0.2], [1.8, 0.85, 0.2]);
    const b = press([7, 0.25, 0.2], [1.8, 0.25, 0.2]);
    expect(a && b).toBeTruthy();

    const g = brushGestureFromDrag(a, b, { R: 1.5, baseY: 0, wallH: 1, shape: RECT });
    expect(g).toBeTruthy();                       // travelled far enough to be a stroke

    // `brushGestureFromDrag` answers the stroke's PARAMETERS (where it starts, how far it climbs
    // and sweeps); `brushGesture` turns those into the path, exactly as the renderer does.
    const geo = buildBrushStrokeOnWall({ R: 1.5, baseY: 0, wallH: 1, shape: RECT, path: brushGesture(g) });
    const pos = geo.getAttribute('position');
    let minX = Infinity, maxX = -Infinity, maxAbsZ = 0;
    for (let i = 0; i < pos.count; i++) {
      minX = Math.min(minX, pos.getX(i));
      maxX = Math.max(maxX, pos.getX(i));
      maxAbsZ = Math.max(maxAbsZ, Math.abs(pos.getZ(i)));
    }
    // It belongs on the right-hand face, near x = 1.8 — not on a circle of 1.5, and not wandered
    // round onto the front.
    expect(minX).toBeGreaterThan(1.5);
    expect(maxX).toBeLessThan(2.1);
    expect(maxAbsZ).toBeLessThan(0.9);
  });

  it('⚠️ and the round cake is untouched by all of it', () => {
    const ROUND = { kind: 'round', radius: 1.5 };
    const p = { x: 0, y: 0.5, z: 1.5 };
    // front-centre: angle 0 on a circle, and fraction 0 along the outline walk
    expect(wallCoordsOf(p, { baseY: 0, wallH: 1 }).at).toBeCloseTo(0, 6);
    expect(wallCoordsOf(p, { baseY: 0, wallH: 1, shape: ROUND }).at).toBeCloseTo(0, 6);
  });
});
