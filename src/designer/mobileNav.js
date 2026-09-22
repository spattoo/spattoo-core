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
 * The five rail items that get a permanent slot in the strip. Ids only — the items themselves come
 * from railItems, so capabilities and feature flags still decide what exists at all.
 *
 * NOT the desktop rail's priorities in a smaller box. A phone and a desk are used for different
 * halves of this job: designing a 3D cake is a DESK act — big canvas, precise dragging, time — and
 * the phone is where a baker checks what is due and answers an enquiry. So the strip leans toward
 * running the bakery, and the rest of the design tools stay one tap away rather than zero.
 *
 * ⚠️ TEMPLATES WAS THE NOTABLE OMISSION, AND IS NOT ANY MORE (2026-09-20). The argument for leaving
 * it out was that it is a STARTING move, used once at the top of a design, where Dashboard is a
 * recurring check — and that a slot in a FIVE-wide bar is worth more to the thing you return to.
 * The second half of that is what changed: the bar is six wide now, so the slot costs less than it
 * did. Sandeep asked for it directly, against the apps bakers already use, where browsing designs
 * is a first-class destination rather than something behind a More button.
 *
 * ⚠️ SIX IS THE CEILING, AND IT IS ARITHMETIC RATHER THAN TASTE. This whole bar exists because the
 * old one put every target under the 44px floor (see features/mobile-navigation.md). Full-bleed
 * slots divide the width: at five that is 64px on a 320 phone, 75 at 375, 79 at 393. At six it is
 * 53 / 62 / 65 — still clear. At SEVEN it is 46 / 54 / 56, and 46 is within a rounding error of the
 * floor the redesign was built to escape. Canva runs seven only because its strip SCROLLS
 * sideways — its last item is visibly clipped — and it has no More button to fit. Do not read a
 * seventh slot off a screenshot without also taking the mechanism that pays for it.
 *
 * Uploads stays in the More sheet, deliberately. It was the natural second candidate, but at six
 * something has to give, and Templates is the one a baker reaches for at the start of every cake.
 *
 * ⚠️ Anything carrying a `menu` must be listed here. The strip renders submenus (RailSubmenu,
 * anchored upward); the More sheet has no surface for one, so a menu item in the sheet would open
 * nothing at all. Only Orders carries a menu today and it is primary. `strandedMenus` below exists
 * to make it loud rather than silent if that ever stops being true.
 */
/* ⚠️ THE ORDER IS THE JOB, NOT THE HISTORY (INVARIANTS #12). Sandeep set it directly:
 *
 *     New · Templates · Decor · Orders · Dashboard
 *
 * It reads left to right as the work actually goes: START a cake (New, or from a Template — the two
 * beginnings, now adjacent), DECORATE it, then run the bakery (Orders, Dashboard). Templates arrived
 * last and was simply appended to the end, which put a starting move after two management ones.
 * Dashboard moves to the far end: it is the thing you glance at, not the thing you are doing. */
export const MOBILE_PRIMARY = ['new', 'templates', 'elements', 'orders', 'dashboard'];

/**
 * How many slots the strip has, More included. Six is the ceiling argued above: full-bleed slots
 * divide the width, and at seven the narrowest lands on the 44px floor this bar exists to escape.
 */
export const MOBILE_SLOTS = 6;

/**
 * Divide the rail into the strip and the More sheet.
 *
 * Primary follows MOBILE_PRIMARY's order rather than railItems', because the strip's order is a
 * layout decision (the + reads as first) while the rail's is a grouping one. Items the baker has no
 * capability for are already gone from railItems, so a missing one drops out rather than leaving a
 * hole — `.filter(Boolean)` is doing real work, not defensive padding.
 *
 * Every item lands in exactly one half: the invariant the Uploads bug broke.
 *
 * ⚠️ NO "More" WHEN THERE IS NOTHING WORTH HIDING. Sandeep, on a signed-in customer:
 * "specially on mobile 'More' option is not needed. instead add the uploads button in place of more."
 *
 * He is right, and it is arithmetic rather than a customer special case. A customer's railItems are
 * five — New, Templates, Decorations, Uploads, Share — so More existed to hold TWO items that fit on
 * the bar beside the other three. A tap to reach something that had room to be visible is a tap
 * spent on nothing.
 *
 * So: when everything fits in `slots`, everything goes in the strip and `secondary` comes back
 * empty. The render site needs no change — it already draws More only when `secondary` is non-empty
 * — and a baker's eleven items still overflow exactly as before. `strandedMenus` stays correct too:
 * nothing can be stranded in a sheet that is not drawn.
 *
 * The absorbed items keep MOBILE_PRIMARY's order first, then the rail's own for the remainder, so
 * the strip still reads START → DECORATE → RUN THE BAKERY rather than in capability order.
 */
export function splitMobileNav(railItems = [], { slots = MOBILE_SLOTS } = {}) {
  const primary   = MOBILE_PRIMARY.map(id => railItems.find(i => i.id === id)).filter(Boolean);
  const secondary = railItems.filter(i => !MOBILE_PRIMARY.includes(i.id));
  if (railItems.length <= slots) return { primary: [...primary, ...secondary], secondary: [] };
  return { primary, secondary };
}

/**
 * Ids that carry a submenu but would land in the More sheet, which cannot render one.
 * Empty is the healthy answer. Called in dev so drift surfaces the moment it is introduced, rather
 * than as a baker reporting that a button does nothing.
 */
export function strandedMenus(railItems = []) {
  return splitMobileNav(railItems).secondary.filter(i => i.menu).map(i => i.id);
}
