// ── Cake cross-section outlines ───────────────────────────────────────────────
// A cake's footprint is a CLOSED 2D OUTLINE, and every shape-dependent operation (mesh, perimeter,
// hit-test, clamping, seating) derives from it. That is the whole point: a new cake shape is then a
// new OUTLINE — data — not a new branch in the renderer.
//
// The prior model was a binary: `shape === 'rect' ? … : (round)`, decided at ~74 call sites. A third
// shape added there would have to be added at all of them, and would silently fall into the `else`
// (round) branch everywhere one was missed — a heart cake wrapped around a phantom cylinder. So the
// shapes below are NOT a third branch; they are the general case that round and rect are special
// (analytic) instances of.
//
// FAMILY is the data↔code seam, exactly like `algorithm` in textSlots / cake_textures: a family KEY
// names a generator here, and its `config` (proportions, lobes, corner radius…) is pure data — a
// `cake_shapes` DB row, no deploy. A genuinely new outline needs a generator; tuning one does not.
//
// Conventions, shared by every generator:
//   • Points are returned NORMALISED to the box [-1,1]² (the extremes touch ±1 on both axes), so a
//     shape carries no size of its own — the tier's width/depth scale it. One outline serves every
//     cake size, and the size sliders work identically for every shape.
//   • The outline is CLOSED and wound counter-clockwise in the (x, z) plane, first point at the FRONT
//     (+Z) where possible — matching roundedRectPerimeter's s=0 convention, so "the front of the
//     cake" means the same thing for every shape.

// Resolution of the sampled polygon. High enough that a rim reads as smooth at cake scale, low enough
// that point-in-polygon and nearest-point stay cheap on the drag path (they are O(n) per call).
const SEGMENTS = 160;

// ── Family generators ─────────────────────────────────────────────────────────
// Each takes its config and returns raw (unnormalised) points; `outlineOf` normalises.

// A heart: the classic cardioid-ish parametric curve. `plump` fattens the lobes, `cleft` deepens the
// notch between them — the two things that actually distinguish one baker's heart tin from another.
function heartOutline({ plump = 1, cleft = 1 } = {}) {
  const pts = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const z = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push({ x: x * plump, z: z + (cleft - 1) * 3 * Math.max(0, Math.cos(t)) });
  }
  return pts;
}

// A butterfly: four wing lobes on the diagonals, the front pair a little larger than the hind pair,
// around a body that keeps the waist from pinching shut. `wing` spreads the wings sideways.
//
// NOT the textbook "butterfly curve" (r = e^sin t − 2cos4t + …): that is a decorative curve with LOOPS,
// so it self-intersects, and an extruded self-intersecting polygon is a mess of fins — which is exactly
// what it rendered as. A cake footprint must be a SIMPLE closed curve; r(θ) > 0 everywhere guarantees it.
function butterflyOutline({ wing = 1 } = {}) {
  const pts = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI * 2;
    const lobes = Math.abs(Math.sin(2 * t)) ** 0.75;      // four lobes, on the diagonals
    const front = 1 + 0.3 * Math.sin(t);                  // front wings larger than the hind wings
    const body  = 0.36 + 0.12 * Math.abs(Math.cos(t));    // the waist never closes to zero
    const r = body + 0.8 * lobes * front;
    pts.push({ x: Math.cos(t) * r * wing, z: Math.sin(t) * r });
  }
  return pts;
}

// A regular polygon (hexagon, octagon…) — `sides` is the only knob, so one generator covers them all.
function polygonOutline({ sides = 6, rotation = 0 } = {}) {
  const n = Math.max(3, Math.round(sides));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rotation * Math.PI) / 180;
    pts.push({ x: Math.sin(a), z: Math.cos(a) });
  }
  return pts;
}

// An ellipse/oval — a circle the tier's width/depth stretch. (A true circle is the analytic `round`
// kind and never comes through here; this exists for ovals authored with their own aspect.)
function ovalOutline() {
  const pts = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    pts.push({ x: Math.sin(a), z: Math.cos(a) });
  }
  return pts;
}

// The seam. A family KEY resolves to a generator; the two analytic families (`circle`, `rounded_rect`)
// are NOT here — they keep their exact existing math in surface.js, so no existing cake can regress.
export const OUTLINE_FAMILIES = Object.freeze({
  heart: heartOutline,
  butterfly: butterflyOutline,
  polygon: polygonOutline,
  oval: ovalOutline,
});

