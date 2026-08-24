// Pure, config-driven placement logic — no React, no element-type branching. The designer and
// the contract test both use these so behaviour can't silently diverge per element type.
import { ZONES, PLACEMENT_MODES, STICKER_SIZE, SIDE_STICKER_SEAT_FRAC } from './constants.js';
import { topClamp, snapToRim, tierShape, topContains } from './geometry/surface.js';

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

// Insert (placement_config.insert): an element's base is sunk INTO the surface and it stands at an
// angle. `depth` = fraction of the element's LENGTH buried (the renderer multiplies by the measured
// length, never a world constant — INVARIANTS #8); `lean_deg` = base tilt from the surface normal;
// `jitter_deg` = random ± spread PER INSTANCE so a scattered batch fans out. Fallbacks when the mode is
// on but a field isn't authored.
export const DEFAULT_INSERT_DEPTH    = 0.3;
export const DEFAULT_INSERT_LEAN_DEG = 12;

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

// Per-instance seat for an `insert` element (base sunk into the surface at an angle). Returns the
// values BAKED onto the instance at add time: `tiltAngle` (base lean ± random jitter, radians),
// `fanYaw` (a small random Y-spin so a scattered batch points different ways — the exploded look), and
// `depthFrac` (fraction of the element's length to bury — the renderer scales by the measured length).
// `rng` is a 0..1 source (default Math.random); the jitter is baked per instance so it persists and a
// deterministic caller (test) can pin it. The ONE place the insert seat is computed — both addSticker
// and the chooser-move path call this, so the two can't drift (see edgeSeatSeed / INVARIANTS.md).
export function insertSeat(insertCfg, rng = Math.random) {
  const cfg = insertCfg ?? {};
  const lean   = (cfg.lean_deg   ?? DEFAULT_INSERT_LEAN_DEG) * Math.PI / 180;
  const jitter = (cfg.jitter_deg ?? 0) * Math.PI / 180;
  const rand = () => jitter ? (rng() * 2 - 1) * jitter : 0;   // ±jitter; a clean 0 when jitter is 0
  return {
    tiltAngle: lean + rand(),
    fanYaw:    rand(),
    depthFrac: cfg.depth ?? DEFAULT_INSERT_DEPTH,
  };
}

// Render-time size for a side-hug hero decoration: it fills `fill` of the tier WALL HEIGHT,
// independent of placement_config.r (which stays the absolute size for `stand`). Pure so the
// contract test pins the formula; `stickerSize` is the renderer's normalized base (a model is
// normalized to stickerSize, then multiplied by this scale).
export function hugScale(wallHeight, stickerSize, fill = DEFAULT_HUG_FILL) {
  return (wallHeight * fill) / stickerSize;
}

// How far a side decal's base sheet sits off the tier wall, in WORLD units, for a tier of the
// given live radius. The seat is a fraction of that radius, so `off / radius` is the SAME on every
// cake size — a decal hugs a 0.45 tier exactly as it hugs a 1.2 one (INVARIANTS.md #8). Pure, and
// the ONE place the seat is computed: the side sticker, the snapshot pass and the topper preview
// all call this rather than re-deriving it (the old absolute constant was pasted at 4 sites).
export function sideSeatOffset(radius) {
  return (Number.isFinite(radius) && radius > 0 ? radius : 0) * SIDE_STICKER_SEAT_FRAC;
}

