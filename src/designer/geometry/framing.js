// ── Where a camera aims at a cake ───────────────────────────────────────────────────────────────
// Every camera that frames a WHOLE cake needs this, and none of them can get it from a constant.
// A single tier is about 1.5 tall and a three-tier stack about 4.2, so one number is either above the
// short cake — which then sinks so far it takes the board off the bottom edge — or below the tall
// one, which loses its top tier off the top. The designer's camera was tuned by hand three times
// (2 → 1.55 → …) before anyone wrote down that the question has no constant answer.
//
// Aim ABOVE the cake's middle, by the same amount for every cake. That is what puts the cake a little
// low in frame, and a cake should sit a little low: it is an object standing on a table, and the room
// under it is what says so. Aimed at its exact middle it is centred in empty space and reads as
// floating — which is what "the cake looks like it's in the air" meant when the aim was first made
// adaptive and the sit was dropped along with the constant.
//
// So this is TWO decisions, and they are separate on purpose:
//   · WHERE the middle is  — the cake's own, so a tall cake is framed like a tall cake (adaptive).
//   · HOW FAR above it we aim — one number, so every cake sits identically (fixed).
// The old constant conflated them: it was a lift that happened to be right for one cake's middle.
const BOARD_H = 0.1;   // the board's own thickness — the tier stack starts on top of it

// ── Fitting a cake to the frame ─────────────────────────────────────────────────────────────────
// How far back a camera must stand for the whole cake to be inside the picture. This is the part
// that was hand-tuned for years, and every tune was right for one cake: pull in until a single tier
// fills the frame and a three-tier stack loses its top; pull back until the stack fits and the
// single tier is a speck. Add a tall topper and it breaks again, because the cake got taller and the
// camera did not move.
//
// A cake is measured as a CYLINDER: `halfW`, its radius across the board, and `halfH`, half its
// height. Both come from what is actually rendered, toppers and all.
//
// A cylinder, not a sphere, and that is the whole correction. A sphere was the obvious rotation-proof
// shape and it is badly wrong here: a cake with its board is a WIDE FLAT disc, so the sphere around
// it is far taller than the cake is. The frame then reserves vertical room for a sphere that is
// mostly empty air, and the cake shrinks into the middle of it — which is precisely "the camera is
// too far and the cake looks like it is floating".
//
// A standing cylinder is just as rotation-proof, because its silhouette from every azimuth is the
// same rectangle. That is the property a turntable needs, and a sphere is not the only shape with it.
//
// ── Perspective, which is where the two previous attempts went wrong ────────────────────────────
// It is tempting to measure the cake's extent in the plane through its CENTRE and fit that. Both
// earlier versions did, and both put the camera about 20% too close, because the near front rim of
// the BOARD is closer to the camera than the centre is and therefore projects bigger than the
// estimate. That rim is the exact point that kept ending up off the bottom of the screen.
//
// There is no need to approximate. The silhouette of a standing cylinder, in the vertical plane
// through the cake and the camera, is a rectangle with four corners. For each corner, ask what
// distance would put it exactly on the frame edge, and take the largest answer. Closed form, exact,
// and it names its own worst case rather than hiding it in a fudge factor.
//
//   px — how far the corner is toward the camera, horizontally (±halfW)
//   py — how far it is above the cake's middle (±halfH)
//
// Along the view axis it sits at  d − (px·cos + py·sin); across it, at  py·cos − px·sin. Requiring
// the second to be within tan(halfFov) of the first and solving for d gives the line below.
function tightDistance(halfW, halfH, elevationRad, fovDeg, aspect) {
  const vHalf = (fovDeg / 2) * Math.PI / 180;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(aspect || 1, 0.01));
  const c = Math.cos(elevationRad), s = Math.sin(elevationRad);
  let d = 0;
  for (const px of [halfW, -halfW]) {
    for (const py of [halfH, -halfH]) {
      const across = Math.abs(py * c - px * s);
      d = Math.max(d, across / Math.tan(vHalf) + px * c + py * s);
    }
  }
  // Sideways, the widest points are the silhouette's edges — out of that plane, so px is 0 for them
  // and only their height shifts how far away they are.
  d = Math.max(d, halfW / Math.tan(hHalf) + Math.abs(halfH * s));
  return Math.max(d, 0.01);
}

// ── Room for what is about to be put on top ─────────────────────────────────────────────────────
// A bare cake is SHORT, so fitting it exactly brings the camera close and it fills the frame; the
// same cake with grass and a topper is taller, so the camera stands back and the cake body reads
// smaller. Both are correctly fitted and they look like different sizes, which is what "a new cake
// is bigger than a template" means.
//
// The cake is not really the subject on its own, though. This is a designer: a cake here is a cake
// that is ABOUT to have something stood on top of it. So the framed shape reserves a topper's worth
// of height above the board even when nothing is there yet.
//
// Two things fall out of that, and the second is the better reason. A new cake is framed like a
// finished one — and adding the first topper no longer LURCHES the camera, because the room it needs
// was already in the picture.
//
// 2.4 is measured, not picked: it is the height at which a bare one-tier cake fits at the same
// distance as the football template (grass + ball), which is the framing that was asked for. Taller
// cakes are unaffected — they already exceed it, so this only ever stops a short cake crowding in.
export const MIN_FRAMED_TOP = 2.4;

