// Pure, config-driven placement logic — no React, no element-type branching. The designer and
// the contract test both use these so behaviour can't silently diverge per element type.
import { ZONES } from './constants.js';

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
  if (zones.includes(ZONES.SIDE) || zones.includes(ZONES.MIDDLE_TIER)) {
    for (let i = n - 1; i >= 0; i--) {
      slots.push({ key: `side-${i}`, placement: 'side', zone: ZONES.SIDE, tierIndex: i });
    }
  }
  return slots;
}
