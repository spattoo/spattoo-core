import * as THREE from 'three';

// ── Tidying a hand-drawn piping line ─────────────────────────────────────────────────────────────
//
// Nobody draws a clean border with a mouse. A run round the rim comes out as a wobbling arc, and the
// wobble is the difference between "a piped cake" and "somebody dragged a mouse". A real baker's
// hand is steadied by the turntable and the cake's own edge; this is the equivalent.
//
// It fits the SHAPE THE CUSTOMER WAS AIMING AT and redraws the stroke on it. Only two shapes,
// because those are the two a cake actually wants:
//
//   • a CIRCLE about the cake's own axis — a border round a rim, the case that is hardest by hand
//     and most obviously wrong when it is off
//   • a STRAIGHT line — everything else: a bar across the top, a level band round the wall
//
// It never invents a shape it is not fairly sure of. A deliberate squiggle, a heart, a name — those
// fit neither and come back untouched. Guessing wrong here destroys work, so the bar is high and the
// fallback is always "leave it exactly as drawn".
//
// ── THE TWO SURFACES ARE DIFFERENT PROBLEMS ─────────────────────────────────────────────────────
// On the cake TOP the surface is a plane, so a line is a line and a circle is a circle, both in XZ.
//
// On the WALL it is a cylinder, and a "straight" line there is not straight in space — a level band
// round the side is a circle, and it must stay ON the wall or it cuts through the cake. So wall
// strokes are unrolled to (arc-length, height) first, straightened there, and rolled back. A level
// band, a vertical drop and a neat diagonal all fall out of one straight-line fit.

const EPS = 1e-9;

// Cheap total-least-squares line fit through 2D points. Returns the fitted direction and centroid
// plus the RMS distance off it, which is what decides whether the customer meant a line at all.
function fitLine(pts) {
  const n = pts.length;
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= n; cy /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) {
    const dx = x - cx, dy = y - cy;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  // Principal axis of the scatter matrix — the direction that leaves the least off it.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(theta), uy = Math.sin(theta);
  let sq = 0;
  for (const [x, y] of pts) {
    const dx = x - cx, dy = y - cy;
    const off = dx * -uy + dy * ux;         // component perpendicular to the axis
    sq += off * off;
  }
  return { cx, cy, ux, uy, rms: Math.sqrt(sq / n) };
}

// Kåsa's algebraic circle fit: linear least squares on x²+y² = 2ax + 2by + c. Fast, no iteration,
// and plenty for deciding "was this meant to be round".
function fitCircle(pts) {
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    sz += z; sxz += x * z; syz += y * z;
  }
  const a11 = 2 * (sxx - sx * sx / n), a12 = 2 * (sxy - sx * sy / n), a22 = 2 * (syy - sy * sy / n);
  const b1 = sxz - sx * sz / n, b2 = syz - sy * sz / n;
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < EPS) return null;               // collinear — there is no circle
  const cx = (b1 * a22 - b2 * a12) / det;
  const cy = (a11 * b2 - a12 * b1) / det;
  let sr = 0;
  for (const [x, y] of pts) sr += Math.hypot(x - cx, y - cy);
  const r = sr / n;
  if (!(r > EPS)) return null;
  let sq = 0;
  for (const [x, y] of pts) { const d = Math.hypot(x - cx, y - cy) - r; sq += d * d; }
  return { cx, cy, r, rms: Math.sqrt(sq / n) };
}

// Total length of a 2D polyline — the scale everything else is judged against, so the thresholds
// below are proportions rather than cake units and hold at any size.
function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

// Evenly spaced angles from a to b, going the short way round unless the sweep says otherwise.
function resampleArc(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = a0 + (a1 - a0) * (i / (n - 1));
    out.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return out;
}

/**
 * Straighten a drawn stroke, or leave it alone.
 *
 * @param points  [[x,y,z], …] seated centerline, as the pen captured it
 * @param opts.normal   the surface normal the stroke was drawn against
 * @param opts.axis     the cake's centre in world XZ, for snapping a rim border true
 * @returns { points, shape } — shape is 'circle' | 'line' | null (null = untouched)
 */
export function snapStroke(points, { normal = [0, 1, 0], axis = [0, 0] } = {}) {
  // Too few to have meant anything, or a tap.
  if (!Array.isArray(points) || points.length < 6) return { points, shape: null };

  const n = new THREE.Vector3().fromArray(normal);
  if (n.lengthSq() < EPS) n.set(0, 1, 0);
  n.normalize();
  const upright = Math.abs(n.y) > 0.7;           // a top or a board, versus a wall

  return upright
    ? snapOnFlat(points, axis)
    : snapOnWall(points, axis);
}

