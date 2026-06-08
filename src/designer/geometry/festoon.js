import * as THREE from 'three';

// ── Bend a straight strip GLB into U-shaped festoons (swags) around the cake ──
// A "strip" element (e.g. a rope/braid) is bent so its LENGTH follows an arc of the ring
// and its belly hangs into a U — the classic draped swag border. One strip = one festoon.
// This is the EXACT math the admin Piping Calibrator previews with (bakeStrip /
// bendOneFestoon / buildFestoons), kept in sync so the cake matches what was tuned there.

// Bake the node transform into the geometry so we work in real (small) world units, not the
// GLB's raw local coords (which can be ~70× scaled & offset). Optional 180° X flip.
function bakeStrip(scene, flip) {
  scene.updateMatrixWorld(true);
  let src = null;
  scene.traverse(o => { if (o.isMesh && !src) { src = o.geometry.clone(); src.applyMatrix4(o.matrixWorld); } });
  if (!src) return null;
  if (flip) src.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI));
  src.computeBoundingBox();
  return src;
}

// Bend ONE strip into a single festoon centred on angle `th0`, spanning `span` radians.
// `depth` = how far the belly hangs below the attachment ends (cake units). `tilt` (radians)
// rolls the strip about its length so it leans into a draped look. `sizeFactor` scales the
// rope's cross-section (thickness) without changing how far it spans the arc.
function bendOneFestoon(srcGeo, { th0, span, depth, attachY, radius, tilt = 0, sizeFactor = 1 }) {
  const g = srcGeo.clone();
  g.computeBoundingBox();
  const bb = g.boundingBox, min = bb.min.clone(), size = new THREE.Vector3(); bb.getSize(size);
  const ax = ['x', 'y', 'z'];
  const lenAxis = ax.reduce((a, b) => (size[b] > size[a] ? b : a), 'x'); // longest = strip length
  const cross = ax.filter(a => a !== lenAxis);
  const L = size[lenAxis];
  const uscale = (span * radius) / L;                                    // stretch to fill the arc
  const outAxis = size[cross[0]] >= size[cross[1]] ? cross[0] : cross[1]; // bump axis (sticks out)
  const widthAxis = outAxis === cross[0] ? cross[1] : cross[0];
  const cOut = min[outAxis] + size[outAxis] / 2, cW = min[widthAxis] + size[widthAxis] / 2;
  const cScale = uscale * sizeFactor;
  const outHalf = (size[outAxis] / 2) * cScale;
  const R = radius + outHalf;                                            // sit proud of the wall
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const pos = g.attributes.position, v = new THREE.Vector3();
  const curve = t => {
    const th = th0 + (t - 0.5) * span;
    const cy = attachY - depth * (1 - Math.pow(2 * t - 1, 2));           // U: belly at t=0.5
    return { p: new THREE.Vector3(Math.cos(th) * R, cy, Math.sin(th) * R), th };
  };
  for (let i = 0; i < pos.count; i++) {
    const comp = { x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) };
    const t = (comp[lenAxis] - min[lenAxis]) / L;
    const oOut = (comp[outAxis] - cOut) * cScale, oW = (comp[widthAxis] - cW) * cScale;
    const cur = curve(t), nxt = curve(Math.min(1, t + 1e-3)), prv = curve(Math.max(0, t - 1e-3));
    const T = new THREE.Vector3().subVectors(nxt.p, prv.p).normalize();      // tangent along the U
    const Rhat0 = new THREE.Vector3(Math.cos(cur.th), 0, Math.sin(cur.th));  // radial out (bumps)
    const B0 = new THREE.Vector3().crossVectors(T, Rhat0).normalize();       // in-wall perpendicular
    const Rhat = Rhat0.clone().multiplyScalar(ct).addScaledVector(B0, st);   // roll by `tilt`
    const B    = B0.clone().multiplyScalar(ct).addScaledVector(Rhat0, -st);
    v.copy(cur.p).addScaledVector(Rhat, oOut).addScaledVector(B, oW);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// Build every festoon around the ring. `spread` 1.0 tiles them edge-to-edge into one
// continuous garland; <1 (default 0.96) leaves a small gap between separate swags.
// Returns an array of bent geometries — render each as its own mesh in the ring's colour.
export function buildFestoons(scene, { flip = false, festoons = 6, depth = 0.4, attachY = 0, radius = 1.2, spread = 0.96, tilt = 0, sizeFactor = 1 }) {
  const src = bakeStrip(scene, flip);
  if (!src) return [];
  const n = Math.max(1, Math.round(festoons));
  const span = (2 * Math.PI / n) * spread;
  return Array.from({ length: n }, (_, k) =>
    bendOneFestoon(src, { th0: Math.PI / 2 + k * (2 * Math.PI / n), span, depth, attachY, radius, tilt, sizeFactor }));
}
