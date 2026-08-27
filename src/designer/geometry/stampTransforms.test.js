import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stampTransforms } from './creamPen.js';

// ── Repeating a shape along a line the customer drew ─────────────────────────────────────────────
// This is the engine behind "I'll pipe it myself": the pen hands over the seated polyline it
// captured, and this walks it and drops a copy every `spacing × footprint`.
//
// It was written for SCATTERING — a dragged row of blossoms, deliberately jittered so it does not
// read as printed. Piping is the opposite: one shell pressed out by the same nozzle at the same
// angle, over and over, and its whole character is that the repeats AGREE. `regular` is that
// difference, and it is the only thing separating a piped border from a row of shells knocked
// askew, so it is worth holding down.

const flat = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];     // 2 long, straight, on the board
const UP = [0, 1, 0];
const rope = (over = {}) => ({
  kind: 'stamprope', points: flat, normal: UP, thickness: 0.05, spacing: 1, seed: 3, ...over,
});

describe('stampTransforms', () => {
  it('walks the drawn path by arc length, not by point count', () => {
    // Three stored points but a step of 0.1 → the copies come from the LINE, not the samples.
    // A capture is however many pointer events happened to fire; spacing has to be independent of it.
    const step = 2 * 0.05 * 1;                                   // spacing × (2 × thickness)
    const got = stampTransforms(rope(), 1);
    expect(got.length).toBe(Math.floor(2 / step) + 1);
  });

  it('spaces them evenly along the line', () => {
    const got = stampTransforms(rope({ regular: true }), 1);
    const gaps = got.slice(1).map((t, i) => t.pos[0] - got[i].pos[0]);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6);
  });

  it('tightens the run as spacing drops', () => {
    const wide  = stampTransforms(rope({ spacing: 1.4, regular: true }), 1);
    const tight = stampTransforms(rope({ spacing: 0.6, regular: true }), 1);
    expect(tight.length).toBeGreaterThan(wide.length);
  });

  it('seats every copy ON the surface, a radius below the stored centerline', () => {
    // The pen stores the centerline lifted one rope-radius along the normal so the cream RESTS on
    // the cake; a stamp has to drop back down or every shell floats.
    for (const t of stampTransforms(rope({ regular: true }), 1)) expect(t.pos[1]).toBeCloseTo(-0.05, 9);
  });

  describe('regular — what makes it piping rather than scattering', () => {
    it('gives every copy the SAME scale', () => {
      const s = stampTransforms(rope({ regular: true }), 1).map(t => t.scale);
      for (const v of s) expect(v).toBeCloseTo(s[0], 12);
    });

    it('gives every copy the same orientation along a straight line', () => {
      const q = stampTransforms(rope({ regular: true }), 1).map(t => t.quat);
      for (const v of q) expect(v).toEqual(q[0]);
    });

    it('faces ACROSS the run, the way a ring points a shell outward', () => {
      // Worked out from the renderer, not assumed. Shell nests group(yaw = -rotY + π/2 + ry) →
      // mesh(tilt) with an identity outer quaternion on a plain ring; at shell angle `a` that yaw
      // sends the GLB's +Z to (cos a, 0, sin a) — the outward radial. A piped shell points AWAY
      // from the cake, square across the border, not along it.
      //
      // Piped along the tangent instead, the configured X-tilt leans the piece sideways rather than
      // forward, which is what "it's falling" was.
      const [t] = stampTransforms(rope({ regular: true }), 1);   // path runs along +x, up is +y
      const facing = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(new THREE.Quaternion().fromArray(t.quat));
      expect(Math.abs(facing.x)).toBeLessThan(1e-6);             // NOT along the run
      expect(Math.abs(facing.z)).toBeCloseTo(1, 6);              // across it
    });

    it('leaves SCATTERING facing along the run, so drawn strokes do not move', () => {
      // The convention only changes for piping. Every cream-pen stamp already on a cake was placed
      // facing along the drag, and a stored stroke has to redraw as it was drawn.
      const loose = stampTransforms(rope({ regular: false, seed: 11 }), 1);
      const facings = loose.map(t => new THREE.Vector3(0, 0, 1)
        .applyQuaternion(new THREE.Quaternion().fromArray(t.quat)));
      // Jittered ±0.25 rad about the tangent, so each still points broadly along +x.
      for (const f of facings) expect(Math.abs(f.x)).toBeGreaterThan(0.9);
    });

    it('still TURNS with the path — it follows the line, it is not frozen', () => {
      // An L: along +x, then along +z. A shell has to face the way the hand was moving, or the
      // corner of a border shows every copy pointing the wrong way.
      const bend = stampTransforms(
        rope({ points: [[0, 0, 0], [1, 0, 0], [1, 0, 1]], regular: true }), 1);
      const first = new THREE.Quaternion().fromArray(bend[0].quat);
      const last  = new THREE.Quaternion().fromArray(bend[bend.length - 1].quat);
      expect(first.angleTo(last)).toBeGreaterThan(1.2);          // ~90° apart
    });

    it('is what the scattering mode does NOT do', () => {
      // The guard against someone "simplifying" the flag away: without it both must vary.
      const loose = stampTransforms(rope({ regular: false }), 1);
      expect(new Set(loose.map(t => t.scale.toFixed(9))).size).toBeGreaterThan(1);
      expect(new Set(loose.map(t => t.quat.join(','))).size).toBeGreaterThan(1);
    });

    it('is stable across renders, so a reload redraws the same border', () => {
      const a = stampTransforms(rope({ regular: true }), 1);
      const b = stampTransforms(rope({ regular: true }), 1);
      expect(a).toEqual(b);
    });
  });

  // ── The element's own rotation ──────────────────────────────────────────────────────────────────
  // Up-to-normal and forward-to-tangent says where a copy sits and which way it points. It says
  // nothing about how the GLB was authored, so a shell modelled lying on its side is piped lying on
  // its side — the same element ringed round a rim stood up, hand-piped it fell over. A ring reads
  // placement_config.*_rotation and splits it: Y yaws about the normal, X and Z tilt upright.
  describe('rotation — standing the piece up the way a ring does', () => {
    // Which way the GLB's own +Y ends up pointing, in world space.
    const localUp = t => new THREE.Vector3(0, 1, 0)
      .applyQuaternion(new THREE.Quaternion().fromArray(t.quat));

    it('leaves the piece along the surface normal when there is no rotation', () => {
      const [t] = stampTransforms(rope({ regular: true }), 1);
      expect(localUp(t).y).toBeCloseTo(1, 6);
    });

    it('tilts about X by the configured degrees', () => {
      const [t] = stampTransforms(rope({ regular: true, rotation: [90, 0, 0] }), 1);
      expect(localUp(t).y).toBeCloseTo(0, 6);            // laid right over
    });

    it('tilts RELATIVE TO THE SURFACE, not to the world', () => {
      // The reason the rotation is applied after the basis. On a wall the normal points sideways,
      // and a piece leaning 30° must lean 30° off ITS OWN wall — composed the other way round,
      // every copy round a curved tier would lean a different direction.
      const wall = rope({ regular: true, normal: [1, 0, 0], points: [[0, 0, 0], [0, 0, 1]], rotation: [30, 0, 0] });
      const [t] = stampTransforms(wall, 1);
      const up = localUp(t);
      const surfaceNormal = new THREE.Vector3(1, 0, 0);
      expect(up.angleTo(surfaceNormal)).toBeCloseTo(30 * Math.PI / 180, 5);
    });

    it('yaws about the normal for the Y component, leaving it upright', () => {
      const [t] = stampTransforms(rope({ regular: true, rotation: [0, 40, 0] }), 1);
      expect(localUp(t).y).toBeCloseTo(1, 6);            // spun in place, still standing
      const none = stampTransforms(rope({ regular: true }), 1)[0];
      expect(t.quat).not.toEqual(none.quat);             // …but genuinely turned
    });

    it('treats an all-zero rotation as none, so config noise costs nothing', () => {
      const zero = stampTransforms(rope({ regular: true, rotation: [0, 0, 0] }), 1);
      expect(zero).toEqual(stampTransforms(rope({ regular: true }), 1));
    });

    it('applies the same rotation to every copy along the run', () => {
      const got = stampTransforms(rope({ regular: true, rotation: [25, 10, 0] }), 1);
      for (const t of got) expect(t.quat).toEqual(got[0].quat);
    });
  });

  it('places a single stamp for a tap without consulting the random spin', () => {
    // A lone regular stamp still has to face somewhere, and it must be the SAME somewhere every
    // render — `rand()` there would spin it on each redraw.
    const one = { kind: 'stamp', point: [0, 0, 0], normal: UP, thickness: 0.05, seed: 9, regular: true };
    expect(stampTransforms(one, 1)).toEqual(stampTransforms(one, 1));
    expect(stampTransforms(one, 1).length).toBe(1);
  });

  it('survives a path with no length and one with a single point', () => {
    expect(stampTransforms(rope({ points: [] }), 1)).toEqual([]);
    expect(stampTransforms(rope({ points: [[0, 0, 0]] }), 1).length).toBe(1);
  });
});
