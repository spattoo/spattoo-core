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
 * ⚠️ AND THE CURVE HAS TO SPEND THE TIME, which is where the first version failed. It eased OUT only
 * — fast away from the start, asymptotically settling — on the reasoning that a piece placed by hand
 * slows as it arrives. True, and it made `total` almost unobservable: measured on an 11-second take,
 * a piece was half way down at 2.3s and 90% down at 5.9s, so the last FIVE SECONDS moved it the
 * final tenth and the take looked finished at six. Sandeep set 11s and reported *"it finished faster
 * … it did not really slow it down."* An ease that asymptotes cannot express a duration.
 *
 * The curve is now a smoothstep, eased at BOTH ends. Same 11s take, measured: half way at 5.5s, 98%
 * down at 10.1s, and no single second carries more than 14% of the drop. The piece still lands
 * gently — it just stops pretending to be finished for the second half of the shot.
 *
 * ⚠️ AND THEY DO NOT ALL ARRIVE THE SAME WAY. Sandeep: *"many elements starting from same point.
 * can it be random? and why all have to come from top?"* With one height and one swing for the whole
 * cake, the decorations are a rigid copy of the finished arrangement floating above it — they move
 * together, so the eye reads one object, not many pieces. `scatter` gives each piece its own start
 * height, its own amount of swing, its own DIRECTION of swing, and a horizontal reach: how far out
 * it begins, and on which bearing. A piece with a small height and a large reach flies in sideways
 * across the board; one with the reverse drops in from overhead. Everything still lands exactly on
 * its seat.
 *
 * ⚠️ RANDOM PER PIECE, IDENTICAL EVERY RUN. The variety is a HASH OF THE INDEX, not `Math.random`.
 * This module's whole claim is that the take is "exact, repeatable, and true of the template it is
 * showing" — a shot you cannot film twice is not a shot, and a baker who re-records after a tweak
 * should get the same choreography back.
 *
 * ⚠️ THEY COME FROM FURTHER, AND THEY MAY CIRCLE. Sandeep: *"the elements are coming from very near.
 * they can come from bit far, if needed they can turn around the cake before getting added on
 * cake."* `rise` is the height, `swing` is how far around the cake axis a piece travels on the way
 * in — both unwind on the same eased progress, so the path is one clean spiral rather than a drop
 * with a turn bolted on.
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
     a world distance, so the shot looks the same on a 6" round and a sheet (INVARIANTS #8).
     ⚠️ 0.55 WAS TOO CLOSE — "the elements are coming from very near". A piece that starts barely
     above its seat has nowhere to travel, so the whole take reads as a twitch however long it runs. */
  rise: 1.3,
  /* How far around the cake a piece swings on its way in, in TURNS. 0.25 is a quarter circle, 1 is
     a full lap. The piece's seat is what rotates, so it arrives facing exactly as designed. */
  swing: 0.3,
  /* How differently each piece arrives, 0…1. At 0 every decoration starts at the same height and
     sweeps the same way — one rigid cake floating above the cake. Higher gives each its own height,
     its own swing (including which way round), and its own bearing to come in on. */
  /* ⚠️ HIGH BY DEFAULT. 0.55 was reported as "a heap" twice over — the variety has to be obvious
     without anyone going looking for this slider. */
  scatter: 0.85,
});

/* ⚠️ A CEILING ON `spread`, because at 1 every piece would have ZERO time to fall: the starts would
   fill the whole take and the last piece would be asked to travel its distance in no time at all,
   which is a teleport, not a landing. 0.85 leaves every piece at least 15% of the take to fly. */
export const MAX_SPREAD = 0.85;

/* The panel's ceilings. `rise` is a fraction of the cake's reach, so 4 is four cake-radii up — high
   enough that a piece enters frame from outside it, which is the "from far" shot. `swing` is in
   turns; past about two laps a piece reads as orbiting scenery rather than arriving. */
