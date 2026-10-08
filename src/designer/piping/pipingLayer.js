import { PIPING_FRONT_ANGLE } from '../constants.js';

// Single source of truth for the piping LAYER — the object stored in a tier's topPipings /
// bottomPipings and consumed by TopPipingRing / BottomPipingRing. Both the interactive designer
// (CakeDesigner add-to-cake path) and any external consumer (e.g. the admin inspiration preview)
// build layers through `makePipingLayer`, so the shape + config wiring never drift (INVARIANTS #3).

// Which arrangements an element allows for a zone. Mirrors the allowed_zones array
// convention; absent ⇒ ['ring'] (matches legacy piping that only ever ringed).
/* ── `single` IS RETIRED FROM THE CHOICE, AND STILL RENDERS FOR EVER ─────────────────────────────
 *
 * Sandeep: *"'ill pipe it myself' and 'single' (from ring and single) are nearly same. single option
 * is no more needed since user can do it using hand piping."* Nearly, and the gap is precision
 * rather than freedom: `single` puts pieces on the RING'S OWN TRACK — same radius, same calibrated
 * rotation and offsets the full ring uses — with an angle and a per-piece height each. Hand-piping
 * puts a piece where you tap. The trade is deliberate and is his call; what is NOT negotiable is
 * that four of the catalogue's templates (the Vintage set) are built on `single`.
 *
 * ⚠️ SO THIS HIDES THE OPTION AND NOTHING ELSE. `ringPositions`' single branch, the per-piece angle
 * and `dy`, the Pieces section of the card — all untouched. A design that carries
 * `arrangement: 'single'` keeps rendering and stays editable; it simply cannot be switched BACK to,
 * because the Ring/Single toggle needs two choices to appear and there is now one.
 *
 * ⚠️ AND IT FIXES SHELL FAN BY CONSTRUCTION. That row is the one element whose default arrangement
 * IS single; `pipingDefaultArrangement` picks the admin's preference only when it is still allowed,
 * so filtering here makes a NEW Shell Fan ring come out as a ring. Doing this in the card instead
 * would have left that element placing a single piece with no way to say otherwise.
 *
 * Filtered rather than deleted from the stored arrays: `top_arrangements_allowed` is authored data
 * on ten elements, and rewriting it would edit rows the Vintage templates depend on to save reading
 * one line here. */
const OFFERED_ARRANGEMENTS = ['ring'];