// ── The cake top (or the board): an honest plane ─────────────────────────────────────────────────
function snapOnFlat(points, axis) {
  const flat = points.map(p => [p[0], p[2]]);            // XZ
  const meanY = points.reduce((s, p) => s + p[1], 0) / points.length;
  const L = polyLength(flat);
  if (L < EPS) return { points, shape: null };

  const line = fitLine(flat);
  const circ = fitCircle(flat);

  // ── A rim border, snapped TRUE ────────────────────────────────────────────────────────────────
  // The case worth getting right. If the fitted circle is roughly concentric with the cake, the
  // customer was going round the rim, and the honest answer is a circle on the cake's OWN axis — not
  // the slightly-off one their hand described. Anything else round stays where it was drawn.
  if (circ) {
    const offAxis = Math.hypot(circ.cx - axis[0], circ.cy - axis[1]);
    const concentric = offAxis < circ.r * 0.25;
    const cx = concentric ? axis[0] : circ.cx;
    const cy = concentric ? axis[1] : circ.cy;

    const ang = flat.map(([x, y]) => Math.atan2(y - cy, x - cx));
    // Unwrap so a sweep through ±π is one continuous run rather than a jump.
    let sweep = 0;
    for (let i = 1; i < ang.length; i++) {
      let d = ang[i] - ang[i - 1];
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      sweep += d;
    }
    const spans = Math.abs(sweep);
    // Round beats straight only with a real arc behind it (a shallow bow IS a line, and reading it
    // as a circle swings the stroke somewhere nobody asked for) and a clearly better fit.
    // Judged against the RADIUS, not the path length. Against length, a big shape gets a big
    // allowance and a heart — which is roughly round, and whose radius swings by half — passes as a
    // circle. Against the radius it is what it is: not round. This is the guard that decides whether
    // somebody's deliberate shape survives, so it is the strict one.
    const roundEnough = spans > 1.0 && circ.rms < line.rms * 0.6 && circ.rms < circ.r * 0.06;
    if (roundEnough) {
      const a0 = ang[0];
      const a1 = a0 + sweep;
      // Nearly all the way round closes it exactly — the join is the thing the eye finds.
      const closed = spans > Math.PI * 1.75;
      const end = closed ? a0 + Math.sign(sweep) * Math.PI * 2 : a1;
      const out = resampleArc(cx, cy, circ.r, a0, end, Math.max(points.length, 24))
        .map(([x, z]) => [+x.toFixed(4), +meanY.toFixed(4), +z.toFixed(4)]);
      return { points: out, shape: 'circle' };
    }
  }

  // A line, if it is convincingly one.
  if (line.rms < L * 0.035) {
    const proj = flat.map(([x, y]) => (x - line.cx) * line.ux + (y - line.cy) * line.uy);
    const lo = Math.min(...proj), hi = Math.max(...proj);
    const out = [];
    const N = Math.max(points.length, 12);
    for (let i = 0; i < N; i++) {
      const t = lo + (hi - lo) * (i / (N - 1));
      out.push([
        +(line.cx + line.ux * t).toFixed(4),
        +meanY.toFixed(4),
        +(line.cy + line.uy * t).toFixed(4),
      ]);
    }
    return { points: out, shape: 'line' };
  }

  return { points, shape: null };
}

// ── The wall: a cylinder, unrolled ───────────────────────────────────────────────────────────────
// Straightening in world space would drive the stroke through the cake. Unrolled to
// (arc-length round the tier, height) a level band, a vertical drop and a diagonal are all one
// straight-line fit, and rolling back keeps every point ON the wall at the radius it was drawn at.
function snapOnWall(points, axis) {
  const r = points.reduce((s, p) => s + Math.hypot(p[0] - axis[0], p[2] - axis[1]), 0) / points.length;
  if (r < EPS) return { points, shape: null };

  const raw = points.map(p => Math.atan2(p[2] - axis[1], p[0] - axis[0]));
  // Unwrapped, so a run past the back of the cake stays monotonic instead of folding.
  const ang = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    let d = raw[i] - raw[i - 1];
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    ang.push(ang[i - 1] + d);
  }
  const flat = points.map((p, i) => [ang[i] * r, p[1]]);   // arc-length across, height up
  const L = polyLength(flat);
  if (L < EPS) return { points, shape: null };

  const line = fitLine(flat);
  if (line.rms > L * 0.035) return { points, shape: null };

  const proj = flat.map(([x, y]) => (x - line.cx) * line.ux + (y - line.cy) * line.uy);
  const lo = Math.min(...proj), hi = Math.max(...proj);
  const out = [];
  const N = Math.max(points.length, 12);
  for (let i = 0; i < N; i++) {
    const t = lo + (hi - lo) * (i / (N - 1));
    const s = line.cx + line.ux * t;         // arc-length round the tier
    const y = line.cy + line.uy * t;
    const a = s / r;
    out.push([
      +(axis[0] + Math.cos(a) * r).toFixed(4),
      +y.toFixed(4),
      +(axis[1] + Math.sin(a) * r).toFixed(4),
    ]);
  }
  return { points: out, shape: 'line' };
}
