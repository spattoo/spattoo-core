import * as THREE from 'three';
import { PIPING_FRONT_ANGLE } from '../constants.js';

// ── Bend a straight strip GLB into U-shaped festoons (swags) around the cake ──
// A "strip" element (e.g. a rope/braid) is bent so its LENGTH follows the wall and its belly hangs
// into a U — the classic draped swag border. One strip = one festoon.
// This is the EXACT math the admin Piping Calibrator previews with (bakeStrip /
// bendOneFestoon / buildFestoons), kept in sync so the cake matches what was tuned there. (The
// calibrator only ever previews a ROUND tier, so it keeps the circle form of the curve below.)
//
// ── THE WALL IS A PERIMETER, NOT A CIRCLE ───────────────────────────────────────────────────────
// This used to bend the strip around `cos(th)*R, sin(th)*R` — a circle, and nothing else. A sheet
// cake was excluded at the call site (`shape?.kind === 'rect'` → no festoons) and then fell through
// to the ordinary shell renderer, which repeats a piece at every perimeter point FACING OUTWARD.
// For a rosette that is right; for a 30cm ribbon it means the ribbon points straight out of the
// cake. That was the reported bug: garland spikes radiating off a sheet cake.
//
// Worse, that guard asked for `rect`, so a HEART or a number cake — `kind: 'outline'` / `'glyph'` —
// was NOT excluded and got a full circle of swags at the bounding radius, hanging in mid-air off
// the real shape. surface.js:75 warns about this exact mistake in so many words.
//
// So the curve now walks a PERIMETER (the same abstraction buildWrapBand below already uses), and
// a circle is simply the perimeter a round cake has. One path, every shape.

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

const TWO_PI = Math.PI * 2;

// ── Where the wall turns a corner ───────────────────────────────────────────────────────────────
// A swag must not drape ACROSS a corner. A garland is attached AT the corners and hangs along each
// face between them; a swag whose belly sags over a square corner reads as a mistake, which is what
// "it should not look odd" rules out. So the wall is CUT at its corners and each run filled on its
// own.
//
// A corner is measured against the shape's OWN average turn, never an absolute angle. A circle also
// turns a full 360° — just evenly — so any fixed threshold either finds four corners on a small
// circle or none on a gently rounded rectangle. What distinguishes a corner is that the turning is
// CONCENTRATED: the wall swings `sharpness`× faster there than a circle of the same perimeter would.
// That single rule gives a round cake no breaks at all (one closed run — precisely the behaviour
// that existed before corners were a concept), a sheet cake four, and a heart its point and cleft.
//
// Returned as arc-length positions along `perim`, ascending.
export function perimeterBreaks(perim, { sharpness = 4, samples = 720 } = {}) {
  const L = perim.length;
  if (!(L > 0)) return [];
  const ang = [];
  for (let i = 0; i < samples; i++) {
    const p = perim.at((i / samples) * L);
    ang.push(Math.atan2(p.nz, p.nx));
  }
  const limit = (TWO_PI / samples) * sharpness;        // a circle turns exactly 2π/samples per step
  const hot = ang.map((a, i) => {
    let d = ang[(i + 1) % samples] - a;
    while (d >  Math.PI) d -= TWO_PI;
    while (d < -Math.PI) d += TWO_PI;
    return Math.abs(d) > limit;
  });
  // All cool → a circle. All hot → a shape so uniformly sharp there is no corner to speak of
  // (a many-sided polygon read at this sample rate); both mean "one continuous run".
  if (!hot.some(Boolean) || hot.every(Boolean)) return [];

  // Group runs of consecutive hot samples into ONE corner each — a sharp corner spikes a single
  // step, a rounded one spreads over the whole fillet — and break at the middle of the group. The
  // walk starts from a cool sample so a corner sitting on the seam is not split into two.
  let s = 0; while (hot[s]) s++;
  const out = [];
  let start = null;
  for (let k = 0; k <= samples; k++) {
    const live = k < samples && hot[(s + k) % samples];
    if (live) { if (start === null) start = k; }
    else if (start !== null) {
      // +0.5: for a sharp corner the turn happens BETWEEN sample i and i+1, so the corner itself
      // sits half a step past the last hot sample.
      out.push((((s + (start + k - 1) / 2 + 0.5) % samples) / samples) * L);
      start = null;
    }
  }
  return out.sort((a, b) => a - b);
}

