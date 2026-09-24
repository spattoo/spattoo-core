import { topperStick } from './topperPiece.js';

// ── A catalogue element on a stick ──────────────────────────────────────────────────────────────
//
// A fondant heart is pushed into the top of a cake on a pick, standing proud of the icing. Sometimes
// it goes in from the side instead, crossing the wall. Bakers do this constantly and the catalogue
// had no way to say so: the stick existed only inside the topper studios, as `payload.stick` on a
// COMPOSED piece, so a GLB element could never have one. Sandeep: *"we did that for few elements.
// but its part of that individual studio. not as a manage element screen property."*
//
// ⚠️ THE GEOMETRY IS NOT NEW, AND MUST NOT BE. `topperStick` already answers "how long is the stick,
// how much of it is buried, where does it tuck" from a box, and its own comment says why there is
// one of it: *"Two copies of 'how long is the stick' is how a baker buries it to the right depth on
// one screen and the wrong one on the other."* This module only decides WHICH box and WHOSE numbers
// — the element's measured bounds and its authored row — and hands both to that function.
//
// ⚠️ A STICK IS NOT AN `insert`. They look similar on screen and mean opposite things:
//
//     insert   the ELEMENT's own base is sunk into the surface (placement_config.<zone>.insert)
//     stick    a ROD below the element goes in, and the element rides ABOVE the icing
//
// So the two are authored separately and compose: a heart on a stick leaning out of the side wall is
// `side: { insert: … }` for the lean and a stick for the height. Nothing here touches placement.
//
// ⚠️ AND THE DEPTH IS THE POINT, NOT AN EXTRA. Sandeep, immediately: *"when stick is added - a
// property to control how much to insert should accompany."* A stick with no depth control is a
// decoration that always floats at one height; the whole reason a baker reaches for a pick is to
// choose how far above the cake the thing sits. `bury` is that number — a FRACTION of the stick's
// hanging length, so it keeps meaning the same thing when the element is resized.

// ⚠️ IT DOES NOT BELONG IN THE BUILD GUIDE, AND THAT WAS ASKED AND ANSWERED. The obvious next move
// is to make X-Ray say "fit a pick" when a stuck element is on the cake, or to have the guide
// generator write a step for it. Sandeep, on the fondant heart whose guide has no stick step:
// *"x-ray includes it anyways and thats good enough. adding a stick is not a step thats important to
// be included in the guide."* The decoration already appears on the sheet; pushing a pick into it is
// not a technique a decorator needs telling. Leave the guides alone.

/** What the code believes about a stick when a row authors nothing. */
export const ELEMENT_STICK_DEFAULTS = Object.freeze({
  // Half in, half out: the stick reads as a stick, and the element clears the icing.
  bury: 0.5,
  /* ⚠️ LENGTH AND THICKNESS ARE MULTIPLIERS, NOT LENGTHS. `topperStick` sizes the rod from the
     element's own measured box, which is what keeps a stick proportional through a resize; these
     scale that answer. A number in world units here would be INVARIANTS #8 — a hardcoded world
     dimension that is wrong the moment a cake is a different size.

     ⚠️ AND THE DEFAULTS ARE NOT 1. A card topper is a large flat thing whose height is a fair guide
     to its pick; a catalogue element is small and solid, and the card's proportions give it a stub
     too short to reach the icing and a rod too fine to see. Sandeep, on the fondant heart: *"stick
     length should be dynamic"* and *"add a control for the stick thickness. its too thin now."*
     2.2× and 2.6× are what a real pick reads as under a heart — see dev/element-stick.html, which
     is where they were chosen rather than guessed. */
  length: 2.2,
  thickness: 2.6,
  // A wooden pick unless a row says otherwise. Metallic stems belong to pieces CUT from one sheet
  // (see stickStock) — an element pushed onto a bought pick is not that.
  finish: null,
});

const num01 = (v, fallback) =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);

