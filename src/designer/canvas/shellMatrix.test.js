import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { shellMatrix } from './shellMatrix.js';

// ── The composed matrix must equal the hierarchy it replaces ─────────────────────────────────────
//
// Instancing a cream ring means expressing three nested Object3Ds as one matrix. There is no clever
// way to check that: the only honest test builds the REAL tree the component builds, lets three.js
// compute the world matrix, and compares. A hand-derived transform that is "obviously" right is
// exactly the kind that comes out mirrored, or a quarter-turn off on half the ring, where it reads
// as somebody's design decision rather than as a bug.
//
// Mirrors <Shell> in CakeTier.jsx. If that hierarchy changes, this fails — which is the point.
function viaHierarchy({ pos, tq, rotY = 0, ryGroup = 0, meshRot = [0, 0, 0], shellScale = 1 }) {
  const g1 = new THREE.Group();
  g1.position.set(pos[0], pos[1], pos[2]);
  if (tq) g1.quaternion.set(tq[0], tq[1], tq[2], tq[3]);

  const g2 = new THREE.Group();
  g2.rotation.set(0, -rotY + Math.PI / 2 + ryGroup, 0);
  g1.add(g2);

  const mesh = new THREE.Object3D();
  mesh.rotation.set(meshRot[0], meshRot[1], meshRot[2]);
  mesh.scale.setScalar(shellScale);
  g2.add(mesh);

  g1.updateMatrixWorld(true);
  return mesh.matrixWorld;
}

const same = (a, b, digits = 10) => {
  for (let i = 0; i < 16; i++) expect(a.elements[i]).toBeCloseTo(b.elements[i], digits);
};

const DEG = Math.PI / 180;

describe('shellMatrix', () => {
  it('matches the nested groups for a plain ring shell', () => {
    const s = { pos: [1.2, 1.5, 0], rotY: 0.7, shellScale: 0.26 };
    same(shellMatrix(s), viaHierarchy(s));
  });

  it('matches with the authored tilt applied', () => {
    // bottom_rotation / top_rotation — a shell leaned back into the cake.
    const s = { pos: [0.4, 1.1, -0.9], rotY: 2.4, meshRot: [-173 * DEG, 0, 12 * DEG], shellScale: 0.31 };
    same(shellMatrix(s), viaHierarchy(s));
  });

  it('matches with the swag quaternion, which is the one that could silently mirror', () => {
    // buildSwagRing hands back a rotation about the WORLD radial axis, deliberately not a local one.
    // Composed in the wrong order this still looks like a swag — just leaning the wrong way on half
    // the ring, which is the failure nobody reports because it reads as a choice.
    const a = 1.9, tilt = -0.42;
    const sh = Math.sin(tilt / 2);
    const s = { pos: [Math.cos(a) * 1.3, 1.4, Math.sin(a) * 1.3],
                tq: [Math.cos(a) * sh, 0, Math.sin(a) * sh, Math.cos(tilt / 2)],
                rotY: a, meshRot: [0.2, 0, -0.1], shellScale: 0.28 };
    same(shellMatrix(s), viaHierarchy(s));
  });

  it('matches with the alternate version\'s own yaw offset', () => {
    const s = { pos: [-0.8, 1.2, 0.6], rotY: 4.1, ryGroup: 37 * DEG,
                meshRot: [-7 * DEG, 0, 0], shellScale: 0.22 };
    same(shellMatrix(s), viaHierarchy(s));
  });

  it('matches across a whole ring, not just one lucky angle', () => {
    // Sign errors hide: a mirrored yaw is exact at 0 and at π, and wrong everywhere between.
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const s = { pos: [Math.cos(a) * 1.2, 1.5, Math.sin(a) * 1.2], rotY: a,
                  meshRot: [0.15, 0, 0.05], shellScale: 0.27 };
      same(shellMatrix(s), viaHierarchy(s));
    }
  });

  it('writes into the matrix it is given, so a ring allocates one', () => {
    const out = new THREE.Matrix4();
    const r = shellMatrix({ pos: [1, 1, 1], rotY: 0.3 }, out);
    expect(r).toBe(out);
  });

  it('does not leak state between calls', () => {
    // Module-scope scratch is the whole reason this is fast; it is also how one shell's tilt ends
    // up on the next one. Same input twice, and interleaved with a different input, must agree.
    const a = { pos: [1, 1, 0], rotY: 0.5, meshRot: [0.3, 0, 0], shellScale: 0.2 };
    const b = { pos: [0, 2, 1], rotY: 2.0, tq: [0.1, 0.2, 0.3, 0.927], shellScale: 0.9 };
    const a1 = shellMatrix(a, new THREE.Matrix4()).clone();
    shellMatrix(b, new THREE.Matrix4());
    const a2 = shellMatrix(a, new THREE.Matrix4());
    same(a1, a2);
  });

  it('treats a missing quaternion as no tilt', () => {
    same(shellMatrix({ pos: [1, 0, 0], rotY: 1 }),
         shellMatrix({ pos: [1, 0, 0], rotY: 1, tq: [0, 0, 0, 1] }));
  });
});