export function pipingAllowedArrangements(pc, isTop) {
  const allowed = isTop ? pc?.top_arrangements_allowed : pc?.bottom_arrangements_allowed;
  const authored = Array.isArray(allowed) && allowed.length ? allowed : ['ring'];
  const offered = authored.filter(a => OFFERED_ARRANGEMENTS.includes(a));
  // Never an empty list: an element authored single-only still has to place something.
  return offered.length ? offered : ['ring'];
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
  // Ring finish: 'cream' recolours the GLB to a single piped-cream material (default, piping); 'element'
  // keeps the GLB's REAL materials so any decoration can ring around the rim/board. A KEY, not a type
  // branch (INVARIANTS #1/#6) — the renderer picks its leaf from this, never from the element's slug.
  const finish = (isTop ? pc.top_ring_finish : pc.bottom_ring_finish) ?? pc.ring_finish ?? 'cream';
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
      // The radial ceiling this element authorised. Shared by both zones: it describes the MESH's
      // room to grow, not a per-surface placement, so there is no top_/bottom_ pair.
      maxDepth:          pc.max_depth          ?? null,
      extraRadialOffset: pc.top_radial_offset  ?? null,
      yOffset:           pc.top_y_offset        ?? null,
      spacing:           pc.top_spacing         ?? null,
      softness:          pc.top_softness        ?? null,
      swagCount:         pc.top_swag_count      ?? null,
      swagDepth:         pc.top_swag_depth      ?? null,
      swagTilt:          pc.top_swag_tilt       ?? null,
      arrangement,
      finish,
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
    /* ⚠️ THE WALL IS NOT THE BOARD, AND IT WAS BORROWING THE BOARD'S ATTITUDE. A piping RING has
       only two zones (rim, board) and a side border is a board ring lifted up the wall — both face
       outward off the wall, so one rotation legitimately serves both. The PEN is a third case: on a
       wall it aligns the piece's up-axis to the SURFACE NORMAL, so "up" points out of the cake,
       which is a different frame from the ring's "upright in world, yawed outward". The same
       numbers mean different things in the two, and `stampRotationSide` was reading the board's.
       Rose Swirl's [-89,-174,-180] happens to satisfy both; a rosette authored [0,0,0] for the
       board renders back-on when hand-piped. Sandeep: *"if i want to hand pipe on side, its not
       same as board. it should be 90 degrees different from board."*
       Absent falls back to the board figure, so every element authored before this renders exactly
       as it did — the fallback lives at the read site, which is the only place that knows the pen
       is asking. */
    sideRotation:      pc.side_rotation        ?? null,
    maxDepth:          pc.max_depth            ?? null,   // see the rim branch
    extraRadialOffset: pc.bottom_radial_offset ?? null,
    yOffset:           pc.bottom_y_offset      ?? null,
    spacing:           pc.bottom_spacing       ?? null,
    softness:          pc.bottom_softness      ?? null,
    swagCount:         pc.bottom_swag_count    ?? null,
    swagDepth:         pc.bottom_swag_depth    ?? null,
    swagTilt:          pc.bottom_swag_tilt     ?? null,
    arrangement,
    /* ⚠️ `finish` WAS MISSING HERE, and the board quietly ignored `bottom_ring_finish` for its whole
       life. The rim branch returned it; this one returned everything else. So a rosette authored
       `ring_finish: "element"` on both zones kept its GLB's own materials on the RIM and fell back
       to the cream path on the BOARD — where the shells are recoloured to `default_color`. Same
       element, same hex, two colours on one cake. Sandeep: *"why was the color also different for
       top?"* — the rim was the one behaving; the board was dropping its config.
       ⚠️ `...drip` too. A drip is rim-only (`const drip` above resolves to `{ drip: false }` here),
       but the spread was omitted, so a board layer carried `drip: undefined` rather than a stated
       false. Falsy either way, which is exactly why it went unnoticed — and why the test below
       compares the two branches' KEY SETS rather than their behaviour. */
    finish,
    ...alt,
    ...bend,
    ...wrap,
    ...drip,
    ...seed,
  };
}

// Build a piping layer for a tier from an element + a resolved GLB. GLB *resolution* stays with the
// caller (the designer resolves multi-part `piping_pattern` blocks via its block map; a simple
// consumer passes el.image_url), but the layer object SHAPE lives here so it's authored once.
// `isTop` → rim (topPipings) vs board (bottomPipings). Callers may layer extras (userRadialOffset,
// yAdjustable…) on top of the returned base.
/* The size a ring STARTS at, off its own row. INVARIANTS line 23: "`placement_config.r` — default
 * scale (never hard-coded; never force a value)."
 *
 * ⚠️ IT LIVES HERE, BESIDE THE LAYER SHAPE, because this module is where a piping layer is authored
 * and three of the four places that seeded `size` were literal 1s elsewhere. One lookup, imported
 * by the card, or the next seed added is a fifth copy.
 *
 * The fallback is 1, not 0.5: that is what a ring with no authored `r` has always rendered at, and
 * changing it would resize every ring on every saved cake. Honouring a number an admin typed is a
 * different decision from redefining what "unset" means.
 */
export function pipingScaleFor(el) {
  return el?.placement_config?.r ?? 1;
}

export function makePipingLayer(el, { isTop, glbUrl, altGlbUrl = null, color, cardId } = {}) {
  return {
    id: el.id,
    cardId: cardId ?? (typeof crypto !== 'undefined' ? crypto.randomUUID() : `${el.id}-${Date.now()}`),
    glbUrl: glbUrl ?? el.image_url ?? null,
    name: el.name,
    color: color ?? el.default_color ?? '#f5e6c8',
    // ⚠️ NOT `1`. This factory is the FOURTH place that seeded a ring's size, and it was the one
    // left behind when the other three were fixed — found by Sandeep asking whether any code drove
    // piping size from config at all. The answer was no: four literals and a dial with no bounds.
    size: pipingScaleFor(el),
    ...pipingPlacementFromConfig(el.placement_config, isTop),
    ...(altGlbUrl ? { altGlbUrl } : {}),
  };
}
