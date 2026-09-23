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

/** The dial's bounds when a row says nothing — the values the control shipped with. */
export const WRITING_SCALE_DEFAULTS = Object.freeze({ min: 0.3, max: 2.5, step: 0.05 });

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
