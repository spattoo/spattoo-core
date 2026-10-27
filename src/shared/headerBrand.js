// ── What the header shows: the mark, the name, or both ───────────────────────────────────────────
//
// A baker's logo and their bakery's name used to be an either/or — a logo replaced the name
// entirely. That is right for a wordmark and wrong for a BADGE, which is what most bakers upload
// and what every logo generator produces: a round mark with the name set inside it, surrounded by
// art. Measured on a real one (Velvet & Vanilla, 640×640): its name block is 43.3% of the badge, so
// at the header's 56px cap the two lines share 24px — about 11px each. No header height fixes that;
// "BAKE HOUSE" is ~6% of the badge, so it would need a 150px logo to read, which is not a header.
//
// Showing both CAN solve it — the badge becomes an ICON, read by shape and colour and never asked
// to be legible, while the name is TEXT, crisp at any size. But on a wordmark logo it prints the
// bakery's name twice, 40px apart, which reads as a fault rather than as branding. So all three
// modes exist and the DEFAULT is the one that is right for this surface; see below.
//
// ⚠️ SEEDED HERE, OVERLAID FROM THE DB. Root CLAUDE.md rule 3: a value a baker would tune lives in
// `bakers.storefront_customizations` and is read through one accessor, never branched on per
// surface. Both headers and the settings control read `headerBrandMode`, so they cannot disagree.

export const HEADER_BRAND = Object.freeze({
  BOTH: 'both',   // the mark, then the name beside it
  LOGO: 'logo',   // the mark alone — right when the logo IS a wordmark
  NAME: 'name',   // the name alone, as a baker with no logo already gets
});

/** The default, and it is the NAME — which is a statement about what this surface is for, not about
 *  what shape a logo happens to be.
 *
 *  ⚠️ THE LOGO'S HOME IS THE STOREFRONT. Sandeep: *"use logo for storefront and name for studio"*.
 *  A storefront sells to a customer who does not know the bakery, has room to show a mark properly,
 *  and already says so itself — CustomerStorefront's header is logo-wins, and its own note reads
 *  "An uploaded logo always wins: that is the baker's mark, not our typography." The studio is a
 *  WORKBENCH, used by someone who knows perfectly well whose it is, with a 52px bar on a phone.
 *
 *  It also settles both failures at once, which an aspect-ratio rule would only have papered over:
 *  a BADGE (Velvet & Vanilla) was unreadable at any header size, and a WORDMARK (Feelings &
 *  Flavours) printed the bakery's name twice, 40px apart. Neither happens when the studio sets the
 *  name in type and the storefront carries the mark.
 *
 *  A baker who wants their logo on their own workbench turns it on and loses nothing — which is the
 *  preset rule: a starting point they can leave, never a locked axis. */
export const DEFAULT_HEADER_BRAND = HEADER_BRAND.NAME;

const VALUES = new Set(Object.values(HEADER_BRAND));

/** Read the mode off a baker profile. Unknown or absent → the default, so a row written by an older
 *  client, or none at all, renders the same as a new one. */
export function headerBrandMode(baker) {
  const v = baker?.storefront_customizations?.header_brand;
  return VALUES.has(v) ? v : DEFAULT_HEADER_BRAND;
}

/** Does the header draw the mark / the name, given a mode and whether a logo exists?
 *  ⚠️ A baker with NO logo always gets their name, whatever the stored mode says — otherwise
 *  choosing "Logo only" and then removing the logo leaves a header with nothing in it at all. */
export function headerBrandParts(baker, hasLogo) {
  const mode = headerBrandMode(baker);
  // ⚠️ No logo always shows the name, whatever is stored — otherwise choosing "Logo only" and then
  // removing the logo leaves a header with nothing in it at all.
  if (!hasLogo) return { logo: false, name: true };
  return {
    logo: mode !== HEADER_BRAND.NAME,
    name: mode !== HEADER_BRAND.LOGO,
  };
}

/* ── How big the name is set, given the room it has ──────────────────────────────────────────────
 *
 * Sandeep: *"why should we truncate. its the baker's identity."* — and he is right, so nothing here
 * clips. The name is always whole; when the room runs short the TYPE gives way instead.
 *
 * ⚠️ IT STEPS DOWN BY AVAILABLE WIDTH, NOT BY CHARACTER COUNT. The same 27-character name has a
 * thousand pixels at a full window and about four hundred at the 641px edge of the desktop layout —
 * so a table keyed on length alone would either shrink names that fit or overflow ones that do not.
 * Both numbers are known without measuring anything, which is the point: no canvas, no
 * ResizeObserver, no measure-then-render loop.
 *
 * ⚠️ AND MEASURING WOULD BE WRONG HERE ANYWAY, not merely heavier. The script face is deliberately
 * not preloaded (see desktopLogoText), so a fit computed on mount measures the QUICKSAND FALLBACK,
 * settles on a size, and then the real face swaps in wider and overflows. A width-derived estimate
 * has no such failure mode: it does not care what has loaded.
 *
 * ⚠️ `PER_CHAR_EM` IS DELIBERATELY PESSIMISTIC. Measured on the longest real bakery name in the
 * table — "Velvet & Vanilla Bake House", 27 characters, 253px at 20px in Shantell Sans — which is
 * 0.47em per character. This uses 0.55: faces differ (Pacifico is wider than Cormorant), and the
 * two outcomes are not symmetric. Under-shrinking by a point is invisible; overflowing is the bug
 * this function exists to prevent.
 */
const PER_CHAR_EM = 0.55;

/** The desktop header's resting size, and the floor below which it will not go. */
export const BRAND_NAME_MAX = 26;
export const BRAND_NAME_MIN = 15;

export function brandNameFontSize(name, availablePx) {
  const chars = String(name ?? '').trim().length;
  if (!chars || !Number.isFinite(availablePx) || availablePx <= 0) return BRAND_NAME_MAX;
  const fits = availablePx / (chars * PER_CHAR_EM);
  /* Whole pixels: a fractional size makes a script face render slightly differently at every window
     width, which reads as the name shivering while you drag the window. */
  return Math.max(BRAND_NAME_MIN, Math.min(BRAND_NAME_MAX, Math.floor(fits)));
}
