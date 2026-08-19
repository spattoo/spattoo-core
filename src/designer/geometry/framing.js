// ── Where a camera aims at a cake ───────────────────────────────────────────────────────────────
// Every camera that frames a WHOLE cake needs this, and none of them can get it from a constant.
// A single tier is about 1.5 tall and a three-tier stack about 4.2, so one number is either above the
// short cake — which then sinks in frame and takes the board with it — or below the tall one, which
// loses its top. The designer's camera was tuned by hand three times (2 → 1.55 → …) before anyone
// wrote down that the question has no constant answer.
//
// The rule is the shape picker's, which arrived at it independently and has been right since: aim at
// a fraction of the stack's own height, measured from the GROUND (the board's underside, y = 0).
//
// 0.45 rather than a true half is deliberate, and it is about what OVERHANGS. Measured from the
// ground the tiers' true middle is a little above 0.45 — so this aims marginally low, which lifts
// the cake in frame and leaves the slack above it, where toppers, candles and tall grass live.
// Slack below buys nothing: there is only board down there.
export const CAKE_AIM_FRAC = 0.45;

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

// The world-Y a camera should look at to centre this cake.
export function cakeAimY(heights, frac = CAKE_AIM_FRAC) {
  return cakeStackHeight(heights) * frac;
}

// The same answer as an OrbitControls / lookAt target. Cakes are built on the Y axis, so X and Z are
// always 0 — worth a helper only because every caller would otherwise spell the array out and one of
// them would eventually spell it differently.
export function cakeAimTarget(heights, frac = CAKE_AIM_FRAC) {
  return [0, cakeAimY(heights, frac), 0];
}
