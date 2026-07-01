// Shared storefront kit — colour utilities, fonts and default copy used by the storefront.

// Accept both '#hex' and 'rgb(r, g, b)' so the utilities chain safely
// (e.g. lighten(darken(primary, .8), .05) — darken returns an rgb() string).
export function parse(input) {
  if (typeof input === 'string' && input.startsWith('rgb')) {
    const m = input.match(/\d+/g) || [];
    return [+m[0] || 0, +m[1] || 0, +m[2] || 0];
  }
  const c = (input || '#000000').replace('#', '');
  const n = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
const toCss = (r, g, b) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
export function mix(hex, target, t) {
  const a = parse(hex), b = parse(target);
  return toCss(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}
export const lighten = (hex, t) => mix(hex, '#ffffff', t);
export const darken  = (hex, t) => mix(hex, '#000000', t);
export function alpha(hex, a) { const [r, g, b] = parse(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; }
export function lum(hex) { const [r, g, b] = parse(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }
export const onColor = hex => (lum(hex) > 0.6 ? '#241a1d' : '#ffffff');

// ── Storefront palette ──────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for every brand-derived colour on the storefront. Colour work is highly
// iterative, so ALL the tunable numbers live here — change one and the whole page follows; no
// scattered lighten()/darken() magic numbers in styles(). Every value derives from the baker's
// `primary` (deep maroon) + `accent` (rose), so the palette holds for ANY baker's brand colours.
//
// Model = TONE-ON-TONE: band backgrounds are tints of `accent`; text/actions use `primary`.
// To retune the look, edit the amounts below. To switch models later (e.g. accent-band), this is
// the only function to change.
export function buildPalette(primary, accent, tk = {}) {
  return {
    // Backgrounds (light → strong)
    // bandStrong darkened just enough that the WHITE headline clears the ~3:1 large-text contrast
    // bar (lighten(accent,0.28) ≈ #D8ACB2 gave only ~2:1). 0.04 is about the LIGHTEST it can go with
    // white text; any lighter → switch the headline to dark text. Deepen the amount for a richer band.
    bandStrong: darken(accent, 0.04),    // hero + header — the rose band
    bandSoftA:  lighten(accent, 0.66),   // section band A (Our story)
    bandSoftB:  lighten(accent, 0.54),   // section band B (Reviews)
    // Lines
    hairline:   lighten(accent, 0.72),   // card / divider borders (rose-tinted, replaces neutral)
    // Hero 3D cake (HeroCake3D) — the featured cake colour + its studio grid + drip
    cake:        '#E6D3AC',              // ivory (deliberately neutral so it pops on the rose band)
    drip:        darken(accent, 0.06),   // buttercream drip over the rim — blush (switch to gold/white here)
    grid:        '#ffffff',
    gridOpacity: 0.5,
    // Text / actions
    onBand:   '#ffffff',                 // headline + text sitting ON bandStrong
    cta:      primary,                   // primary button
    ctaHover: darken(primary, 0.08),     // (reserved) button hover
    onCta:    onColor(primary),          // label colour on the CTA
    eyebrow:  primary,                   // section eyebrows
  };
}

export const FONT  = "'Quicksand', sans-serif";              // soft sans for body / UI
export const SERIF = "'Cormorant Garamond', Georgia, serif"; // elegant serif for headings

// Baker-editable storefront text (bakers.storefront_customizations); empty/missing → these.
export const STOREFRONT_TEXT = {
  hero_tagline:      'You design, we bake it',
  hero_subtitle:     'Custom cakes for birthdays, weddings and every sweet occasion — designed by you, baked fresh to order.',
  creations_heading: 'Our creations',
  story_heading:     'Our story',
  reviews_heading:   'Loved by our customers',
};
// Pick an override only when it's a non-empty string, else the default.
export const storefrontText = (custom, key) => (custom?.[key]?.trim?.() || STOREFRONT_TEXT[key]);

export function buildContent(baker) {
  return {
    steps: [
      { n: '01', title: 'Design it in 3D', body: 'Start from a template or a blank cake — add tiers, colours, toppers and a message, live in 3D.' },
      { n: '02', title: 'Send your order', body: `Happy with it? Share your design with ${baker.name}, with your date and any details.` },
      { n: '03', title: 'Pickup or delivery', body: `${baker.name} bakes it to match your design, ready exactly when you need it.` },
    ],
    testimonials: [
      { quote: "The 3D designer let me get exactly the cake I pictured for my daughter's birthday — and it looked even better in person!", author: 'Priya S.', occasion: 'Birthday' },
      { quote: 'Seeing the cake in 3D before ordering gave me total confidence. Beautiful work and absolutely delicious.', author: 'Rahul M.', occasion: 'Anniversary' },
      { quote: 'From design to delivery the whole thing was seamless — so responsive, and the cake was stunning. Highly recommend!', author: 'Aisha K.', occasion: 'Wedding' },
    ],
  };
}
