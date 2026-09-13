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

/** Where a docked page stacks, and the rail above it while one is open. */
export const DOCKED_PAGE_Z = 300;
export const RAIL_OVER_PAGE_Z = DOCKED_PAGE_Z + 1;

/**
 * The frame of a screen that REPLACES the workspace beside the rail — a page, not a layer over it.
 *
 * `dockedLeft` alone started the panel at the rail's painted edge, so everything the spatula does
 * not cover — the gap beside its narrow handle, the strip under its cap, the header's bakery name —
 * was the designer showing through. With a slide-in and a shadow on top, the result read as a popup
 * floating over the app, yet it had a Back button and no close: neither a popup nor a page.
 *
 * So on desktop the page spans the whole window — its ground AND its header band run to the
 * viewport's left edge, behind the rail — and each band pads its own CONTENT by `dockedInset`. The
 * host lifts the rail to RAIL_OVER_PAGE_Z and gives the spatula RAIL_LIFTED_SHADOW, so the menu
 * visibly floats ABOVE the window rather than sitting beside a card. No slide-in and no page shadow.
 * On a phone the page is the whole screen already, so it keeps its slide-in as a page transition.
 *
 * Padding the page itself would stop the header band at the rail's edge, which is exactly what made
 * it read as a separate layer — hence the inset per band.
 *
 * Needs a `slideInRight` keyframe in scope on a phone. Style the ground (background) yourself.
 */
export const dockedPage = (isMobile) => ({
  position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
  zIndex: DOCKED_PAGE_Z,
  ...(isMobile ? { animation: 'slideInRight 0.3s cubic-bezier(0.32,0.72,0,1)' } : {}),
});

/** How far a docked page's bands indent their content, to clear the rail floating over them. */
export const dockedInset = (isMobile) => (isMobile ? 0 : RAIL_RIGHT);

/**
 * The spatula's shadow while it floats over a docked page. A `filter` on the SVG alone, never on the
 * rail's column: a filter makes its element the containing block for `position: fixed` descendants,
 * and the rail's submenus are fixed (RailSubmenu's escapeClip) — they would land in the wrong place.
 */
export const RAIL_LIFTED_SHADOW = 'drop-shadow(6px 0 16px rgba(0,0,0,0.28))';

/**
 * Left edge for a flyout that should read as emerging from BEHIND the rail — the submenu that
 * slides out of it, not a panel parked next to it. Deliberately the centre line, so the rail
 * overlaps its square left edge and hides the seam.
 */
export const RAIL_FLYOUT_LEFT = RAIL_CENTRE;
