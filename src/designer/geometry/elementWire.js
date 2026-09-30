import { ELEMENT_STICK_DEFAULTS, STICK_SCALE } from './elementStick.js';

// ── A catalogue element floating on a bendable wire ─────────────────────────────────────────────
//
// Butterflies hovering off a cake, each on a thin white wire that springs out of the icing and
// curves. Sandeep, with two reference photographs: *"if you see these butterflies are standing on a
// white color bendable wire. we already have butterfly elements, however we need to be able to
// attach this wire support."*
//
// ⚠️ A WIRE IS NOT A LONGER PICK, AND THAT IS THE WHOLE REASON THIS FILE EXISTS. `elementStick`
// already answers "a rod below the element, some of it buried", and the temptation is to raise its
// length multiplier and thin its radius and call the result a wire. Three things break:
//
//     a pick is STRAIGHT        a wire BOWS, and the bow is what reads as wire rather than skewer
//     a pick holds it UP        a wire holds it OUT — the piece floats clear of the cake, off-axis
//     a pick is one stiffness   a wire is bent by hand, so no two on one cake are alike
//
// The bow is not decoration. A straight white rod at this thickness reads as a pin; the same rod
// with a gentle S reads instantly as florist wire, because that is the only thing that shape is.
//
// ⚠️ IT RETURNS A PATH, NOT A GEOMETRY, which is `rainbow.js`'s arrangement and not an accident.
// The renderer wants a TubeGeometry, tests want numbers they can assert about, and the build guide
// wants a length in centimetres. A module that returned a THREE.BufferGeometry could serve exactly
// one of those three. See rainbow.js:748 for the same split.
//
// ⚠️ EVERY DIMENSION IS A MULTIPLE OF THE ELEMENT'S OWN BOX — INVARIANTS #8. A wire measured in
// world units is correct for one butterfly on one cake size and wrong everywhere else, and it stops
// being proportional the moment a customer resizes the piece.

/** What the code believes about a wire when a row authors nothing.
 *
 *  ⚠️ THESE ARE STARTING POINTS FOR A TUNING SESSION, NOT MEASUREMENTS. `elementStick`'s 2.2 and 2.6
 *  were chosen in dev/element-stick.html against a render, which is the only way numbers like these
 *  ever become right. dev/element-wire.html is the equivalent here — change them THERE, against a
 *  picture, and copy the answer back. */
