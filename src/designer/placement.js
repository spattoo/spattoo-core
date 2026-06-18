// Pure, config-driven placement logic — no React, no element-type branching. The designer and
// the contract test both use these so behaviour can't silently diverge per element type.
import { ZONES, PLACEMENT_MODES } from './constants.js';

// Default fraction of a tier's wall height a side-hug HERO decoration fills. Tunable per
// element via placement_config.hug_fill.
export const DEFAULT_HUG_FILL = 0.7;

// Render-time size for a side-hug hero decoration: it fills `fill` of the tier WALL HEIGHT,
// independent of placement_config.r (which stays the absolute size for `stand`). Pure so the
// contract test pins the formula; `stickerSize` is the renderer's normalized base (a model is
// normalized to stickerSize, then multiplied by this scale).
export function hugScale(wallHeight, stickerSize, fill = DEFAULT_HUG_FILL) {
  return (wallHeight * fill) / stickerSize;
}

// Keep a side decal's CENTRE y so its (scaled) bottom edge never crosses the tier base into the
// board. If the decal is taller than the wall (enlarged a lot), let it overflow UPWARD only —
// never down into the board. halfH = half the rendered sticker height.
export function wallClampY(y, baseY, wallHeight, halfH) {
  const lo = baseY + halfH;
  const hi = baseY + wallHeight - halfH;
  return hi >= lo ? Math.min(Math.max(y, lo), hi) : lo;
}

// A placed decoration whose size should track the tier wall (vs. absolute r): hero element
// (single_per_slot) hugging a surface. Scattered decor (NOT single_per_slot) keeps its own r
// so many small stickers don't each balloon to wall height. Config/mode-driven, never by type.
export function isDynamicHug(sticker) {
  return sticker?.singlePerSlot === true && sticker?.placementMode === PLACEMENT_MODES.HUG;
}

// The SizeDial's absolute-scale range for an element, from config — never branched on type.
// `placement_config.scale = { min, max }` bounds the dial; `placement_config.r` is just the
// default position WITHIN that range (set at placement). Each key is optional and falls back to
// the control's own default (`dMin`/`dMax`), so an element with no `scale` keeps its present
// bounds — backward compatible. Applies ONLY to absolute-scale dials, never the hero-hug `hugMul`
// (a wall-relative multiplier — a different unit). For a composite group, intersect the members'
// ranges (max of mins, min of maxes) so the shared dial can't push any member past its own cap.
export function scaleRangeOf(element, dMin, dMax) {
  const sc = element?.placement_config?.scale;
  return {
    min: typeof sc?.min === 'number'                 ? sc.min : dMin,
    max: typeof sc?.max === 'number' && sc.max > 0   ? sc.max : dMax,
  };
}

// ── Facing-offset unit normalization ─────────────────────────────────────────
// A GLB's authored facing offset (placement_config.rotation) is AUTHORED in degrees — the same
// convention the calibrator and piping (top_/bottom_rotation) already use — but consumed by THREE
// (and stored on placed stickers as baseRotation) in RADIANS. Convert at the element→instance read
// boundary so there is exactly ONE unit on each side: degrees in the DB, radians at runtime.
//
// Rollout is gated per element by placement_config.rotation_unit:
//   'deg'           → rotation is degrees (the new standard); convert ×π/180.
//   'rad' / absent  → legacy radians, passed through unchanged (back-compat until migrated).
// Once every row is migrated to 'deg', drop the legacy branch and this flag.
const DEG_TO_RAD = Math.PI / 180;

export function degToRad3(v) {
  return Array.isArray(v) ? [v[0] * DEG_TO_RAD, v[1] * DEG_TO_RAD, v[2] * DEG_TO_RAD] : null;
}

export function radToDeg3(v) {
  return Array.isArray(v) ? [v[0] / DEG_TO_RAD, v[1] / DEG_TO_RAD, v[2] / DEG_TO_RAD] : null;
}

// The GLB facing offset as a RADIANS triple (or null), resolving the unit from the element's
// placement_config. The single source of truth for reading placement_config.rotation — every
// element→instance boundary (addSticker, the chooser preview) must go through here, never read
// placement_config.rotation raw, so the unit can't silently diverge per type again.
export function facingOffsetRadians(placementConfig) {
  const rot = placementConfig?.rotation ?? null;
  if (!Array.isArray(rot)) return null;
  return placementConfig?.rotation_unit === 'deg' ? degToRad3(rot) : rot;
}

// A "hero" element places exactly ONE instance per (tier × surface) slot, chosen via the
// placement chooser's checkboxes. Everything else scatters freely as many dragged stickers.
// Style is config (placement_config.single_per_slot) — NEVER inferred from allowed_zones.
export function isSinglePerSlot(element) {
  return element?.placement_config?.single_per_slot === true;
}

// The (tier × surface) slots the chooser offers for `element` on a cake with `tierCount` tiers:
//   • top_surface → one slot, on the cake's actual top (the LAST tier).
//   • side/middle  → one slot per tier, ordered top-to-bottom so the BOTTOM tier's side is last.
// Returns [{ key, placement: 'top' | 'side', zone, tierIndex }]. Labels/checked/instance are
// layered on by the caller (they need cake state); this is the pure enumeration.
export function placementSlots(element, tierCount) {
  const zones = element?.allowed_zones ?? [];
  const n = Math.max(1, tierCount || 1);
  const slots = [];
  if (zones.includes(ZONES.TOP_SURFACE)) {
    slots.push({ key: 'top', placement: 'top', zone: ZONES.TOP_SURFACE, tierIndex: n - 1 });
  }
  if (zones.includes(ZONES.RIM)) {
    // The top EDGE of each tier (e.g. a perched figure) — one slot per tier, like side placement,
    // so a figure can perch on a lower tier's ledge too. Renders via the top path at that tier's edge.
    for (let i = n - 1; i >= 0; i--) {
      slots.push({ key: `rim-${i}`, placement: 'top', zone: ZONES.RIM, tierIndex: i });
    }
  }
  if (zones.includes(ZONES.SIDE) || zones.includes(ZONES.MIDDLE_TIER)) {
    for (let i = n - 1; i >= 0; i--) {
      slots.push({ key: `side-${i}`, placement: 'side', zone: ZONES.SIDE, tierIndex: i });
    }
  }
  return slots;
}