export const MAX_RISE = 4;
export const MAX_SWING = 2;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/* ⚠️ EASED AT BOTH ENDS — smoothstep, not the ease-out this started with. The header has the
   measurement; the short version is that an ease-out asymptotes, so the back half of a long take is
   motion too small to see and `total` stops meaning anything. Smoothstep puts the halfway point at
   the halfway mark and still arrives gently. */
const settle = (t) => { const k = clamp01(t); return k * k * (3 - 2 * k); };

/* ⚠️ `??` DOES NOT CATCH NaN, and that is how NaN reached a position. It only replaces null and
   undefined, so a plan carrying NaN — which is what a slider hands over mid-drag, and what
   `JSON.stringify` quietly turns into `null` when you go looking — sailed through `Number(x ?? 0)`
   and came out the other side as a decoration that vanished with nothing to say why. */
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

const spreadOf = (plan) => Math.min(MAX_SPREAD, Math.max(0, num(plan?.spread, 0)));
const totalOf  = (plan) => Math.max(0, num(plan?.total, 0));
const riseOf   = (plan) => Math.min(MAX_RISE, Math.max(0, num(plan?.rise, 0)));
const swingOf  = (plan) => Math.min(MAX_SWING, Math.max(-MAX_SWING, num(plan?.swing, 0)));
const scatterOf = (plan) => Math.min(1, Math.max(0, num(plan?.scatter, 0)));

const TAU = Math.PI * 2;

/* A stable number in [0, 1) for piece `i` on channel `salt`.
   ⚠️ NOT `Math.random`. See the header: the same cake must film the same way every time. */
/** The fractional part, for the low-discrepancy walks in pieceJitter. */
const frac = (v) => v - Math.floor(v);

