import { describe, it, expect } from 'vitest';
import { isSinglePerSlot, placementSlots } from './placement.js';

// Contract: every element type flows through the SAME placement logic. These fixtures stand in
// for the real types; if a type ever diverges, a shared assertion here breaks. Guards the exact
// bugs we hit: scattered wrongly grouped, slot ordering, top placed on the wrong tier.

const heroTopSide = { allowed_zones: ['top_surface', 'side'], placement_config: { single_per_slot: true } };
const heroTopOnly = { allowed_zones: ['top_surface'], placement_config: { single_per_slot: true } };
const scattered   = { allowed_zones: ['top_surface', 'side', 'middle_tier'], placement_config: {} };
const picks       = { allowed_zones: ['top_surface', 'side', 'middle_tier'], placement_config: {} };

describe('isSinglePerSlot — placement STYLE is config-driven, not zone-count', () => {
  it('hero elements (single_per_slot flag) are single-per-slot', () => {
    expect(isSinglePerSlot(heroTopSide)).toBe(true);
    expect(isSinglePerSlot(heroTopOnly)).toBe(true);
  });
  it('scattered/picks scatter freely even with many allowed_zones', () => {
    expect(isSinglePerSlot(scattered)).toBe(false);  // the bug: 3 zones must NOT mean single-per-slot
    expect(isSinglePerSlot(picks)).toBe(false);
    expect(isSinglePerSlot(undefined)).toBe(false);
  });
});

describe('placementSlots — one slot per (tier × surface)', () => {
  it('top+side on a 2-tier cake: Top, then sides top→bottom (bottom LAST)', () => {
    const slots = placementSlots(heroTopSide, 2);
    expect(slots.map(s => s.key)).toEqual(['top', 'side-1', 'side-0']);
    expect(slots[0]).toMatchObject({ placement: 'top', tierIndex: 1 }); // top sits on the LAST tier
  });
  it('single-tier cake: Top + one Side', () => {
    expect(placementSlots(heroTopSide, 1).map(s => s.key)).toEqual(['top', 'side-0']);
  });
  it('top-only element offers only a Top slot', () => {
    expect(placementSlots(heroTopOnly, 3).map(s => s.key)).toEqual(['top']);
  });
});
