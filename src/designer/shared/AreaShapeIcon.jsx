import { REGION_KINDS } from '../geometry/region.js';

/* ── The shape of a chosen AREA, drawn ───────────────────────────────────────────────────────────
 *
 * Round / Rectangle / Triangle as marks rather than words, for the card where a baker picks which
 * patch of a surface a filling covers. Sandeep: *"for the area- can we use icons instead of the
 * words."*
 *
 * ⚠️ NOT IN `src/shared/icons.jsx`, and that file says why: *"Only what is genuinely SHARED lives
 * here. Icons used by a single screen stay next to it — a cupboard everything gets tipped into is
 * worse than two definitions."* These live beside the region vocabulary instead, because the next
 * thing poured into an area is cream and its card will want the same three marks — a region is
 * deliberately not a sand feature (region.js).
 *
 * ⚠️ AND THIS IS THE CASE `ShapePicker` IS NOT ABOUT. That picker draws a CAKE rather than a
 * footprint, on hard-won grounds: *"every circle-family shape (Round, Cylinder, 2T Cylinder) drew
 * the identical pink disc"*. The ambiguity it was dodging does not exist here — an area has no
 * families, and its outline IS the thing being chosen, so the outline is the honest mark.
 *
 * ⚠️ A GLYPH PER KIND, KEYED OFF `REGION_KINDS`, never a branch on a name (CLAUDE.md rule 2). A kind
 * added to the geometry without a mark here falls back to its word rather than rendering an empty
 * button, which is the failure mode worth designing for: a silent blank is unpickable, and nobody
 * would know which of the three they were looking at.
 */
const GLYPH = {
  round: <circle cx="12" cy="12" r="8" />,
  /* Landscape, so it reads as "rectangle" beside a circle rather than as a box — but only just.
     At 18x11 it sat visually lighter than its neighbours: the circle and the triangle both fill
     ~15 units of height and a short rect reads as a smaller button, not a different shape. */
  rect: <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />,
  /* Apex UP, which is where `REGION_KINDS.triangle` actually points — its first vertex is toward
     -z, and -z is up on a top-down view. The mark and the sand agree. */
  triangle: <path d="M12 4.5 L20.5 19 H3.5 Z" />,
};

export const AREA_LABEL = { round: 'Round', rect: 'Rectangle', triangle: 'Triangle' };

/** The word for a kind — the accessible name for its button, and the fallback when it has no mark. */
export function areaLabel(kind) {
  return AREA_LABEL[kind] ?? kind;
}

/** Whether this kind has a mark. Callers render `areaLabel(kind)` when it does not. */
export function hasAreaGlyph(kind) {
  return kind in GLYPH;
}

export function AreaShapeIcon({ kind, size = 22 }) {
  const glyph = GLYPH[kind];
  if (!glyph) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true" focusable="false">
      {glyph}
    </svg>
  );
}

/* A mark exists for every kind the geometry offers. Asserted in the card's test rather than here,
   because a module cannot usefully fail at import time — but the list is the contract. */
export const AREA_KINDS = Object.keys(REGION_KINDS);
