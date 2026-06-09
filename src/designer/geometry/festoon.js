import * as THREE from 'three';

// ── Bend a straight strip GLB into U-shaped festoons (swags) around the cake ──
// A "strip" element (e.g. a rope/braid) is bent so its LENGTH follows an arc of the ring
// and its belly hangs into a U — the classic draped swag border. One strip = one festoon.
// This is the EXACT math the admin Piping Calibrator previews with (bakeStrip /
// bendOneFestoon / buildFestoons), kept in sync so the cake matches what was tuned there.

// Bake the node transform into the geometry so we work in real (small) world units, not the
// GLB's raw local coords (which can be ~70× scaled & offset). Optional 180° X flip.
//
// We build a FRESH, plain (non-interleaved, de-normalized) Float32 position buffer in WORLD
// space rather than cloning the mesh geometry. meshopt-compressed / quantized GLBs deliver
// INTERLEAVED + NORMALISED attributes: cloning them and mutating the clone can share or
// corrupt the cached (useGLTF) InterleavedBuffer, and downstream per-vertex writes then
// scramble the geometry. Reading every vertex through a Vector3 de-normalises it and applies
// the world matrix, fully isolating us from how the GLB encodes its attributes — so a meshopt
// ring wraps exactly like an uncompressed one. Index is preserved; normals are recomputed by
// callers after they deform the positions.
function bakeStrip(scene, flip) {
  scene.updateMatrixWorld(true);
  let mesh = null;
  scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
  if (!mesh) return null;
  const pos = mesh.geometry.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
  }
  const src = new THREE.BufferGeometry();
  src.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  if (mesh.geometry.index) src.setIndex(mesh.geometry.index.clone());
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

// ── Wrap a pre-formed RING GLB around the tier wall (round OR rounded-rect) ────
// Some piping GLBs are already a full closed ring (a base/side band), not a repeatable
// shell — normalising + repeating them just shrinks the whole ring to a sliver. Instead we
// re-route the ring's vertices onto the tier PERIMETER: a vertex at angle θ around the ring
// maps to the same fraction f = θ/2π of the perimeter, displaced OUTWARD by its radial
// profile (inner face on the wall) and lifted by its height. Because the perimeter abstracts
// shape, a circle ring becomes a circular band on a round cake and follows the rounded-rect
// on a sheet cake — auto-hugging the wall at any size. The seam closes naturally (f=0≡f=1 map
// to the same perimeter point). `perim` is from surface.js; `anchorY` is the band's base up
// the wall; `heightFrac` sets band height as a fraction of the tier radius (sizeFactor tunes);
// `outset` nudges it proud of the wall to avoid z-fighting. Returns one BufferGeometry.
// `tilt` (radians) pitches the band's cross-section about the wall tangent: positive flares the
// top edge OUTWARD (away from the cake), negative tucks it in — the ribbon "leans" round the wall.
export function buildWrapBand(scene, { perim, anchorY = 0, heightFrac = 0.33, sizeFactor = 1, radius = 1.2, outset = 0.01, tilt = 0 }) {
  const g = bakeStrip(scene, false);
  if (!g || !perim) return null;
  // Orient the ring flat: its hole axis (thinnest bbox axis) must be vertical (Y).
  g.computeBoundingBox();
  let size = new THREE.Vector3(); g.boundingBox.getSize(size);
  const thin = (size.x <= size.y && size.x <= size.z) ? 'x' : (size.z <= size.y ? 'z' : 'y');
  if (thin === 'x') g.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  else if (thin === 'z') g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  // Centre the hole on the Y axis (X,Z → 0); measure base height + inner radius.
  g.computeBoundingBox();
  const c = new THREE.Vector3(); g.boundingBox.getCenter(c);
  g.translate(-c.x, 0, -c.z);
  g.computeBoundingBox();
  const yMin = g.boundingBox.min.y;
  size = new THREE.Vector3(); g.boundingBox.getSize(size);
  const ringH = size.y || 1e-3;
  const pos = g.attributes.position;
  let rInner = Infinity;
  for (let i = 0; i < pos.count; i++) { const rho = Math.hypot(pos.getX(i), pos.getZ(i)); if (rho < rInner) rInner = rho; }
  const cs = (radius * heightFrac / ringH) * Math.max(0.05, sizeFactor);   // uniform cross-section scale
  const L = perim.length, v = new THREE.Vector3();
  const cb = Math.cos(tilt), sb = Math.sin(tilt);                          // tilt about the wall tangent
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const f = (((Math.atan2(z, x) / (2 * Math.PI)) % 1) + 1) % 1;          // ring angle → perimeter fraction
    const P = perim.at(f * L);                                             // {x,z,nx,nz} on the wall
    const rRel = (Math.hypot(x, z) - rInner) * cs;                         // radial dist from inner face
    const h    = (y - yMin) * cs;                                          // height above the band base
    const out  = rRel * cb + h * sb + outset;                             // tilt rotates the cross-section
    const hT   = h * cb - rRel * sb;                                      //   about the inner-bottom edge
    v.set(P.x + P.nx * out, anchorY + hT, P.z + P.nz * out);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
