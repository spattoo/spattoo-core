// Standard ("Honeybear-style") typography — one clean geometric sans for headings + body
// (the original serif heading read less professional). A future template (e.g. an editorial
// direction) can set its own serif in these tokens.
const SANS = "'Montserrat', system-ui, -apple-system, sans-serif";

// Storefront template registry.
//
// A template is a DESIGN LANGUAGE (a set of tokens) layered over the ONE shared storefront
// renderer (CustomerStorefront). The baker's brand colours (primary/accent) always overlay at
// render time; tokens are everything else about the look — typography, neutral inks, surface
// colour, spacing, hero tone. A new template is DATA (a new token set), never a forked layout
// tree — so the renderer stays single-source and templates can't drift apart.
//
// `spotlight` (labelled "Standard") reproduces the original look EXACTLY: its tokens are the
// values that were previously hard-coded inside CustomerStorefront's styles(). Keeping the key
// as `spotlight` means existing bakers (whose storefront_theme is already `spotlight`) need no
// data migration.

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
  // The dark hero/footer "ink" is mixed FROM the baker's primary; inkMix lets a template
  // retune that mix (towards a warmer/cooler/darker tone) as pure data.
  inkMix:       { with: '#3a363a', amount: 0.74 },
  // HERO: the signature centred cake on a brand-tinted band with a wavy bottom (split on wide).
  hero:         { type: 'centered-cake' },
  // DEFAULT palette — the designed sage/green that seeds the pickers when Spotlight is selected
  // (the starting point the baker tweaks from). The storefront still renders from the pickers.
  defaultPrimary:  '#9FA28B',                          // sage
  defaultAccent:   '#A3AB9B',                          // muted green
  defaultCtaColor: '#EAEBE5',                           // light hero/button text (on the dark band)
};

// `aurora` — a modern GRADIENT theme (message + CTA left, a big rotating chocolate cake bleeding off
// the right, on a soft warm gradient with a top-flush transparent header). `hero.type:'gradient-cake'`
// selects the hero renderer from HERO_RENDERERS. Colours DERIVE from the pickers (gradient/cake/top all
// computed in buildPalette) — moving a picker moves the design; the template supplies only the DEFAULT
// palette below (chocolate/caramel), which the customiser seeds into the pickers on select. All DATA;
// the renderer + customiser are shared.
const AURORA_TOKENS = {
  font:         SANS,                                  // body — modern geometric sans
  serif:        SANS,                                  // headings also sans (heavy weight set in styles)
  brandFont:    SANS,                                  // modern wordmark (not the script) to match the gradient look
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
  // HERO: `type` selects the renderer from HERO_RENDERERS (config-driven, no branch). The remaining
  // keys are LAYOUT knobs for this hero, tunable per breakpoint as [mobile, tablet, desktop]: they keep
  // the message clear of the cake — textWidth = the headline/CTA column; subMaxWidth caps the subtitle so
  // it stays LEFT of the cake; cakeWidth + cakeRight size and bleed the cake off the right; minHeight is
  // the hero height. Change these numbers to retune the layout — no renderer change.
  hero: {
    type:        'gradient-cake',
    textWidth:   ['66%', '56%', '54%'],
    subMaxWidth: [230, 300, 320],
    cakeWidth:   [360, 520, 620],
    cakeRight:   [-90, -120, -140],
    minHeight:   [440, 460, 540],
  },
  // COLOUR = DERIVED FROM THE PICKERS (full baker control). The hero gradient, the 3D cake and the
  // flush top surface are all computed from the baker's primary/accent in buildPalette — so moving a
  // picker moves the whole design. The template only supplies the DEFAULTS below, which the
  // customiser seeds into the pickers when Aurora is selected (the starting point to tweak from).
  cake:        'brand',                                // 3D cake takes the PRIMARY colour (chocolate by default)
  pageBgMode:  'heroTop',                              // page/top surface = the gradient's derived light top tone
  defaultPrimary:  '#5B3A29',                          // chocolate  → seeds the Primary picker
  defaultAccent:   '#C8945B',                          // caramel    → seeds the Accent picker
  defaultCtaColor: '#3A281C',                          // dark hero text (gradient is light) → seeds Hero/button text
};

// Which customiser controls a template exposes, in order (Phase 3). The customiser (ThemePreview)
// renders the left panel from this list — a template omits it → DEFAULT_CONTROLS (all). This is how a
// template hides irrelevant knobs (e.g. a photo-hero template would swap in a hero-photo uploader).
export const DEFAULT_CONTROLS = ['brandColors', 'font', 'photo', 'text', 'sections', 'gallery', 'reviews'];

export const TEMPLATES = {
  spotlight: { key: 'spotlight', label: 'Standard', tokens: SPOTLIGHT_TOKENS, controls: DEFAULT_CONTROLS },
  aurora:    { key: 'aurora',    label: 'Aurora',   tokens: AURORA_TOKENS,    controls: DEFAULT_CONTROLS },
  // TEMP DEMO (uncommitted) — proves BOTH registries: hero.type:'none' → no hero, and a SUBSET
  // controls list → the customiser shows only Brand colours + Sections. Data only. Remove after demo.
  demoNone:  { key: 'demoNone',  label: 'Demo — no hero', tokens: { ...SPOTLIGHT_TOKENS, hero: { type: 'none' } }, controls: ['brandColors', 'sections'] },
};

// Resolve a baker's chosen template key to a built template. Unknown / missing → the baseline,
// so the storefront always renders (mirrors the old BUILT_TEMPLATES fallback).
export function resolveTemplate(key) {
  return (key && TEMPLATES[key]) || TEMPLATES.spotlight;
}
