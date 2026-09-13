import { BufferGeometry, Float32BufferAttribute } from 'three';

// ── A garnish pressed flat against a tier wall ──────────────────────────────────────────────────
//
// A piece is built in its own space — the XY plane, face looking along +Z, origin bottom-centre (see
// garnishPiece.js). Standing or lying on a tier TOP, a group transform is all it needs. Against a
// WALL it needs two things a transform cannot do, so they are done to the vertices here:
//
// 1. ⚠️ IT BENDS TO THE WALL. A flat piece laid against a cylinder touches it along one line and lifts
//    off at both edges: the gap is about w²/8R, and a 0.9-wide piece on a 1.2-radius tier stands 0.08
//    proud at its ends — a piece stuck on at its middle and floating everywhere else. That is the
//    limit the garnish plan named when it left the side out ("a flat piece must curve to the wall or
//    it floats at the tangent"). Wrapping each vertex round a vertical axis at the wall's centre keeps
//    the whole back face on the wall at every size, the way a side decal is bent (INVARIANTS #8a).
//
// 2. ⚠️ THE TURN HAPPENS BEFORE THE BEND. On a wall, Turn spins the piece in the plane of the wall.
//    Spun AFTER bending, the bend axis would tilt with it and a turned piece would wrap round a
//    leaning cylinder — correct only at a turn of zero. So: centre, spin in the wall's plane, then
//    bend round a vertical axis. The renderer's group only faces the result outward.
//
// 3. ⚠️ A LONG FLAT SPAN IS SPLIT BEFORE IT IS BENT. A cut panel's straight edge is two vertices and a
//    triangle between them. Bending moves the two corners onto the wall, but the triangle stays a
//    straight CHORD — and a chord of a circle passes INSIDE it. The middle of a panel's top edge sank
//    into the wall and was hidden by it: the piece showed a V-shaped bite out of its top, bigger the
//    bigger the piece. So triangles are halved along their longest edge until none spans more than the
//    wall's curve allows (a chord of length L sits L²/8R inside; the limit keeps that under ~1.5 mm).
//    A swept rope is already fine-grained and passes through untouched.
//
// Normals move with the vertices (the same rotations, analytically) rather than being recomputed:
// recomputing from faces would flatten the smooth shading a swept rope depends on.

/**
 * geometry  the built piece (bottom-centre origin, facing +Z). Not modified — a clone is returned.
 * height    the piece's height, so it can be re-centred on its middle (a wall piece is placed by its
 *           centre, not by the edge that would rest on a table)
 * spin      radians, the piece's turn within the wall's plane
 * radius    the wall's curve at the piece's middle plane. 0 = a flat facet: no bend.
 */
export function wrapToWall(geometry, { height = 0, spin = 0, radius = 0 } = {}) {
  const out = radius > 0 ? subdivideLongEdges(geometry, Math.sqrt(8 * radius * SAG_LIMIT)) : geometry.clone();
  const pos = out.attributes.position;
  const nor = out.attributes.normal;
  const cs = Math.cos(spin), sn = Math.sin(spin);
  const half = height / 2;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i) - half, z = pos.getZ(i);
    // Spin in the wall's plane (about the piece's own +Z).
    const x1 = x * cs - y * sn;
    const y1 = x * sn + y * cs;
    // Bend round a vertical axis `radius` behind the piece: arc length along the wall stays the
    // piece's own width, and depth off the wall stays its own thickness.
    let x2 = x1, z2 = z, a = 0;
    if (radius > 0) {
      a = x1 / radius;
      x2 = (radius + z) * Math.sin(a);
      z2 = (radius + z) * Math.cos(a) - radius;
    }
    pos.setXYZ(i, x2, y1, z2);

    if (nor) {
      const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      const nx1 = nx * cs - ny * sn;
      const ny1 = nx * sn + ny * cs;
      // The bend turns the local frame about Y by `a`: +X → (cos a, 0, −sin a), +Z → (sin a, 0, cos a).
      const ca = Math.cos(a), sa = Math.sin(a);
      nor.setXYZ(i, nx1 * ca + nz * sa, ny1, -nx1 * sa + nz * ca);
    }
  }
  pos.needsUpdate = true;
  if (nor) nor.needsUpdate = true;
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/* How far a flat span may sit inside the wall's curve, in world units. */
const SAG_LIMIT = 0.0015;

/* Halve every triangle along its longest edge until no edge is longer than `maxLen`. Every attribute
   is interpolated at the new midpoint, so position, normal and uv stay consistent. Returns a new
   geometry; the source is not touched.

   ⚠️ NOTHING TO SPLIT → A PLAIN CLONE. This runs every time Turn moves, and a swept rope is thousands of
   small triangles that never need splitting — turning them all into arrays and back on each tick would
   make the slider stutter for no change at all. One pass over the positions decides. */
function subdivideLongEdges(geometry, maxLen, maxTriangles = 400000) {
  const max2 = maxLen * maxLen;
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = flat.attributes.position.array;
  const long = (i, j) => (p[i] - p[j]) ** 2 + (p[i + 1] - p[j + 1]) ** 2 + (p[i + 2] - p[j + 2]) ** 2 > max2;
  let anyLong = false;
  for (let t = 0; t < p.length && !anyLong; t += 9) anyLong = long(t, t + 3) || long(t + 3, t + 6) || long(t + 6, t);
  if (!anyLong) { if (flat !== geometry) flat.dispose(); return geometry.clone(); }

  // A vertex is every attribute's components laid end to end, position first so edges measure it.
  const names = ['position', ...Object.keys(flat.attributes).filter(n => n !== 'position')];
  const attrs = names.map(n => flat.attributes[n]);
  const vertex = i => attrs.flatMap(a => Array.from(a.array.subarray(i * a.itemSize, (i + 1) * a.itemSize)));
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  const stack = [];
  for (let i = 0; i < flat.attributes.position.count; i += 3) stack.push([vertex(i), vertex(i + 1), vertex(i + 2)]);
  const done = [];
  while (stack.length) {
    const t = stack.pop();
    const e = [d2(t[0], t[1]), d2(t[1], t[2]), d2(t[2], t[0])];
    const k = e.indexOf(Math.max(...e));
    if (e[k] <= max2 || done.length + stack.length > maxTriangles) { done.push(t); continue; }
    const a = t[k], b = t[(k + 1) % 3], c = t[(k + 2) % 3];
    const m = a.map((x, n) => (x + b[n]) / 2);
    stack.push([a, m, c], [m, b, c]);
  }

  const out = new BufferGeometry();
  let offset = 0;
  attrs.forEach((a, ai) => {
    const arr = new Float32Array(done.length * 3 * a.itemSize);
    let w = 0;
    for (const tri of done) for (const v of tri) for (let k = 0; k < a.itemSize; k++) arr[w++] = v[offset + k];
    out.setAttribute(names[ai], new Float32BufferAttribute(arr, a.itemSize));
    offset += a.itemSize;
  });
  if (flat !== geometry) flat.dispose();
  return out;
}
