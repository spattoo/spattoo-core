// ── What the header shows: the mark, the name, or both ───────────────────────────────────────────
//
// A baker's logo and their bakery's name used to be an either/or — a logo replaced the name
// entirely. That is right for a wordmark and wrong for a BADGE, which is what most bakers upload
// and what every logo generator produces: a round mark with the name set inside it, surrounded by
// art. Measured on a real one (Velvet & Vanilla, 640×640): its name block is 43.3% of the badge, so
// at the header's 56px cap the two lines share 24px — about 11px each. No header height fixes that;
// "BAKE HOUSE" is ~6% of the badge, so it would need a 150px logo to read, which is not a header.
//
// Showing both solves it by giving each job to the thing that can do it: the badge is an ICON, read
// by shape and colour and never asked to be legible, and the name is TEXT, crisp at any size on any
// screen. It is also what the no-logo header already did — `desktopLogoText` sets the name in
// Pacifico at 26px — so this makes a branded header at least as good as an unbranded one, which is
// the inversion that started this.
//
// ⚠️ SEEDED HERE, OVERLAID FROM THE DB. Root CLAUDE.md rule 3: a value a baker would tune lives in
// `bakers.storefront_customizations` and is read through one accessor, never branched on per
// surface. Both headers and the settings control read `headerBrandMode`, so they cannot disagree.

export const HEADER_BRAND = Object.freeze({
  BOTH: 'both',   // the mark, then the name beside it
  LOGO: 'logo',   // the mark alone — right when the logo IS a wordmark
  NAME: 'name',   // the name alone, as a baker with no logo already gets
});

/** The default, and it is BOTH on purpose: a header showing only an unreadable badge is worse than
 *  one that repeats the name, and most uploads are badges. A baker whose logo is already a wordmark
 *  turns the name off and loses nothing. */
export const DEFAULT_HEADER_BRAND = HEADER_BRAND.BOTH;

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
  if (!hasLogo) return { logo: false, name: true };
  return {
    logo: mode !== HEADER_BRAND.NAME,
    name: mode !== HEADER_BRAND.LOGO,
  };
}