// The box to frame, given what is actually rendered: the cake, plus the headroom above if the cake
// is not already using it. Returns the same shape the fit wants — half-height and centre.
export function framedHeight(boxMinY, boxMaxY, minTop = MIN_FRAMED_TOP) {
  const top = Math.max(boxMaxY, minTop);
  return { halfH: (top - boxMinY) / 2, centerY: (top + boxMinY) / 2 };
}

// How much further back than EXACTLY TOUCHING to stand. 1.0 puts the cake's worst corner precisely
// on the frame edge, so this reads as "25% more room than the cake strictly needs" — a number worth
// arguing about, unlike the fudge factors it replaces.
export const FIT_MARGIN = 1.25;

export function fitDistance(halfW, halfH, elevationRad, fovDeg, aspect, margin = FIT_MARGIN) {
  return fitDistanceTight(halfW, halfH, elevationRad, fovDeg, aspect) * margin;
}

// The distance at which the cake exactly touches the frame. Exported so the sit can work out how
// much air the margin actually bought, rather than estimating it a second way and disagreeing.
export function fitDistanceTight(halfW, halfH, elevationRad, fovDeg, aspect) {
  return tightDistance(Math.max(halfW, 0.01), Math.max(halfH, 0.01), elevationRad, fovDeg, aspect);
}

// How far above the cake's middle to aim, given how much ROOM there is above and below it.
//
// The sit used to be a fixed angle, and a fixed angle cannot know when it has run out of room: on a
// tall cake — two tiers and a topper — it went on pushing down until the board left the bottom of
// the frame, which is exactly what it was added to prevent. Expressed as a fraction of the SLACK it
// is self-limiting. A cake that fills the frame gets no sit because there is none to give; a small
// cake gets the full amount and stands on the lower third where an object on a table belongs.
// Under half, and that is the point: the sit must never consume the air the margin just bought, or
// the board ends up against the bottom edge — which is the bug all of this exists to end.
export const SIT_OF_SLACK = 0.35;

export function sitFromSlack(tightDist, distance, fovDeg, frac = SIT_OF_SLACK) {
  const vHalf = (fovDeg / 2) * Math.PI / 180;
  // The air the margin bought, measured at the cake. Standing back by (distance - tight) widens the
  // frame by that much times tan(halfFov); the cake did not grow, so all of it is spare room.
  return Math.max(0, distance - tightDist) * Math.tan(vHalf) * frac;
}

// How far above the cake's middle the camera looks — as a FRACTION OF ITS DISTANCE from the cake,
// not in world units. The sit is an ANGLE: how far the aim is tilted above the cake's middle. Move
// the camera back and the same world offset covers less of the frame.
//
// That is not theoretical. The designer uses two cameras, and the phone's sits 1.33x further out, so
// a world-space lift tuned on the desktop one gave 5.2° there and 3.9° on a phone — a quarter less
// sit. It came back from a phone still looking like it was floating, and it was: the fix had only
// been checked on a desktop.
//
// 0.0915 ≈ 5.2°, which is what the hand-tuned [0, 1.55, 0] came to on the desktop camera and a
// one-tier cake — the framing that was asked for back. As an angle it is now the same shot on both
// cameras, and on any camera added later.
export const CAKE_SIT_FRAC = 0.0915;

// A cake stands at the origin, so the camera's distance from it is just the length of its position.
export function cameraDistance(cameraPosition) {
  const [x = 0, y = 0, z = 0] = cameraPosition ?? [];
  return Math.hypot(x, y, z) || 1;
}

// A default so an EMPTY cake still frames like a cake rather than aiming at the floor — the preview
// renders `{ tiers: [] }` while a design loads, and a camera aimed at y=0 during that beat swings up
// as the first tier arrives, which reads as the page lurching.
const FALLBACK_STACK_H = 1.45;

// `heights` — each tier's own height, bottom-first. The caller passes RESOLVED heights (a glyph
// tier's is derived from its typed characters, not authored on the tier), because resolving them is
// the config's job and this is only the arithmetic.
export function cakeStackHeight(heights) {
  const total = (heights ?? []).reduce((h, t) => h + (Number.isFinite(t) ? t : 0), 0);
  return total > 0 ? total : FALLBACK_STACK_H;
}

// The middle of the cake as it STANDS — board included, measured from the ground. The board is part
// of the object being photographed (it is drawn by CakeContent, INVARIANTS #2b), so leaving it out
// would put the middle a half-board too high on every cake.
export function cakeMiddleY(heights) {
  return (BOARD_H + cakeStackHeight(heights)) / 2;
}

// The world-Y a camera at `cameraPosition` should look at: above the cake's middle by the sit, so the
// cake stands on the frame rather than floating in it. The camera is an argument because the answer
// genuinely depends on it — see CAKE_SIT_FRAC.
export function cakeAimY(heights, cameraPosition) {
  return cakeMiddleY(heights) + cameraDistance(cameraPosition) * CAKE_SIT_FRAC;
}

// The same answer as an OrbitControls / lookAt target. Cakes are built on the Y axis, so X and Z are
// always 0 — worth a helper only because every caller would otherwise spell the array out and one of
// them would eventually spell it differently.
export function cakeAimTarget(heights, cameraPosition) {
  return [0, cakeAimY(heights, cameraPosition), 0];
}
