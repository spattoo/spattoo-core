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