function hash01(i, salt) {
  let h = Math.imul((i | 0) + 1, 0x9E3779B1) ^ Math.imul((salt | 0) + 1, 0x85EBCA77);
  h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297A2D39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * Where THIS piece starts, as a DIRECTION and a distance from its seat.
 *
 * ⚠️ A DIRECTION, NOT A HEIGHT WITH A NUDGE — and the first version got this wrong in a way that
 * survived two rounds of "it's better now". It varied the height and added a small sideways reach,
 * which sounds like the same thing and is not: measured at the default setting, every piece started
 * between 1.3x and 5.7x further UP than ACROSS, so all eight still fell more or less straight down
 * from more or less the same altitude. Sandeep, twice: *"all are coming as a heap … why all from
 * top to bottom direction?"* Varying the length of a mostly-vertical vector cannot answer that.
 *
 * So each piece gets an ELEVATION — 90° is straight overhead, 10° is almost along the board — plus
 * an azimuth and its own distance. A piece at 15° flies in low across the table; one at 80° drops
 * from above; and because the distance varies too they do not set off as a slab.
 *
 * ⚠️ AT `scatter` 0 EVERY ELEVATION IS 90° AND EVERY DISTANCE IS 1x, which is exactly the old
 * uniform choreography — `cos(90°)` is 0, so the sideways terms vanish rather than being special-
 * cased. A plan that asks for no variety is not perturbed by anything in here.
 */
function pieceJitter(index, plan) {
  const sc = scatterOf(plan);
  /* ⚠️ `up`/`out` RATHER THAN AN ANGLE, so the uniform case is EXACT. Returning elev = π/2 and
     letting the caller take its cosine leaves 6.1e-17 behind — `Math.cos(Math.PI / 2)` is not 0 —
     and a piece at scatter 0 drifted sideways by 8e-17 of a cake. Harmless on screen and wrong in
     principle: "no variety" has to mean no variety. Resolving the direction here lets that branch
     return the exact pair. */
  if (sc <= 0) return { distMul: 1, up: 1, out: 0, az: 0, swingMul: 1 };
  const i = Math.max(0, Math.floor(num(index, 0)));
  /* ⚠️ SPREAD BY CONSTRUCTION, NOT BY LUCK. Independent hashes are "random" and cluster: with the
     first version's eight pieces every elevation landed between 57° and 77°, which is a heap with
     extra steps. These two walk the range in golden-ratio steps — a low-discrepancy sequence, so
     ANY number of pieces comes out evenly spread, three as well as a hundred and eighty-one, and
     consecutive pieces are never near each other.
     The offsets just stop piece 0 always starting at the same place. */
  const elevFrac = frac(i * 0.6180339887498949 + 0.37);
  const azFrac   = frac(i * 0.3819660112501051 + 0.11);
  /* How far DOWN from straight-overhead. At full scatter the shallowest is a few degrees above the
     board — a piece skimming in across the table — and the steepest still clearly off the vertical,
     so the set never reads as one column. */
  const drop = (0.1 + elevFrac * 0.9) * sc;
  const elev = (Math.PI / 2) * (1 - drop);
  return {
    up: Math.sin(elev),
    out: Math.cos(elev),
    az: azFrac * TAU,
    // Distances spread too, or a ring of pieces sets off as a slab and lands as one.
    distMul: 1 + (hash01(i, 4) * 2 - 1) * sc * 0.7,
    // Magnitude AND direction: half the pieces sweep in the other way round the cake.
    swingMul: (hash01(i, 2) < 0.5 ? -1 : 1) * (1 + (hash01(i, 3) * 2 - 1) * sc * 0.6),
  };
}

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
 * Returns `{ visible, rise, swing }`:
 *   visible  false until its turn comes. ⚠️ A piece that has not started is NOT RENDERED, rather
 *            than rendered transparent — a GLB brings its own materials and making them fade means
 *            reaching into every one of them. Not drawing it is exact, free, and works for any
 *            mesh we are ever handed. At `spread` 0 nothing is ever hidden: they all start at once.
 *   rise     how far ABOVE its seat it currently sits, as a fraction of the cake's reach. 0 once
 *            it has landed, so a finished build is the design exactly as saved.
 *   swing    RADIANS still to travel around the cake's axis before it is over its seat. Also 0 on
 *            landing, and for the same reason: the take has to end on the design, not near it.
 *   offX,offZ  how far from over its seat it currently sits, ACROSS the board, as fractions of the
 *            cake's reach. This is the half that lets a piece arrive from the side instead of from
 *            overhead. 0 on landing, like everything else.
 *
 * ⚠️ ALL OF THEM UNWIND ON ONE EASED PROGRESS, so height, angle and ground distance are locked
 * together and the piece flies a single path. Easing them separately is how an arrival ends up
 * drifting sideways after it has already touched down.
 */
export function assemblyPose(index, count, t, plan = ASSEMBLY_DEFAULTS) {
  const j = pieceJitter(index, plan);
  /* `rise` is now "how far away it starts", resolved along the piece's own direction. Straight up
     when the elevation is 90°, which is what scatter 0 gives every piece. */
  const dist = riseOf(plan) * j.distMul;
  const high = dist * j.up;
  const flat = dist * j.out;
  const turn = swingOf(plan) * TAU * j.swingMul;
  const offX = flat * Math.cos(j.az);
  const offZ = flat * Math.sin(j.az);
  const time = Math.max(0, num(t, 0));
  const start = pieceStart(index, count, plan);
  const flight = pieceFlight(plan, count);

  if (time < start) return { visible: false, rise: high, swing: turn, offX, offZ };
  if (flight <= 0 || time >= start + flight) {
    return { visible: true, rise: 0, swing: 0, offX: 0, offZ: 0 };
  }
  const left = 1 - settle((time - start) / flight);
  return {
    visible: true,
    rise: high * left,
    swing: turn * left,
    offX: offX * left,
    offZ: offZ * left,
  };
}

/** Has every piece landed? */
export function assemblyDone(t, plan = ASSEMBLY_DEFAULTS) {
  return num(t, 0) >= assemblyTotal(plan);
}
