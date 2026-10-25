/* ── The hero spin, as a camera move ─────────────────────────────────────────────────────────────
 *
 * A cake turning on a turntable, then lifting to a plan view, holding, and settling back. Four
 * phases, each with its own duration, because the take has to fit a narration whose length is
 * already known — Sandeep's shot is *"total 10 seconds - 6 turning, 3 over the cake, 1 get back to
 * normal"*, and the first attempt at it was 14." 
 *
 *   turn   the cake revolves once, level              — the establishing shot
 *   rise   the camera lifts toward straight down       — reveals the TOP, which is where the
 *                                                        decorating happened
 *   top    it holds there                              — the beat that lets somebody look
 *   back   it settles to where it started              — so the take can be cut into anything
 *
 * ⚠️ PURE ARITHMETIC, NO RENDERER — the same bargain `takePlan.js` makes and for the same reason.
 * A camera move that can only be checked by watching it is a camera move nobody checks. Everything
 * decided here is testable in plain node; the half that touches three.js is a dozen lines in the
 * canvas that do nothing but apply these two numbers.
 *
 * ⚠️ AZIMUTH MOVES ONLY DURING `turn`, AND THAT IS WHAT MAKES "BACK TO NORMAL" TRUE. The turn is
 * exactly one revolution, so it ENDS where it began; the other three phases move the polar angle
 * alone. Let the azimuth drift through all four and the final pose is wherever the arithmetic
 * happened to land, and the 1-second return becomes a 180° lurch to catch up. Predictability is
 * worth more than the slightly nicer drifting top-down.
 */

/* Sandeep's shot: *"its total 10 seconds - 6 turning, 3 over the cake, 1 get back to normal"*.
 *
 * ⚠️ THAT IS THREE SEGMENTS AND THIS IS FOUR, because getting over the cake is a MOVE and a move
 * takes time out of the three seconds — it cannot arrive for free. So the 3 is split: one second
 * lifting, two actually looking down. The alternative readings are a slower, more cinematic lift
 * (rise 1.5 / top 1.5) or a near-cut (rise 0.5 / top 2.5), and the panel is there precisely so that
 * is a slider and not an argument. The total is 10 either way.
 *
 * A starting point a baker tunes, never a fixed shape — the panel writes all four and `spinPose`
 * reads whatever it is given. */
export const SPIN_DEFAULTS = Object.freeze({ turn: 6, rise: 1, top: 2, back: 1 });

/* How far "top" is. ⚠️ NOT ZERO, deliberately: straight down is the pole, where the camera's up
   vector has nothing to disambiguate it and the view can flip as it arrives. A few degrees short
   looks identical and cannot gimbal. */
export const TOP_POLAR = 0.12;

/* Phases in order. A list rather than four ifs, so `spinTotal` and `spinPose` cannot disagree about
   what the phases are or what order they run in. */
export const SPIN_PHASES = ['turn', 'rise', 'top', 'back'];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// Smoothstep: starts and ends at rest. A linear lift arrives at the top and stops dead, which reads
// as a missed keyframe rather than as a camera move.
const ease = (t) => { const k = clamp01(t); return k * k * (3 - 2 * k); };

/** Seconds the whole take runs for. */
export function spinTotal(plan = SPIN_DEFAULTS) {
  return SPIN_PHASES.reduce((s, k) => s + Math.max(0, Number(plan?.[k] ?? 0)), 0);
}

/**
 * Where the camera should be at `t` seconds into the take.
 *
 * `startPolar` is wherever the baker had the cake when they pressed go — the take lifts from the
 * angle they chose and returns to it, rather than snapping to one of ours first.
 *
 * Returns `{ azimuth, polar, done }`:
 *   azimuth  RADIANS TO ADD to the starting azimuth, not an absolute bearing. The caller holds the
 *            start; this says how far round from it we are, which is what makes one revolution
 *            exactly one revolution however the cake was facing.
 *   polar    an absolute polar angle, because it interpolates between two known ends.
 */
export function spinPose(t, plan = SPIN_DEFAULTS, startPolar = Math.PI / 3) {
  const d = {};
  for (const k of SPIN_PHASES) d[k] = Math.max(0, Number(plan?.[k] ?? 0));
  const total = spinTotal(d);
  const time = Math.max(0, Number(t) || 0);
  const topPolar = Math.min(startPolar, TOP_POLAR);

  if (time >= total) return { azimuth: d.turn > 0 ? Math.PI * 2 : 0, polar: startPolar, done: true };

  // ── turn: one full revolution, level ──────────────────────────────────────────────────────────
  if (time < d.turn) {
    /* Linear, not eased. A turntable runs at a constant speed, and easing the revolution makes the
       cake appear to hesitate at the front — which reads as a stutter in the recording, not style. */
    return { azimuth: (time / d.turn) * Math.PI * 2, polar: startPolar, done: false };
  }
  // Everything after the turn sits at a whole revolution: back where it started, facing front.
  const az = d.turn > 0 ? Math.PI * 2 : 0;

  // ── rise: lift toward the plan view ───────────────────────────────────────────────────────────
  const afterTurn = time - d.turn;
  if (afterTurn < d.rise) {
    const k = ease(afterTurn / d.rise);
    return { azimuth: az, polar: startPolar + (topPolar - startPolar) * k, done: false };
  }

  // ── top: hold ─────────────────────────────────────────────────────────────────────────────────
  const afterRise = afterTurn - d.rise;
  if (afterRise < d.top) return { azimuth: az, polar: topPolar, done: false };

  // ── back: settle to where it started ──────────────────────────────────────────────────────────
  const afterTop = afterRise - d.top;
  const k = d.back > 0 ? ease(afterTop / d.back) : 1;
  return { azimuth: az, polar: topPolar + (startPolar - topPolar) * k, done: false };
}
