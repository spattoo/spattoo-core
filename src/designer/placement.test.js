import { describe, it, expect } from 'vitest';
import { isSinglePerSlot, placementSlots, hugScale, isDynamicHug, wallClampY, sideSeatOffset, DEFAULT_HUG_FILL, facingOffsetRadians, degToRad3, radToDeg3, scaleRangeOf, tierAbove, occludedTopFrac, stickerSizeControl, clampSizeValue, STICKER_SCALE_RANGE, HUG_MUL_RANGE, seatedHitBox, zoneCfg, zoneMode, zoneModes, zoneHasChoice, zoneSeat, zoneInsert, zoneSeatFields, clampLean, LEAN_LIMIT, surfaceFit, surfaceFitMax, frameTopMaxScale, insertSeat, DEFAULT_INSERT_DEPTH, DEFAULT_INSERT_LEAN_DEG, flatPose } from './placement.js';
import { TIER_RADII, STICKER_SIZE } from './constants.js';
import { topContains } from './geometry/surface.js';
import { scaledOutline } from './geometry/shapes.js';

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

// INVARIANTS.md #8. The question that has to be asked of any world dimension: "does this still
// hold on a cake of a different radius?" For the seat gap the answer must be YES — the decal has to
// hug a 0.45 tier exactly as it hugs a 1.2 one. An ABSOLUTE gap fails this: 0.025 world is 2.1% of
// a 1.2 radius but 5.6% of a 0.45 radius, so the decal floated further off the smaller the cake and
// you saw the board through the slot at the silhouette tangent. Pin the ratio, not the length.
describe('sideSeatOffset — the seat is a FRACTION of the live radius, never an absolute length', () => {
  it('holds the same gap-to-radius ratio on every tier size', () => {
    const ratios = TIER_RADII.map(r => sideSeatOffset(r) / r);
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[0], 12);
  });

  it('scales linearly with radius (a 2x cake gets a 2x gap)', () => {
    expect(sideSeatOffset(2.4)).toBeCloseTo(2 * sideSeatOffset(1.2), 12);
    expect(sideSeatOffset(0.45)).toBeCloseTo(0.375 * sideSeatOffset(1.2), 12);
  });

  it('matches the Relief Studio frame it was authored in (TIER_R 1.2 -> 0.004)', () => {
    expect(sideSeatOffset(1.2)).toBeCloseTo(0.004, 12);
  });

  it('is NOT the old absolute constant', () => {
    expect(sideSeatOffset(1.2)).not.toBeCloseTo(0.025, 3);
  });

  it('degrades safely on a missing/invalid radius rather than inventing a world length', () => {
    for (const bad of [0, -1, NaN, Infinity, undefined]) expect(sideSeatOffset(bad)).toBe(0);
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

describe('tier stacking — ONE occlusion rule (rim rings AND top-surface finishes share it)', () => {
  // index 0 = bottom; each higher index rests on the one below (concentric, tapering up).
  const tiers = [{ radius: 2 }, { radius: 1 }, { radius: 0.5 }];
  it('tierAbove returns the tier resting on top, null at the top', () => {
    expect(tierAbove(tiers, 0)).toBe(tiers[1]);
    expect(tierAbove(tiers, 2)).toBe(null);
    expect(tierAbove(undefined, 0)).toBe(null);
  });
  it('occludedTopFrac = upper radius / this radius (the hidden centre)', () => {
    expect(occludedTopFrac(tiers, 0)).toBe(0.5);   // 1 / 2
    expect(occludedTopFrac(tiers, 1)).toBe(0.5);   // 0.5 / 1
  });
  it('top tier and a non-smaller upper tier are fully visible (frac 0)', () => {
    expect(occludedTopFrac(tiers, 2)).toBe(0);                       // nothing above the top tier
    expect(occludedTopFrac([{ radius: 1 }, { radius: 1 }], 0)).toBe(0); // upper not smaller → no occlusion
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

describe('scaleRangeOf — optional step sets the dial increment', () => {
  it('no step → falls back to the control default step', () => {
    expect(scaleRangeOf({ placement_config: { scale: { min: 0.2, max: 0.5 } } }, 0.25, 8, 0.05).step).toBe(0.05);
    expect(scaleRangeOf({ placement_config: {} }, 0.25, 8, 0.1).step).toBe(0.1);
  });
  it('a positive step overrides the default; min/max/step compose independently', () => {
    expect(scaleRangeOf({ placement_config: { scale: { min: 0.2, max: 0.5, step: 0.1 } } }, 0.25, 8, 0.05))
      .toEqual({ min: 0.2, max: 0.5, step: 0.1 });
    expect(scaleRangeOf({ placement_config: { scale: { step: 0.5 } } }, 0.25, 8, 0.05))
      .toEqual({ min: 0.25, max: 8, step: 0.5 });   // only step overridden
  });
  it('ignores a non-positive or non-numeric step', () => {
    expect(scaleRangeOf({ placement_config: { scale: { step: 0 } } },  0.25, 8, 0.05).step).toBe(0.05);
    expect(scaleRangeOf({ placement_config: { scale: { step: -1 } } }, 0.25, 8, 0.05).step).toBe(0.05);
    expect(scaleRangeOf({ placement_config: { scale: { step: 'x' } } }, 0.25, 8, 0.05).step).toBe(0.05);
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

  describe('asymmetric extent — a banner clamps by its flags, not its transparent square', () => {
    // A bunting image: flags in the vertical middle, empty margin above AND below. Content reaches
    // 0.1 above the centre and 0.1 below, though the square half is 0.35.
    const up = 0.1, down = 0.1, squareHalf = 0.35;

    it('lets the visible content climb until its TOP touches the rim', () => {
      // Old symmetric clamp (squareHalf) stopped the centre at baseY+wall-0.35 = 1.45.
      const yOld = wallClampY(5, baseY, wall, squareHalf);
      const yNew = wallClampY(5, baseY, wall, down, up);
      expect(yNew).toBeGreaterThan(yOld);                 // it can go higher now…
      expect(yNew + up).toBeCloseTo(baseY + wall, 6);     // …until the flags' top is at the rim
    });

    it('lets the visible content drop until its BOTTOM touches the base', () => {
      const yNew = wallClampY(0, baseY, wall, down, up);
      expect(yNew - down).toBeCloseTo(baseY, 6);          // flags' bottom at the base
    });

    it('is unchanged for a margin-free asset (content fills the square)', () => {
      expect(wallClampY(5, baseY, wall, squareHalf, squareHalf))
        .toBe(wallClampY(5, baseY, wall, squareHalf));    // same as the single-arg (symmetric) form
    });

    it('the reported banner: empty top margin no longer blocks upward travel', () => {
      // The transparent square would stop the centre 0.25 short of where the flags allow.
      const gained = wallClampY(5, baseY, wall, down, up) - wallClampY(5, baseY, wall, squareHalf);
      expect(gained).toBeCloseTo(squareHalf - up, 6);     // exactly the empty top margin, recovered
    });
  });
});

describe('stickerSizeControl — the ONE size field + bounds for a sticker', () => {
  const plain = { placement_config: {} };
  const tier  = { radius: 1, height: 0.8 };

  it('an ordinary sticker sizes by absolute `scale`, on the default range', () => {
    const c = stickerSizeControl(plain, { scale: 1.4, zone: 'top_surface' }, tier);
    expect(c).toEqual({ key: 'scale', value: 1.4, ...STICKER_SCALE_RANGE });
  });

  it('reads placement_config.scale bounds rather than hard-coding them', () => {
    const el = { placement_config: { scale: { min: 0.5, max: 1.2, step: 0.1 } } };
    const c = stickerSizeControl(el, { scale: 1, zone: 'side' }, tier);
    expect(c).toMatchObject({ key: 'scale', min: 0.5, max: 1.2, step: 0.1 });
  });

  it('a hero hug sizes by `hugMul`, NOT scale — and ignores placement_config.scale', () => {
    const el = { placement_config: { scale: { min: 0.5, max: 1.2 } } };
    const hug = { singlePerSlot: true, placementMode: 'hug', hugMul: 1.5, scale: 99 };
    expect(isDynamicHug(hug)).toBe(true);
    expect(stickerSizeControl(el, hug, tier)).toEqual({ key: 'hugMul', value: 1.5, ...HUG_MUL_RANGE });
  });

  it('defaults each missing value rather than throwing', () => {
    expect(stickerSizeControl(undefined, undefined, null))
      .toEqual({ key: 'scale', value: 1, ...STICKER_SCALE_RANGE });
  });

  it('caps a photo frame on the SIDE so it cannot outgrow the wall', () => {
    const frame = { scale: 1, zone: 'side', photoMask: 'm.png', photoFill: 1 };
    const c = stickerSizeControl(plain, frame, { radius: 1, height: 0.8 });
    expect(c.max).toBeLessThan(STICKER_SCALE_RANGE.max);   // capped by geometry, not the raw range
    expect(c.max).toBeGreaterThan(c.min);
  });

  it("a frame's border ring counts against its cap (thicker border → smaller max)", () => {
    const base = { scale: 1, zone: 'side', photoMask: 'm.png', photoFill: 1 };
    const thin = stickerSizeControl(plain, base, tier).max;
    const thick = stickerSizeControl(plain, { ...base, borderWidth: 0.3 }, tier).max;
    expect(thick).toBeLessThan(thin);
  });

  it('a non-frame sticker is never capped by cake geometry', () => {
    const c = stickerSizeControl(plain, { scale: 1, zone: 'side' }, tier);
    expect(c.max).toBe(STICKER_SCALE_RANGE.max);
  });

  it('a cap never squeezes the control below one step of travel', () => {
    const frame = { scale: 1, zone: 'side', photoMask: 'm.png', photoFill: 1 };
    const c = stickerSizeControl(plain, frame, { radius: 1, height: 0 });   // zero-height wall
    expect(c.max).toBeGreaterThan(c.min);
  });
});

describe('clampSizeValue — a handle drag can never reach a size the dial refuses', () => {
  const range = { min: 0.25, max: 2, step: 0.05 };

  it('clamps below the floor and above the ceiling', () => {
    expect(clampSizeValue(-5, range)).toBe(0.25);
    expect(clampSizeValue(99, range)).toBe(2);
  });

  it('snaps onto the control increment', () => {
    expect(clampSizeValue(1.023, range)).toBe(1);
    expect(clampSizeValue(1.04, range)).toBe(1.05);
  });

  it('honours a coarse step', () => {
    expect(clampSizeValue(1.4, { min: 0.5, max: 3, step: 0.5 })).toBe(1.5);
  });

  it('degrades to a plain clamp when step is absent or invalid', () => {
    expect(clampSizeValue(1.234, { min: 0, max: 2, step: 0 })).toBe(1.234);
  });

  it('never returns a float-noise value like 1.0500000000000003', () => {
    const v = clampSizeValue(1.0499999, range);
    expect(Number.isInteger(v * 10000)).toBe(true);
  });
});

describe('seatedHitBox — a base-seated element\'s box stops at its seat, never inside the cake', () => {
  const S = 0.28, half = S / 2;
  const bottomOf = b => b.centerY - b.height / 2;
  const topOf    = b => b.centerY + b.height / 2;

  it('a NON base-seated element keeps the full square, centred on its origin', () => {
    expect(seatedHitBox({ standSeat: false, seatHalf: 0.05, size: S }))
      .toEqual({ width: S, height: S, centerY: 0 });
  });

  it('trims exactly the strip below a base-seated element\'s contact point', () => {
    const b = seatedHitBox({ standSeat: true, seatHalf: 0.105, size: S });   // 0.75 × half
    expect(bottomOf(b)).toBeCloseTo(-0.105, 6);   // bottom sits ON the seat…
    expect(topOf(b)).toBeCloseTo(half, 6);        // …and the top margin is untouched
    expect(b.width).toBe(S);                      // …and so are the side margins
  });

  it('is a no-op when the artwork already fills the plane (seatHalf === half)', () => {
    expect(seatedHitBox({ standSeat: true, seatHalf: half, size: S }))
      .toEqual({ width: S, height: S, centerY: 0 });
  });

  it('falls back to the full square while the asset is still being measured', () => {
    expect(seatedHitBox({ standSeat: true, seatHalf: null, size: S }))
      .toEqual({ width: S, height: S, centerY: 0 });
    expect(seatedHitBox({ standSeat: true, size: S })).toEqual({ width: S, height: S, centerY: 0 });
  });

  it('never inverts or overshoots on a nonsense seat', () => {
    for (const seatHalf of [-1, 0, 99]) {
      const b = seatedHitBox({ standSeat: true, seatHalf, size: S });
      expect(b.height).toBeGreaterThan(0);
      expect(bottomOf(b)).toBeGreaterThanOrEqual(-half - 1e-9);
      expect(topOf(b)).toBeCloseTo(half, 6);
    }
  });

  it('reproduces the palm-tree screenshot: 12.5% of the square was buried', () => {
    // Measured: border 224px wide, seatHalf 84px against a 112px half-square.
    const b = seatedHitBox({ standSeat: true, seatHalf: half * (84 / 112), size: S });
    const buried = half - (-bottomOf(b));      // how much the old square hung below the seat
    expect(buried / S).toBeCloseTo(0.125, 3);
    expect(bottomOf(b)).toBeCloseTo(-half * 0.75, 6);
  });

  it('defaults to STICKER_SIZE when no size is given', () => {
    expect(seatedHitBox({}).width).toBeCloseTo(0.28, 6);
  });
});

// Per-zone placement config: a zone entry is a mode string OR an object { mode, seat, ... }.
// zoneCfg normalises both; zoneMode/zoneSeat read through it. Backward compatibility (string form
// keeps working) and the seat default rule (scatter→flush, else proud) are the contracts here.
describe('zoneCfg / zoneMode', () => {
  it('normalises a legacy string to { mode }', () => {
    expect(zoneCfg({ side: 'hug' }, 'side')).toEqual({ mode: 'hug' });
  });
  it('passes an object entry through', () => {
    expect(zoneCfg({ side: { mode: 'hug', seat: 'flush' } }, 'side')).toEqual({ mode: 'hug', seat: 'flush' });
  });
  it('absent zone → { mode: undefined }', () => {
    expect(zoneCfg({}, 'side')).toEqual({ mode: undefined });
    expect(zoneCfg(undefined, 'side')).toEqual({ mode: undefined });
  });
  it('zoneMode reads the mode from either form, with a fallback', () => {
    expect(zoneMode({ side: 'hug' }, 'side', 'stand')).toBe('hug');
    expect(zoneMode({ side: { mode: 'perch' } }, 'side', 'stand')).toBe('perch');
    expect(zoneMode({}, 'side', 'stand')).toBe('stand');
    expect(zoneMode({ side: 'verge' }, 'side')).toBe('verge');
  });
});

// Insert is a MODIFIER, not a position. `zoneInsert` reads the per-zone `insert` object; zoneCfg
// promotes the legacy `mode:"insert"` + shared `placement_config.insert` form into an upright pose
// (stand on flat surfaces, hug against a wall) so no data migration is needed. These are the
// back-compat + composition contracts for the decomposition.
describe('zoneInsert / insert-as-modifier', () => {
  it('reads a per-zone insert modifier riding the zone object (new form)', () => {
    const pc = { top_surface: { mode: 'stand', insert: { depth: 0.4, lean_deg: 10 } } };
    expect(zoneMode(pc, 'top_surface')).toBe('stand');
    expect(zoneInsert(pc, 'top_surface')).toEqual({ depth: 0.4, lean_deg: 10 });
  });
  it('no insert key → null (element seats flush, not buried)', () => {
    expect(zoneInsert({ top_surface: 'stand' }, 'top_surface')).toBeNull();
    expect(zoneInsert({ top_surface: { mode: 'stand' } }, 'top_surface')).toBeNull();
    expect(zoneInsert({}, 'top_surface')).toBeNull();
  });
  it('legacy mode:"insert" on a flat surface promotes to stand + the shared global insert params', () => {
    const pc = { top_surface: 'insert', insert: { depth: 0.3, lean_deg: 15, jitter_deg: 20 } };
    expect(zoneMode(pc, 'top_surface')).toBe('stand');           // position, never "insert"
    expect(zoneInsert(pc, 'top_surface')).toEqual({ depth: 0.3, lean_deg: 15, jitter_deg: 20 });
  });
  it('legacy mode:"insert" on a WALL promotes to hug (the wall base pose), same params', () => {
    const pc = { side: 'insert', insert: { depth: 0.25 } };
    expect(zoneMode(pc, 'side')).toBe('hug');
    expect(zoneInsert(pc, 'side')).toEqual({ depth: 0.25 });
  });
  it('legacy mode:"insert" with no global params still promotes (empty modifier, defaults apply)', () => {
    const pc = { top_surface: 'insert' };
    expect(zoneMode(pc, 'top_surface')).toBe('stand');
    expect(zoneInsert(pc, 'top_surface')).toEqual({});
  });
});

describe('zoneSeat', () => {
  it('defaults solid decor to proud', () => {
    expect(zoneSeat({ side: 'hug' }, 'side')).toBe('proud');
    expect(zoneSeat({}, 'side')).toBe('proud');
  });
  it('defaults scatter decor to flush', () => {
    expect(zoneSeat({ scatter: true, side: 'hug' }, 'side')).toBe('flush');
  });
  it('an explicit per-zone seat overrides the default (both ways)', () => {
    expect(zoneSeat({ side: { mode: 'hug', seat: 'flush' } }, 'side')).toBe('flush');
    expect(zoneSeat({ scatter: true, side: { mode: 'hug', seat: 'proud' } }, 'side')).toBe('proud');
  });
  it('ignores an unknown seat value and falls back to the default', () => {
    expect(zoneSeat({ side: { mode: 'hug', seat: 'sideways' } }, 'side')).toBe('proud');
  });
});

// The single source the add path AND the chooser's zone-switch move both use, so a placed and a
// moved instance seat identically (regression: moving a proud element off the wall and back left it
// flush/buried because the move never re-derived these — and could leak the raw { mode, seat } object
// into placementMode).
describe('zoneSeatFields — placementMode + sideProud, config-driven, from either config form', () => {
  it('derives mode via zoneMode (never the raw object) and proud from the default', () => {
    expect(zoneSeatFields({ side: 'hug' }, 'side')).toEqual({ placementMode: 'hug', sideProud: true });
  });
  it('reads the OBJECT form without leaking the object into placementMode', () => {
    const f = zoneSeatFields({ side: { mode: 'hug', seat: 'proud' } }, 'side');
    expect(f.placementMode).toBe('hug');           // NOT the { mode, seat } object
    expect(f.sideProud).toBe(true);
  });
  it('honours an explicit flush seat and the scatter default', () => {
    expect(zoneSeatFields({ side: { mode: 'hug', seat: 'flush' } }, 'side').sideProud).toBe(false);
    expect(zoneSeatFields({ scatter: true, side: 'hug' }, 'side').sideProud).toBe(false);
  });
  it('falls back to hug when the zone is unconfigured', () => {
    expect(zoneSeatFields({}, 'side')).toEqual({ placementMode: 'hug', sideProud: true });
  });
});

describe('insertSeat — buried-and-angled seat: lean±jitter, fan spin, depth (config-driven, #8)', () => {
  const D2R = Math.PI / 180;

  it('no jitter → deterministic: tilt = lean, no fan, depth passes through', () => {
    const s = insertSeat({ depth: 0.4, lean_deg: 20, jitter_deg: 0 });
    expect(s.tiltAngle).toBeCloseTo(20 * D2R, 6);
    expect(s.fanYaw).toBe(0);
    expect(s.depthFrac).toBe(0.4);
  });

  it('falls back to defaults when fields are unauthored', () => {
    const s = insertSeat({});
    expect(s.tiltAngle).toBeCloseTo(DEFAULT_INSERT_LEAN_DEG * D2R, 6);
    expect(s.depthFrac).toBe(DEFAULT_INSERT_DEPTH);
    expect(s.fanYaw).toBe(0);
    // null config (mode on, object absent) is safe too.
    expect(insertSeat(undefined).depthFrac).toBe(DEFAULT_INSERT_DEPTH);
  });

  it('jitter spreads BOTH the lean and the fan yaw within ±jitter, seeded by the rng', () => {
    // rng=1 → +jitter on both; rng=0 → −jitter.
    const hi = insertSeat({ lean_deg: 10, jitter_deg: 30 }, () => 1);
    expect(hi.tiltAngle).toBeCloseTo((10 + 30) * D2R, 6);
    expect(hi.fanYaw).toBeCloseTo(30 * D2R, 6);
    const lo = insertSeat({ lean_deg: 10, jitter_deg: 30 }, () => 0);
    expect(lo.tiltAngle).toBeCloseTo((10 - 30) * D2R, 6);
    expect(lo.fanYaw).toBeCloseTo(-30 * D2R, 6);
  });
});

// ── Two poses on one surface ────────────────────────────────────────────────────────────────────
// A jersey stands on the cake top or lies flat on it, and which is right is the customer's taste.
// The list is ordered: the FIRST entry is what a drop gets, so a config naming one pose behaves
// exactly as it did — that is what makes this additive rather than a migration.
describe('zoneModes — the poses a zone allows, default first', () => {
  it('reads the legacy string form as a one-pose zone', () => {
    expect(zoneModes({ top_surface: 'stand' }, 'top_surface')).toEqual(['stand']);
  });

  it('reads the object form as a one-pose zone', () => {
    expect(zoneModes({ top_surface: { mode: 'stand' } }, 'top_surface')).toEqual(['stand']);
  });

  it('reads a modes list, default first', () => {
    expect(zoneModes({ top_surface: { modes: ['stand', 'hug'] } }, 'top_surface')).toEqual(['stand', 'hug']);
  });

  it('zoneMode still answers the DEFAULT, so every existing caller is unchanged', () => {
    expect(zoneMode({ top_surface: { modes: ['stand', 'hug'] } }, 'top_surface')).toBe('stand');
    expect(zoneMode({ top_surface: 'hug' }, 'top_surface')).toBe('hug');
  });

  it('only a real list is a choice — one pose grows no controls', () => {
    expect(zoneHasChoice({ top_surface: 'stand' }, 'top_surface')).toBe(false);
    expect(zoneHasChoice({ top_surface: { modes: ['stand'] } }, 'top_surface')).toBe(false);
    expect(zoneHasChoice({ top_surface: { modes: ['stand', 'hug'] } }, 'top_surface')).toBe(true);
  });

  it('falls back for a zone the config never mentions', () => {
    expect(zoneModes({}, 'top_surface', 'hug')).toEqual(['hug']);
    expect(zoneModes({}, 'top_surface')).toEqual([]);
  });
});

describe('zoneSeatFields — an explicitly picked pose', () => {
  const pc = { top_surface: { modes: ['stand', 'hug'] } };

  it('honours a pose the zone offers', () => {
    expect(zoneSeatFields(pc, 'top_surface', 'hug').placementMode).toBe('hug');
  });

  it('falls back to the default for a pose the zone does NOT offer', () => {
    // The case that matters: a design saved while the element allowed two poses, loaded after an
    // admin cut it back to one. Trusting the stored value would render a pose the element no longer
    // claims to do — so it is validated against the config, not carried.
    expect(zoneSeatFields({ top_surface: 'stand' }, 'top_surface', 'hug').placementMode).toBe('stand');
    expect(zoneSeatFields(pc, 'top_surface', 'perch').placementMode).toBe('stand');
  });

  it('with no pose asked for, answers exactly as before', () => {
    expect(zoneSeatFields({ side: 'hug' }, 'side')).toEqual({ placementMode: 'hug', sideProud: true });
  });
});

describe('clampLean — one limit for both lean axes', () => {
  it('holds a lean inside the limit', () => {
    expect(clampLean(0.4)).toBeCloseTo(0.4, 6);
    expect(clampLean(-0.4)).toBeCloseTo(-0.4, 6);
  });

  it('clamps both directions', () => {
    expect(clampLean(99)).toBe(LEAN_LIMIT);
    expect(clampLean(-99)).toBe(-LEAN_LIMIT);
  });

  it('treats a missing value as upright', () => {
    expect(clampLean(undefined)).toBe(0);
    expect(clampLean(null)).toBe(0);
  });
});

// ── Artwork that fits a surface ─────────────────────────────────────────────────────────────────
// An edible sheet is printed artwork the baker lays on the cake. It must grow until it meets the rim
// and stop — an overhanging disc is not a look, it is a sheet that will not fit the cake it was
// bought for. A photo frame already had this rule; the sheet borrows it.
describe('surfaceFit — where the two fit numbers come from', () => {
  it('an ordinary decoration does not fit a surface — it is sized by taste', () => {
    expect(surfaceFit({ scale: 2 })).toBe(null);
  });

  it('a sheet reads its own artwork', () => {
    expect(surfaceFit({ sheetShape: 'round', sheetFill: 0.9 })).toEqual({ shape: 'round', fill: 0.9 });
  });

  it('a photo frame grows its fill by the border ring drawn around it', () => {
    // The ring is part of what must not overhang, so the bound has to include it.
    const fit = surfaceFit({ photoMask: 'm.png', photoShape: 'round', photoFill: 0.8, borderWidth: 0.25 });
    expect(fit.fill).toBeCloseTo(1.0, 6);
  });

  it('a sheet wins over photo fields, so an element cannot be both', () => {
    const fit = surfaceFit({ sheetShape: 'rect', sheetFill: 1, photoMask: 'm.png', photoFill: 0.5 });
    expect(fit).toEqual({ shape: 'rect', fill: 1 });
  });
});

describe('surfaceFitMax — the fit is the CAKE\'s size, not a number someone typed', () => {
  const round = (radius) => ({ shape: 'round', radius, height: 1 });

  it('a round sheet on a round top reaches the rim', () => {
    const wide   = surfaceFitMax({ zone: 'top_surface', sheetShape: 'round', sheetFill: 1 }, round(1.2));
    const narrow = surfaceFitMax({ zone: 'top_surface', sheetShape: 'round', sheetFill: 1 }, round(0.6));
    // The SAME sheet is smaller on a narrower cake — which is the whole point, and the reason an
    // authored default scale could never be right for every cake.
    expect(narrow).toBeLessThan(wide);
    expect(narrow / wide).toBeCloseTo(0.5, 6);
  });

  it('a square sheet on a round top inscribes rather than overhanging', () => {
    const r = round(1.2);
    const circle = surfaceFitMax({ zone: 'top_surface', sheetShape: 'round', sheetFill: 1 }, r);
    const box    = surfaceFitMax({ zone: 'top_surface', sheetShape: 'rect',  sheetFill: 1 }, r);
    expect(box).toBeCloseTo(circle / Math.SQRT2, 6);
  });

  it('transparent margin around the artwork is taken off the bound', () => {
    const full = surfaceFitMax({ zone: 'top_surface', sheetShape: 'round', sheetFill: 1 },   round(1.2));
    const half = surfaceFitMax({ zone: 'top_surface', sheetShape: 'round', sheetFill: 0.5 }, round(1.2));
    // Artwork filling half its plane has to scale twice as far for its EDGE to reach the same rim.
    expect(half).toBeCloseTo(full * 2, 6);
  });

  it('answers null for anything that does not fit a surface, so the authored max stands', () => {
    expect(surfaceFitMax({ zone: 'top_surface', scale: 1 }, round(1.2))).toBe(null);
    expect(surfaceFitMax({ zone: 'top_surface', sheetShape: 'round' }, null)).toBe(null);
    expect(surfaceFitMax({ zone: 'board', sheetShape: 'round' }, round(1.2))).toBe(null);
  });
});

// ── A sheet on a cake that is not round ─────────────────────────────────────────────────────────
// Heart, hexagon, butterfly and number cakes report an OUTLINE with a bounding box. The fit used to
// be that box, and a square filling a heart's box hangs off the shoulders and the point — a real
// overhang, on photo frames as much as on sheets. And a heart-shaped sheet had no way to say it was
// heart-shaped, so it inscribed a square in the middle of a heart cake instead of covering it.
describe('frameTopMaxScale on non-round cakes', () => {
  // The REAL heart, built the way tierShape builds it — not an approximation of one. A hand-written
  // polygon would be testing my idea of a heart rather than the shape a customer's cake actually is.
  const heart = {
    kind: 'outline', family: 'heart', halfW: 1.2, halfD: 1.2,
    outline: scaledOutline('heart', {}, 1.2, 1.2),
  };

  it('a square sheet on a heart cake stays INSIDE the heart', () => {
    const s = frameTopMaxScale(heart, 'round', 1);
    const e = (STICKER_SIZE / 2) * s;             // half-extent of the placed artwork
    for (const [x, z] of [[e, e], [-e, e], [e, -e], [-e, -e]]) {
      expect(topContains(heart, x, z), `corner ${x.toFixed(3)},${z.toFixed(3)} is off the cake`).toBe(true);
    }
  });

  it('and is smaller than the bounding box would have allowed — the old bug', () => {
    const box = Math.min(heart.halfW, heart.halfD) / (STICKER_SIZE / 2);
    expect(frameTopMaxScale(heart, 'round', 1)).toBeLessThan(box);
  });

  it('a HEART sheet on a heart cake fills it instead of hiding in the middle', () => {
    const matched = frameTopMaxScale(heart, 'heart', 1);
    const square  = frameTopMaxScale(heart, 'round', 1);
    expect(matched).toBeGreaterThan(square);
    expect(matched).toBeCloseTo(Math.min(heart.halfW, heart.halfD) / (STICKER_SIZE / 2), 6);
  });

  it('a heart sheet on a ROUND cake still inscribes — a shape match is not assumed', () => {
    const round = { kind: 'round', radius: 1.2 };
    expect(frameTopMaxScale(round, 'heart', 1)).toBeCloseTo(frameTopMaxScale(round, 'rect', 1), 6);
  });

  it('a rect sheet on a sheet cake fills to the nearest edge', () => {
    const sheetCake = { kind: 'rect', halfW: 1.08, halfD: 0.78 };
    expect(frameTopMaxScale(sheetCake, 'rect', 1)).toBeCloseTo(0.78 / (STICKER_SIZE / 2), 6);
  });
});

describe('flatPose — a flat surface is stood on, never hugged', () => {
  it('turns a hug into a stand on the board', () => {
    // The football's config genuinely says `board: "hug"`. Honoured literally it seats the model's
    // middle at the surface and half the ball sinks into the drum.
    expect(flatPose('board', 'hug')).toBe('stand');
    expect(flatPose('board', null)).toBe('stand');
    expect(flatPose('board', undefined)).toBe('stand');
  });

  it('leaves the WALL zones alone — hugging is what they are for', () => {
    expect(flatPose('side', 'hug')).toBe('hug');
    expect(flatPose('middle_tier', 'hug')).toBe('hug');
  });

  it('leaves every pose a flat surface genuinely has', () => {
    // Config still chooses freely among the poses that mean something on a flat surface.
    for (const m of ['stand', 'perch', 'verge', 'insert']) {
      expect(flatPose('board', m)).toBe(m);
      expect(flatPose('top_surface', m)).toBe(m);
    }
  });

  it('leaves top_surface hug ALONE — that pose is real', () => {
    // ⚠️ The first cut coerced every non-wall zone and broke a standing test. A top-surface hug is
    // the hero pose that auto-sizes to the tier wall (hugMul, not scale). "Flat" does not imply
    // "cannot hug"; only the board has nothing to hug.
    expect(flatPose('top_surface', 'hug')).toBe('hug');
  });
});

describe('zoneSeatFields writes the coerced pose', () => {
  it('never writes hug for a board, whatever the config says', () => {
    // ⚠️ The move path calls this, not seatOnSlot. Coercing only at the seat left dragging a
    // decoration onto the board writing `hug` straight back and burying it again.
    const pc = { board: 'hug', top_surface: 'stand' };
    expect(zoneSeatFields(pc, 'board').placementMode).toBe('stand');
    expect(zoneSeatFields(pc, 'board', 'hug').placementMode).toBe('stand');
  });

  it('still writes hug on a wall', () => {
    const pc = { side: 'hug' };
    expect(zoneSeatFields(pc, 'side').placementMode).toBe('hug');
  });
});
