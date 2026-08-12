// Standard ("Honeybear-style") typography — one clean geometric sans for headings + body.
const SANS = "'Montserrat', system-ui, -apple-system, sans-serif";

// ── Storefront template registry ────────────────────────────────────────────────────────────────
// A template is DATA over the ONE shared renderer (CustomerStorefront) + the ONE shared customiser
// (ThemePreview). Adding a template is a config object here — never a forked layout or a per-theme
// branch. See docs/TEMPLATE_CONFIG.md for the full shape. Each template is:
//
//   {
//     key, label,
//     tokens:   <renderer config> — typography, neutral inks, surface colour, spacing, the HERO
//               (`hero.type` selects a HERO_RENDERERS entry + its layout knobs), and palette hints
//               (`cake`, `pageBgMode`, header colours). Passed to buildPalette() + styles().
//     defaults: { primary, accent, ctaColor } — the designed starting palette the CUSTOMISER seeds
//               into the pickers when the template is selected. The storefront always RENDERS from
//               the pickers (colours derive from them in buildPalette), so every colour stays editable.
//     controls: [...] — which customiser controls to show, in order (→ DEFAULT_CONTROLS if omitted).
//   }
//
// spotlight (labelled "Standard") reproduces the original look; its key is unchanged so existing
// bakers need no data migration.

const SPOTLIGHT_TOKENS = {
  font:         SANS,                                  // body
  serif:        SANS,                                  // headings (clean sans)
  brandFont:    "'Pacifico', cursive",                 // the bakery name — thick, curvy script
  pageBg:       '#FFFFFF',
  heading:      '#241A1E',
  text:         '#3A2E32',
  muted:        '#8B7B80',
  cardBorder:   '#ECE5DE',
  shadow:       '0 12px 30px rgba(60,40,45,0.08)',
  contentWidth: 600,
  // The dark hero/footer "ink" is mixed FROM the baker's primary; inkMix retunes that mix as data.
  inkMix:       { with: '#3a363a', amount: 0.74 },
  // HERO: the signature centred cake on a brand-tinted band with a wavy bottom (split on wide).
  hero:         { type: 'centered-cake' },
};

const AURORA_TOKENS = {
  font:         SANS,                                  // body — modern geometric sans
  serif:        SANS,                                  // headings also sans (heavy weight set in styles)
  brandFont:    SANS,                                  // modern wordmark (not the script) to match the gradient
  // Top-flush header: no white bar — the header + util strip are transparent so the cream/gradient
  // shows from pixel 0. (spotlight leaves these unset → its opaque light header.)
  headerBg:         'transparent',
  headerBorderColor:'transparent',
  utilbarBg:        'transparent',
  heading:      '#3A281C',                             // body-section neutrals (below the hero)
  text:         '#5A4636',
  muted:        '#9C8A79',
  cardBorder:   '#EFE4D6',
  shadow:       '0 14px 34px rgba(80,50,30,0.10)',
  contentWidth: 600,
  inkMix:       { with: '#2C1D13', amount: 0.70 },     // warm dark ink for footer/sections
  // HERO: `type` selects the renderer from HERO_RENDERERS. The remaining keys are LAYOUT knobs for
  // this hero, per breakpoint as [mobile, tablet, desktop]: they keep the message clear of the cake —
  // textWidth = the headline/CTA column; subMaxWidth caps the subtitle LEFT of the cake; cakeWidth +
  // cakeRight size and bleed the cake off the right; minHeight = hero height. Retune = data change.
  hero: {
    type:        'gradient-cake',
    textWidth:   ['66%', '56%', '54%'],
    subMaxWidth: [230, 300, 320],
    cakeWidth:   [360, 520, 620],
    cakeRight:   [-90, -120, -140],
    minHeight:   [440, 460, 540],
  },
  // Palette hints for the gradient hero — DERIVED from the pickers in buildPalette (moving a picker
  // moves the design): cake:'brand' → the 3D cake takes the primary colour; pageBgMode:'heroTop' →
  // the page/top surface = the gradient's derived light top tone.
  cake:        'brand',
  pageBgMode:  'heroTop',
};

