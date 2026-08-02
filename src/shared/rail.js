// ── The rail's footprint ────────────────────────────────────────────────────────────────────────
// Where the spatula rail actually ends, for everything that has to sit beside it.
//
// This is not the same as where the nav COLUMN ends, and that is the whole problem it solves. The
// column is 64px wide, but the spatula drawn behind it is 158 and deliberately overflows on both
// sides — the blade bulges past the handle, which is the point of the shape. So the rail's visible
// right edge is nowhere near its box's.
//
// Eight docked panels (Orders, Customers, Settings, Billing, Templates, Flavours, Invites,
// Dashboard) each hardcoded `left: 76`. That was correct once: leftCol's padding used to be 12, and
// 12 + 64 = 76 landed exactly on the column's edge. The padding is 40 now and the silhouette is
// wider, so 76 stopped being the edge and became a point 53% of the way ACROSS the rail — measured,
// not estimated. Every one of those panels opened over the middle of the blade, hiding half the nav
// a baker uses to get back out of them.
//
// One derivation, so that moving or resizing the rail moves everything that docks beside it instead
// of leaving eight copies of a number that used to be true.

export const RAIL = {
  padLeft:    40,   // leftCol's left padding
  width:      64,   // the nav column itself
  svgW:      158,   // SpatulaFrame's viewBox width — wider than the column, on purpose
  bladeHalf:  61,   // the silhouette's widest point, either side of centre
};

/** Centre line of the rail, in viewport px. The silhouette is centred on the column. */
export const RAIL_CENTRE = RAIL.padLeft + RAIL.width / 2;

/**
 * Where the painted silhouette actually ends (133px). Verified against the real path's
 * getBoundingClientRect, not derived on paper — the blade's outermost control point is
 * `cx + bladeHalf`, and the SVG is centred on the column rather than aligned to it.
 */
export const RAIL_RIGHT = RAIL_CENTRE + RAIL.bladeHalf;

/**
 * Left edge for a panel that docks BESIDE the rail, clearing it completely so the nav stays
 * visible and clickable while the panel is open. Full-bleed on mobile, where there is no rail to
 * clear and the panel is the whole screen.
 */
export const dockedLeft = (isMobile) => (isMobile ? 0 : RAIL_RIGHT);

/**
 * Left edge for a flyout that should read as emerging from BEHIND the rail — the submenu that
 * slides out of it, not a panel parked next to it. Deliberately the centre line, so the rail
 * overlaps its square left edge and hides the seam.
 */
export const RAIL_FLYOUT_LEFT = RAIL_CENTRE;
