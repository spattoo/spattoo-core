import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { wrapToWall } from './garnishWall.js';

/* A flat card the way a piece is built: in the XY plane, facing +Z, origin at its bottom-centre. */
function card(w = 0.9, h = 0.5, cols = 12, rows = 4) {
  const g = new THREE.PlaneGeometry(w, h, cols, rows);
  g.translate(0, h / 2, 0);
  return g;
}

describe('a piece wrapped to a tier wall', () => {
  /* ⚠️ THE WHOLE BACK ON THE WALL. A flat 0.9-wide piece against a 1.2-radius wall lifts w²/8R ≈ 0.08
   * off it at both ends. Wrapped, every vertex is the wall's distance from the tier's axis. */
  it('puts every point of a flat piece on the wall\'s curve', () => {
    const R = 1.2;
    const out = wrapToWall(card(), { height: 0.5, spin: 0, radius: R });
    const p = out.attributes.position;
    for (let i = 0; i < p.count; i++) {
      expect(Math.hypot(p.getX(i), p.getZ(i) + R)).toBeCloseTo(R, 6);
    }
  });

  it('centres the piece on its middle and keeps its height', () => {
    const out = wrapToWall(card(0.9, 0.5), { height: 0.5, radius: 1.2 });
    out.computeBoundingBox();
    expect(out.boundingBox.min.y).toBeCloseTo(-0.25, 6);
    expect(out.boundingBox.max.y).toBeCloseTo(0.25, 6);
  });

  // Lighting follows the bend: each normal points straight out of the wall where its vertex is.
  it('turns its normals out of the wall with the bend', () => {
    const R = 1.2;
    const out = wrapToWall(card(), { height: 0.5, radius: R });
    const p = out.attributes.position, n = out.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const dx = p.getX(i), dz = p.getZ(i) + R, len = Math.hypot(dx, dz);
      expect(n.getX(i)).toBeCloseTo(dx / len, 5);
      expect(n.getZ(i)).toBeCloseTo(dz / len, 5);
    }
  });

  /* ⚠️ THE TURN HAPPENS BEFORE THE BEND, so a turned piece still wraps a VERTICAL wall: turned a quarter,
   * its width runs up the wall and its height round it, and every point is still on the curve. */
  it('spins in the wall before bending, so a turned piece still hugs the wall', () => {
    const R = 1.2;
    const out = wrapToWall(card(0.9, 0.5), { height: 0.5, spin: Math.PI / 2, radius: R });
    out.computeBoundingBox();
    expect(out.boundingBox.max.y - out.boundingBox.min.y).toBeCloseTo(0.9, 5);
    const p = out.attributes.position;
    for (let i = 0; i < p.count; i++) expect(Math.hypot(p.getX(i), p.getZ(i) + R)).toBeCloseTo(R, 6);
  });

  /* ⚠️ A STRAIGHT EDGE MUST NOT CUT INTO THE WALL. A cut panel's edge is two vertices; bent, the flat
   * triangle between them is a chord that runs inside the curve, and the wall hides its middle — a
   * V-shaped bite out of the top of the piece. Every triangle's middle must stay on the wall. */
  it('keeps a two-triangle panel on the wall, not cutting into it', () => {
    const R = 1.2;
    const out = wrapToWall(card(0.9, 0.5, 1, 1), { height: 0.5, radius: R });
    const p = out.attributes.position;
    expect(p.count).toBeGreaterThan(6);                       // it was split
    for (let i = 0; i < p.count; i += 3) {
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      expect(Math.hypot(cx, cz + R)).toBeGreaterThan(R - 0.002);
    }
  });

  it('leaves a piece on a flat face unbent', () => {
    const out = wrapToWall(card(), { height: 0.5, radius: 0 });
    const p = out.attributes.position;
    for (let i = 0; i < p.count; i++) expect(p.getZ(i)).toBeCloseTo(0, 9);
  });

  it('does not touch the geometry it was given', () => {
    const src = card();
    const before = src.attributes.position.array.slice();
    wrapToWall(src, { height: 0.5, spin: 0.4, radius: 1.2 });
    expect(Array.from(src.attributes.position.array)).toEqual(Array.from(before));
  });
});
