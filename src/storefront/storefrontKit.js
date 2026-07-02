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
export function buildPalette(primary, accent, tk = {}, opts = {}) {
  // Bands derive from PRIMARY (the dominant brand colour) — the hero/header band is the primary,
  // NOT the accent. Accent is the secondary POP (the drip). bandStrong darkened slightly so on-band
  // text has contrast; onBand is ADAPTIVE (onColor) so it reads on a dark OR light primary.
  const bandStrong = darken(primary, 0.04);   // hero + header — the primary band
  // Baker lever (storefront_customizations.cta_color): ONE "text" colour for the hero HEADLINE +
  // SUBTITLE + BUTTON LABELS. Unset → adaptive (white on dark band, dark on light). The BUTTON
  // BACKGROUND is always the BAND colour, so the band and the buttons match.
  const heroText = opts.ctaColor || onColor(bandStrong);
  // Gradient-hero (aurora) surfaces — DERIVED from the pickers so moving a picker moves the whole
  // hero. heroTop = the light top tone (also the flush page/header surface); heroGradient = a soft
  // top→deeper warm wash; heroInk = the headline/subtitle colour (cta_color picker, else dark on the
  // light gradient). Only meaningful when the template opts into the gradient treatment.
  const heroTop = lighten(accent, 0.82);
  return {
    // Backgrounds (light → strong)
    bandStrong,
    bandSoftA:  lighten(primary, 0.66),  // section band A (Our story)
    bandSoftB:  lighten(primary, 0.54),  // section band B (Reviews)
    // Lines
    hairline:   lighten(primary, 0.72),  // card / divider borders (tinted, replaces neutral)
    // Hero 3D cake (HeroCake3D) — the featured cake colour + its studio grid + drip. tk.cake='brand'
    // → the cake takes the PRIMARY colour (follows the picker); a hex → that fixed colour; default ivory.
    cake:        tk.cake === 'brand' ? primary : (tk.cake ?? '#E6D3AC'),
    drip:        darken(accent, 0.06),   // buttercream drip over the rim — the ACCENT pop
    grid:        '#ffffff',
    gridOpacity: 0.5,
    // Gradient-hero derived surfaces (see above) — all move with the pickers.
    heroTop,
    heroGradient: tk.heroTreatment === 'gradient' ? `linear-gradient(120deg, ${heroTop} 0%, ${lighten(accent, 0.55)} 100%)` : null,
    heroInk:      opts.ctaColor || onColor(heroTop),
    // Text / actions
    onBand:   onColor(bandStrong),       // header/nav ON the band — white on dark, dark on light
    heroText,                            // hero headline + subtitle + button labels (via cta_color)
    cta:      bandStrong,                // buttons use the BAND colour (band & button match)
    ctaHover: darken(bandStrong, 0.08),  // button hover
    onCta:    heroText,                  // button label = the chosen text colour
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
  highlight_heading: 'This week',
};

// ── Font themes ─────────────────────────────────────────────────────────────────
// A "font theme" swaps the storefront's typography as a set (baker lever, saved as
// storefront_customizations.font_key). Reuses fonts already loaded by the app (Montserrat,
// Pacifico, Quicksand, Cormorant) — ADD a new theme only after loading its fonts in the host apps.
export const FONT_THEMES = {
  montserrat: { key: 'montserrat', label: 'Modern',       brandFont: "'Pacifico', cursive", serif: "'Montserrat', system-ui, sans-serif",      font: "'Montserrat', system-ui, sans-serif" },
  cormorant:  { key: 'cormorant',  label: 'Classic serif', brandFont: "'Pacifico', cursive", serif: "'Cormorant Garamond', Georgia, serif",     font: "'Montserrat', system-ui, sans-serif" },
  quicksand:  { key: 'quicksand',  label: 'Soft & round',  brandFont: "'Pacifico', cursive", serif: "'Quicksand', system-ui, sans-serif",       font: "'Quicksand', system-ui, sans-serif" },
};
// Overlay a chosen font theme onto template tokens (returns tokens unchanged if none/unknown).
export function applyFontTheme(tokens, fontKey) {
  const ft = fontKey && FONT_THEMES[fontKey];
  return ft ? { ...tokens, font: ft.font, serif: ft.serif, brandFont: ft.brandFont } : tokens;
}

// ── Sections ────────────────────────────────────────────────────────────────────
// The storefront body is an ORDERED, TOGGLEABLE list of sections (baker lever, saved as
// storefront_customizations.sections). Hero + footer are always present and not in this list.
// Absence → DEFAULT_SECTIONS, so already-published bakers render exactly as before (back-compat).
// A section object is { type, enabled, ...content } — content lives inline so a type can repeat.
export const SECTION_TYPES = ['gallery', 'highlight', 'story', 'reviews'];
// Singleton sections present by default. `highlight` is REPEATABLE and add-only (bakers add one or
// more via the customiser), so it's not in the defaults — a fresh storefront has no highlight.
export const DEFAULT_SECTIONS = [
  { type: 'gallery', enabled: true },
  { type: 'story',   enabled: true },
  { type: 'reviews', enabled: true },
];
// A new (blank, enabled) section of the given type — used by the customiser's "Add section".
export function newSection(type = 'highlight') {
  return { type, enabled: true, title: '', blurb: '', image: '' };
}
// Resolve the baker's saved sections into a clean ordered list. Keeps only known types, and
// appends any DEFAULT type the baker's list is missing (so new section types light up for
// existing bakers rather than silently never appearing).
export function resolveSections(customizations) {
  const saved = Array.isArray(customizations?.sections) ? customizations.sections : null;
  if (!saved) return DEFAULT_SECTIONS.map(s => ({ ...s }));
  const known = saved.filter(s => s && SECTION_TYPES.includes(s.type));
  const seen = new Set(known.map(s => s.type));
  for (const d of DEFAULT_SECTIONS) if (!seen.has(d.type)) known.push({ ...d });
  return known.map(s => ({ ...s }));
}
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
