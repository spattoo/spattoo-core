/* ── Deciding what a take should cost, before paying for it ──────────────────────────────────────
 *
 * A reel is rendered at 1080×1920 and captured live. On a current phone that is comfortable. On a
 * four-year-old Android with a loaded cake — a dozen toppers, piping all round — it is not, and the
 * failure is quiet: the recording still succeeds, it just comes out juddering.
 *
 * So the take is measured before it is committed to. A handful of frames are rendered at the size
 * being asked for, and if the device cannot keep up, the take is made cheaper rather than worse.
 *
 * Pure arithmetic, no renderer, no DOM: the rendering half lives in TakeDirector where the camera
 * is, and everything decided from it is here where it can be tested.
 */

/* Ladder, best first. Each rung is a real Instagram-acceptable portrait size.
 *
 * 720×1280 is 44% of the pixels of 1080×1920 — enough of a saving to matter, and still sharp on a
 * phone. There is deliberately no third rung: below this the video stops being worth posting, and a
 * reel nobody posts is not a cheaper success, it is a failure that took longer. */
export const RUNGS = [
  { width: 1080, height: 1920, label: '1080×1920' },
  { width: 720,  height: 1280, label: '720×1280' },
];

/* Above this many milliseconds per frame, the device is not sustaining the shot.
 *
 * 60fps is a 16.7ms budget. 20ms allows a little slack — a stray garbage collection or a topper
 * texture finishing upload should not demote a device that is otherwise fine — while still catching
 * anything genuinely below about 50fps. */
export const SLOW_MS = 20;

/* What to record, given what a probe measured.
 *
 * `msPerFrame` null (no probe ran, or it could not measure) means the top rung. Refusing to guess
 * downward matters: a device that was never measured is not a slow device, and quietly halving
 * everybody's resolution because a probe failed would be the worse bug of the two.
 */
export function planTake(msPerFrame) {
  if (msPerFrame == null || !Number.isFinite(msPerFrame) || msPerFrame <= SLOW_MS) {
    return { ...RUNGS[0], demoted: false };
  }
  return { ...RUNGS[1], demoted: true };
}

/* The median, not the mean.
 *
 * The first frame after a resize includes the reallocation of the drawing buffer, and any frame can
 * absorb a garbage collection. Either one drags a mean far enough to demote a device that is
 * perfectly capable — and the mean is what the first version of this used.
 */
export function medianOf(samples) {
  const xs = samples.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/* How far through the shot we are, from the CLOCK rather than from a frame counter.
 *
 * ⚠️ This is the difference between "4.5 seconds" meaning it and meaning it on fast hardware only.
 * The loop used to run a fixed `seconds × 60` iterations, one per animation frame — so a phone
 * managing 30fps took NINE seconds to get through them, and MediaRecorder timestamps in real time,
 * so the reel came out twice as long and half as fast as the baker chose. Nothing reported this;
 * the file was fine, it was just wrong.
 *
 * Driven by elapsed time, a slow device produces FEWER frames over the same duration — which is a
 * choppier reel of the correct length, and the probe above is what stops it being choppy. Duration
 * and motion are what the baker chose; frame count is the machine's business.
 */
export const progressAt = (elapsedMs, seconds) =>
  Math.min(1, Math.max(0, elapsedMs / (seconds * 1000)));