// Which customiser controls a template exposes, in order. The customiser (ThemePreview) renders the
// left panel from this list; omit it → DEFAULT_CONTROLS (all). This is how a template hides
// irrelevant knobs (e.g. a photo-hero template would swap in a hero-photo uploader).
// ── Patisserie — the premium, hand-drawn theme ──────────────────────────────────────────────────
// Ink linework and soft watercolour washes on warm paper, instead of the flat colour every other
// theme uses. That medium IS the product here: a baker paying for the premium theme is buying the
// look of a hand-painted patisserie, and the storefront is the one page their customers judge them
// on before tasting anything.
//
// ⚠️ EVERY MARK IS OURS, DRAWN IN CODE. The brief arrived as a photograph of another bakery's brand
// illustration. Nothing from it is traced, embedded or redrawn — that artwork and its hand-lettered
// wordmark are a real company's identity, and imitating them closely enough to be recognised is
// passing off, not inspiration. What is taken is the STYLE LANGUAGE, which nobody owns: ink line +
// watercolour wash, blush/duck-egg/cherry, scalloped and doily edges, an arched shop window, and
// composition that leaves a lot of paper showing. Restraint is what reads as premium; density does
// not. The facade is SVG we author (heroes/Shopfront.jsx), so there is no image asset at all.
const PATISSERIE_TOKENS = {
  // Body. NOT the shared SANS: Montserrat is a geometric sans with even stroke weight, and beside
  // ink linework and a copperplate wordmark it was the one element still reading as a web app. Lora
  // has brush-drawn roots and real thick/thin, so the words match the drawing.
  font:      "'Lora', Georgia, serif",
  serif:     "'Cormorant Garamond', Georgia, serif",        // headings — high-contrast, unhurried
  // The wordmark. Pacifico (thick, rounded, one stroke width) is the wrong instrument for an
  // ink-line theme; Parisienne is a fine copperplate with real thick/thin. Registered in
  // spattoo-web's next/font — see shared/fonts.js for why a LIBRARY only names its fonts.
  brandFont: "'Parisienne', 'Cormorant Garamond', cursive",
  // The DRAWN face, for the primary button and the section eyebrows — the two places the page
  // speaks in its own voice rather than the baker's. Cormorant on the button was refined and
  // formal: it said "menu", not "hand-drawn", which is the one note this theme cannot afford to
  // miss on the thing a customer actually clicks. Marker contours on a SANS skeleton, so it reads
  // instantly at button size; a true handwriting face (Caveat) was tried and loses too much
  // legibility at 15px on a phone.
  handFont:  "'Shantell Sans', 'Trebuchet MS', cursive",
  // Warm paper, never #FFF: pure white makes a watercolour wash look like a sticker on a screen.
  pageBg:     '#FFFCF8',
  heading:    '#2E3A46',      // ink — a blue-black, the colour a dip pen actually leaves
  text:       '#4A5561',
  muted:      '#93A0AC',
  cardBorder: '#E7DFD8',
  // A wash, not a drop shadow: wide, faint and slightly warm, so cards sit ON paper rather than
  // float above a UI.
  shadow:     '0 14px 34px rgba(70,60,66,0.07)',
  contentWidth: 600,
  inkMix:     { with: '#2E3A46', amount: 0.72 },
  hero:       { type: 'shopfront' },
  // Bands end in scallops rather than the product's signature wave — the same edge as the awning
  // and the doily, so the motif carries down the page instead of stopping at the hero.
  edges:      'scallop',
  // The type is part of the drawing, not a preference: the copperplate wordmark and the brush-rooted
  // body are half of why this reads as hand-made. The font picker would swap all three for
  // Pacifico + a geometric sans and leave a premium theme looking like the standard one wearing a
  // shopfront. See `ownsType` in CustomerStorefront.
  ownsType:   true,
  // The 3D cake takes the baker's own primary — it is their cake in their shop window, which is the
  // entire point of the hero.
  cake:       'brand',
};

