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

// A heart: the classic parametric curve. `plump` fattens the lobes, `cleft` deepens the valley between
// them — the two things that actually distinguish one baker's heart tin from another.
//
// The POINT faces the front of the cake (+Z, toward the viewer) and the lobes sit at the back, which is
// how a heart cake is served and photographed. The raw curve is the other way up, hence the negated z.
//
// The valley is then ROUNDED (relaxCusps). On paper the curve's cleft is a cusp — a zero-width notch
// where the two lobes meet at a point — and a cusp has no inward direction, so the rolled rim's offset
// crossed over itself there and left an X-shaped pinch on the cake. Real heart tins have a rounded
// valley anyway; a cusp is a property of the equation, not of any cake anyone has baked.
function heartOutline({ plump = 1, cleft = 1, tip: tipR = 0.12 } = {}) {
  // How a heart TIN is actually made: two round lobes at the back, two straight sides running forward to
  // a point, and a shallow valley where the lobes meet. (The textbook heart *equation* is a different
  // animal — its lobes balloon and its cleft plunges to a cusp, which is what made the last one read as
  // two blobs stuck together rather than a cake.)
  const r = 0.58 * plump;                 // lobe radius
  const bz = -0.30;                       // lobes sit at the BACK (−Z); the point faces the front (+Z)
  // Half-gap between the lobe centres. The lobes OVERLAP, and the valley is where they cross — so a
  // wider gap cuts the notch deeper (centres almost touching leaves barely any notch at all).
  const c = r * Math.max(0.15, Math.min(0.97, 0.72 * cleft));
  const tip = { x: 0, z: 1.15 };

  // Where a straight side leaves the lobe: the tangent from the tip to the circle. Anything else would
  // either cut the lobe or leave a kink where the side meets it.
  const C = { x: c, z: bz };
  const dx = tip.x - C.x, dz = tip.z - C.z;
  const d = Math.hypot(dx, dz);
  const beta = Math.acos(Math.min(1, r / d));
  const phi = Math.atan2(dz, dx);
  const tanAng = phi - beta;              // the OUTER tangent — the one on the lobe's own side

  // The valley: where the two overlapping lobes cross. They cross TWICE — the front crossing is buried
  // inside the cake where the lobes merge into the body; it is the BACK one that is the notch you can
  // see between the humps. Taking the front one ran each lobe's arc straight through the other and left
  // a lens-shaped hole through the middle of the heart.
  const valleyZ = bz - Math.sqrt(Math.max(0, r * r - c * c));
  const valleyAng = Math.atan2(valleyZ - bz, -c);               // that crossing, as an angle on the right lobe

  const pts = [];
  const ARC = 46, SIDE = 26, TIP = 12;

  const T = { x: C.x + r * Math.cos(tanAng), z: C.z + r * Math.sin(tanAng) };

  // ── The point, rounded ──────────────────────────────────────────────────────
  // Where the two straight sides meet is a knife edge, and no cake has one — a tin's point carries a
  // radius, and a sharp vertical crease is the first thing that reads as "computer". So the apex is a
  // fillet arc tangent to both sides: cut back `L` along each side and swing an arc of radius `tipR`.
  const sx = T.x - tip.x, sz = T.z - tip.z;
  const sl = Math.hypot(sx, sz) || 1;
  const d1 = { x: sx / sl, z: sz / sl };                  // tip → right side
  const bis = { x: 0, z: -1 };                           // the bisector points back into the cake
  const theta = Math.acos(Math.max(-1, Math.min(1, -d1.z)));   // half-angle between the two sides
  const R = Math.max(0, Math.min(tipR, sl * 0.6));
  const A = { x: tip.x + d1.x * (R / Math.tan(theta)), z: tip.z + d1.z * (R / Math.tan(theta)) };
  const O = { x: tip.x + bis.x * (R / Math.sin(theta)), z: tip.z + bis.z * (R / Math.sin(theta)) };
  const M = { x: O.x - bis.x * R, z: O.z - bis.z * R };  // the arc's foremost point, on the centre line

  if (R > 1e-4) {
    const aM = Math.atan2(M.z - O.z, M.x - O.x);
    let aA = Math.atan2(A.z - O.z, A.x - O.x);
    while (aA - aM > Math.PI) aA -= Math.PI * 2;
    while (aM - aA > Math.PI) aA += Math.PI * 2;
    for (let i = 0; i <= TIP; i++) {
      const a = aM + (aA - aM) * (i / TIP);
      pts.push({ x: O.x + R * Math.cos(a), z: O.z + R * Math.sin(a) });
    }
  } else {
    pts.push({ ...tip });
  }

  // Right side: from where the tip fillet leaves off, up to the tangent point.
  const start = pts[pts.length - 1];
  for (let i = 1; i < SIDE; i++) {
    const t = i / SIDE;
    pts.push({ x: start.x + (T.x - start.x) * t, z: start.z + (T.z - start.z) * t });
  }
  // Right lobe: tangent point, round the outside, to the valley.
  let a0 = tanAng, a1 = valleyAng;
  while (a1 > a0) a1 -= Math.PI * 2;                             // sweep the OUTER way (clockwise here)
  for (let i = 0; i <= ARC; i++) {
    const a = a0 + (a1 - a0) * (i / ARC);
    pts.push({ x: C.x + r * Math.cos(a), z: C.z + r * Math.sin(a) });
  }
  // The left half is the mirror, walked back out to the tip.
  const half = pts.length;
  for (let i = half - 1; i >= 1; i--) pts.push({ x: -pts[i].x, z: pts[i].z });

  return relaxCusps(pts, 3);              // soften the valley's corner — a tin has a radius there, not a crease
}

