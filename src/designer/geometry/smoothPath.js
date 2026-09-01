// ── Rounding a drawn stroke ──────────────────────────────────────────────────────────────────────
//
// The other tidy-ups in this codebase all SHARPEN: `snapPolygon` puts a wobbly triangle onto its
// corners, `snapStroke` makes a near-circle a circle and a near-straight run a line. A baker who
// wants the opposite — the corners of a hand-drawn leaf softened rather than crisped — had nothing,
// and no amount of ticking "auto-correct" was going to give it to them.
//
// ⚠️ CRISP AND SOFT ARE OPPOSITE INTENTS, which is why this is a separate function and, in the UI, a
// separate choice rather than a second checkbox. One control cannot mean both.
//
// Chaikin's corner cutting: replace every corner with two points a quarter and three quarters along
// its edges. Each pass halves the sharpness and keeps the shape, which is exactly what "soften" means
// to a hand — not a spline through the points, which would also move the line where it was already
// smooth.

const QUARTER = 0.25;

/**
 * points  [[x, y], …]
 * passes  how many times to cut the corners. Two is a gentle round; four is soft rope.
 * closed  a ring cuts its last corner too, or the join stays sharp while every other corner softens
 */
export function smoothPath(points, { passes = 2, closed = false } = {}) {
  let pts = (points ?? []).filter(p => Array.isArray(p) && p.length === 2);
  if (pts.length < 3) return pts.slice();

  for (let n = 0; n < Math.max(0, passes); n++) {
    const out = [];
    /* ⚠️ THE ENDS OF AN OPEN STROKE ARE PINNED. Cutting them too walks the whole line inwards a
       little on every pass, so a swirl piped to a point loses its point and a letter shrinks away
       from where it was drawn. A ring has no ends, so it is cut all the way round. */
    if (!closed) out.push(pts[0]);

    const last = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < last; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push(
        [a[0] + (b[0] - a[0]) * QUARTER, a[1] + (b[1] - a[1]) * QUARTER],
        [a[0] + (b[0] - a[0]) * (1 - QUARTER), a[1] + (b[1] - a[1]) * (1 - QUARTER)],
      );
    }

    if (!closed) out.push(pts[pts.length - 1]);
    else out.push([...out[0]]);            // keep it closed for the ring maths downstream
    pts = out;
  }
  return pts;
}
