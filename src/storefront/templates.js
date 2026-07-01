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
};

export const TEMPLATES = {
  spotlight: { key: 'spotlight', label: 'Standard', tokens: SPOTLIGHT_TOKENS },
};

// Resolve a baker's chosen template key to a built template. Unknown / missing → the baseline,
// so the storefront always renders (mirrors the old BUILT_TEMPLATES fallback).
export function resolveTemplate(key) {
  return (key && TEMPLATES[key]) || TEMPLATES.spotlight;
}