// Round off any vertex whose turn is too sharp to be a cake, by pulling it toward its neighbours. Only
// the offenders move, so the silhouette everywhere else is the curve as authored.
function relaxCusps(pts, passes = 6, maxTurnDeg = 60) {
  const n = pts.length;
  const cosLimit = Math.cos((maxTurnDeg * Math.PI) / 180);
  let cur = pts;
  for (let k = 0; k < passes; k++) {
    const next = cur.map((p, i) => {
      const a = cur[(i - 1 + n) % n], b = cur[(i + 1) % n];
      const ax = p.x - a.x, az = p.z - a.z;
      const bx = b.x - p.x, bz = b.z - p.z;
      const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
      const turn = (ax * bx + az * bz) / (la * lb);       // 1 = straight on, −1 = doubles back
      if (turn > cosLimit) return p;                       // gentle enough — leave it exactly as authored
      return { x: (a.x + b.x + p.x * 2) / 4, z: (a.z + b.z + p.z * 2) / 4 };
    });
    cur = next;
  }
  return cur;
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
//
// An outline is EITHER a single ring (`Point[]`) or a list of disjoint rings (`Point[][]`) — a
// multi-digit number cake is several separate glyph contours (a "10" is a "1" ring and a "0" ring),
// which must NEVER be joined into one loop (that bridges piping shells between the digits). `asRings`
// normalises both forms to a list so every op below treats one ring and many the same way; a
// single-ring shape (heart, polygon, single digit) is just a one-element list, so its output is
// byte-identical to before.
export const asRings = (outline) => (Array.isArray(outline?.[0]) ? outline : [outline]);

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

// Several disjoint rings as ONE arc-length perimeter, for the few uses that want a single scalar
// length or coordinate (wall-grain U, single-shell placement). Reuses polygonPerimeter per ring.
// Piping does NOT use this — it walks each ring on its own (see pipingPerimeters) so shells never
// bridge between contours.
export function multiPolygonPerimeter(rings) {
  const loops = rings.map(polygonPerimeter);
  const length = loops.reduce((t, l) => t + l.length, 0) || 1;
  return {
    length,
    at(s) {
      let d = ((s % length) + length) % length;
      for (const l of loops) { if (d <= l.length || l === loops[loops.length - 1]) return l.at(d); d -= l.length; }
      return loops[0].at(0);
    },
  };
}

// Is (x,z) inside the outline? Ray-casting (crossing number) — exact for any simple polygon, which a
// circle-radius test is not once the footprint has lobes or a cleft. Across multiple rings the
// crossings accumulate (even-odd), so disjoint digits test independently and a hole would subtract.
export function pointInPolygon(outline, x, z) {
  let inside = false;
  for (const pts of asRings(outline)) {
    for (let i = 0, n = pts.length, j = n - 1; i < n; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
  }
  return inside;
}

// Nearest point ON the outline to (x,z), with its outward normal — the general `snapToRim`. Scans
// every ring so a point snaps to whichever digit/contour is closest.
export function nearestOnPolygon(outline, x, z) {
  let best = null, bd = Infinity;
  for (const pts of asRings(outline)) {
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
  }
  return best;
}

// The outline scaled about the origin (the tier centre) — how an outline shape insets (a margin) or
// clamps (a fraction k). Uniform scaling is an approximation of a true polygon offset, but it is the
// RIGHT one here: it keeps the silhouette (a heart inset stays heart-shaped), which is what a baker
// means by "keep the decoration a little in from the edge". Scaling about the shared origin also
// keeps a multi-digit number's digits in proportion. Preserves the input's ring/flat structure so
// the result feeds straight back into pointInPolygon / nearestOnPolygon.
export function scalePolygon(outline, k) {
  const scale = (ring) => ring.map(p => ({ x: p.x * k, z: p.z * k }));
  return Array.isArray(outline?.[0]) ? outline.map(scale) : scale(outline);
}

// Largest distance from centre — the "bounding radius" incidental code (board size, camera framing,
// topper scale) still wants. Across rings it's the farthest point of any contour.
export function polygonRadius(outline) {
  let r = 0;
  for (const pts of asRings(outline)) for (const p of pts) r = Math.max(r, Math.hypot(p.x, p.z));
  return r;
}