export const ELEMENT_WIRE_DEFAULTS = Object.freeze({
  /* How far the tip stands off, as a multiple of the element's height. A butterfly perched a third
     of its own width from the icing is a brooch; the reference photographs show them one to three
     widths out, which is what makes the swarm read as flight.

     ⚠️ 4, AND IT HAS BEEN 3 THEN 6 BEFORE LANDING HERE — each move made against a render rather
     than at a desk. 3 was a desk guess and the bow was a wobble at the size a piece is actually
     seen; 6 was chosen on a fondant heart, which is roughly square, and reads long under a
     butterfly, whose width makes the same multiple of its HEIGHT carry much further. Sandeep, on a
     butterfly at the top of the range: *"lets have a default value as 4, not as 6."*

     ⚠️ AND IT IS ONLY THE FALLBACK. A row that authors `placement_config.wire.length` overrides it,
     and that is where the real answer for any given element belongs — Sandeep: *"default value
     should be from the configured value in manage elements."* This number exists so a blank field
     renders something sensible, not so it decides anything. */
  length: 4.0,
  /* Multiplier on WIRE_GAUGE below.

     ⚠️ 2.5, NOT 1, BECAUSE "TRUE TO LIFE" WAS THE WRONG TARGET. Real florist wire is meant to
     disappear, and at 1 it duly did — Sandeep, looking at two butterflies on a cake: *"wire is
     barely visible."* A stem a baker cannot see is a control they will believe is broken, and on a
     phone at arm's length it is a couple of pixels. The render is not a photograph; it has to SAY
     "there is a wire here" at the size the cake is actually looked at. */
  thickness: 2.5,
  /* How far the wire bows away from the straight line between its two ends, as a fraction of its
     own length. Zero is a straight stem.

     ⚠️ 0, AND IT WAS 0.35 — A DELIBERATE CHOICE THAT THE ANGLE CONTROL OVERTURNED. The old note
     said a straight rod "reads as a skewer, not a wire", and on the cake TOP, where a stem is a
     short vertical line, that was true. On a WALL it is not: a bow of 0.35 over two kinks is an
     S-curl, and once the piece can be pushed in at a chosen angle the curl is the only thing the
     eye reads — the stem no longer points anywhere. Sandeep, with a butterfly on the side at 65°:
     *"it should be directly inserting — straight line first. then twisting should be the user
     choice. in this case, i cant make it stand with angle."*

     ⚠️ SO THE BOW BECOMES OPT-IN, WHICH IS ALSO THE RIGHT ORDER. A baker places a piece, sees it
     go in where they meant, and then bends the wire if they want it bent. A default that arrives
     pre-curled makes the first thing they see the hardest to reason about, and hides the two
     controls — Angle and Long — that decide where the piece actually sits. Bend, Kinks and Twist
     are all still there, one dial away, and they do exactly what they did before. */
  bend: 0,
  /* WHICH WAY it bows, in degrees around the cake's axis. Not a tilt — see `wireFor`. Varying this
     between pieces is what stops a swarm of butterflies looking like a row of pins. */
  sweep: 35,
  /* How steeply a WALL wire climbs out of the icing, in degrees above horizontal. Ignored on the top
     surface and the rim, which have a direction of their own.
     ⚠️ 45, AND 31 WAS TOO SHALLOW TO READ. The angle only gets to act on the part of the wire that
     is outside the cake, and at the default burial that is half of it — so an angle that looks
     reasonable as a number is a few pixels of rise on screen. Chosen against the render, not the
     arithmetic. */
  angle: 45,
  /* ── How many bends, and how much the wire turns as it climbs ────────────────────────────────
   *
   * ⚠️ ONE BEND IS A HOOK, NOT A BENT WIRE. `sin(pi·t)` bows out and comes back — a C — which is
   * what a wire looks like if you bend it once, deliberately, in the middle. Nobody bends florist
   * wire that way. Sandeep: *"right now there is only one bending. we should also be twisting the
   * wire. for example like a s shape etc. a slight zig zag is normal in cake decoration."*
   *
   * `waves` is the number of half-bends, so the same one line of arithmetic gives all of them:
   *
   *     1   a C — one bulge, the old shape
   *     2   an S — out, back through the axis, out the other way
   *     3   a zigzag
   *
   * ⚠️ AND `twist` IS THE OTHER HALF, WHICH A PLANAR CURVE CANNOT FAKE. Every bend above happens in
   * ONE plane; real wire bent by hand wanders out of it, so the S you see from the front is a
   * different S from the side. Turning the bow's plane as the wire climbs costs one term and is the
   * difference between a drawn squiggle and something that looks bent by fingers.
   *
   * 2 and 25° rather than 1 and 0: an S with a little wander is what the reference photographs show,
   * and a default nobody changes should look like the thing being copied. */
  waves: 2,
  twist: 25,
  /* How much of the wire is pushed into the cake. Shares the pick's default so a baker moving an
     element between the two does not find the depth has changed under them. */
  bury: ELEMENT_STICK_DEFAULTS.bury,
  /* Bare wire, white. A florist's stem wire is paper-wrapped white or pale green; every reference
     photograph shows white. A row may name a finish for a gold-wrapped stem. */
  finish: null,
});

/* ── A wire's length has its own range, and borrowing the pick's was a bug ──────────────────────
 *
 * ⚠️ THE DEFAULT SAT EXACTLY ON THE CEILING. `STICK_SCALE` is 0.25–6, which is a sensible span for a
 * cocktail stick under a card; the wire's tuned default is 6, so every control built from that range
 * could only ever make a wire SHORTER. A default with no headroom above it is a control that does
 * half of what it looks like it does.
 *
 * A wire is also genuinely longer than a pick — the reference photographs show butterflies one to
 * three of their own widths clear of the icing, where a pick barely reaches past the piece it
 * carries. So it gets its own span rather than the one it was nearest to.
 */
export const WIRE_LENGTH = Object.freeze({ min: 1, max: 9, step: 0.5 });

/* The wire's own gauge, as a fraction of the element's height. Chosen against a render in
   dev/element-wire.html rather than guessed: at 0.017 a heart's stem reads as wire, at half that it
   disappears on a phone, and at double it reads as a painted skewer. */
export const WIRE_GAUGE = 0.017;

