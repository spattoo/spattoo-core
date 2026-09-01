// ── Straightening a hand-drawn polygon ───────────────────────────────────────────────────────────
//
// `strokeSnap.js` tidies a near-circle into a circle and a near-straight run into a straight line,
// which is the whole of what "auto-correct" meant until now. A hand-drawn TRIANGLE is neither, so it
// was left exactly as drawn — the correction was on, and nothing happened, which is worse than
// having no correction at all because it says the tool tried.
//
// ⚠️ A POLYGON IS ITS CORNERS. Everything between two corners is a straight edge a hand failed to
// draw straight, so the fix is to find the corners and join them — not to smooth, which keeps every
// wobble and merely blurs it.
//
// ⚠️ CORNERS ARE FOUND BY HOW FAR THE LINE DEVIATES, not by angle between neighbouring points. A
// hand-drawn line is noisy at the scale of a few points, so a local angle test finds a corner every
// few millimetres; deviation from the chord is what a person actually sees as a corner.
//
// ⚠️ AND IT MUST REFUSE. A scribble, a letter, a swirl — most of what gets piped — has no corners to
// find, and forcing edges onto one turns a signature into a scrawl of triangles. Anything that does
// not reduce to a small number of corners is returned untouched.

const MIN_CORNERS = 3;
const MAX_CORNERS = 8;      // above this it is a curve being described by points, not a polygon
const TOLERANCE = 0.035;    // of the shape's diagonal — how far off the chord a point must sit

/**
 * points  [[x, y], …] — a CLOSED ring (last point repeats the first) or a closed-enough loop
 *
 * Returns `{ points, corners }` with straight edges between the corners found, or `null` when this
 * is not a polygon — which is the common case and must stay cheap and silent.
 */
export function snapPolygon(points, { tolerance = TOLERANCE } = {}) {
  if (!Array.isArray(points) || points.length < 8) return null;

  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (diag <= 0) return null;

  const eps = diag * tolerance;
  const closed = dist(points[0], points[points.length - 1]) <= eps;
  if (!closed) return null;                 // an open stroke is a line or a letter, not a polygon

  /* Ramer–Douglas–Peucker over the ring. Run on the open run first, then the first point is added
     back as the closing corner — running it on a ring directly has no fixed endpoints to anchor it
     and the result depends on where the hand happened to start. */
  const open = points.slice(0, -1);
  const kept = simplify(open, eps);
  if (kept.length < MIN_CORNERS || kept.length > MAX_CORNERS) return null;

  /* ⚠️ EDGES THAT SURVIVE ARE THE ONES A PERSON MEANT. A corner detected across a very short run is
     usually a hand tremor at a real corner rather than a corner of its own, and dropping those is
     what turns a wobbly triangle into a triangle instead of into a pentagon. */
  /* ⚠️ A CORNER IS A CHANGE OF DIRECTION, and that has to be tested separately from how far a point
     sits off the chord. A hand wobbling 7 units either side of a straight edge puts points further
     off the chord than the tolerance allows, so the split test alone reported a fifth "corner" in
     the middle of a square's bottom edge — a spike, not a turn. Anything that barely turns is on a
     straight edge whatever its deviation. */
  const merged = dropStraightCorners(dropShortEdges(kept, diag * 0.08));
  if (merged.length < MIN_CORNERS) return null;

  return { points: [...merged, merged[0]], corners: merged.length };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Perpendicular distance from p to the line through a and b — the "how far off the chord" measure.
function offChord(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return dist(p, a);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}

function simplify(pts, eps) {
  if (pts.length < 3) return pts.slice();
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = offChord(pts[i], pts[0], pts[pts.length - 1]);
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= eps) return [pts[0], pts[pts.length - 1]];
  return [
    ...simplify(pts.slice(0, at + 1), eps).slice(0, -1),
    ...simplify(pts.slice(at), eps),
  ];
}

/* ⚠️ SET FROM MEASUREMENT, NOT FROM TASTE. On a hand-drawn square the real corners turn 64–91° and
 * the worst wobble spike on a straight edge turns 28°, so the line goes between them at 40°. Chosen
 * at 24° first, which is below the noise and let the spike through as a fifth corner. The ceiling
 * that matters is a regular octagon — 45° per corner — which still survives, and eight corners is
 * already the most this is willing to call a polygon. */
const MIN_TURN = 0.70;      // radians, 40°

function dropStraightCorners(pts) {
  if (pts.length <= MIN_CORNERS) return pts;
  // Drop the straightest one at a time, since removing a corner changes its neighbours' angles.
  const out = pts.slice();
  for (;;) {
    if (out.length <= MIN_CORNERS) break;
    let flattest = 0, at = -1;
    for (let i = 0; i < out.length; i++) {
      const t = turnOf(out, i);
      if (t < MIN_TURN && (at === -1 || t < flattest)) { flattest = t; at = i; }
    }
    if (at === -1) break;
    out.splice(at, 1);
  }
  return out;
}

function turnOf(pts, i) {
  const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
  const d = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
}

function dropShortEdges(pts, min) {
  const out = [];
  for (const p of pts) {
    if (out.length && dist(out[out.length - 1], p) < min) continue;
    out.push(p);
  }
  // The closing edge counts too: a corner sitting almost on the first one is the same corner.
  while (out.length > MIN_CORNERS && dist(out[0], out[out.length - 1]) < min) out.pop();
  return out;
}
