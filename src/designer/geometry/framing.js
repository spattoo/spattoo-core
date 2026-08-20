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

// How far above the cake's middle the camera looks, in world units. 0.775 is not a fresh guess: it is
// what the old [0, 1.55, 0] came to on a one-tier cake, which is the cake this app makes most and the
// framing that was asked for back. Every other cake now gets that same sit instead of drifting with
// its height.
export const CAKE_AIM_LIFT = 0.775;

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

// The world-Y a camera should look at. Above the middle by `lift`, so the cake sits on the frame
// rather than floating in it.
export function cakeAimY(heights, lift = CAKE_AIM_LIFT) {
  return cakeMiddleY(heights) + lift;
}

// The same answer as an OrbitControls / lookAt target. Cakes are built on the Y axis, so X and Z are
// always 0 — worth a helper only because every caller would otherwise spell the array out and one of
// them would eventually spell it differently.
export function cakeAimTarget(heights, lift = CAKE_AIM_LIFT) {
  return [0, cakeAimY(heights, lift), 0];
}
