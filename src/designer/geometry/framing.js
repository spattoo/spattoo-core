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
// ── The camera looks DOWN, so height alone is not the vertical extent ───────────────────────────
// Tilted by `elevation`, a standing cylinder projects taller than its height: the near rim of the
// board swings down into the picture. The vertical extent is the height foreshortened plus the
// board's depth stood up — h·cos + w·sin. Leave the second term out and the board is exactly what
// runs off the bottom of the frame, which is the bug this whole rule was written to end.
//
// `aspect` is the viewport's, and it matters most on a phone: a tall narrow frame is limited by its
// WIDTH, so the width constraint wins there and the height constraint wins on a desktop. Asking both
// and taking the larger distance is what makes one rule serve both shapes.
// Air around the cake. 1.0 has it touching the tightest edge; this leaves about 12% of the half-frame
// clear once the sit below has taken its share, which is the difference between a cake standing in a
// picture and a cake jammed into one. Raising it does less than it looks: the sit is a fraction of
// the slack, so it eats part of every increase.
export const FIT_MARGIN = 1.22;

export function fitDistance(halfW, halfH, elevationRad, fovDeg, aspect, margin = FIT_MARGIN) {
  const vHalf = (fovDeg / 2) * Math.PI / 180;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(aspect || 1, 0.01));
  const w = Math.max(halfW, 0.01);
  const h = Math.max(halfH, 0.01);
  const halfSeen = seenHalfHeight(w, h, elevationRad);
  return Math.max(w / Math.tan(hHalf), halfSeen / Math.tan(vHalf)) * margin;
}

// What the cake covers VERTICALLY on screen, once the camera's downward tilt is accounted for.
// Shared with the sit, which has to know the same number or it hands back slack that is not there.
export function seenHalfHeight(halfW, halfH, elevationRad) {
  return Math.max(halfH, 0) * Math.abs(Math.cos(elevationRad))
       + Math.max(halfW, 0) * Math.abs(Math.sin(elevationRad));
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

export function sitFromSlack(halfSeen, distance, fovDeg, frac = SIT_OF_SLACK) {
  const vHalf = (fovDeg / 2) * Math.PI / 180;
  const halfFrameAtCake = distance * Math.tan(vHalf);
  return Math.max(0, halfFrameAtCake - Math.max(halfSeen, 0)) * frac;
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
