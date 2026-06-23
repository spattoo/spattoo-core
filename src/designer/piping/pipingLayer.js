import { PIPING_FRONT_ANGLE } from '../constants.js';

// Single source of truth for the piping LAYER — the object stored in a tier's topPipings /
// bottomPipings and consumed by TopPipingRing / BottomPipingRing. Both the interactive designer
// (CakeDesigner add-to-cake path) and any external consumer (e.g. the admin inspiration preview)
// build layers through `makePipingLayer`, so the shape + config wiring never drift (INVARIANTS #3).

// Which arrangements an element allows for a zone. Mirrors the allowed_zones array
// convention; absent ⇒ ['ring'] (matches legacy piping that only ever ringed).
export function pipingAllowedArrangements(pc, isTop) {
  const allowed = isTop ? pc?.top_arrangements_allowed : pc?.bottom_arrangements_allowed;
  return Array.isArray(allowed) && allowed.length ? allowed : ['ring'];
}

// Default arrangement for a zone: the admin's `*_arrangement` if it's actually allowed,
// otherwise the first allowed mode (so a single-only element defaults to single).
export function pipingDefaultArrangement(pc, isTop) {
  const allowed = pipingAllowedArrangements(pc, isTop);
  const pref = isTop ? pc?.top_arrangement : pc?.bottom_arrangement;
  return allowed.includes(pref) ? pref : allowed[0];
}

// Map an element's placement_config to the piping fields a ring consumes. Rim (top) and board
// (bottom) are symmetric: top_* mirrors bottom_*. Returned keys match TopPipingRing/BottomPipingRing.
export function pipingPlacementFromConfig(placementConfig, isTop) {
  const pc = placementConfig ?? {};
  const arrangement = pipingDefaultArrangement(pc, isTop);
  // Single mode seeds exactly one instance from the configured angle; ring carries
  // no instances array so it stays the cheap, procedural full-circle path.
  const seed = arrangement === 'single'
    ? { instances: [{ id: Date.now(), angle: (isTop ? pc.top_single_angle : pc.bottom_single_angle) ?? PIPING_FRONT_ANGLE }] }
    : {};
  // Alternating A/B pattern — version B's shape + transform + the repeating cycle string.
  const alt = isTop
    ? {
        altEnabled:      pc.top_alt_enabled        ?? false,
        altGlbUrl:       pc.top_alt_glb_url         ?? null,
        altFlip:         pc.top_alt_flip            ?? false,
        altRotation:     pc.top_alt_rotation        ?? null,
        altRadialOffset: pc.top_alt_radial_offset   ?? null,
        altYOffset:      pc.top_alt_y_offset        ?? null,
        pattern:         pc.top_pattern             || 'AB',
      }
    : {
        altEnabled:      pc.bottom_alt_enabled      ?? false,
        altGlbUrl:       pc.bottom_alt_glb_url       ?? null,
        altFlip:         pc.bottom_alt_flip          ?? false,
        altRotation:     pc.bottom_alt_rotation      ?? null,
        altRadialOffset: pc.bottom_alt_radial_offset ?? null,
        altYOffset:      pc.bottom_alt_y_offset      ?? null,
        pattern:         pc.bottom_pattern           || 'AB',
      };
  // U-shaped (bend/festoon) fields — present only on strip elements tuned with "Bend" on.
  const bend = isTop
    ? { bend: pc.top_bend ?? false, bendRing: pc.top_bend_ring ?? false, festoons: pc.top_festoons ?? null, bendDepth: pc.top_bend_depth ?? null, bendTilt: pc.top_bend_tilt ?? null }
    : { bend: pc.bottom_bend ?? false, bendRing: pc.bottom_bend_ring ?? false, festoons: pc.bottom_festoons ?? null, bendDepth: pc.bottom_bend_depth ?? null, bendTilt: pc.bottom_bend_tilt ?? null };
  // Wrap: a pre-formed ring GLB wrapped round the wall as one band (round or sheet). Flag-only.
  const wrap = {
    wrap:     (isTop ? pc.top_wrap      : pc.bottom_wrap)      ?? false,
    wrapTilt: (isTop ? pc.top_wrap_tilt : pc.bottom_wrap_tilt) ?? null,
    wrapSize: (isTop ? pc.top_wrap_size : pc.bottom_wrap_size) ?? null,
  };
  // Drip: a procedural chocolate-drip ring (no GLB). Rim/top only for now. `dripConfig` is the
  // authored geometry bundle (tuned in the admin drip studio); gloss/length are customer-editable
  // defaults (the layer's `color` carries the chocolate colour, like any ring).
  const drip = isTop
    ? { drip: pc.top_drip ?? false, dripConfig: pc.top_drip_config ?? null, dripGloss: pc.top_drip_gloss ?? null, dripLength: pc.top_drip_length ?? null, dripFlood: pc.top_drip_flood ?? false }
    : { drip: false };
  if (isTop) {
    return {
      flipTop:           pc.top_flip          ?? false,
      rotation:          pc.top_rotation       ?? null,
      extraRadialOffset: pc.top_radial_offset  ?? null,
      yOffset:           pc.top_y_offset        ?? null,
      spacing:           pc.top_spacing         ?? null,
      softness:          pc.top_softness        ?? null,
      swagCount:         pc.top_swag_count      ?? null,
      swagDepth:         pc.top_swag_depth      ?? null,
      swagTilt:          pc.top_swag_tilt       ?? null,
      arrangement,
      ...alt,
      ...bend,
      ...wrap,
      ...drip,
      ...seed,
    };
  }
  return {
    flipBottom:        pc.bottom_flip          ?? true,
    bottomRotation:    pc.bottom_rotation      ?? null,
    extraRadialOffset: pc.bottom_radial_offset ?? null,
    yOffset:           pc.bottom_y_offset      ?? null,
    spacing:           pc.bottom_spacing       ?? null,
    softness:          pc.bottom_softness      ?? null,
    swagCount:         pc.bottom_swag_count    ?? null,
    swagDepth:         pc.bottom_swag_depth    ?? null,
    swagTilt:          pc.bottom_swag_tilt     ?? null,
    arrangement,
    ...alt,
    ...bend,
    ...wrap,
    ...seed,
  };
}

// Build a piping layer for a tier from an element + a resolved GLB. GLB *resolution* stays with the
// caller (the designer resolves multi-part `piping_pattern` blocks via its block map; a simple
// consumer passes el.image_url), but the layer object SHAPE lives here so it's authored once.
// `isTop` → rim (topPipings) vs board (bottomPipings). Callers may layer extras (userRadialOffset,
// yAdjustable…) on top of the returned base.
export function makePipingLayer(el, { isTop, glbUrl, altGlbUrl = null, color, cardId } = {}) {
  return {
    id: el.id,
    cardId: cardId ?? (typeof crypto !== 'undefined' ? crypto.randomUUID() : `${el.id}-${Date.now()}`),
    glbUrl: glbUrl ?? el.image_url ?? null,
    name: el.name,
    color: color ?? el.default_color ?? '#f5e6c8',
    size: 1,
    ...pipingPlacementFromConfig(el.placement_config, isTop),
    ...(altGlbUrl ? { altGlbUrl } : {}),
  };
}
