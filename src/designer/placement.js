// Pure, config-driven placement logic — no React, no element-type branching. The designer and
// the contract test both use these so behaviour can't silently diverge per element type.
import { ZONES, PLACEMENT_MODES, STICKER_SIZE } from './constants.js';
import { topClamp, snapToRim } from './geometry/surface.js';

// Default fraction of a tier's wall height a side-hug HERO decoration fills. Tunable per
// element via placement_config.hug_fill.
export const DEFAULT_HUG_FILL = 0.7;

// Folded sticker (placement_config.foldable): the flat decal splits at the body spine into
// two wings that hinge up into a shallow V. These are the fallbacks used when `foldable` is
// on but the angle/split aren't authored — tunable per element via placement_config.fold
// (dihedral degrees) and placement_config.spine (split fraction, 0–1). foldable off → flat.
export const DEFAULT_FOLD_DEG = 30;
export const DEFAULT_SPINE    = 0.5;

// Verge (placement_config.verge): an element rests its base on the rim lip and reclines radially
// OUTWARD by this many degrees, so the rest of it cantilevers over the edge into the air. Fallback
// used when the mode is on but `angle_deg` isn't authored — tunable per element via
// placement_config.verge.angle_deg.
export const DEFAULT_VERGE_ANGLE_DEG = 35;

