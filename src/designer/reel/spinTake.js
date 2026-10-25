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
 * ⚠️ AZIMUTH MOVES ONLY DURING `turn`, and `back` unwinds whatever fraction of a revolution is
 * left over — that is what makes "back to normal" true. Let it drift through all four phases and
 * the final pose is wherever the arithmetic happened to land.
 *
 * ⚠️ IT TURNS AT THE SPEED THE TURNTABLE ALWAYS DID, AND THE SAME WAY ROUND. The first version made
 * the turn "exactly one revolution over `turn` seconds", which is tidy arithmetic and was twelve
 * and a half times too fast — the canvas's `autoRotateSpeed={0.8}` is one revolution per SEVENTY
 * FIVE seconds, not per six. It also ran backwards: `_rotateLeft` decrements theta, so autoRotate
 * turns one way and adding to theta turns the other. Sandeep: *"you increased the speed. earlier
 * speed was good. and your turning the opposite direction now."* Both numbers are read off
 * OrbitControls' own formula below rather than chosen.
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

/* The turntable's own pace, so a take looks like the spin the designer has always done.
 *
 * ⚠️ BOTH NUMBERS COME FROM OrbitControls, NOT FROM TASTE. Its `_getAutoRotationAngle` returns
 * `(2π / 60 * autoRotateSpeed) * deltaTime` radians per second, and the canvas has always set
 * `autoRotateSpeed={0.8}` — so the pace is 2π/60 × 0.8 ≈ 0.084 rad/s, one revolution every 75
 * seconds. Six seconds of it is about 29°: a drift, not a lap. That is the shot that was liked.
 *
 * ⚠️ NEGATIVE BECAUSE `_rotateLeft` SUBTRACTS. autoRotate calls it with a positive angle, so theta
 * DECREASES; adding to theta turns the cake the other way, which is what shipped. */
const TURN_SPEED = 0.8;                                  // the canvas's autoRotateSpeed
export const TURN_RATE = -(Math.PI * 2 / 60) * TURN_SPEED;   // radians per second, signed

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

  /* How far round the turn gets, and where `back` unwinds to: the nearest WHOLE revolution, so the
     cake finishes facing the way it started. At the default 6 seconds that is 29° out and 29° back;
     a turn long enough to lap simply has less to undo. Unwinding to zero instead would make a long
     take spool backwards through every revolution it had just made. */
  const turned = TURN_RATE * d.turn;
  const settled = Math.round(turned / (Math.PI * 2)) * Math.PI * 2;

  if (time >= total) return { azimuth: settled, polar: startPolar, done: true };

  // ── turn: a steady drift at the turntable's own pace ──────────────────────────────────────────
  if (time < d.turn) {
    /* Linear, not eased. A turntable runs at a constant speed, and easing it makes the cake appear
       to hesitate — which reads as a stutter in the recording, not as style. */
    return { azimuth: TURN_RATE * time, polar: startPolar, done: false };
  }
  const az = turned;

  // ── rise: lift toward the plan view ───────────────────────────────────────────────────────────
  const afterTurn = time - d.turn;
  if (afterTurn < d.rise) {
    const k = ease(afterTurn / d.rise);
    return { azimuth: az, polar: startPolar + (topPolar - startPolar) * k, done: false };
  }

  // ── top: hold ─────────────────────────────────────────────────────────────────────────────────
  const afterRise = afterTurn - d.rise;
  if (afterRise < d.top) return { azimuth: az, polar: topPolar, done: false };

  // ── back: settle to where it started, in both angles ──────────────────────────────────────────
  const afterTop = afterRise - d.top;
  const k = d.back > 0 ? ease(afterTop / d.back) : 1;
  return {
    azimuth: az + (settled - az) * k,
    polar: topPolar + (startPolar - topPolar) * k,
    done: false,
  };
}
