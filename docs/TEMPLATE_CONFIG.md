# Storefront Template Config

A storefront template is a **config object** in `src/storefront/templates.js`, layered over the ONE
shared renderer (`CustomerStorefront`) and the ONE shared customiser (`ThemePreview`). Adding or
changing a template is **data** — never a forked layout or a per-theme branch.

## The shape
```js
TEMPLATES.aurora = {
  key:   'aurora',        // stable id; matches storefront_themes.key in the DB
  label: 'Aurora',        // display name in the switcher (DB `name` overrides in the real customiser)
  tokens:   { ... },      // RENDERER config (typography, inks, spacing, hero, palette hints)
  defaults: { primary, accent, ctaColor },   // CUSTOMISER: seed the pickers on select
  controls: [ ... ],      // CUSTOMISER: which controls to show, in order
}
```
- **`tokens`** is consumed by the RENDERER (`buildPalette()` + `styles()` + `CustomerStorefront`).
- **`defaults`** + **`controls`** are consumed by the CUSTOMISER (`ThemePreview`).

### `tokens` (renderer config)
| Key | Meaning |
|---|---|
| `font`, `serif`, `brandFont` | body / heading / wordmark fonts (baker `font_key` lever overlays via `applyFontTheme`) |
| `pageBg` | page background (unless derived — see `pageBgMode`) |
| `heading`, `text`, `muted` | neutral text colours for the body sections |
| `cardBorder`, `shadow`, `contentWidth`, `inkMix` | surface + spacing + the footer "ink" mix |
| `headerBg`, `headerBorderColor`, `utilbarBg` | header/util-strip colours (`'transparent'` → top-flush) |
| **`hero`** | `{ type, ...layoutKnobs }` — see below |
| `cake` | 3D hero-cake colour: `'brand'` → the primary colour; a hex → fixed; default ivory |
| `pageBgMode` | `'heroTop'` → page/top surface = the gradient's derived light top tone |

### `hero` (inside `tokens`)
`hero.type` selects a renderer from **`HERO_RENDERERS`** (in `CustomerStorefront.jsx`). The remaining
keys are that hero's layout knobs. Current types:
- `centered-cake` — brand-tinted band + wavy bottom, centred 3D cake (split on wide). *(Spotlight)*
- `gradient-cake` — soft gradient, message left, big cake bleeding off the right. Knobs (per breakpoint
  `[mobile, tablet, desktop]`): `textWidth`, `subMaxWidth`, `cakeWidth`, `cakeRight`, `minHeight`. *(Aurora)*
- `photo` — full-bleed baker lifestyle photo (auto-selected when the baker sets `hero_image`).
- `none` — no hero; just header + sections.

### `defaults` (customiser seeding)
`{ primary, accent, ctaColor }` — the designed starting palette. When a baker **selects** the template,
`ThemePreview` seeds these into the pickers (only on a real switch). The storefront ALWAYS renders from
the pickers — Aurora's gradient/cake/top all DERIVE from `primary`/`accent`/`cta_color` in
`buildPalette` — so every colour stays editable. Defaults are the starting point, not a lock.

### `controls` (customiser panel)
An ordered list of control keys from the **`CONTROLS`** registry (in `ThemePreview.jsx`):
`brandColors`, `font`, `photo`, `text`, `sections`, `gallery`, `reviews`. Omit `controls` →
`DEFAULT_CONTROLS` (all). A template shows fewer/different controls by declaring a subset.

## How to…
- **Add a template:** add a config object to `TEMPLATES` (+ a `storefront_themes` DB row to make it
  selectable in the real customiser — see Activation).
- **Add a hero:** write a renderer fn + add it to `HERO_RENDERERS`, then set `tokens.hero.type` on a template.
- **Add a control:** add an entry to `CONTROLS` in `ThemePreview`, then list its key in a template's `controls`.

## Activation (making a template live)
Template config is CODE (ships in `@spattoo/designer`). Availability is gated by the DB
`storefront_themes` row (`key`/`name`/`is_active`; `is_active=false` → "Soon"). To ship a template:
build it → flip `is_active=true` → re-vendor `@spattoo/designer` into `spattoo-web` → deploy.

## Persistence (where a baker's choices are saved)
On publish, the baker's chosen values go on the **`bakers` row**: `storefront_theme_id` (which template),
`primary_color`/`accent_color` (pickers), and `storefront_customizations` jsonb (`cta_color`, `font_key`,
`sections`, `hero_image`, …). No per-template schema. Note: it's **one config per baker** — switching
templates seeds/overwrites that single config (documented limitation; per-theme saved configs would need
a new structure).