/** The range a bend may take. Beyond about half its own length a wire reads as a spring, not a
 *  stem, and the tube starts to self-intersect at the tight end of the curve. */
export const WIRE_BEND = Object.freeze({ min: 0, max: 0.5, step: 0.02 });

/** How many half-bends the wire carries. Past four it reads as a spring rather than a stem, and the
 *  tube starts to pinch where the curve doubles back on itself. */
export const WIRE_WAVES = Object.freeze({ min: 1, max: 4, step: 1 });

/** How far the bow's plane turns between the buried end and the tip, in degrees. A full turn makes
 *  a corkscrew; a quarter of one is the wander a hand leaves. */
export const WIRE_TWIST = Object.freeze({ min: 0, max: 180, step: 5 });

/** The bow's direction, all the way round. A full circle so a baker can point it away from
 *  whatever it would otherwise cross. */
export const WIRE_SWEEP = Object.freeze({ min: 0, max: 360, step: 15 });

/** How steeply a WALL wire climbs as it leaves the icing, in degrees above horizontal.
 *
 * ⚠️ THIS WAS A CONSTANT AND IT SHOULD NOT HAVE BEEN. It started at 0 — dead horizontal, a flagpole
 * — which Sandeep photographed: *"its inserting horizontally. thats not how its done."* Fixing it by
 * hard-coding 31° then produced a picture he read as still horizontal, because at the default burial
 * only half the wire is outside the cake and 31° over that short a run is a few pixels. *"can we
 * have control for the angle with which it needs to be inserted."*
 *
 * ⚠️ AND THE ENDS EXCLUDE THE LOOK THAT WAS REJECTED. 0 is the flagpole this replaced, so the floor
 * is well above it; past about 75 the wire is diving into the wall and the piece reads as hung from
 * a hook rather than standing off. A dial that can reach a setting no cake has is not more useful.
 *
 * Meaningless on the top surface, where the wire runs straight down — see `frameFor`. */
export const WIRE_ANGLE = Object.freeze({ min: 20, max: 75, step: 5 });

const clamp = (v, { min, max }, fallback) =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback);

/**
 * The wire an element OFFERS, from its row.
 *
 * ⚠️ THE SAME SPLIT AS `elementStick`, AND FOR THE SAME REASON: `allowed_actions` says what a
 * customer MAY do, `placement_config` carries the values. A row that authors a bend but never ticks
 * the box offers no wire — the tick is the decision, the numbers only shape it once taken.
 */
export function elementWire(placementConfig, allowedActions) {
  const cfg = placementConfig?.wire ?? {};
  return {
    offered:   allowedActions?.wire === true,
    length:    clamp(cfg.length,    WIRE_LENGTH, ELEMENT_WIRE_DEFAULTS.length),
    thickness: clamp(cfg.thickness, STICK_SCALE, ELEMENT_WIRE_DEFAULTS.thickness),
    bend:      clamp(cfg.bend,      WIRE_BEND,   ELEMENT_WIRE_DEFAULTS.bend),
    sweep:     clamp(cfg.sweep,     WIRE_SWEEP,  ELEMENT_WIRE_DEFAULTS.sweep),
    waves:     clamp(cfg.waves,     WIRE_WAVES,  ELEMENT_WIRE_DEFAULTS.waves),
    twist:     clamp(cfg.twist,     WIRE_TWIST,  ELEMENT_WIRE_DEFAULTS.twist),
    bury:      clamp(cfg.bury,      { min: 0, max: 1 }, ELEMENT_WIRE_DEFAULTS.bury),
    /* ⚠️ FORWARDED HERE OR AN ADMIN ROW CANNOT AUTHOR IT. This function is an allow-list, not a
       spread: a key missing from it never reaches the designer however carefully it was typed into
       placement_config, and the control silently falls back to the code default. toCanvasConfig ate
       a whole feature that way earlier the same week. */
    angle:     clamp(cfg.angle,     WIRE_ANGLE,  ELEMENT_WIRE_DEFAULTS.angle),
    finish:    typeof cfg.finish === 'string' ? cfg.finish : ELEMENT_WIRE_DEFAULTS.finish,
  };
}

