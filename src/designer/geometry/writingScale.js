// ── How big a message may be, as the Texts row authored it ──────────────────────────────────────
//
// The Size dial on a writing carried 0.3–0.95 step 0.05 in code, while the "Texts" row in Manage
// Elements said 0.2–2.5 step 0.25 with a default scale of 0.5. An admin could type those numbers,
// press Save, and change nothing on any cake. Reported as *"its not honoring what i authored in
// admin"*, and it is the same failure `addWritingFromRow` already carries a warning about, where the
// Acrylic Topper Studio's output was written and never read.
//
// Pure and separate from the component for the reason every rule in this codebase ends up pure: the
// designer needs a login and a catalogue to open, so a bound resolved inside it is a bound nobody
// can test. Same bargain `garnishPlacementOptions` makes.
//
// ⚠️ EVERY FIELD IS OPTIONAL AND EACH FALLS BACK ON ITS OWN. The admin form says so in as many
// words — *"All optional… Either bound is optional; blank both for the designer defaults"* — so a
// row that authors only a max must not lose the default min. Checked per field rather than by
// swapping in a whole default object.
//
// ⚠️ TYPE-CHECKED, NOT TRUTH-CHECKED. `min: 0` is a real bound and `r: 0` is a real default; `??`
// alone would keep them, but a `||` would not, and this is exactly the shape of value where that
// mistake is silent. `typeof === 'number'` also refuses a string from hand-edited JSON rather than
// handing NaN to a dial.

/** The dial's bounds when a row says nothing — the values the control shipped with.
 *
 * ⚠️ 0.1, NOT 0.3. Sandeep: "lowest size value is only 0.5. lets allow upto 0.2 or 0.1." A small
 * message is a real thing — a name tucked under a picture, a date in a corner — and the old floor
 * made the smallest cake writing a third of the top.
 *
 * ⚠️ AND THE ROW STILL WINS, which is the half that matters on a live storefront: this is only the
 * fallback for a host with no catalogue loaded. A dial showing a floor of 0.5 is reading 0.5 off the
 * Texts row's `placement_config.scale.min` in Manage Elements, and lowering it there is the fix —
 * changing this number alone would move nothing. */
export const WRITING_SCALE_DEFAULTS = Object.freeze({ min: 0.1, max: 2.5, step: 0.05 });

/* ── How big a message may get before it leaves the cake ─────────────────────────────────────────
 *
 * ⚠️ A CEILING THE SURFACE IMPOSES, ON TOP OF THE ONE AN ADMIN AUTHORS. `fit` is a fraction of the
 * surface, and on the TOP the builder fills the width — so `fit` 1.0 makes a block as wide as the
 * cake is across, and the corners of a block that wide are outside a CIRCLE. Reported exactly that
 * way: "can we guard it not to go beyond cake when we increase size. right now at full size, its
 * going out of cake."
 *
 * ⚠️ 0.85 IS MEASURED, AND IT IS SET BY THE WORST TEXT RATHER THAN A TYPICAL ONE. Built the real
 * geometry on a 1.2-radius top and compared the block's half-diagonal with the radius: a long
 * message stays inside to 0.95 ("BABY loading" → 0.99 of the radius) because it is wide and shallow,
 * but a SHORT one is tall for its width and goes out sooner ("Ava" → 1.06 at 0.95, already outside).
 * A cap that only suited long messages would let a one-word name hang off the edge, so it is set by
 * the one that fails first, with ~5% of the radius left over.
 *
 * ⚠️ THE BOARD IS NOT CAPPED, and that is not an oversight. Its box is `boardRadius * 0.9 * fit` —
 * less than half the drum's diameter at `fit` 1 — so a board message needs to go WELL past 1 to look
 * right, which is why the ceiling was raised there in the first place ("size dialer shows only a max
 * of 0.95. need to increase"). The side is a band rather than a disc and has no edge to fall off.
 *
 * ⚠️ IT CAPS THE DIAL, NOT THE GEOMETRY. `fit` is stored on every saved design and every template,
 * so clamping it in the renderer would resize messages on work that is already out there — the same
 * reasoning that kept the board's ceiling a RANGE change rather than a redefinition. A cake saved
 * with an overflowing message keeps it; nobody can make a new one. */
export const WRITING_TOP_MAX_FIT = 0.85;
export function writingMaxFit(surface, authoredMax) {
  const max = typeof authoredMax === 'number' && Number.isFinite(authoredMax)
    ? authoredMax : WRITING_SCALE_DEFAULTS.max;
  return surface === 'top' ? Math.min(max, WRITING_TOP_MAX_FIT) : max;
}

const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * @param {object|null} placementConfig  the Texts row's `placement_config`
 * @returns {{min:number, max:number, step:number, r:number|null}}
 *          `r` is the authored STARTING size ("Default scale (r)" on the form), or null when the row
 *          leaves it to the material's own default (WRITING_FIT).
 */
export function writingScaleFrom(placementConfig) {
  const sc = placementConfig?.scale ?? {};
  return {
    min:  num(sc.min,  WRITING_SCALE_DEFAULTS.min),
    max:  num(sc.max,  WRITING_SCALE_DEFAULTS.max),
    step: num(sc.step, WRITING_SCALE_DEFAULTS.step),
    r:    num(placementConfig?.r, null),
  };
}
