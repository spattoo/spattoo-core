// ── The rail's footprint ────────────────────────────────────────────────────────────────────────
// Where the rail actually ends, for everything that has to sit beside it.
//
// ⚠️ IT USED TO BE WIDER THAN ITS OWN COLUMN, and this file exists because of that. The rail was
// drawn as a silicone spatula: a 158px SVG behind a 64px column, with the blade bulging 61px either
// side of centre, so the painted edge was 133px — nowhere near the box's 104.
//
// Eight docked panels (Orders, Customers, Settings, Billing, Templates, Flavours, Invites,
// Dashboard) each hardcoded `left: 76`, correct back when leftCol's padding was 12. The padding
// became 40 and the silhouette grew, so 76 turned into a point 53% of the way ACROSS the rail —
// measured, not estimated — and every one of those panels opened over the middle of the blade,
// hiding half the nav a baker uses to get back out of them.
//
// ⚠️ THE SHAPE LEFT AND CAME BACK ON THE SAME DAY (2026-10-04), which is the best argument for this
// file existing. It became a straight strip for half a morning — every number here collapsed to the
// column's own edge — and then Sandeep looked at it: "i feel like spatula was better looking." The
// blade is back, so RAIL_RIGHT is the blade's reach again. Nothing outside this file moved in either
// direction, because nothing outside this file knows the number.

export const RAIL = {
  /* ⚠️ NOT A MARGIN — CLEARANCE. The blade bulges 61px either side of the column's centre (cx=72),
     so the silhouette reaches back to x=11; this is room for paint that extends left of its own
     box. It went to 0 for the strip, which had nothing to clear, and came straight back with the
     shape. Anyone reading it as whitespace and deleting it will clip the blade's left edge. */
  padLeft:    40,   // leftCol's left padding — clearance for the blade's reach past the column
  width:      64,   // the nav column itself
  svgW:      158,   // SpatulaFrame's viewBox width — wider than the column, on purpose
  bladeHalf:  61,   // the silhouette's widest point, either side of centre
};

/** Centre line of the rail, in viewport px. */
export const RAIL_CENTRE = RAIL.padLeft + RAIL.width / 2;

/**
 * Where the painted silhouette actually ends (133px). Verified against the real path's
 * getBoundingClientRect, not derived on paper — the blade's outermost control point is
 * `cx + bladeHalf`, and the SVG is centred on the column rather than aligned to it.
 *
 * ⚠️ NOT WHERE THE COLUMN ENDS (104). Anything docking BESIDE the rail wants this; anything sitting
 * at header height wants the column, because up there the shape is only the handle. The desktop
 * logo got that wrong in both directions on 2026-10-04 and now derives from the column.
 */
export const RAIL_RIGHT = RAIL_CENTRE + RAIL.bladeHalf;

/**
 * Left edge for a panel that docks BESIDE the rail, clearing it completely so the nav stays
 * visible and clickable while the panel is open. Full-bleed on mobile, where there is no rail to
 * clear and the panel is the whole screen.
 */
export const dockedLeft = (isMobile) => (isMobile ? 0 : RAIL_RIGHT);

/**
 * Where docked pages stack. A page that opens OVER another docked page (Billing, from a premium
 * theme inside Store Settings) sits one step up; the rail sits above both while any is open, and
 * below the app-wide overlays at 320.
 */
export const DOCKED_PAGE_Z         = 300;
export const DOCKED_PAGE_STACKED_Z = 310;
export const RAIL_OVER_PAGE_Z      = 315;

/**
 * The frame of a screen that REPLACES the workspace beside the rail — a page, not a layer over it.
 *
 * `dockedLeft` alone started the panel at the rail's painted edge, so everything the spatula does
 * not cover — the gap beside its narrow handle, the strip under its cap, the header's bakery name —
 * was the designer showing through. With a slide-in and a shadow on top, it read as a popup floating
 * over the app, yet it had a Back button and no close: neither a popup nor a page.
 *
 * So on desktop the page spans the whole window. Its ground runs to the viewport's left edge and
 * its content is padded clear of the rail; its top bar reaches back under the rail with
 * `dockedBleed`. The host lifts the rail to RAIL_OVER_PAGE_Z and gives the spatula
 * RAIL_LIFTED_SHADOW, so the menu visibly floats ABOVE the window rather than sitting beside a card.
 * No slide-in and no page shadow. On a phone the page is the whole screen already, so it keeps its
 * slide-in as a page transition.
 *
 * Needs a `slideInRight` keyframe in scope on a phone. Style the ground (background) yourself.
 */
export const dockedPage = (isMobile, { stacked = false } = {}) => ({
  position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
  zIndex: stacked ? DOCKED_PAGE_STACKED_Z : DOCKED_PAGE_Z,
  ...(isMobile
    ? { animation: 'slideInRight 0.3s cubic-bezier(0.32,0.72,0,1)' }
    : { paddingLeft: RAIL_RIGHT }),
});

/**
 * For a docked page's TOP BAR only: reach back under the rail, so the band spans the whole window,
 * while keeping its content where it was. `pad` is the bar's own left padding. Spread it AFTER any
 * `padding` shorthand. Only the top bar needs it: the page's ground already fills the padding
 * behind every other band, and a header that stopped at the rail's edge is what made the rail read
 * as sitting beside a separate card.
 */
export const dockedBleed = (isMobile, pad) =>
  (isMobile ? {} : { marginLeft: -RAIL_RIGHT, paddingLeft: pad + RAIL_RIGHT });

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