// The wall between two corners (or the whole closed loop when there are none), cut into whole
// festoons. `pitch` is what one swag OCCUPIES; `spanLen` the arc it actually covers, the rest being
// the gap `spread` leaves.
//
// ── COUNT IS A LENGTH ───────────────────────────────────────────────────────────────────────────
// The authored festoon count was tuned on a round tier, which makes it a disguised measurement: how
// much wall one swag should cover. So it is converted to a length once (`calibSpan`) and it is the
// LENGTH that travels. On a circle this hands back exactly the authored count and nothing moves. On
// a longer wall it lays down MORE swags at the tuned size instead of the same few stretched to fit —
// which is what keeps a sheet cake's garland from ballooning past the cake it hangs on.
//
// ── HOW MANY, EXACTLY ───────────────────────────────────────────────────────────────────────────
// Whole swags rarely divide a run exactly, so one of two counts has to be picked and the swags
// stretched or squeezed to close the gap. Rounding the COUNT is the obvious move and the wrong one:
// a run of 1.38 calibrated spans rounds to 1, which stretches that single swag by 38% — while two
// swags would only have squeezed them by 31%. The count is not what the eye judges; the SIZE is.
//
// So both candidates are scored on how far their pitch lands from the calibrated one, as a RATIO
// (scale-symmetric — 1.4× too long and 1.4× too short are equally wrong, which is not what an
// absolute difference says). Choosing the better of the two caps the error at the geometric
// crossover: a swag can never be stretched past √2 or squeezed below 1/√2 of the size it was tuned
// at, whatever the wall measures. That bound is the guarantee, not a happy accident of the numbers.
function fitRun({ start, len, closed }, calibSpan, spread, frontS) {
  const raw = len / calibSpan;
  const lo = Math.max(1, Math.floor(raw)), hi = Math.max(1, Math.ceil(raw));
  const off = m => { const r = (len / m) / calibSpan; return r >= 1 ? r : 1 / r; };
  const m = off(hi) < off(lo) ? hi : lo;
  const pitch = len / m;
  return Array.from({ length: m }, (_, k) => ({
    // A closed run is phase-anchored to the cake FRONT, so the first swag is centred there exactly
    // as it was before any of this. An open run is centred WITHIN the run instead — its ends are
    // the corners, and that is where the joins belong.
    s0: closed ? frontS + k * pitch : start + (k + 0.5) * pitch,
    spanLen: pitch * spread,
    pitch,
  }));
}

