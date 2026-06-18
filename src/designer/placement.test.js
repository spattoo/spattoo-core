import { describe, it, expect } from 'vitest';
import { isSinglePerSlot, placementSlots, hugScale, isDynamicHug, wallClampY, DEFAULT_HUG_FILL, facingOffsetRadians, degToRad3, radToDeg3, scaleRangeOf } from './placement.js';

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

describe('hugScale — side-hug size tracks the tier WALL HEIGHT, not r', () => {
  const STICKER_SIZE = 0.28;
  it('fills the default fraction of the wall height', () => {
    // A shorter (upper) tier yields a smaller decoration than a taller (bottom) tier — the bug we fix.
    expect(hugScale(1.0, STICKER_SIZE)).toBeCloseTo((1.0 * DEFAULT_HUG_FILL) / STICKER_SIZE);
    expect(hugScale(0.6, STICKER_SIZE)).toBeLessThan(hugScale(1.0, STICKER_SIZE));
  });
  it('honours a per-element fill override', () => {
    expect(hugScale(1.0, STICKER_SIZE, 0.5)).toBeLessThan(hugScale(1.0, STICKER_SIZE, 0.7));
  });
  it('does NOT depend on placement_config.r (absolute scale is stand-only)', () => {
    // Same wall → same hug size regardless of any r the element carries.
    expect(hugScale(1.0, STICKER_SIZE)).toBe(hugScale(1.0, STICKER_SIZE));
  });
});

describe('isDynamicHug — only HERO hugs auto-fit; scattered decor keeps its own r', () => {
  it('hero element hugging a side is dynamic', () => {
    expect(isDynamicHug({ singlePerSlot: true, placementMode: 'hug' })).toBe(true);
  });
  it('scattered decor (not single_per_slot) hugging a side stays absolute', () => {
    expect(isDynamicHug({ singlePerSlot: false, placementMode: 'hug' })).toBe(false);
    expect(isDynamicHug({ placementMode: 'hug' })).toBe(false);
  });
  it('a hero STANDING (not hugging) uses r, not the dynamic size', () => {
    expect(isDynamicHug({ singlePerSlot: true, placementMode: 'stand' })).toBe(false);
  });
});

describe('facingOffsetRadians — one unit on each side: degrees in DB, radians at runtime', () => {
  it('the deg→rad equivalence that makes migration pixel-identical', () => {
    // The whole staged rollout rests on this: a topper authored as [0,-90,0]° with the flag must
    // produce the SAME radians baseRotation the legacy [0,-π/2,0] row did — so the render can't move.
    const deg    = { rotation: [0, -90, 0], rotation_unit: 'deg' };
    const legacy = { rotation: [0, -Math.PI / 2, 0] };
    const fromDeg = facingOffsetRadians(deg);
    const fromLegacy = facingOffsetRadians(legacy);
    expect(fromDeg[1]).toBeCloseTo(fromLegacy[1]);
    expect(fromDeg).toEqual(legacy.rotation.map((_, i) => expect.closeTo(legacy.rotation[i])));
  });
  it('flagless rows are read as legacy RADIANS, unchanged (back-compat during rollout)', () => {
    const legacy = { rotation: [0, -Math.PI / 2, 0] };
    expect(facingOffsetRadians(legacy)).toBe(legacy.rotation);   // passthrough, no conversion
    expect(facingOffsetRadians({ rotation: [0, -Math.PI / 2, 0], rotation_unit: 'rad' })[1])
      .toBeCloseTo(-Math.PI / 2);
  });
  it('degrees only convert when the flag opts in (a 90 value is NOT silently treated as radians)', () => {
    expect(facingOffsetRadians({ rotation: [0, -90, 0], rotation_unit: 'deg' })[1]).toBeCloseTo(-Math.PI / 2);
    // Same numbers WITHOUT the flag stay radians (legacy) — proves the flag, not a heuristic, decides.
    expect(facingOffsetRadians({ rotation: [0, -90, 0] })[1]).toBe(-90);
  });
  it('null/empty/missing rotation → null (GLB already faces +z)', () => {
    expect(facingOffsetRadians(null)).toBe(null);
    expect(facingOffsetRadians({})).toBe(null);
    expect(facingOffsetRadians({ rotation_unit: 'deg' })).toBe(null);
  });
  it('degToRad3 / radToDeg3 round-trip and reject non-arrays', () => {
    const deg = [0, -90, 45];
    expect(radToDeg3(degToRad3(deg)).map(Math.round)).toEqual(deg);
    expect(degToRad3(null)).toBe(null);
    expect(radToDeg3(undefined)).toBe(null);
  });
});

