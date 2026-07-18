// Seating-depth rule — the ONE home for "how far to offset a GLB so it clears the surface
// instead of burying half of itself." Shared by the side-sticker PROUD seat (CakeCanvas
// `StickerModel` → `bendStickerScene`) and the piping-shell edge seat (CakeTier), so the rule
// can never drift between the two paths.
//
// Both seat by HALF the model's rendered depth, just in opposite directions: a proud sticker
// pushes OUT so its back sits on the wall; a piping shell pulls IN so its outer face sits at the
// rim edge. Same magnitude, opposite sign.
//
// `scaledDepth` is the model's rendered Z-extent (bounding-box depth × fit scale). Using the full
// bounding box is correct when the element's intended contact face is its backmost extent — the
// natural way these are modelled (a bow's flat knot-back to the wall, tails hanging in front).
//
// FUTURE (intentionally not built — no current element needs it): if a model has a thin
// protrusion reaching BEHIND its contact face (e.g. a tail deeper than the knot), seating by the
// full box would push the whole piece off the wall. The fix then is to pass a "bulk back" depth
// instead — the Z-extent at, say, the 95th percentile of vertex mass — so a thin protrusion is
// ignored. Add that as a separate measured input; this half-depth rule stays the same.
export function seatHalfDepth(scaledDepth) {
  return (scaledDepth ?? 0) / 2;
}
