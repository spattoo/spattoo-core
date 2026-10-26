/* ── A cake assembling itself ────────────────────────────────────────────────────────────────────
 *
 * The decorations descend out of the air and settle onto the cake. The opening shot for a demo: the
 * sentence "every cake starts as a picture in someone's head" shown rather than said. Sandeep, with
 * an exploded-phone teardown as the reference: *"the elements of the templates get assembled and
 * makes a cake"*.
 *
 * ⚠️ BUILT, NOT GENERATED, AND THAT IS THE WHOLE POINT. A video model would invent *a* cake; it has
 * never seen this one. We hold every element's real position already, so the animation is those
 * positions with an offset eased away — exact, repeatable, and true of the template it is showing.
 *
 * ⚠️ THE TAKE IS A FIXED LENGTH, AND THE PIECE COUNT DOES NOT CHANGE IT. The first version set a
 * fixed GAP between pieces, which is the obvious design and is wrong here: real templates run from
 * 3 pieces (cricket theme) to 181 (space theme), so a 0.36s gap produced a 1.6-second build on one
 * and a SIXTY-FIVE second build on the other. A 65-second opening shot is not an opening shot. You
 * say how long the whole thing takes; everything else is derived.
 *
 * ⚠️ AND THEY MAY ALL COME AT ONCE. Sandeep: *"if all elements come together from air and assemble
 * on cake at once, it ll look even more graceful."* `spread` is how much of the take is spent
 * starting pieces — 0 is every piece in the air from the first frame, landing together; higher
 * values deal them out. Parallel is the default because it is the gracer shot and because it is the
 * one that stays graceful at 181 pieces.
 *
 * ⚠️ SLOW MOTION IS THIS CONTROL, not a speed change in an editor. Slowing a clip in post resamples
 * frames that were already captured, so it judders or softens; a longer `total` renders every frame
 * for real at the slower pace. The generator is the right place to be slow.
 *
 * ⚠️ PIECES ARRIVE IN THE ORDER THEY WERE PLACED, which is free and happens to be the honest one:
 * it replays how the cake was actually built. Only visible when `spread` is above 0.
 *
 * ⚠️ PURE ARITHMETIC, NO RENDERER — `takePlan.js`'s bargain and `spinTake.js`'s. The applying half
 * is a few lines in the canvas, and the applying half is exactly where the hero spin broke: it
 * called two OrbitControls setters that do not exist, and every test passed because they were all
 * on the arithmetic.
 */

export const ASSEMBLY_DEFAULTS = Object.freeze({
  /* Seconds for the whole build, whatever the cake holds. */
  total: 5,
  /* How much of that is spent STARTING pieces, 0…MAX_SPREAD.
     0    — every piece is in the air at once and they land together. The graceful one.
     0.5  — starts are dealt across the first half; each piece then flies for the other half. */
  spread: 0,
  /* How far above its seat a piece begins, as a fraction of the cake's own reach. A fraction, never
     a world distance, so the shot looks the same on a 6" round and a sheet (INVARIANTS #8). */
  rise: 0.55,
});

/* ⚠️ A CEILING ON `spread`, because at 1 every piece would have ZERO time to fall: the starts would
   fill the whole take and the last piece would be asked to travel its distance in no time at all,
   which is a teleport, not a landing. 0.85 leaves every piece at least 15% of the take to fly. */
export const MAX_SPREAD = 0.85;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/* Ease OUT only — fast away from the start, settling gently. A piece being placed by hand slows as
   it arrives and does not ease into leaving; symmetric easing makes every piece look weightless. */
const settle = (t) => { const k = clamp01(t); return 1 - (1 - k) * (1 - k) * (1 - k); };

/* ⚠️ `??` DOES NOT CATCH NaN, and that is how NaN reached a position. It only replaces null and
   undefined, so a plan carrying NaN — which is what a slider hands over mid-drag, and what
   `JSON.stringify` quietly turns into `null` when you go looking — sailed through `Number(x ?? 0)`
   and came out the other side as a decoration that vanished with nothing to say why. */
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

const spreadOf = (plan) => Math.min(MAX_SPREAD, Math.max(0, num(plan?.spread, 0)));
const totalOf  = (plan) => Math.max(0, num(plan?.total, 0));

/** Seconds the whole build runs for. ⚠️ Independent of the piece count — that is the point. */
export function assemblyTotal(plan = ASSEMBLY_DEFAULTS) {
  return totalOf(plan);
}

/**
 * How long one piece spends falling.
 *
 * ⚠️ IT DEPENDS ON THE COUNT, because with ONE piece there is no starting window to leave room for
 * — so a lone decoration should fall for the whole take, not for `1 - spread` of it and then sit
 * there. Without this a one-piece cake at spread 0.85 landed after 0.75s of a 5s take and nothing
 * moved for the rest.
 */
export function pieceFlight(plan = ASSEMBLY_DEFAULTS, count = 2) {
  const n = Math.max(0, Math.floor(num(count, 0)));
  return totalOf(plan) * (n <= 1 ? 1 : 1 - spreadOf(plan));
}

/**
 * When piece `index` of `count` starts moving.
 *
 * ⚠️ `count - 1` IN THE DENOMINATOR, so the LAST piece starts exactly when the starting window
 * closes and the take still ends on time. Dividing by `count` would leave a gap at the end that
 * grows as pieces are added — the same class of off-by-one that makes a progress bar never finish.
 * With one piece there is no window at all, and 0/0 is guarded.
 */
export function pieceStart(index, count, plan = ASSEMBLY_DEFAULTS) {
  const n = Math.max(0, Math.floor(num(count, 0)));
  if (n <= 1) return 0;
  const i = Math.min(Math.max(0, num(index, 0)), n - 1);
  return totalOf(plan) * spreadOf(plan) * (i / (n - 1));
}

/**
 * Where piece `index` of `count` is at `t` seconds into the build.
 *
 * Returns `{ visible, rise }`:
 *   visible  false until its turn comes. ⚠️ A piece that has not started is NOT RENDERED, rather
 *            than rendered transparent — a GLB brings its own materials and making them fade means
 *            reaching into every one of them. Not drawing it is exact, free, and works for any
 *            mesh we are ever handed. At `spread` 0 nothing is ever hidden: they all start at once.
 *   rise     how far ABOVE its seat it currently sits, as a fraction of the cake's reach. 0 once
 *            it has landed, so a finished build is the design exactly as saved.
 */
export function assemblyPose(index, count, t, plan = ASSEMBLY_DEFAULTS) {
  const high = Math.max(0, num(plan?.rise, 0));
  const time = Math.max(0, num(t, 0));
  const start = pieceStart(index, count, plan);
  const flight = pieceFlight(plan, count);

  if (time < start) return { visible: false, rise: high };
  if (flight <= 0 || time >= start + flight) return { visible: true, rise: 0 };
  return { visible: true, rise: high * (1 - settle((time - start) / flight)) };
}

/** Has every piece landed? */
export function assemblyDone(t, plan = ASSEMBLY_DEFAULTS) {
  return num(t, 0) >= assemblyTotal(plan);
}
