/* ── A cake assembling itself ────────────────────────────────────────────────────────────────────
 *
 * Every decoration lands on the cake in turn, each one descending into its own place. The opening
 * shot for a demo: the sentence "every cake starts as a picture in someone's head" shown rather
 * than said. Sandeep, with an exploded-phone teardown as the reference: *"the elements of the
 * templates get assembled and makes a cake"*.
 *
 * ⚠️ BUILT, NOT GENERATED, AND THAT IS THE WHOLE POINT. A video model would invent *a* cake; it has
 * never seen this one. We hold every element's real position already, so the animation is those
 * positions with an offset eased away — exact, repeatable, and true of the template it is showing.
 *
 * ⚠️ PIECES ARRIVE IN THE ORDER THEY WERE PLACED, which is free and happens to be the honest one:
 * it replays how the cake was actually built. Sorting by height would read as tidier and would be a
 * story nobody told.
 *
 * ⚠️ PURE ARITHMETIC, NO RENDERER — `takePlan.js`'s bargain and `spinTake.js`'s. The applying half
 * is a few lines in the canvas, and the applying half is exactly where the hero spin broke: it
 * called two OrbitControls setters that do not exist, and every test passed because they were all
 * on the arithmetic. What touches somebody else's API gets its own guard; what is arithmetic lives
 * here where plain node can check it.
 */

/* ⚠️ SLOW MOTION IS GENERATED, NEVER POST-PROCESSED, and that is why it is a multiplier here
 * rather than a speed change in the editor. Slowing a clip in Descript or Screen Studio resamples
 * frames that were already captured, so it judders or softens; stretching these durations renders
 * every frame for real at the slower pace. The generator is the right place to be slow.
 *
 * `speed` divides the two durations and leaves `rise` alone — a piece travels the same distance,
 * it just takes longer about it, which is what slow motion IS. Scaling the distance too would make
 * the pieces start further away, which is a different shot. */
export function atSpeed(plan, speed = 1) {
  const k = Math.max(0.05, Number(speed) || 1);
  return { ...plan, perPiece: (plan?.perPiece ?? 0) / k, stagger: (plan?.stagger ?? 0) / k };
}

export const ASSEMBLY_DEFAULTS = Object.freeze({
  /* How long one piece takes to settle. Short: the piece is the event, not the journey. */
  perPiece: 0.45,
  /* The gap between one piece starting and the next. Smaller than `perPiece` on purpose, so pieces
     overlap in the air — a strict queue reads as a progress bar, not as a cake being built. */
  stagger: 0.18,
  /* How far above its seat a piece begins, as a fraction of the cake's own reach. A fraction, never
     a world distance, so the shot looks the same on a 6" round and a sheet (INVARIANTS #8). */
  rise: 0.55,
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/* Ease OUT only — fast away from the start, settling gently. A piece being placed by hand slows as
   it arrives and does not ease into leaving; symmetric easing makes every piece look weightless. */
const settle = (t) => { const k = clamp01(t); return 1 - (1 - k) * (1 - k) * (1 - k); };

/** When piece `index` starts moving. */
export function pieceStart(index, plan = ASSEMBLY_DEFAULTS) {
  return Math.max(0, Number(plan?.stagger ?? 0)) * Math.max(0, index);
}

/** Seconds the whole build runs for, for `count` pieces. */
export function assemblyTotal(count, plan = ASSEMBLY_DEFAULTS) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) return 0;
  return pieceStart(n - 1, plan) + Math.max(0, Number(plan?.perPiece ?? 0));
}

/**
 * Where piece `index` is at `t` seconds into the build.
 *
 * Returns `{ visible, rise }`:
 *   visible  false until its turn comes. ⚠️ A piece that has not started is NOT RENDERED, rather
 *            than rendered transparent — a GLB brings its own materials and making them fade means
 *            reaching into every one of them. Not drawing it is exact, free, and works for any
 *            mesh we are ever handed.
 *   rise     how far ABOVE its seat it currently sits, as a fraction of the cake's reach. 0 once
 *            it has landed, so a finished build is the design exactly as saved.
 */
export function assemblyPose(index, t, plan = ASSEMBLY_DEFAULTS) {
  const per = Math.max(0, Number(plan?.perPiece ?? 0));
  const high = Math.max(0, Number(plan?.rise ?? 0));
  const time = Math.max(0, Number(t) || 0);
  const start = pieceStart(index, plan);

  if (time < start) return { visible: false, rise: high };
  if (per <= 0 || time >= start + per) return { visible: true, rise: 0 };
  return { visible: true, rise: high * (1 - settle((time - start) / per)) };
}

/** Has every piece landed? */
export function assemblyDone(count, t, plan = ASSEMBLY_DEFAULTS) {
  return (Number(t) || 0) >= assemblyTotal(count, plan);
}
