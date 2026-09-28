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
     own length. Zero is a pin.

     ⚠️ 0.35, and below about 0.2 a white rod simply reads as a skewer however long it is. The bow
     is not decoration; it is the only thing that says "wire" rather than "pin". */
  bend: 0.35,
  /* WHICH WAY it bows, in degrees around the cake's axis. Not a tilt — see `wireFor`. Varying this
     between pieces is what stops a swarm of butterflies looking like a row of pins. */
  sweep: 35,
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

/** The bow's direction, all the way round. A full circle so a baker can point it away from
 *  whatever it would otherwise cross. */
export const WIRE_SWEEP = Object.freeze({ min: 0, max: 360, step: 15 });

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
    bury:      clamp(cfg.bury,      { min: 0, max: 1 }, ELEMENT_WIRE_DEFAULTS.bury),
    finish:    typeof cfg.finish === 'string' ? cfg.finish : ELEMENT_WIRE_DEFAULTS.finish,
  };
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
export function wireFor(box, instanceWire, rowWire) {
  if (!instanceWire?.on || !box || !(box.h > 0)) return null;

  const row = rowWire ?? ELEMENT_WIRE_DEFAULTS;
  const pick = (k, range) => clamp(instanceWire[k], range, clamp(row[k], range, ELEMENT_WIRE_DEFAULTS[k]));

  const length    = pick('length', WIRE_LENGTH);
  const thickness = pick('thickness', STICK_SCALE);
  const bend      = pick('bend', WIRE_BEND);
  const sweep     = pick('sweep', WIRE_SWEEP);
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
  const base = { x: 0, y: tipY - len, z: 0 };
  const tip = { x: 0, y: tipY, z: 0 };

  /* ⚠️ THE BOW IS HORIZONTAL, AND `sweep` ONLY CHOOSES ITS COMPASS DIRECTION. A vertical run bulging
     sideways is what hand-bent florist wire does; `sin(pi·t)` puts the deepest part at the middle
     and returns to zero at both ends, so the wire meets the icing and the butterfly without a kink
     at either. */
  const phi = (sweep * Math.PI) / 180;
  const bow = len * bend;

  const points = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    const k = Math.sin(Math.PI * t) * bow;
    points.push({
      x: Math.cos(phi) * k,
      y: base.y + (tip.y - base.y) * t,
      z: Math.sin(phi) * k,
    });
  }

  return { points, radius, len, buried, bury, tip, baseY: base.y };
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
  return wire ? Math.max(0, wire.len - wire.buried) : 0;
}
