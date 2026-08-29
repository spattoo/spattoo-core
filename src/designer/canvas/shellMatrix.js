import * as THREE from 'three';

/* ── One shell's placement, as a single matrix ────────────────────────────────────────────────────
 *
 * A cream shell is drawn as a nested hierarchy — a group holding the ring position and the swag
 * tilt, a group inside it holding the yaw that faces the shell outward, and the mesh itself
 * carrying the authored tilt and the scale:
 *
 *   <group position={pos} quaternion={tq}>
 *     <group rotation={[0, -rotY + π/2 + ryGroup, 0]}>
 *       <mesh rotation={meshRot} scale={shellScale} />
 *
 * That reads well and costs a lot. Every shell is three Object3Ds and — because CreamMesh declares
 * its material inline — its own MeshPhysicalMaterial. A 48-shell ring is 48 meshes, 48 physical
 * materials and 48 draw calls; a three-tier cake with a rim and a board ring on each is around 288
 * of each, for one geometry repeated.
 *
 * An InstancedMesh needs the same placement expressed as ONE matrix per instance, so this composes
 * the hierarchy by hand. three.js builds a child's world matrix as `parent.matrixWorld · child.matrix`,
 * so the order below is the tree read outside-in — and that order is the whole correctness of it.
 *
 * ⚠️ Pure, and separate from the component, so it can be tested against the real thing: the test
 * builds the actual nested Object3D tree, calls updateMatrixWorld, and compares element by element.
 * A transform that is "obviously" right is exactly the kind that ends up mirrored or off by a
 * quarter turn on half the ring, where it reads as a design choice rather than a bug.
 */
export function shellMatrix({ pos, tq, rotY = 0, ryGroup = 0, meshRot = [0, 0, 0], shellScale = 1 }, out = new THREE.Matrix4()) {
  const q = tq ? new THREE.Quaternion(tq[0], tq[1], tq[2], tq[3]) : IDENT_Q;

  // group 1 — where on the ring, plus the swag tilt about the world radial axis
  out.compose(TMP_V.set(pos[0], pos[1], pos[2]), q, ONE);

  // group 2 — yaw so the shell faces outward. Sign and the +π/2 come from the component; they are
  // reproduced rather than reasoned about, because the two must agree exactly.
  M2.makeRotationY(-rotY + Math.PI / 2 + ryGroup);
  out.multiply(M2);

  // the mesh — authored tilt, then the shell scale
  M3.makeRotationFromEuler(TMP_E.set(meshRot[0], meshRot[1], meshRot[2], 'XYZ'));
  M3.scale(TMP_S.set(shellScale, shellScale, shellScale));
  out.multiply(M3);

  return out;
}

// Module-scope scratch. This runs once per shell per rebuild — a 48-shell ring on a three-tier cake
// is a few hundred calls — and allocating five objects each time is garbage the frame after.
const IDENT_Q = new THREE.Quaternion();
const ONE     = new THREE.Vector3(1, 1, 1);
const TMP_V   = new THREE.Vector3();
const TMP_E   = new THREE.Euler();
const TMP_S   = new THREE.Vector3();
const M2      = new THREE.Matrix4();
const M3      = new THREE.Matrix4();
