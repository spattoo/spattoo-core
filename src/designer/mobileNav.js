// ── What the phone's bottom strip carries, and what goes one tap behind it ──────────────────────
//
// Split out of CakeDesigner so it can be TESTED. The bug this guards against has already happened
// once: the phone bar and the desktop rail each kept their own copy of the item list, they drifted,
// and Uploads existed on the rail and nowhere on the phone — a baker had no way into their own
// images at all. Nothing caught it, because a nav item that is simply absent looks like a nav item
// that was never meant to be there.
//
// So the two surfaces share one list, and this decides only WHERE each item goes.

/**
 * The four rail items that get a permanent slot in the strip. Ids only — the items themselves come
 * from railItems, so capabilities and feature flags still decide what exists at all.
 *
 * NOT the desktop rail's priorities in a smaller box. A phone and a desk are used for different
 * halves of this job: designing a 3D cake is a DESK act — big canvas, precise dragging, time — and
 * the phone is where a baker checks what is due and answers an enquiry. So the strip leans toward
 * running the bakery, and the design tools stay one tap away rather than zero.
 *
 * Templates is the notable omission. It is a STARTING move, used once at the top of a design, where
 * Dashboard is a recurring check — and a slot in a five-wide bar is worth more to the thing you
 * return to than the thing you begin with.
 *
 * ⚠️ Anything carrying a `menu` must be listed here. The strip renders submenus (RailSubmenu,
 * anchored upward); the More sheet has no surface for one, so a menu item in the sheet would open
 * nothing at all. Only Orders carries a menu today and it is primary. `strandedMenus` below exists
 * to make it loud rather than silent if that ever stops being true.
 */
export const MOBILE_PRIMARY = ['new', 'dashboard', 'elements', 'orders'];

/**
 * Divide the rail into the strip and the More sheet.
 *
 * Primary follows MOBILE_PRIMARY's order rather than railItems', because the strip's order is a
 * layout decision (the + reads as first) while the rail's is a grouping one. Items the baker has no
 * capability for are already gone from railItems, so a missing one drops out rather than leaving a
 * hole — `.filter(Boolean)` is doing real work, not defensive padding.
 *
 * Every item lands in exactly one half: the invariant the Uploads bug broke.
 */
export function splitMobileNav(railItems = []) {
  return {
    primary:   MOBILE_PRIMARY.map(id => railItems.find(i => i.id === id)).filter(Boolean),
    secondary: railItems.filter(i => !MOBILE_PRIMARY.includes(i.id)),
  };
}

/**
 * Ids that carry a submenu but would land in the More sheet, which cannot render one.
 * Empty is the healthy answer. Called in dev so drift surfaces the moment it is introduced, rather
 * than as a baker reporting that a button does nothing.
 */
export function strandedMenus(railItems = []) {
  return splitMobileNav(railItems).secondary.filter(i => i.menu).map(i => i.id);
}
