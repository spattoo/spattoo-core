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

/** What the code believes about a stick when a row authors nothing. */
export const ELEMENT_STICK_DEFAULTS = Object.freeze({
  // Half in, half out: the stick reads as a stick, and the element clears the icing.
  bury: 0.5,
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
    offered: allowedActions?.stick === true,
    bury:    num01(cfg.bury, ELEMENT_STICK_DEFAULTS.bury),
    finish:  typeof cfg.finish === 'string' ? cfg.finish : ELEMENT_STICK_DEFAULTS.finish,
  };
}

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
  return topperStick(box, { on: true, bury });
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