// Keep a side decal's CENTRE y so its (scaled) bottom edge never crosses the tier base into the
// board. If the decal is taller than the wall (enlarged a lot), let it overflow UPWARD only —
// never down into the board. halfH = half the rendered sticker height.
// Keep a side-wall element's CENTRE where its VISIBLE content stays on the wall band [baseY, baseY+
// wallHeight]. `down`/`up` are the content's extent below/above the centre (scaled) — its lowest and
// highest opaque pixel, NOT the transparent square. Passing the same value for both (the square's
// half-height) reproduces the old symmetric clamp, so a margin-free asset is unchanged; a banner with
// empty margin above and below its flags can now climb until the flags touch the rim instead of being
// stopped short by the empty square. When the content is taller than the wall, pin its top to the rim.
export function wallClampY(y, baseY, wallHeight, down, up = down) {
  const lo = baseY + down;
  const hi = baseY + wallHeight - up;
  // Content taller than the wall: pin its BASE to the tier base (bottom seated, top overflows) —
  // the same fallback as the symmetric clamp.
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
// The largest scale whose artwork BOX stays inside an outline top (heart, hexagon, number…). Found by
// bisection on the four corners rather than analytically, because the outline is an arbitrary polygon
// and there is no closed form for "largest axis-aligned square inside it".
//
// Conservative on purpose: a ROUND piece of artwork would fit slightly larger than its bounding box
// allows. Erring small leaves a hair of icing showing; erring large hangs the sheet off the cake, and
// only one of those is a picture somebody has to explain to a customer.
function largestBoxInside(shp, halfAtUnitScale) {
  let lo = 0, hi = (Math.max(shp.halfW, shp.halfD) / halfAtUnitScale) * 1.5;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    const e = halfAtUnitScale * mid;
    const inside = topContains(shp, e, e) && topContains(shp, -e, e)
                && topContains(shp, e, -e) && topContains(shp, -e, -e);
    if (inside) lo = mid; else hi = mid;
  }
  return lo;
}

