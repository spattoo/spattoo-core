// ── How high a board piping layer, or ONE hand-placed piece of it, may sit on the wall ──────────
//
// A board layer rides the tier WALL, so it has a vertical anchor (`yOffset + userYOffset`) and a
// shell that reaches some distance above and below it. Two questions come off that, and they are
// NOT the same question — which is the bug this module exists to stop recurring:
//
//   1. The layer's HEIGHT SLIDER moves the whole ring. A ring is a band all the way round the cake,
//      so it can collide with another ring, and stacking is real: a ring resting on the one below
//      is what a baker means by piping two borders.
//
//   2. A DRAG moves ONE piece. Dragging is only offered in `single` arrangement (see
//      `useSinglePieceDrag`), so the piece has an ANGLE, and a piece at 331° cannot collide with a
//      piece at 90° whatever their heights. Constraining it against other layers is applying a
//      ring's rule to something that is not a ring.
//
// ⚠️ THE SECOND CASE WAS BORROWING THE FIRST'S BOUNDS, and the symptom was exactly what you would
// predict: a rosette dragged UP moved freely, and dragged DOWN stopped dead at the top of an
// unrelated layer somewhere else on the cake. Reported 2026-09-10 with a white rosette that would
// not go below a purple one it never touched.
//
// Pure and unit-tested on purpose: this lived inside CakeDesigner as two closures over component
// state, which is why a rule for rings could be reused for a piece without anybody noticing.

/** The [low, high] a shell occupies, in tier-local units, for an anchor at `yo`.
 *  `topFrac`/`botFrac` are the shell's reach as fractions of the tier RADIUS (botFrac is ≤ 0 when
 *  the shell dips below its anchor), which is how `getShellExtents` reports them. */
export function shellBand(yo, radius, topFrac, botFrac) {
  return [yo + radius * botFrac, yo + radius * topFrac];
}

/** Bounds that keep the shell ON THE WALL: bottom edge no lower than the tier base, top edge no
 *  higher than the rim. This is the whole constraint for a hand-placed piece. */
export function wallYoBounds({ tierHeight, yo, band }) {
  const [lo, hi] = band;
  const topExt = hi - yo;          // reach above the anchor
  const botExt = lo - yo;          // and below (≤ 0 when it dips under)
  return { yoMin: -botExt, yoMax: tierHeight - topExt };
}

/** The same, plus the ring-stacking rule: a layer whose band sits entirely below ours becomes a
 *  floor, one entirely above becomes a ceiling. For the layer's Height slider ONLY. */
export function stackedYoBounds({ tierHeight, yo, band, neighbourBands = [] }) {
  const [lo, hi] = band;
  const { yoMin: baseMin, yoMax: baseMax } = wallYoBounds({ tierHeight, yo, band });
  const topExt = hi - yo, botExt = lo - yo;
  const EPS = 1e-4;
  let yoMin = baseMin, yoMax = baseMax;
  for (const [nlo, nhi] of neighbourBands) {
    if      (nhi <= lo + EPS) yoMin = Math.max(yoMin, nhi - botExt);   // below us → we rest on it
    else if (nlo >= hi - EPS) yoMax = Math.min(yoMax, nlo - topExt);   // above us → we stop under it
  }
  return { yoMin, yoMax };
}

/* ⚠️ WHAT THIS GIVES UP, on purpose: a hand-placed piece dragged INTO a ring will interpenetrate it.
 * The old rule prevented that, but only by banning a whole range of heights outright — including for
 * pieces at an angle where nothing could ever touch, which is the common case and the reported bug.
 * Real prevention needs an angle-aware test, and it is not obviously wanted: bakers nestle piping
 * together deliberately. Placing by hand means the baker decides. Do not reinstate a height ban as a
 * substitute for collision. */

/** Clamp into a band that may be inverted (yoMax < yoMin happens on a short tier with a tall
 *  shell); `yoMin` wins there, so the piece stays on the cake rather than jumping to the rim. */
export function clampYo(value, { yoMin, yoMax }) {
  return Math.min(Math.max(yoMin, value), Math.max(yoMin, yoMax));
}
