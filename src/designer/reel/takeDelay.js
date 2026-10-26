/* ── A head start before the take begins ─────────────────────────────────────────────────────────
 *
 * Sandeep: *"add a feature like 'start after n seconds', so the actual assembling video or the spin
 * video starts after selected number of seconds, this is useful in case of screen recording."*
 *
 * The need is plain: both takes are filmed by pointing a screen recorder at the designer, and you
 * cannot press Start in the browser and press Record in another app at the same instant. The delay
 * buys the hand-over.
 *
 * ⚠️ ONE SETTING FOR BOTH TAKES, because it is a property of how you are RECORDING, not of what you
 * are filming. A build and a spin set up the same way: arm it, cross to the recorder, let it run.
 *
 * ⚠️ NOTHING ABOUT THE SCENE MAY CHANGE DURING THE WAIT. The lens, the camera and every decoration
 * stay exactly as they were — the take begins whole, at the end of the count, or the recording opens
 * on a lens jump the baker did not ask for. That is why the delay lives out here and not inside
 * `assemblyTake` or `spinTake`: it is time BEFORE a take, not part of one.
 *
 * ⚠️ AND THE COUNT IS GONE BEFORE THE FIRST FRAME OF THE TAKE. The caller clears it and starts the
 * take in the same React commit, so no rendered frame ever carries both. A number burned over the
 * opening second of the build would be in the recording for good.
 */

/** The longest head start offered. Fifteen seconds is an unhurried walk to another window. */
export const DELAY_MAX = 15;

/** Off by default — pressing Start still starts it, which is what every earlier take did. */
export const DELAY_DEFAULT = 0;

/**
 * The number to show with `ms` milliseconds still to wait.
 *
 * ⚠️ CEIL, NOT FLOOR, AND THIS IS THE WHOLE REASON THIS FUNCTION EXISTS. `Math.floor(ms / 1000)`
 * reads 0 for the entire last second — so a three-second count shows "3, 2, 1, 0" and sits on a
 * zero that means "still waiting", which looks like a stuck screen at the exact moment the baker is
 * watching for the start. Ceiling counts 3, 2, 1 and then the count is simply gone.
 *
 * Returns 0 only when the wait is actually over, which the caller treats as "do not draw it".
 */
export function secondsLeft(ms) {
  const v = Number(ms);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.ceil(v / 1000);
}

/** Keep a delay inside what the panel can ask for, and make rubbish mean "no delay". */
export function clampDelay(seconds) {
  const v = Number(seconds);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(DELAY_MAX, v);
}