export function frameTopMaxScale(shp, frameShape, fill = 1, stickerSize = STICKER_SIZE) {
  // `fill` = the shape's half-extent as a fraction of the plane half (measured from the mask at
  // authoring time). Using it makes the SHAPE's edge — not the square plane — reach the boundary, so
  // a mask with any transparent margin still grows exactly to the rim.
  const h = (stickerSize / 2) * (fill > 0 ? fill : 1);

  // ── Same silhouette as the cake → it FILLS ──────────────────────────────────────────────────────
  // A heart sheet on a heart cake, a rectangle on a sheet cake. Two identical shapes meet exactly
  // when their bounding boxes do, so matching the box matches the outline — no polygon work needed.
  // This is what makes shape-matched artwork worth authoring: it covers the cake instead of hiding
  // inside a square drawn in the middle of it.
  const cakeFamily = shp.kind === 'round' ? 'round' : (shp.family ?? shp.kind);
  if (frameShape && frameShape === cakeFamily) {
    if (shp.kind === 'round') return Math.max(1, shp.radius / h);
    return Math.max(1, Math.min(shp.halfW, shp.halfD) / h);
  }

  let s;
  if (shp.kind === 'round') {
    // A square in a circle is corner-limited; a round frame reaches the rim.
    s = frameShape === 'round' ? shp.radius / h : shp.radius / (h * Math.SQRT2);
  } else if (shp.kind === 'rect') {
    // Straight edges: the nearest one limits it.
    s = Math.min(shp.halfW, shp.halfD) / h;
  } else {
    // An OUTLINE top (heart, hexagon, butterfly, number). halfW/halfD are its BOUNDING BOX, and a
    // square filling that box hangs off the curves — a heart is nowhere near its box at the
    // shoulders or the point. This branch used the box and so overhung on every one of these shapes,
    // for photo frames as well as sheets. The real polygon answers it.
    s = largestBoxInside(shp, h);
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

// ── The element's clickable/drawn box, in its own local frame ────────────────
// A placed element's hit plane is a `size` square centred on its origin. But a BASE-SEATED element
// (stand / base-verge / a folded card on a perch) is lifted by `seatHalf` — the distance from its
// origin down to its lowest OPAQUE pixel — so its visible base rests on the surface rather than the
// empty bottom of its transparent margin. When the artwork has empty space below it,
// `seatHalf < size/2`, and the square's bottom edge ends up BELOW the contact point — buried in the
// cake. That strip is not merely ugly: the hit plane billboards toward the camera, so it sits NEARER
// than the cake behind it and wins the raycast — clicking the bare cake in front of a palm tree
// selects the palm tree.
//
// So a base-seated element's box stops at its seat. Only the strip BELOW the seat is trimmed: the
// side and top margins stay, because they genuinely do intercept clicks over a neighbour and the
// border exists to show that (INVARIANTS #5a). The sub-seat strip is inside the cake, where it can
// reveal nothing and only steals clicks from the tier.
//
// Flag-driven off the placement mode, never an element type. A perch/verge that deliberately
// overhangs the rim is NOT base-seated — its underside hangs in air, not in cake — so it keeps the
// full square. GLBs self-correct: their `seatHalf` is half the model's height.
// A GLB passes its measured DENSE footprint (`halfW`/`halfH`, in STICKER_SIZE units) so the hit
// plane hugs the model's real extent — a tall-narrow bow gets a tall-narrow box, not a square. 2D
// stickers omit them and keep the full STICKER_SIZE square (their transparent margin genuinely does
// steal clicks and must be shown — INVARIANTS #5a). The box still traces the hit plane; only the
// plane's SIZE narrows to the art it actually intercepts.
export function seatedHitBox({ standSeat = false, seatHalf = null, size = STICKER_SIZE, halfW = null, halfH = null } = {}) {
  const hw  = halfW == null ? size / 2 : halfW;   // footprint half-width (GLB) or square half
  const top = halfH == null ? size / 2 : halfH;   // footprint half-height (GLB) or square half
  // Unmeasured (asset still loading) → the full square, exactly as before.
  const seat = seatHalf == null ? top : Math.min(Math.max(seatHalf, 0), top);
  const bottom = standSeat ? -seat : -top;
  return { width: hw * 2, height: top - bottom, centerY: (top + bottom) / 2 };
}

// ── The ONE answer to "how big is this sticker, and how big may it get?" ──────
// Every size control — the SizeDial in the edit popup AND the corner resize handles on the canvas —
// reads its field, value and bounds from here, so a drag and a dial can never disagree (INVARIANTS
// #3: a rule used in two places lives in one pure function). It resolves three things the callers
// used to each re-derive inline, and one of them got wrong (a hard-coded 0.25–3 range that ignored
// placement_config.scale entirely):
//   1. WHICH field carries size. A hero hug sizes by `hugMul` (a nudge on a wall-derived scale),
//      everything else by absolute `scale`. Flag-driven via isDynamicHug — never an element type.
//   2. The config bounds — placement_config.scale { min, max, step } (INVARIANTS #1).
//   3. The cake-geometry cap — a photo frame may only grow until it (and its border ring) reaches
//      the rim / wall edges. Config-gated on photoMask, no element-type branch.
export const STICKER_SCALE_RANGE = Object.freeze({ min: 0.25, max: 8, step: 0.05 });
export const HUG_MUL_RANGE       = Object.freeze({ min: 0.3,  max: 3, step: 0.05 });

// ── Artwork that fits a surface ─────────────────────────────────────────────────────────────────
// Two different things want the same rule: a photo-cake frame, and an EDIBLE SHEET (printed artwork
// a baker lays on the cake — the football disc). Both are flat pictures that should grow until they
// meet the boundary of the surface and stop, and neither should ever overhang the rim.
//
// They differ only in where the two numbers come from, so this is the ONE place that decides, and
// the geometry (frameTopMaxScale / frameSideMaxScale) stays shared:
//
//   sheet  the artwork IS the picture — its shape and extent are authored on the element
//   photo  the MASK is the shape, and the fill grows by the border ring drawn around it
//
// Returns null when an element is not surface-fitting, which is nearly all of them — an ordinary
// decoration is sized by taste, not by the cake.
export function surfaceFit(sticker) {
  if (sticker?.sheetShape) {
    return { shape: sticker.sheetShape, fill: sticker.sheetFill ?? 1 };
  }
  if (sticker?.photoMask) {
    return { shape: sticker.photoShape, fill: (sticker.photoFill ?? 1) * (1 + (sticker.borderWidth ?? 0)) };
  }
  return null;
}

// The largest an element may be scaled on a given surface — its fit, when it has one, else the
// element's authored max. `tier` is a CANVAS tier (radius resolved), not a design tier.
export function surfaceFitMax(sticker, tier, floor = 0) {
  const fit = surfaceFit(sticker);
  if (!fit || !tier) return null;
  if (sticker.zone === ZONES.TOP_SURFACE) {
    return Math.max(floor, frameTopMaxScale(tierShape(tier), fit.shape, fit.fill));
  }
  if (sticker.zone === ZONES.SIDE || sticker.zone === ZONES.MIDDLE_TIER) {
    return Math.max(floor, frameSideMaxScale(tier?.height ?? 0, fit.fill));
  }
  return null;
}

export function stickerSizeControl(element, sticker, tier = null) {
  if (isDynamicHug(sticker)) {
    return { key: 'hugMul', value: sticker?.hugMul ?? 1, ...HUG_MUL_RANGE };
  }
  const { min, max, step } = scaleRangeOf(
    element, STICKER_SCALE_RANGE.min, STICKER_SCALE_RANGE.max, STICKER_SCALE_RANGE.step);

  // Never cap below one step above the floor, or the control would have no travel.
  const capped = surfaceFitMax(sticker, tier, min + step) ?? max;
  return { key: 'scale', value: sticker?.scale ?? 1, min, max: capped, step };
}

// Snap a continuous size (a handle drag) onto the control's increment and clamp it to the control's
// bounds, so dragging can't reach a size the dial refuses to show.
export function clampSizeValue(value, { min, max, step }) {
  if (!(step > 0)) return Math.min(max, Math.max(min, value));
  const snapped = Math.round(value / step) * step;
  return +Math.min(max, Math.max(min, snapped)).toFixed(4);
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
  if (zones.includes(ZONES.BOARD)) {
    /* The board is ONE slot for the whole cake, not one per tier — there is only one board, and it
     * belongs to the cake rather than to any tier. tierIndex 0 so every "which tier does this sit
     * against" reader downstream resolves the bottom tier, which is the one the board is sized to.
     *
     * `placement: 'top'` because a board decoration STANDS on a flat surface, exactly like a
     * top-surface one — same seat, same drag, same renderer, a different plane. Calling it its own
     * placement would have meant a second copy of all of that. */
    slots.push({ key: 'board', placement: 'top', zone: ZONES.BOARD, tierIndex: 0 });
  }
  if (zones.includes(ZONES.SIDE) || zones.includes(ZONES.MIDDLE_TIER)) {
    for (let i = n - 1; i >= 0; i--) {
      slots.push({ key: `side-${i}`, placement: 'side', zone: ZONES.SIDE, tierIndex: i });
    }
  }
  return slots;
}

// ── Tier stacking ───────────────────────────────────────────────────────────────────────────────
// Tiers are a concentric stack, index 0 = bottom, each higher index resting ON the one below. These
// are the SINGLE source for "what sits on this tier" — used by rim-ring room/offset limits AND by
// top-surface finish placement (gold leaf), so the occlusion rule lives in one place, not copied per
// element. Any future decor on a lower tier's top should read occludedTopFrac, not re-derive it.

// The tier resting directly on top of tier `i` (one step up the stack), or null if `i` is the top.
export function tierAbove(tiers, i) {
  return tiers?.[i + 1] ?? null;
}

// Fraction of tier `i`'s top RADIUS hidden under the tier resting on it (0 = nothing above, or the
// upper tier isn't smaller → whole top visible). The VISIBLE top is the ring [occludedTopFrac, 1];
// anything inside it tucks under the upper tier and never shows.
export function occludedTopFrac(tiers, i) {
  const r = tiers?.[i]?.radius ?? 0;
  const up = tierAbove(tiers, i)?.radius ?? 0;
  return (r > 0 && up && up < r) ? up / r : 0;
}

// Wall zones (side + middle tier) seat elements AGAINST a vertical face; every other zone
// (top_surface, rim, board) is a flat-ish surface an element stands ON. The ONE predicate for that
// split (deOverlapSeat has its own inline copy for its coord-system branch); used here to pick the
// upright base pose an `insert` modifier composes with when back-compat has to infer it.
function isWallZone(zone) {
  return zone === ZONES.SIDE || zone === ZONES.MIDDLE_TIER;
}

// ── How far an element may lean ─────────────────────────────────────────────────────────────────
// Two axes, one limit: `tiltAngle` tips an element front/back and `rollAngle` tips it left/right (on
// a wall, that second one spins it in the plane of the wall — a jersey sitting diagonally). ±1.2 rad
// is about 69°; past that an element reads as fallen over rather than leaning, and its base starts to
// lift out of the seat its base-pivot holds it in.
//
// Here rather than beside the toolbar because it is a rule about placement, not about a button: the
// popup control and the chooser's TiltRow both nudge through it, so they cannot drift to different
// limits.
export const LEAN_LIMIT = 1.2;
export function clampLean(value) {
  return Math.max(-LEAN_LIMIT, Math.min(LEAN_LIMIT, +((value ?? 0)).toFixed(3)));
}

// ── Per-zone placement config ─────────────────────────────────────────────────────────────────
// A zone's entry in `placement_config` is EITHER a mode string ("hug") or an object carrying
// per-zone config ({ mode, seat, insert, ... }). `zoneCfg` normalises both so callers never branch
// on the shape; per-zone modifiers (`seat`, and now `insert`) ride on the object alongside `mode`
// and flow through this one seam.
//
// Back-compat: `insert` was once a POSITION (`mode:"insert"`) with its params in a SHARED top-level
// `placement_config.insert`. It is now a MODIFIER on a standing base pose (INSERT is upright, only
// its base is buried). `zoneCfg` promotes the legacy form so every caller sees the canonical
// `{ mode:<upright pose>, insert:{…} }` — no data migration. The pose insert composes with is the
// zone's natural upright base: `stand` on a flat surface, `hug` against a wall (geometry-driven, no
// element-type branch). New data authors `insert` as a per-zone key directly and never trips this.
export function zoneCfg(placementConfig, zone) {
  const v = placementConfig?.[zone];
  const obj = (v && typeof v === 'object') ? { ...v } : { mode: v };
  if (obj.mode === PLACEMENT_MODES.INSERT) {
    obj.mode = isWallZone(zone) ? PLACEMENT_MODES.HUG : PLACEMENT_MODES.STAND;
    if (obj.insert == null) obj.insert = placementConfig?.insert ?? {};
  }
  return obj;
}

// ── One zone, more than one pose ────────────────────────────────────────────────────────────────
// Some elements read equally well in two poses on the SAME surface: a football jersey on the cake
// top can stand up like a topper or lie flat like a decal, and which one is right is the customer's
// taste, not a property of the jersey. A zone used to name exactly one mode, so the element could
// only offer whichever the author happened to pick.
//
// `modes` is the list a zone allows, FIRST ENTRY FIRST — it is the default a drop uses, so a config
// carrying one mode behaves exactly as it did. The legacy `mode` string is the one-entry case, which
// is why nothing has to be migrated: every existing element already answers this correctly.
//
//   "top_surface": "stand"                                  → ['stand']
//   "top_surface": { "mode": "stand" }                       → ['stand']
//   "top_surface": { "modes": ["stand", "hug"] }             → ['stand', 'hug']   (stand is default)
export function zoneModes(placementConfig, zone, fallback) {
  const cfg = zoneCfg(placementConfig, zone);
  const list = Array.isArray(cfg.modes) ? cfg.modes.filter(Boolean) : [];
  if (list.length) return list;
  const single = cfg.mode ?? fallback;
  return single ? [single] : [];
}

// May this zone be posed at all? The toggle and the extra chooser tile both hang off this, so an
// element with one pose grows no controls — the ~50 that exist today are untouched.
export function zoneHasChoice(placementConfig, zone) {
  return zoneModes(placementConfig, zone).length > 1;
}

// The placement MODE (the POSITION) for a zone ("hug" | "stand" | "perch" | "verge"), from string or
// object form. Never returns "insert" — that is a modifier now (see zoneInsert), promoted away by
// zoneCfg. With `modes`, this is the DEFAULT (the first) — what a drop gets before anyone chooses.
export function zoneMode(placementConfig, zone, fallback) {
  return zoneModes(placementConfig, zone, fallback)[0] ?? fallback;
}

// The per-zone INSERT modifier ({ depth, lean_deg, jitter_deg }) or null. Insert sinks an element's
// base INTO the zone surface and leans it — a MODIFIER on the zone's upright base pose, NOT a pose
// itself, so it composes with `stand`/`hug` (whatever `zoneMode` returns). Rides the per-zone object
// like `seat`; zoneCfg promotes the legacy `mode:"insert"` + shared `placement_config.insert` form
// into it, so callers read one shape. Null (absent) → the element seats flush, not buried.
export function zoneInsert(placementConfig, zone) {
  const ins = zoneCfg(placementConfig, zone).insert;
  return (ins && typeof ins === 'object') ? ins : null;
}

// How DEEP an element seats in a zone: 'proud' (a solid body sits ON the surface, back flush against
// it) or 'flush' (a thin decal centred on the surface). Only meaningful for wall-hug; verge/stand/
// perch seat by their own logic and ignore it. An explicit zone-level `seat` wins; otherwise the
// default is config-driven off the existing `scatter` flag — scattered decor nestles FLUSH (small
// pieces read better tucked in), everything else solid seats PROUD (so a 3D piece isn't half-buried).
// No element-type branch.
export function zoneSeat(placementConfig, zone) {
  const explicit = zoneCfg(placementConfig, zone).seat;
  if (explicit === 'proud' || explicit === 'flush') return explicit;
  return placementConfig?.scatter === true ? 'flush' : 'proud';
}

// The config-driven, ZONE-DEPENDENT instance fields — the ONE place both the add path
// (`addSticker`) and the chooser's zone-switch path derive them, so a placed instance and a
// re-seated (moved) instance seat identically (INVARIANTS #1/#3). `placementMode` and the side
// seat DEPTH (`sideProud`) both change when an element moves between zones; reading them here —
// never from the raw `placement_config[zone]` value — keeps the string and `{ mode, seat }` object
// forms interchangeable. (The move path previously set neither, so moving a proud element off the
// wall and back left it flush/buried and could leak the raw object into `placementMode`.)
// `mode` overrides the zone default — the customer picked a pose (a chooser tile, or the card's
// Standing/Lying toggle). It is validated against what the zone actually allows rather than trusted:
// a pose is only meaningful where the config offers it, and a stale value (say a design saved while
// an element allowed two poses, loaded after an admin cut it back to one) must fall back rather than
// render something the element no longer claims to do.
/* The BOARD is stood on. Nothing else is coerced.
 *
 * `hug` seats a model's MIDDLE at its surface, which is right against a wall and wrong on the drum —
 * a football with `board: "hug"` sank halfway into the board. The config says hug because the admin
 * form offers it, not because anything on the board can be hugged.
 *
 * ⚠️ SCOPED TO THE BOARD ON PURPOSE. The first cut of this coerced every non-wall zone and broke a
 * standing test: `top_surface` has a REAL hug — the hero pose that auto-sizes to the tier wall and
 * nudges a hugMul rather than a scale. "Flat" does not imply "cannot hug"; only the board does.
 *
 * ⚠️ And here, in the ONE place both the add and the move path resolve a pose. Coercing at the call
 * sites left the move path writing `hug` straight back, so dragging a decoration onto the board
 * buried it again after the seat had been fixed.
 *
 * A board `hug` may one day mean something real — a decoration standing on the drum and LEANING on
 * the cake wall is a look bakers do. That is a pose to build, not a config to honour literally while
 * it renders as a half-buried ball.
 */
export function flatPose(zone, mode) {
  return (zone === ZONES.BOARD && (mode === 'hug' || !mode)) ? 'stand' : mode;
}

export function zoneSeatFields(placementConfig, zone, mode = null) {
  const allowed = zoneModes(placementConfig, zone, 'hug');
  const picked  = mode && allowed.includes(mode) ? mode : (allowed[0] ?? 'hug');
  return {
    placementMode: flatPose(zone, picked),
    sideProud:     zoneSeat(placementConfig, zone) === 'proud',
  };
}
