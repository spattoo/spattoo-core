import { simplify, signedArea } from './traceOutline.js';

// ── A freehand trail → a shape you can pipe ──────────────────────────────────────────────────────
//
// The baker draws a shape, regular or irregular, with a mouse or a fingertip. That trail is not yet
// a shape: a pointer fires far faster than a hand moves, so it arrives as hundreds of near-identical
// points, and it almost never ends exactly where it started.
//
// ⚠️ REUSES `simplify` FROM traceOutline.js rather than carrying its own Douglas–Peucker. That one
// already handles the case this needs and a naive version gets wrong: on a CLOSED ring RDP anchors
// its two endpoints, which are the same point, so the whole loop collapses toward it. Two copies of
// this would have drifted, and only one of them would have been the one with the fix.

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * points     the raw pointer trail, [[x, y], …]
 * minStep    drop samples closer together than this — a still hand emits a pile of duplicates, and
 *            duplicate points make the scanline fill produce zero-length spans
 * tolerance  Douglas–Peucker tolerance, same units
 * minArea    below this the "shape" is a stray tap or a scrub, and is not something to fill
 *
 * Returns `{ ring, closed, gap, area }`, or `null` when there is no usable shape.
 * `ring` is always CLOSED (last point repeats the first), because a fill needs a closed boundary.
 * `closed` reports whether the BAKER closed it; `gap` is how far apart their start and end were.
 */
export function tidyDrawn(points, { minStep = 2, tolerance = 2, minArea = 30 } = {}) {
  if (!points || points.length < 3) return null;

  const thinned = [points[0]];
  for (const p of points.slice(1)) if (dist(p, thinned[thinned.length - 1]) >= minStep) thinned.push(p);
  if (thinned.length < 3) return null;

  /* ⚠️ CLOSE IT FOR THEM, and record that we did. Nobody hand-draws a loop that lands on its own
   * start, and refusing to fill until they do would make the tool feel broken for a gap of three
   * pixels. But the gap is also information: a wide one means they drew an open squiggle — a treble
   * clef, a spiral — and filling that is almost certainly not what they meant. The caller decides;
   * this only reports. */
  const gap = dist(thinned[0], thinned[thinned.length - 1]);
  const ring = [...thinned, thinned[0]];

  const out = simplify(ring, tolerance);
  if (out.length < 4) return null;                      // fewer than 3 distinct corners

  const area = Math.abs(signedArea(out));
  if (area < minArea) return null;

  return { ring: out, closed: gap <= Math.max(minStep * 4, 12), gap, area };
}

/**
 * Would filling this shape be a mistake? A long thin trail — a signature, a spiral, a treble clef —
 * has a real enclosed area yet is plainly a LINE rather than a region, and hatching it produces a
 * smear of tiny disconnected dashes rather than anything anyone drew on purpose.
 *
 * Compares area against the trail's own length: a compact blob scores high, a wandering line low.
 * This is advice for the UI, not a veto — the baker may still ask, and gets what they asked for.
 */
export function fillWorthwhile(ring) {
  if (!ring || ring.length < 4) return false;
  let len = 0;
  for (let i = 1; i < ring.length; i++) len += dist(ring[i - 1], ring[i]);
  if (len <= 0) return false;
  // 4πA/P² — 1 for a circle, → 0 for anything long and thin. A hand-drawn blob sits around 0.6–0.9.
  return (4 * Math.PI * Math.abs(signedArea(ring))) / (len * len) > 0.18;
}