/**
 * The stick an element OFFERS, from its row.
 *
 * @param {object|null} placementConfig  the element's `placement_config`
 * @param {object|null} allowedActions   the element's `allowed_actions` — `stick` is the capability
 * @returns {{ offered: boolean, bury: number, finish: string|null }}
 *
 * ⚠️ CAPABILITY AND NUMBERS COME FROM DIFFERENT PLACES ON PURPOSE, which is this codebase's existing
 * split: `allowed_actions` says what a customer MAY do, `placement_config` carries the values. A row
 * that authors a depth but never ticks the box offers no stick, and that is the right way round —
 * the tick is the decision, the number is only how it behaves once taken.
 */
export function elementStick(placementConfig, allowedActions) {
  const cfg = placementConfig?.stick ?? {};
  return {
    offered:   allowedActions?.stick === true,
    bury:      num01(cfg.bury, ELEMENT_STICK_DEFAULTS.bury),
    length:    inRange(cfg.length, ELEMENT_STICK_DEFAULTS.length),
    thickness: inRange(cfg.thickness, ELEMENT_STICK_DEFAULTS.thickness),
    finish:    typeof cfg.finish === 'string' ? cfg.finish : ELEMENT_STICK_DEFAULTS.finish,
  };
}

/** The range a length or a thickness multiplier may take — the same bounds `topperStick` clamps to,
 *  named once so the card's steppers and the row's authored value cannot disagree about them. */
export const STICK_SCALE = Object.freeze({ min: 0.25, max: 6, step: 0.2 });

const inRange = (v, fallback) =>
  (typeof v === 'number' && Number.isFinite(v)
    ? Math.max(STICK_SCALE.min, Math.min(STICK_SCALE.max, v))
    : fallback);

/**
 * The stick to DRAW for a placed instance, or null.
 *
 * `box` is the element's measured bounds (the same `onVExtent` box the selection outline uses), so
 * the stick is proportional to the thing it carries and survives resizing — INVARIANTS #8: never a
 * world constant.
 *
 * The instance's own `bury` wins over the row's, because the row authors a STARTING depth and the
 * whole point of the control is that a baker moves it.
 */
export function stickFor(box, instanceStick, rowStick) {
  if (!instanceStick?.on || !box) return null;
  const bury = num01(instanceStick.bury, rowStick?.bury ?? ELEMENT_STICK_DEFAULTS.bury);
  const rod = topperStick(box, {
    on: true,
    bury,
    lengthScale: inRange(instanceStick.length,    rowStick?.length    ?? ELEMENT_STICK_DEFAULTS.length),
    radiusScale: inRange(instanceStick.thickness, rowStick?.thickness ?? ELEMENT_STICK_DEFAULTS.thickness),
  });
  if (!rod) return null;
  /* ⚠️ WHERE THE ROD'S LOWER END SITS, RELATIVE TO THE ELEMENT'S CENTRE — and its absence is the
     whole of the "stick is floating" bug. `topperStick` answers in the BOX's frame (`bottomY` is
     measured from the box's bottom edge), and the renderer drew the rod at a bare `-len` from the
     group origin, which for a placed element is its CENTRE. So every rod hung `h/2` too high: at
     bury 0.5 the heart's pick stopped a tenth of its own height ABOVE the icing, in mid-air.
     Nothing errored, every test passed, and the numbers were each correct in their own frame.
     Derived here so one function owns the conversion and the renderer reads a single number. */
  return { ...rod, baseY: rod.bottomY - (box.cy ?? 0), tipY: rod.topY - (box.cy ?? 0) };
}

/**
 * How far the element rides ABOVE the surface it is stuck into: everything of the stick that did not
 * go in. Zero without a stick, so a caller can add it unconditionally.
 *
 * ⚠️ NOT `len` — `len - buried`. Burying the whole stick puts the element on the icing, which is
 * what bury 1 should look like, and the first version of this floated it by a full stick length at
 * every depth because it added the wrong one.
 */
export function stickLift(stick) {
  return stick ? Math.max(0, stick.len - stick.buried) : 0;
}