// Nudge a seat so it doesn't land exactly on a coincident sibling — in the SURFACE's own coordinate
// system. ONE rule, shared by placement (addSticker) and duplication (duplicateSticker), so the
// "don't stack two copies" behaviour lives in a single place rather than per call-site. The branch is
// on the surface's coordinate system (geometry), never on element type/slug (INVARIANTS #1/#2):
//   • top_surface → cartesian: push away from each colliding sibling by `step`, kept inside the tier.
//   • rim        → same cartesian push, then re-snapped onto the rim perimeter (edge-seated modes).
//   • side round → walk the seat angle `theta` until clear of any near sibling (same θ±, similar y).
//   • side rect  → walk the perimeter fraction `u` until clear.
// `pos` carries whatever coords that surface uses ({x,z} top/rim; {theta,y} round wall; {u,y} rect);
// the returned object is `pos` with the relevant coord(s) nudged. `siblings` = same surface + tier
// (the original is a sibling for duplication, so the copy is pushed off it). Pure.
export function deOverlapSeat(shape, zone, pos, siblings, step = STICKER_SIZE) {
  const isSide = zone === ZONES.SIDE || zone === ZONES.MIDDLE_TIER;
  if (isSide && pos.u != null) {
    let u = pos.u, guard = 0;
    const near = s => s.u != null && Math.abs((((u - s.u) % 1) + 1) % 1) < 0.04 && Math.abs((pos.y ?? 0) - (s.y ?? 0)) < 0.2;
    while (guard++ < 64 && siblings.some(near)) u += 0.04;
    return { ...pos, u: (((u % 1) + 1) % 1) };
  }
  if (isSide) {
    const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    let theta = pos.theta ?? 0, guard = 0;
    const near = s => angDist(theta, s.theta ?? 0) < 0.15 && Math.abs((pos.y ?? 0) - (s.y ?? 0)) < 0.2;
    while (guard++ < 64 && siblings.some(near)) theta += 0.5;
    return { ...pos, theta: (((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) };
  }
  // Cartesian surfaces (top_surface, rim): one push-away per colliding sibling.
  let x = pos.x ?? 0, z = pos.z ?? 0;
  for (const sib of siblings) {
    if (sib.x == null && sib.z == null) continue;
    const ex = x - (sib.x ?? 0), ez = z - (sib.z ?? 0);
    const d = Math.hypot(ex, ez);
    if (d < step) {
      const dir = d > 0.001 ? { x: ex / d, z: ez / d } : { x: 1, z: 0 };
      x = (sib.x ?? 0) + dir.x * step;
      z = (sib.z ?? 0) + dir.z * step;
    }
  }
  ({ x, z } = zone === ZONES.RIM ? snapToRim(shape, x, z) : topClamp(shape, x, z, 0.88));
  return { ...pos, x, z };
}

// Front-edge seat for the edge-seated modes (perch, verge): where the instance sits the moment it
// lands on a rim slot, and the lean it carries. Pure so BOTH placement paths seed identically —
// `addSticker` (hero add) and the chooser's scatter "move" path. Returns null for non-edge modes
// (caller keeps its own seat). `shp` is the tier's shape (from tierShape); reads only config.
//   • perch → centre straddles the edge at the lip, calibrated lean from placement_config.perch.tilt_deg.
//   • verge → centre-seated so the MID-SPINE rests ON the rim edge (z = radius) and the body drapes
//     over the lip, reclining OUTWARD by placement_config.verge.angle_deg (default 35°).
// `edge_inset` is the radial pull-IN from the rim (+ = inward, − = pushed out over the lip), default 0
// so the contact lands right on the edge. Overridable via config.
export function edgeSeatSeed(placementConfig, shp, mode) {
  const isPerch = mode === PLACEMENT_MODES.PERCH;
  const isVerge = mode === PLACEMENT_MODES.VERGE;
  if (!isPerch && !isVerge) return null;
  const cfg = (isVerge ? placementConfig?.verge : placementConfig?.perch) ?? {};
  const edge = shp.kind === 'rect' ? shp.halfD : shp.radius;
  const tiltAngle = isVerge
    ? (cfg.angle_deg ?? DEFAULT_VERGE_ANGLE_DEG) * Math.PI / 180
    : (cfg.tilt_deg ?? 0) * Math.PI / 180;
  return { x: 0, z: edge - (cfg.edge_inset ?? 0), tiltAngle, yOffset: cfg.y_offset ?? 0 };
}

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
// `placement_config.scale = { min, max, step }` bounds the dial and its increment; `placement_config.r`
// is just the default position WITHIN that range (set at placement). Each key is optional and falls
// back to the control's own default (`dMin`/`dMax`/`dStep`), so an element with no `scale` keeps its
// present bounds — backward compatible. Applies ONLY to absolute-scale dials, never the hero-hug
// `hugMul` (a wall-relative multiplier — a different unit). For a composite group, intersect the
// members' ranges (max of mins, min of maxes) so the shared dial can't push any member past its cap.
export function scaleRangeOf(element, dMin, dMax, dStep) {
  const sc = element?.placement_config?.scale;
  return {
    min:  typeof sc?.min  === 'number'                 ? sc.min  : dMin,
    max:  typeof sc?.max  === 'number' && sc.max  > 0  ? sc.max  : dMax,
    step: typeof sc?.step === 'number' && sc.step > 0  ? sc.step : dStep,
  };
}

// Max Size for a photo frame on the TOP surface: grow until the frame's shape reaches the cake-top
// boundary. Assumes the mask shape fills its square plane (half-extent = stickerSize/2 at scale 1).
//   round cake + round frame  → circle meets the rim (fills)
//   round cake + box frame    → square inscribed in the circle (corner-limited)
//   rect cake (any frame)     → grows to the nearest edge (inscribed; fills when shapes/aspect match)
// `frameShape` is the authored placement_config.photo.shape ('round' | 'rect' | 'other'); anything
// not 'round' is treated as a box (bounding-square) so hearts/stars inscribe rather than overhang.
export function frameTopMaxScale(shp, frameShape, fill = 1, stickerSize = STICKER_SIZE) {
  // `fill` = the shape's half-extent as a fraction of the plane half (measured from the mask at
  // authoring time). Using it makes the SHAPE's edge — not the square plane — reach the boundary, so
  // a mask with any transparent margin still grows exactly to the rim.
  const h = (stickerSize / 2) * (fill > 0 ? fill : 1);
  let s;
  if (shp.kind === 'round') {
    s = frameShape === 'round' ? shp.radius / h : shp.radius / (h * Math.SQRT2);
  } else {
    s = Math.min(shp.halfW, shp.halfD) / h;
  }
  return Math.max(1, s);   // never below 1× (a tiny cake shouldn't trap the dial under the default)
}

// Max Size for a photo frame on the SIDE: grow until the shape's height fills the tier WALL (so it
// never spills above the rim or below the base). `fill` is the shape's extent fraction of the plane,
// pre-multiplied by (1 + borderWidth) by the caller so the border ring is included in the bound.
export function frameSideMaxScale(wallHeight, fill = 1, stickerSize = STICKER_SIZE) {
  const ext = stickerSize * (fill > 0 ? fill : 1);   // shape full height at scale 1
  return Math.max(0.3, wallHeight / ext);
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