/* ── Which way the wire runs, and the two directions its bow may use ────────────────────────────
 *
 * ⚠️ A WIRE IS NOT ALWAYS VERTICAL, WHICH THE FIRST VERSION ASSUMED THROUGHOUT. On the cake top it
 * goes down into the icing; on the WALL it goes horizontally into it, and the piece floats out from
 * the side rather than above. Sandeep: *"When the butterfly is on the side of the cake, wire is not
 * applying. we should be able to insert from sidewise as well."*
 *
 * The shape is identical in both — same bow, same kinks, same twist — so only the FRAME differs:
 * a direction to run in, and two perpendicular axes for the bow to swing through. Written as data
 * rather than a branch, because a second copy of the curve is how the two drift apart.
 *
 *   down   the top surface. Runs from the piece's bottom edge into the icing; bows in the horizontal
 *          plane, so `sweep` is a compass bearing.
 *   out    a wall. Runs backwards into it from the piece's own plane; bows in the plane of the wall,
 *          so `sweep` chooses between up-and-down and side-to-side.
 *   lip    the rim. Runs down AND BACK, because a verge piece is cantilevered OUT over the edge —
 *          straight down from there misses the cake entirely and the wire hangs on the outside of
 *          the wall for its whole length. Leaning it back puts the buried end in the top surface
 *          just inside the rim, which is where a decorator would actually push it.
 *
 * ⚠️ A LEAN IS RIGHT HERE AND WRONG ON THE TOP SURFACE, WHICH LOOKS LIKE AN INCONSISTENCY AND IS
 * NOT. On the top the piece sits over its own anchor, so leaning the base moves it OFF the cake —
 * that shipped once and hung a wire in mid-air beside the board. On the rim the piece is already
 * past the edge, so leaning the base moves it BACK ON. Same change, opposite sign, because the two
 * poses start on opposite sides of the cake's edge.
 */
/* The rim's lean: mostly down, somewhat out. The wall's equivalent is authored now (WIRE_ANGLE), so
   this pair is the rim's alone. */