// Bend ONE strip into a single festoon centred at arc-length `s0` along `perim`, covering
// `spanLen` of wall. `depth` = how far the belly hangs below the attachment ends (cake units).
// `tilt` (radians) rolls the strip about its length so it leans into a draped look. `outset`
// pushes it proud of the wall on top of its own half-thickness.
//
// `cScale` (cross-section) is passed in rather than derived from `spanLen`, and that separation is
// the second half of the sizing fix. They used to be the same number, so a swag squeezed into a
// short run came out THINNER as well as shorter, and a stretched one came out fatter — a garland
// that changed weight from face to face. Now the rope keeps the thickness it was calibrated at and
// only its LENGTH flexes to the run. Its reach off the wall is therefore constant too, which is
// what stops it projecting past the cake.
function bendOneFestoon(srcGeo, { perim, s0, spanLen, cScale, depth, attachY, tilt = 0, outset = 0 }) {
  const g = srcGeo.clone();
  g.computeBoundingBox();
  const bb = g.boundingBox, min = bb.min.clone(), size = new THREE.Vector3(); bb.getSize(size);
  const ax = ['x', 'y', 'z'];
  const lenAxis = ax.reduce((a, b) => (size[b] > size[a] ? b : a), 'x'); // longest = strip length
  const cross = ax.filter(a => a !== lenAxis);
  const L = size[lenAxis];
  const outAxis = size[cross[0]] >= size[cross[1]] ? cross[0] : cross[1]; // bump axis (sticks out)
  const widthAxis = outAxis === cross[0] ? cross[1] : cross[0];
  const cOut = min[outAxis] + size[outAxis] / 2, cW = min[widthAxis] + size[widthAxis] / 2;
  const outHalf = (size[outAxis] / 2) * cScale;
  const off = outHalf + outset;                                          // sit proud of the wall
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const pos = g.attributes.position, v = new THREE.Vector3();
  const curve = t => {
    const P = perim.at(s0 + (t - 0.5) * spanLen);
    const cy = attachY - depth * (1 - Math.pow(2 * t - 1, 2));           // U: belly at t=0.5
    return { p: new THREE.Vector3(P.x + P.nx * off, cy, P.z + P.nz * off), nx: P.nx, nz: P.nz };
  };
  for (let i = 0; i < pos.count; i++) {
    const comp = { x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) };
    const t = (comp[lenAxis] - min[lenAxis]) / L;
    const oOut = (comp[outAxis] - cOut) * cScale, oW = (comp[widthAxis] - cW) * cScale;
    const cur = curve(t), nxt = curve(Math.min(1, t + 1e-3)), prv = curve(Math.max(0, t - 1e-3));
    const T = new THREE.Vector3().subVectors(nxt.p, prv.p).normalize();      // tangent along the U
    const Rhat0 = new THREE.Vector3(cur.nx, 0, cur.nz);                      // wall normal (bumps out)
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

// Build every festoon along the wall. `perims` is one perimeter per closed contour (a round or
// sheet cake has one; a two-digit number cake has one per digit, so no swag ever bridges the gap
// between them). `radius` is the tier radius — the calibration scale only, not a position.
// `spread` 1.0 tiles them edge-to-edge into one continuous garland; <1 (default 0.96) leaves a
// small gap between separate swags — and at a corner, that gap is the join.
// Returns an array of bent geometries — render each as its own mesh in the ring's colour.
export function buildFestoons(scene, {
  flip = false, festoons = 6, depth = 0.4, attachY = 0,
  perims = null, radius = 1.2, spread = 0.96, tilt = 0, sizeFactor = 1, outset = 0,
}) {
  const src = bakeStrip(scene, flip);
  if (!src || !perims?.length) return [];
  const n = Math.max(1, Math.round(festoons));
  const calibSpan = (TWO_PI * radius) / n;         // wall covered by ONE swag, as tuned on a round tier
  // The strip's own length, so the calibrated span can be turned into a cross-section scale that no
  // longer depends on how far this particular swag happens to be stretched.
  src.computeBoundingBox();
  const sSize = new THREE.Vector3(); src.boundingBox.getSize(sSize);
  const stripL = Math.max(sSize.x, sSize.y, sSize.z) || 1;
  const cScale = ((calibSpan * spread) / stripL) * sizeFactor;
  const out = [];
  for (const perim of perims) {
    if (!(perim?.length > 0)) continue;
    const breaks = perimeterBreaks(perim);
    const runs = breaks.length
      ? breaks.map((b, i) => ({
          start: b,
          len: (((breaks[(i + 1) % breaks.length] - b) % perim.length) + perim.length) % perim.length || perim.length,
          closed: false,
        }))
      : [{ start: 0, len: perim.length, closed: true }];
    // s=0 on a circle sits at +X; the front is a quarter turn round from there (PIPING_FRONT_ANGLE).
    const frontS = perim.length * (PIPING_FRONT_ANGLE / TWO_PI);
    for (const run of runs) {
      for (const f of fitRun(run, calibSpan, spread, frontS)) {
        out.push(bendOneFestoon(src, { perim, s0: f.s0, spanLen: f.spanLen, cScale, depth, attachY, tilt, outset }));
      }
    }
  }
  return out;
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