// ── Atelier — the severe one ────────────────────────────────────────────────────────────────────
// Bone, ink, one hairline. Built as the deliberate opposite of Patisserie, because a picker whose
// themes differ only in COLOUR is a picker of recolours and nobody pays for a recolour. Where that
// one is drawn, warm and curved, this is photographed, cold and straight: no illustration, no wave,
// no script — the expense is in the restraint and the size of the type.
//
// The wordmark is a heavy SANS in caps, wide-tracked, the way a fashion house sets its name — not a
// script. That single choice is most of the difference: script says handmade, caps say house.
const ATELIER_TOKENS = {
  font:      SANS,                                       // body — plain, small, quiet
  serif:     "'Cormorant Garamond', Georgia, serif",     // the big editorial headline
  brandFont: SANS,
  brandMark: 'caps',                                     // house mark, not a script wordmark
  // Bone rather than white. Pure #FFF under a black rule reads as an unstyled document; bone reads
  // as paper stock, which is the whole trick of an editorial page.
  pageBg:     '#F7F5F1',
  heading:    '#111111',
  text:       '#3A3A38',
  muted:      '#8E8E88',
  cardBorder: '#E2DFD8',
  // Almost no shadow. Editorial pages sit FLAT — a card that floats belongs to a dashboard.
  shadow:     '0 1px 0 rgba(17,17,17,0.06)',
  contentWidth: 600,
  inkMix:     { with: '#111111', amount: 0.86 },
  hero:       { type: 'atelier' },
  // Straight. The product's signature wave would be the one soft thing on a page selling severity.
  edges:      'rule',
  // The type IS the design here, exactly as in Patisserie — a font picker would undo it.
  ownsType:   true,
  cake:       'brand',
};

export const DEFAULT_CONTROLS = ['brandColors', 'hero', 'font', 'photo', 'text', 'sections', 'gallery', 'reviews'];

export const TEMPLATES = {
  spotlight: {
    key: 'spotlight', label: 'Standard', tokens: SPOTLIGHT_TOKENS,
    defaults: { primary: '#9FA28B', accent: '#A3AB9B', ctaColor: '#EAEBE5' },   // designed sage/green
    controls: DEFAULT_CONTROLS,
  },
  aurora: {
    key: 'aurora', label: 'Aurora', tokens: AURORA_TOKENS,
    defaults: { primary: '#5B3A29', accent: '#C8945B', ctaColor: '#3A281C' },   // chocolate/caramel + dark hero text
    controls: DEFAULT_CONTROLS,
  },
  atelier: {
    key: 'atelier', label: 'Atelier', tokens: ATELIER_TOKENS,
    // Ink, bone, and the baker's own accent as the ONE colour on the page. Deliberately not a
    // palette: the restraint is the product, and a baker who wants three colours wants a different
    // theme.
    defaults: { primary: '#1A1A18', accent: '#A8654B', ctaColor: '#F7F5F1' },
    controls: DEFAULT_CONTROLS.filter(c => c !== 'font'),
  },
  patisserie: {
    key: 'patisserie', label: 'Patisserie', tokens: PATISSERIE_TOKENS,
    // Every control except `font` — the theme owns its typography (ownsType), so offering the picker
    // would be offering a knob that is wired to nothing.
    controls: DEFAULT_CONTROLS.filter(c => c !== 'font'),
    // Blush facade, duck-egg trim, cherry for the CTA — the three colours that carry the style, and
    // all three stay editable: the facade, the awning and the hearts are painted FROM these pickers,
    // so a baker who wants a mint-green shop gets one rather than a picture they cannot change.
    // ⚠️ ctaColor is the LABEL colour, not the button fill (buildPalette: onCta = heroText =
    // opts.ctaColor). Cherry red here meant red TEXT on the pink button, which is what shipped and
    // read as a warning rather than an invitation. It is the drawing's ink now — near-black on
    // blush, which is what the rest of the theme does.
    defaults: { primary: '#E9B7C2', accent: '#A9CBD4', ctaColor: '#2E3A46' },
  },
};

// Resolve a baker's chosen template key to a built template. Unknown / missing → the baseline,
// so the storefront always renders.
export function resolveTemplate(key) {
  return (key && TEMPLATES[key]) || TEMPLATES.spotlight;
}