// ── The outline ───────────────────────────────────────────────────────────────
// Generate → normalise to [-1,1]² → force CCW winding. Cached: the drag path asks for the same
// outline every frame, and re-sampling 160 points of trigonometry per frame is pure waste.
const _cache = new Map();

export function outlineOf(family, config) {
  const gen = OUTLINE_FAMILIES[family];
  if (!gen) return null;
  const ck = `${family}|${JSON.stringify(config ?? {})}`;
  if (_cache.has(ck)) return _cache.get(ck);

  const raw = gen(config || {});
  // Normalise about the CENTRE of the bounding box (not the centroid): the cake's origin must be the
  // middle of its footprint, or every tier would stack off-centre.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of raw) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const sx = (maxX - minX) / 2 || 1, sz = (maxZ - minZ) / 2 || 1;
  let pts = raw.map(p => ({ x: (p.x - cx) / sx, z: (p.z - cz) / sz }));
  if (signedArea(pts) < 0) pts = pts.reverse();     // CCW, so segment normals point outward
  Object.freeze(pts);
  _cache.set(ck, pts);
  return pts;
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

// The outline scaled to a tier's footprint. Width is the X extent, depth the Z extent — the same two
// numbers a rect tier already carries, so the size sliders are shape-agnostic.
export function scaledOutline(family, config, halfW, halfD) {
  const unit = outlineOf(family, config);
  if (!unit) return null;
  return unit.map(p => ({ x: p.x * halfW, z: p.z * halfD }));
}

// ── Generic polygon operations ────────────────────────────────────────────────
// These are what let placement/piping/hit-testing stop caring what shape a cake is.

// Arc-length parameterisation with OUTWARD unit normals — the same { length, at(s) } interface
// circlePerimeter and roundedRectPerimeter expose, so every consumer of `perimeter(shape)` already
// speaks it. (n̂ is the segment's right-hand perpendicular; CCW winding makes that point outward.)
export function polygonPerimeter(pts) {
  const n = pts.length;
  const segs = [];
  let length = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) continue;
    segs.push({ a, dx, dz, len, nx: dz / len, nz: -dx / len, s0: length });
    length += len;
  }
  return {
    length,
    at(s) {
      const d = ((s % length) + length) % length;
      // Segments are in arc-length order, so a binary search finds the one containing d.
      let lo = 0, hi = segs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (segs[mid].s0 <= d) lo = mid; else hi = mid - 1;
      }
      const g = segs[lo];
      const u = (d - g.s0) / g.len;
      return { x: g.a.x + g.dx * u, z: g.a.z + g.dz * u, nx: g.nx, nz: g.nz };
    },
  };
}

// Is (x,z) inside the outline? Ray-casting (crossing number) — exact for any simple polygon, which a
// circle-radius test is not once the footprint has lobes or a cleft.
export function pointInPolygon(pts, x, z) {
  let inside = false;
  for (let i = 0, n = pts.length, j = n - 1; i < n; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// Nearest point ON the outline to (x,z), with its outward normal — the general `snapToRim`.
export function nearestOnPolygon(pts, x, z) {
  let best = null, bd = Infinity;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const t = len2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0;
    const px = a.x + dx * t, pz = a.z + dz * t;
    const dd = (px - x) ** 2 + (pz - z) ** 2;
    if (dd < bd) {
      bd = dd;
      const len = Math.sqrt(len2) || 1;
      best = { x: px, z: pz, nx: dz / len, nz: -dx / len };
    }
  }
  return best;
}

// The outline scaled about its own centre — how an outline shape insets (a margin) or clamps (a
// fraction k). Uniform scaling is an approximation of a true polygon offset, but it is the RIGHT one
// here: it keeps the silhouette (a heart inset stays heart-shaped), which is what a baker means by
// "keep the decoration a little in from the edge".
export function scalePolygon(pts, k) {
  return pts.map(p => ({ x: p.x * k, z: p.z * k }));
}

// Largest distance from centre — the "bounding radius" incidental code (board size, camera framing,
// topper scale) still wants.
export function polygonRadius(pts) {
  let r = 0;
  for (const p of pts) r = Math.max(r, Math.hypot(p.x, p.z));
  return r;
}