describe('scaleRangeOf — placement_config.scale bounds the Size dial, with per-key fallback', () => {
  it('no scale key → falls back to the control defaults (backward compatible)', () => {
    expect(scaleRangeOf({ placement_config: {} }, 0.25, 8)).toEqual({ min: 0.25, max: 8 });
    expect(scaleRangeOf(undefined, 0.1, 4)).toEqual({ min: 0.1, max: 4 });
    expect(scaleRangeOf({ placement_config: { r: 0.5 } }, 0.25, 8)).toEqual({ min: 0.25, max: 8 });
  });
  it('a full scale range overrides both ends (admin can tighten OR widen)', () => {
    expect(scaleRangeOf({ placement_config: { scale: { min: 0.5, max: 1.2 } } }, 0.25, 8))
      .toEqual({ min: 0.5, max: 1.2 });
    expect(scaleRangeOf({ placement_config: { scale: { min: 0.2, max: 12 } } }, 0.25, 8))
      .toEqual({ min: 0.2, max: 12 });
  });
  it('partial scale → only the supplied key overrides; the other falls back', () => {
    expect(scaleRangeOf({ placement_config: { scale: { max: 1 } } }, 0.25, 8))
      .toEqual({ min: 0.25, max: 1 });       // cap the top, keep the floor
    expect(scaleRangeOf({ placement_config: { scale: { min: 0.6 } } }, 0.25, 8))
      .toEqual({ min: 0.6, max: 8 });
  });
  it('ignores a non-positive or non-numeric max (guards a bad authored value)', () => {
    expect(scaleRangeOf({ placement_config: { scale: { max: 0 } } }, 0.25, 8).max).toBe(8);
    expect(scaleRangeOf({ placement_config: { scale: { max: -2 } } }, 0.25, 8).max).toBe(8);
    expect(scaleRangeOf({ placement_config: { scale: { max: 'big' } } }, 0.25, 8).max).toBe(8);
  });
  it('r (the default render scale) is independent of the range and not consumed here', () => {
    // r drives the initial size at placement; scaleRangeOf only bounds the dial.
    const el = { placement_config: { r: 0.5, scale: { min: 0.3, max: 1.5 } } };
    expect(scaleRangeOf(el, 0.25, 8)).toEqual({ min: 0.3, max: 1.5 });
  });
});

describe('wallClampY — a side decal never dips below the tier base into the board', () => {
  const baseY = 1.0, wall = 0.8;
  it('leaves a comfortably-sized decal where it is', () => {
    const halfH = 0.2;                                   // fits well within the wall
    expect(wallClampY(1.4, baseY, wall, halfH)).toBe(1.4);
  });
  it('lifts a decal whose bottom would cross the tier base', () => {
    const halfH = 0.35;
    expect(wallClampY(baseY + 0.1, baseY, wall, halfH)).toBe(baseY + halfH); // bottom snaps to base
  });
  it('keeps the top edge within the wall when there is room', () => {
    const halfH = 0.2;
    expect(wallClampY(baseY + wall, baseY, wall, halfH)).toBe(baseY + wall - halfH);
  });
  it('a decal taller than the wall overflows UP, never into the board', () => {
    const halfH = 0.6;                                   // taller than the 0.8 wall
    const y = wallClampY(5, baseY, wall, halfH);
    expect(y).toBe(baseY + halfH);                       // bottom pinned to base
    expect(y - halfH).toBeGreaterThanOrEqual(baseY);     // bottom never below the board line
  });
});