const DIAG = Math.hypot(1, 0.6);
const AXES = {
  down: { dir: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  lip:  { dir: [0, -1 / DIAG, -0.6 / DIAG], u: [1, 0, 0], v: [0, 0.6 / DIAG, -1 / DIAG] },
};

/**
 * The frame a wire runs in: where it goes, and the two directions its bow can bow in.
 *
 * ⚠️ THE WALL FRAME IS COMPUTED, THE OTHER TWO ARE NOT, and that asymmetry is the feature. A wire
 * leaving a wall can be pushed in at any angle a hand chooses and every reference shows a different
 * one; a wire in the top surface goes straight down because that is the only way in. So `angle`
 * drives `out` alone.
 *
 * `dir` runs from the piece toward the BURIED end, so it points down as well as in — the piece ends
 * up above and outside its own entry point, which is what a wired butterfly does. `v` is `dir`
 * turned a quarter turn so the bow still bulges "up" whatever the angle.
 */
export function frameFor(axis, angleDeg) {
  if (axis !== 'out') return AXES[axis] ?? AXES.down;
  const a = (clamp(angleDeg, WIRE_ANGLE, ELEMENT_WIRE_DEFAULTS.angle) * Math.PI) / 180;
  const s = Math.sin(a), c = Math.cos(a);
  return { dir: [0, -s, -c], u: [1, 0, 0], v: [0, c, -s] };
}

/* How many points describe the curve. Enough that a TubeGeometry reads smooth at the bend's tight
   end; few enough that a cake carrying twenty butterflies is not paying for four thousand. */
/* ⚠️ ODD, SO THERE IS A SAMPLE AT THE APEX. The bow is `sin(pi·t)` and its deepest point is exactly
   halfway; an even count straddles that with two samples at 0.478 and 0.522, so the drawn curve
   never quite reaches the bend it was asked for and the shortfall grows as the count falls. */
const SAMPLES = 25;

/**
 * The wire to DRAW for a placed instance, or null.
 *
 * `box` is the element's measured bounds — the same `onVExtent` box the selection outline uses — so
 * everything here is proportional to the piece it carries and survives a resize (INVARIANTS #8).
 *
 * ⚠️ POINTS ARE IN THE ELEMENT'S OWN FRAME, WHERE THE ORIGIN IS ITS CENTRE. This is the frame the
 * renderer's group is already in, and getting it wrong is not hypothetical: the pick shipped hanging
 * `h/2` too high because `topperStick` answers in the BOX's frame and the renderer drew from the
 * group's. One conversion, done here, so the renderer reads a path and adds nothing.
 *
 * @returns {{ points: {x,y,z}[], radius: number, len: number, buried: number,
 *             tip: {x,y,z}, baseY: number } | null}
 */
export function wireFor(box, instanceWire, rowWire, { axis = 'down' } = {}) {
  if (!instanceWire?.on || !box || !(box.h > 0)) return null;

  const row = rowWire ?? ELEMENT_WIRE_DEFAULTS;
  const pick = (k, range) => clamp(instanceWire[k], range, clamp(row[k], range, ELEMENT_WIRE_DEFAULTS[k]));

  const length    = pick('length', WIRE_LENGTH);
  const thickness = pick('thickness', STICK_SCALE);
  const bend      = pick('bend', WIRE_BEND);
  const sweep     = pick('sweep', WIRE_SWEEP);
  const waves     = Math.round(pick('waves', WIRE_WAVES));
  const twist     = pick('twist', WIRE_TWIST);
  const bury      = pick('bury', { min: 0, max: 1 });

  /* The run from where the wire leaves the icing to where the element sits. Proportional to the
     element's HEIGHT rather than its width, because height is the dimension `topperStick` already
     measures against, and two sizing rules for one family of parts is how they drift apart. */
  const len = box.h * length;
  const buried = len * bury;
  /* ⚠️ PROPORTIONAL, WITH NO FLOOR, AND THE FLOOR IS WHY THIS IS SPELLED OUT. The first version
     borrowed the pick's `Math.max(box.h * 0.014, 0.006)` — a minimum radius so a small pick is never
     invisibly thin. On a wire that floor DOMINATES: it only stops applying above a box height of
     0.43, and real elements are a fraction of that, so every wire on every cake came out the same
     world thickness whatever it carried. A test asking whether a doubled element doubles its wire
     caught it. That is INVARIANTS #8 — a hardcoded world dimension wearing a `Math.max`.
 
     ⚠️ AND IT IS ARGUABLY RIGHT IN REAL LIFE, WHICH IS WHAT MAKES IT A TRAP. Florist wire is sold by
     gauge: one thickness, whatever it holds. But world units here scale with the cake, so a constant
     radius is a different fraction of a 6-inch cake than of a 12-inch one, and the invariant exists
     precisely because that reasoning is seductive and wrong. */
  const radius = box.h * WIRE_GAUGE * thickness;

  const frame = frameFor(axis, pick('angle', WIRE_ANGLE));

  /* ⚠️ THE ELEMENT'S BOTTOM, WHICH IS NOT `-h/2`, FOR TWO SEPARATE REASONS.
 
     A box is not centred on the group origin — `box.cy` says where its middle sits, and stickFor
     already converts through it (`rod.bottomY - box.cy`). Ignoring it hangs the wire from the wrong
     height on any artwork whose opaque content is off-centre in its canvas, which is most artwork.
 
     And a FOLDED piece has a different bottom again. A butterfly standing on a cake hinges its wings
     up into a V from the spine, so the lowest point stops being a wingtip and becomes the body. The
     renderer reports that as `box.bottom`; the flat extents know nothing about it, and a wire hung
     from them starts in the air below the butterfly it is supposed to carry.
 
     `box.bottom` when the renderer supplies one, the centred arithmetic when it does not — so a
     caller that predates this, or a shape with no fold, behaves exactly as before. */
  const bottom = Number.isFinite(box.bottom) ? box.bottom : (box.cy ?? 0) - box.h / 2;
  /* Just inside it, so the wire disappears behind the artwork rather than stopping short in mid-air. */
  const tipY = bottom + box.h * 0.04;

  /* ⚠️ THE BASE IS DIRECTLY BELOW THE TIP, AND THE FIRST VERSION LEANED IT — WHICH PUT THE WIRE'S
     ROOT OUTSIDE THE CAKE. Leaning the base away by `len·sin(lean)` looked right in the reference
     photographs, where a butterfly hovers well beyond the rim. It is the wrong end to move. The
     renderer draws this group at `[sticker.x, py, sticker.z]` — the point the BAKER placed — so
     leaning the base means the wire's root drifts off the piece's own position, and at len 9 it was
     visibly hanging in mid-air beside the cake.
 
     Displacing the element instead would be worse: `sticker.x/z` is what the selection border and
     the drag both read, so a render that quietly added an offset would detach the piece from its own
     border at every angle. That is INVARIANTS #10 law 1, and it is precisely how the rainbow broke.
 
     So the element stays exactly where it was put, the wire runs straight down from it into the
     cake, and ALL the character comes from the bow. */
  /* ⚠️ ON A WALL THE TIP IS THE PIECE'S MIDDLE, NOT ITS BOTTOM EDGE. Running down, the wire has to
     reach the icing, so it leaves from the lowest point of the artwork. Running out of a wall there
     is no icing below it — the stem goes in behind the piece, and behind its bottom corner it would
     be visibly off-centre. `cy` rather than `bottom`, and the same `box` answers both. */
  const tip = axis === 'out'
    ? { x: 0, y: box.cy ?? 0, z: 0 }
    : { x: 0, y: tipY, z: 0 };
  const base = {
    x: tip.x + frame.dir[0] * len,
    y: tip.y + frame.dir[1] * len,
    z: tip.z + frame.dir[2] * len,
  };

  /* ⚠️ THE BOW IS HORIZONTAL, AND `sweep` ONLY CHOOSES ITS COMPASS DIRECTION. A vertical run bulging
     sideways is what hand-bent florist wire does; `sin(pi·t)` puts the deepest part at the middle
     and returns to zero at both ends, so the wire meets the icing and the butterfly without a kink
     at either. */
  const phi = (sweep * Math.PI) / 180;
  const twistRad = (twist * Math.PI) / 180;
  /* ⚠️ THE BOW SHRINKS AS THE BENDS MULTIPLY, and without that an S is twice the excursion of a C
     at the same setting — so raising `waves` would fling the piece sideways and read as a different
     control having been moved. Dividing by the count keeps `bend` meaning "how far from straight". */
  const bow = (len * bend) / waves;

  const points = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    /* `sin(waves·pi·t)` is zero at both ends whatever the count, so the wire always meets the icing
       and the butterfly without a kink — and it alternates sign, which is what turns one bulge into
       an S and then a zigzag. */
    const k = Math.sin(waves * Math.PI * t) * bow;
    /* The bow's plane turns as the wire climbs. A planar curve is a drawing of a bent wire; this is
       what makes the S seen from the front a different S from the side. */
    const a = phi + twistRad * t;
    const ku = Math.cos(a) * k, kv = Math.sin(a) * k;
    points.push({
      x: base.x + (tip.x - base.x) * t + frame.u[0] * ku + frame.v[0] * kv,
      y: base.y + (tip.y - base.y) * t + frame.u[1] * ku + frame.v[1] * kv,
      z: base.z + (tip.z - base.z) * t + frame.u[2] * ku + frame.v[2] * kv,
    });
  }

  /* ⚠️ THE LIFT IS A VECTOR, NOT A LENGTH, once the wire can run diagonally. Whatever did not go
     into the cake has to displace the piece — upward on the top, outward on a wall, and BOTH on the
     rim. A single scalar was fine while every wire was vertical; on the `lip` axis, treating the
     whole run as height floats a butterfly well above where its own stem ends. Each caller takes
     the component its pose can actually move in. */
  const out = len - buried;
  return {
    points, radius, len, buried, bury, tip, axis, baseY: base.y,
    lift: { y: Math.max(0, -frame.dir[1] * out), out: Math.max(0, -frame.dir[2] * out) },
  };
}

/**
 * How far the element rides ABOVE the surface it is pushed into: the part of the wire that did not
 * go in, measured VERTICALLY.
 *
 * ⚠️ THE SAME ANSWER AS THE PICK'S, AND THAT IS NOW CORRECT RATHER THAN LAZY. An earlier version
 * leaned the wire and so had to resolve the lift through a cosine; the lean is gone (see `wireFor`),
 * the run is vertical, and run-minus-buried is simply how much of it is still above the icing. Zero
 * without a wire, so a caller can add it unconditionally.
 */
export function wireLift(wire) {
  return wire?.lift ? wire.lift.y : 0;
}

/** How far the element stands OFF the surface it is pushed into — the same leftover run, along the
 *  other axis. A wall wire displaces the piece entirely this way; a rim wire does a bit of both. */
export function wireStandoff(wire) {
  return wire?.lift ? wire.lift.out : 0;
}
