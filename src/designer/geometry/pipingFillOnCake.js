import { fillShape, FILL_PATTERNS } from './pipingFill.js';

// ── Filling a stroke that was drawn ON the cake ──────────────────────────────────────────────────
//
// `pipingFill.js` works in 2D, because a fill is a flat idea: passes across a shape. A pen stroke is
// a list of 3D points already seated on the cake. This is the bit in between — project, fill, and
// put the result back where it came from.
//
// ⚠️ FLAT SURFACES ONLY, AND THIS IS A LIMIT WORTH STATING RATHER THAN HIDING. On the top of a tier
// or on the board, every point of a stroke shares a height, so dropping the height and filling in
// x/z is exact. On a tier WALL the surface curves away, and a straight pass across the shape would
// cut through the cake and come out the other side. Filling a curved wall needs the stroke unwrapped
// into surface coordinates, which is a different job — so this reports `flat: false` and the UI does
// not offer a fill, instead of quietly producing something that floats.
//
// ⚠️ AND ONLY A CLOSED STROKE HAS AN INSIDE. Letters, numbers and swirls are most of what gets
// piped; see drawnShape.js for why closure is detected and never imposed.

const FLAT_TOLERANCE = 0.012;      // world units of height variation still counted as flat

const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * points     the stroke's stored points, [[x, y, z], …]
 * thickness  the rope's radius, which sets both the pass spacing and how far the fill stops short
 *            of the outline — a fill that touches the outline reads as one piece, and one that
 *            crosses it reads as a mistake
 *
 * Returns `{ flat, closed, canFill, paths }`, `paths` being 3D polylines ready to be piped —
 * each one a continuous squeeze, so `paths.length` is how many times the nozzle lifts.
 */
export function fillStrokeOnFlat(points, { pattern = 'hatch', thickness = 0.03, seed = 1 } = {}) {
  const none = { flat: false, closed: false, canFill: false, paths: [] };
  if (!points || points.length < 4) return none;

  const ys = points.map(p => p[1]);
  const flat = Math.max(...ys) - Math.min(...ys) <= FLAT_TOLERANCE;
  if (!flat) return none;

  // Height is constant, so the fill lives in x/z and comes back at the same height. Using the MEAN
  // rather than the first point's height keeps the fill in the same plane as the stroke even when
  // seating jittered it by a fraction.
  const y = ys.reduce((a, b) => a + b, 0) / ys.length;
  const flat2d = points.map(p => [p[0], p[2]]);

  /* Closure, judged against the size of the shape — the same rule as drawnShape.js and for the same
   * reason: a fixed distance is a wide-open horseshoe on a small shape and a closed loop on a big
   * one. Kept in step with that module deliberately; if one changes, so does the other. */
  const xs = flat2d.map(p => p[0]), zs = flat2d.map(p => p[1]);
  const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  /* ⚠️ GENEROUS, BECAUSE A HAND DOES NOT CLOSE A LOOP ACCURATELY. The first version allowed 9% of the
   * shape's own size, or twice the rope width — with the chocolate pen's fine 0.018 tip that is a few
   * millimetres of world space, and a loop drawn on a cake that plainly READS as closed was reported
   * open. The control then hid itself and explained, politely, that the baker should do what they had
   * just done.
   *
   * A quarter of the shape's own diagonal instead. It still refuses the things that must be refused,
   * because those are not near misses: the ends of an "S" or a treble clef sit roughly a whole
   * diagonal apart, and a line's are further still. The gap between "nearly closed" and "not a loop
   * at all" is wide, so the threshold does not have to be precise — it has to be on the right side of
   * a chasm, and 9% was on the wrong one. */
  const gap = dist2(flat2d[0], flat2d[flat2d.length - 1]);
  const closed = gap <= Math.max(thickness * 4, diagonal * 0.25);
  if (!closed) return { flat: true, closed: false, canFill: false, paths: [] };

  const ring = [...flat2d.slice(0, -1), flat2d[0]];     // snapped exactly shut, or the fill leaks

  /* Spacing is expressed in ROPE WIDTHS, not world units, so a fine chocolate line and a fat cream
   * one both come out looking piped rather than one of them reading as a solid blob and the other as
   * a few stray lines. Solid ignores this and packs by rope width (see pipingFill.js). */
  const rope = Math.max(0.004, thickness) * 2;
  const paths2d = fillShape(ring, {
    pattern,
    spacing: rope * 2.2,
    inset: rope * 0.5,
    ropeWidth: rope,
    seed,
  });

  return { flat: true, closed: true, canFill: true, paths: paths2d.map(p => p.map(([x, z]) => [x, y, z])) };
}

/** Can this stroke be filled at all — used to decide whether to OFFER the control, since a dead
 *  control is worse than an absent one. */
export const canFillStroke = (points, thickness) =>
  fillStrokeOnFlat(points, { pattern: 'hatch', thickness }).canFill;

export { FILL_PATTERNS };
