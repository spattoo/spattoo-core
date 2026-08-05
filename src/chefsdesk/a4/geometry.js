// ── Where things sit on the sheet, and how big ────────────────────────────────────────────────────
// The arithmetic behind dragging, resizing and placing an item on the A4 page — pure, so the rules
// that decide whether a print comes out the right shape can be tested without a page to drag on.
//
// ── UNITS, which are the whole of the correctness here ──────────────────────────────────────────
//   x  fraction of the sheet's WIDTH
//   y  fraction of the sheet's HEIGHT   (x and y position a point, so each follows its own edge)
//   w  fraction of the sheet's WIDTH
//   h  fraction of the sheet's WIDTH    ← not a typo, and not the height
//
// Both SIZES are measured against the same edge so that an item's proportions are a property of the
// item, not of the page. A square is then `w === h`, and `aspectRatio: w / h` hands the layout to
// CSS with no conversion in the view.
//
// Measuring h against the height instead would make a square `h = w * (W/H)` — the page's aspect
// smuggled into every item, wrong the moment the page changes, and invisible until something prints
// out of shape. Converting to a height-fraction is done at exactly one place, `clampY`, because
// keeping the bottom edge on the page is the one question that is genuinely about the page.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The smallest an item may be dragged. Below this the handles overlap each other and the item cannot
// be grabbed again — a size you can reach but not leave.
export const MIN_W = 0.1;

/**
 * An item `w` wide, at the source's own proportions.
 *
 * A source that declares no aspect is treated as square — the shape every item had before aspect
 * existed, so an adapter that has not been taught about it keeps behaving exactly as it did rather
 * than dividing by undefined and laying out NaN.
 */
export const sized = (source, w) => ({ w, h: w / (source?.aspect || 1) });

/**
 * Resize by a width delta, PROPORTIONALLY — h follows w by the ratio the item already has.
 *
 * Free-form stretching is the one gesture that can quietly ruin a print: a squashed name looks
 * deliberate on screen at small sizes and is only obviously wrong once it is on a cake. Nothing
 * about a corner handle warns you it is about to do that, so it does not do it.
 *
 * `start` is the item as it was when the drag began — reading the LIVE item instead would compound
 * each move event's rounding into a drift you cannot undo.
 */
export function resized(start, dw, { minW = MIN_W } = {}) {
  const w = clamp(start.w + dw, minW, Math.max(minW, 1 - start.x));
  return { w, h: start.h * (w / start.w) };
}

/**
 * Move by a delta, keeping the item on the page.
 *
 * `pageAspect` is the sheet's width ÷ height. It appears only here: h is a width-fraction, so the
 * bottom edge needs it converted to a height-fraction to be compared against y at all.
 */
export function moved(start, { dx, dy, w, h }, pageAspect) {
  return {
    x: clamp(start.x + dx, 0, Math.max(0, 1 - w)),
    y: clamp(start.y + dy, 0, Math.max(0, 1 - h * pageAspect)),
  };
}
