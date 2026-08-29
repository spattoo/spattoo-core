import { simplify, signedArea } from './traceOutline.js';

// ── A freehand trail → something you can pipe ────────────────────────────────────────────────────
//
// The baker draws with a mouse or a fingertip. That trail is not yet usable: a pointer fires far
// faster than a hand moves, so it arrives as hundreds of near-identical points.
//
// ⚠️ THE STROKE IS NEVER CLOSED FOR THEM, and an earlier version of this got it badly wrong. It
// joined the two ends whatever the distance, on the theory that nobody hand-draws a loop landing
// exactly on its own start. True, and beside the point: **most of what gets piped is not a loop at
// all.** Bakers write letters, numbers, names, a treble clef, a swirl. Drawing an "8" and having a
// 97px chord slapped across it produces something the baker never drew and cannot use.
//
// So an open stroke stays open, and closure is DETECTED rather than imposed. Only a shape that
// actually closes can be filled, and even then only if asked.
//
// ⚠️ REUSES `simplify` FROM traceOutline.js rather than carrying its own Douglas–Peucker — that one
// already handles the closed-ring case a naive version gets wrong (RDP anchors two endpoints which
// on a ring are the same point, so the loop collapses toward it).

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* ⚠️ "CLOSED" IS RELATIVE TO THE SIZE OF THE SHAPE, never a fixed pixel count. A 20px gap on a
 * thumbnail-sized loop is a wide-open horseshoe; the same 20px on a shape filling the plate is a
 * hand that closed it. A fixed threshold gets one of those two wrong whichever number you pick. */
const CLOSE_FRACTION = 0.09;      // of the bounding box diagonal
const CLOSE_FLOOR    = 10;        // px, for shapes small enough that the fraction is meaningless

const bboxDiagonal = pts => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};

/**
 * points     the raw pointer trail, [[x, y], …]
 * minStep    drop samples closer together than this — a still hand emits a pile of duplicates, and
 *            duplicates make zero-length spans in the fill
 * tolerance  Douglas–Peucker tolerance, same units
 *
 * Returns `{ path, ring, closed, gap, area }` or `null` if there is nothing usable.
 *
 *   path    the stroke AS DRAWN, simplified and left open. This is what gets piped.
 *   ring    a closed copy, or `null` when the stroke does not close. Only this can be filled.
 *   closed  did the baker bring the ends together, relative to the size of what they drew
 *   gap     how far apart the two ends are
 *
 * ⚠️ There is no minimum area. A "1" encloses nothing at all and is a perfectly good thing to pipe;
 * an earlier version rejected it as "a stray tap" and so refused to draw numbers.
 */
export function tidyDrawn(points, { minStep = 2, tolerance = 2 } = {}) {
  if (!points || points.length < 3) return null;

  const thinned = [points[0]];
  for (const p of points.slice(1)) if (dist(p, thinned[thinned.length - 1]) >= minStep) thinned.push(p);
  if (thinned.length < 2) return null;

  const path = simplify(thinned, tolerance);
  if (path.length < 2) return null;

  const gap = dist(path[0], path[path.length - 1]);
  const closed = gap <= Math.max(CLOSE_FLOOR, bboxDiagonal(path) * CLOSE_FRACTION);

  // Snapped shut rather than merely nearly-shut: a fill scanline leaks out through a gap of even one
  // pixel, so the ring it works on has to be exactly closed even when the drawn stroke is not.
  const ring = closed ? [...path.slice(0, -1), path[0]] : null;

  return { path, ring, closed, gap, area: ring ? Math.abs(signedArea(ring)) : 0 };
}

/**
 * Would filling this shape be a mistake? A signature, a spiral or a treble clef can close and still
 * be a LINE rather than a region, and hatching one produces a smear of disconnected dashes.
 *
 * Compactness, 4πA/P² — 1 for a circle, → 0 for anything long and thin. A hand-drawn blob sits
 * around 0.6–0.9. ⚠️ Advice for the UI, never a veto: the baker may still ask, and gets what they
 * asked for.
 */
export function fillWorthwhile(ring) {
  if (!ring || ring.length < 4) return false;
  let len = 0;
  for (let i = 1; i < ring.length; i++) len += dist(ring[i - 1], ring[i]);
  if (len <= 0) return false;
  return (4 * Math.PI * Math.abs(signedArea(ring))) / (len * len) > 0.18;
}
