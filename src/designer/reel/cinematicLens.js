/* ── The lens a take is filmed on ────────────────────────────────────────────────────────────────
 *
 * The designer's default is 42°, and the canvas already says why that is right for its job and
 * wrong for this one:
 *
 *   "The default (42°, close) is a portrait lens for a thumbnail — flattering, but it splays a
 *    cake's near bottom edge outward, which reads as the cake bulging at the base. Judging a SHAPE
 *    needs a long lens (small fov, camera pulled back) so the silhouette on screen is the
 *    silhouette, not the perspective."
 *
 * Filming is the same question as judging a shape. A long lens compresses perspective, stops the
 * near rim splaying, and is most of what "cinematic" means before anyone reaches for a grade.
 *
 * ⚠️ THIS PARAGRAPH USED TO SAY THE FIT WOULD COMPENSATE. It said `FitCakeToView` "recomputes its
 * distance from `camera.fov` every frame and GLIDES there, so the cake stays the same size in
 * frame". That was never true and I never checked it: the fit re-frames when the cake's BOUNDING
 * BOX or the window's ASPECT changes, and it does not look at the focal length at all. What it did
 * instead was chase the decorations flying ABOVE the cake — a build balloons the box — and a box
 * change SNAPS where only an aspect change glides. Measured during a take: the board grew from
 * 310px to 452px over 600ms and then jumped back to 324px in a single step. That jump was the
 * "harsh" Sandeep reported, and easing this lens alone did not touch it.
 *
 * So the take HOLDS the fit (`framingHeld` in CakeCanvas) and the lens is the only thing moving.
 * Narrowing the focal length with the camera standing still is a true zoom: the cake grows, the
 * perspective flattens, and nothing fights it.
 *
 * ⚠️ AND IT IS A TAKE-ONLY CHANGE, RESTORED AFTERWARDS. The baker's own view is a contract — what
 * they approve is what the customer gets — so the lens the designer renders a cake on must not
 * quietly move because somebody filmed it once. The component that applies this saves the old fov
 * on mount and puts it back on unmount, the same bargain `sceneSnapshot` makes for the reel.
 *
 * ⚠️ PIXEL RATIO IS DELIBERATELY NOT TOUCHED HERE. Raising it would sharpen the capture and is the
 * obvious next idea — but `takePlan.js` exists because a loaded cake on an older phone already
 * cannot always hold 60fps, and a take that drops frames is worse than a take that is slightly soft.
 * That one needs measuring before it is offered, not assuming.
 */

/** The designer's everyday lens — a portrait focal length, flattering for a thumbnail. */
export const EDITOR_FOV = 42;

/** What a take is filmed on. Long enough to compress, short of the distortion-free-but-flat look. */
export const CINEMATIC_FOV = 28;

/** The range the panel offers: 20° is a very long lens, 42° is the designer's own. */
export const LENS_RANGE = Object.freeze({ min: 20, max: 42 });

/**
 * How much further back the camera must sit to frame the same subject at `fov` instead of `from`.
 *
 * Framing is governed by the half-angle, so the distance scales with `tan(from/2) / tan(fov/2)`.
 * At the default pair that is 1.54× — the compression you can see, expressed as the dolly you
 * cannot. Exported because it is the number worth knowing before choosing a lens, and because an
 * arithmetic claim in a comment is one nobody checks.
 */
export function lensDistanceFactor(fov, from = EDITOR_FOV) {
  const half = (deg) => Math.tan((Math.max(1, Math.min(179, Number(deg) || 0)) * Math.PI) / 360);
  return half(from) / half(fov);
}

/* ── The move onto the lens, and back off it ─────────────────────────────────────────────────────
 *
 * ⚠️ THE FIRST VERSION ASSIGNED `camera.fov` AND CALLED IT DONE, which is a cut, not a move. The
 * note above is right that `FitCakeToView` dollies back on its own and eases — but it eases the
 * DISTANCE while the focal length changed in a single frame, so the shot snapped onto the long lens
 * and snapped off it again when the take ended. Sandeep: *"the cake is zooming in, but its very
 * harsh … once all elements are dropped on cake, its going back from the zoom in position, that is
 * harsh too."*
 *
 * ⚠️ SMOOTHSTEP, NOT THE easeOutCubic `FitCakeToView` USES. That curve is "quick off the mark,
 * settles softly", which is right for a view catching up with a cake that just changed — it should
 * feel eager. A zoom is the opposite: leaving at full speed IS the harshness. This one starts from
 * rest and arrives at rest, so both ends of the take are a move rather than a jump.
 */

/** Seconds the camera takes to reach the take's lens, and to come back off it. */
export const LENS_GLIDE_S = 1.2;

/** The focal length `t` seconds into a glide from `from` to `to`. Holds at `to` once it arrives. */
export function lensAt(from, to, t) {
  const span = Number(LENS_GLIDE_S);
  const k = span > 0 ? Math.min(1, Math.max(0, Number(t) / span)) : 1;
  const eased = k * k * (3 - 2 * k);
  const a = Number(from), b = Number(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.isFinite(b) ? b : CINEMATIC_FOV;
  return a + (b - a) * eased;
}

/** Keep a lens inside what the panel can ask for, so a stray value cannot invert the projection. */
export function clampLens(fov) {
  const v = Number(fov);
  if (!Number.isFinite(v)) return CINEMATIC_FOV;
  return Math.min(LENS_RANGE.max, Math.max(LENS_RANGE.min, v));
}
