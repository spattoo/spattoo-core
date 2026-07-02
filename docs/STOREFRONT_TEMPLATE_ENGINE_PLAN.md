# Storefront Template Engine — Dynamic / Self-Describing Templates

## Goal
Make each storefront template a single **self-describing config object** that declares its whole
identity — design tokens, default palette, **hero**, exposed **customiser controls**, and section
defaults. The **renderer** and the **customiser** both READ from the template. Adding a new template
becomes *data* (plus, occasionally, one small hero/control module) — never a fork of the renderer or
the customiser. This lets us ship templates like "photo hero", "no 3D-cake hero", "minimal", or
"editorial" purely as config.

## Principles (root `CLAUDE.md`)
- **Config-driven, not type-branching.** Registries (a map `type → module`), never a growing if/else.
- **One renderer, one customiser.** Templates are data layered over them.
- **Backward-compatible each phase.** Spotlight + Aurora keep working; verify in the dev harness AND
  the real customiser.
- **Template config lives in CODE** (design = master data shipped in `@spattoo/designer`). The baker's
  *chosen* values live on the `bakers` row (`primary_color`/`accent_color` + `storefront_customizations`
  jsonb). **No schema change for the engine.**

## Target template shape (end-state)
```js
{
  key, label,
  tokens:   { font, serif, brandFont, heading, text, muted, cardBorder, shadow,
              contentWidth, inkMix, headerBg, headerBorderColor, utilbarBg },
  defaults: { primary, accent, ctaColor },              // seed the pickers on select
  hero:     { type: 'gradient-cake'|'centered-cake'|'photo'|'none', ...typeConfig },
  controls: ['brandColors','heroText','font','photo','text','sections', ...], // what the customiser shows
  sections: [ ... ] | undefined,                         // optional default section list/order
}
```
- **Renderer** consumes `tokens`, `defaults` (via pickers), `hero`, `sections`.
- **Customiser** consumes `controls` (which panels to show) + `defaults` (seeding).

## Current state (honest audit)
| Area | State |
|---|---|
| **Sections** | ✅ Config-driven + **decoupled from the hero** (`resolveSections`). A new template's sections already render regardless of hero. |
| **Palette** | ✅ Derived from the pickers; templates seed defaults (just built). |
| **Hero** | ⚠️ Config-*selected* (`heroTreatment`) but a **fixed if/else** in the renderer; **no `none`**. |
| **Customiser controls** | ❌ **Hardcoded** in `ThemePreview` — same panel for every template. |
| **Template shape** | ⚠️ Partially there (tokens + defaults + hero knobs) but not consolidated/documented. |

---

## Phases (go one by one)

### Phase 1 — Hero registry (pluggable heroes)  ← START HERE
**Why first:** directly enables "a template without the 3D-cake hero" and any new hero, and it's a
contained refactor. Sections already keep working.

**Changes**
- Extract the three hero blocks from `CustomerStorefront` JSX into standalone render functions, each
  taking a `heroCtx` (`{ baker, pal, s, txt, wide, bp, designLabel, notAcceptingOrders, expired,
  handleCta, HeroCake3D }`): `gradientCakeHero`, `centeredCakeHero` (today's curve + split), `photoHero`.
- Add a **registry**: `HERO_RENDERERS = { 'gradient-cake', 'centered-cake', 'photo', 'none' }`
  (`'none'` → renders nothing → just header + sections).
- Template declares `hero: { type, ...config }` — Aurora `= { type:'gradient-cake', textWidth,
  subMaxWidth, cakeWidth, cakeRight, minHeight }` (the knobs move under `hero`); Spotlight `= { type:
  'centered-cake' }`.
- **Dispatch:** `heroType = baker.storefront_customizations?.hero_image ? 'photo' : (template.hero.type)`;
  render `HERO_RENDERERS[heroType]?.(ctx)`. (Baker hero-image still overrides to a photo hero.)

**Deliverable:** a template with `hero:{type:'none'}` or `'photo'` renders correctly with all sections;
adding a hero = one module + one registry entry. Renderer stops being an if/else.

**Verify:** dev harness — add a throwaway `minimal` template (`hero:{type:'none'}`), confirm sections
render + no hero; confirm Aurora/Spotlight pixel-identical to now.

---

### Phase 2 — Consolidate + document the template shape
**Goal:** one canonical `Template` object; Spotlight + Aurora migrated; documented.

**Changes**
- Reorganise `templates.js`: group `tokens` / `defaults` / `hero` / `controls` per template (move
  `defaultPrimary` → `defaults.primary`, hero knobs → `hero.*`, etc.). Keep a thin back-compat read at
  the boundary if needed so nothing else breaks mid-migration.
- Write `docs/TEMPLATE_CONFIG.md` — the shape, each field, and which of {renderer, customiser} consumes it.

**Deliverable:** consistent, documented config; a new template is a copy-the-shape exercise.
(Low-risk reorg — can fold into Phase 1 or 3 as those files are touched.)

---

### Phase 3 — Template-declared customiser controls (the "pickers from config" ask)
**Goal:** the customiser's left panel renders from `template.controls`, not hardcoded.

**Changes**
- **Control registry** in the customiser: `CONTROLS = { brandColors, heroText, font, photo, heroPhoto,
  text, sections }` — each a small component that declares what it binds to (`primary_color`,
  `accent_color`, `customizations.cta_color`, `customizations.font_key`, `portrait`, `hero_image`, …).
- `ThemePreview` renders `template.controls.map(k => CONTROLS[k](bindingCtx))`. The **Theme selector is
  always shown** (it's how you switch). Everything else is per-template.
- Templates declare `controls`: Aurora/Spotlight `= ['brandColors','heroText','font','photo','text',
  'sections']`; a photo-hero template `= ['heroPhoto','brandColors','sections']` (shows a hero-image
  uploader, hides irrelevant knobs).

**Deliverable:** different templates expose different controls; adding a control = one module + registry.

**Verify:** real customiser — switch templates, the panel changes; a photo-hero template shows a
hero-photo uploader and not the 3D-cake-only knobs.

---

### Phase 4 (optional / deferred) — template-aware sections
Only if a template needs different section **types** or a different default order/styling. Templates
would declare `sections` defaults + allowed types. **Defer** until a real template demands it — sections
already work globally today.

---

### Phase 5 (cross-cutting, per template) — activation + persistence
- Template config is CODE; the `storefront_themes` DB row (`key`/`name`/`is_active`) gates availability
  (the "Soon" badge = `is_active=false`). **To ship a template:** build it → flip `is_active=true` →
  re-vendor `@spattoo/designer` into `spattoo-web` (vendored-tarball flow) → deploy.
- **No schema change** for the engine. Baker's chosen values stay on the `bakers` row.
- **Known limitation (documented):** it's **one config per baker, not per-theme** — switching themes
  seeds/overwrites the single config. If per-theme saved configs are ever wanted (flip between a fully
  styled Aurora and Spotlight without redoing colours), that needs a new structure (e.g.
  `storefront_customizations` keyed by theme, or a `baker_theme_configs` table). Out of scope now.

---

## Recommended sequence
1. **Phase 1** — hero registry (unblocks new heroes / no-cake templates).
2. **Phase 3** — controls schema (the "pickers driven by config" ask).
3. **Phase 2** — consolidate + document (fold in while touching `templates.js`).
4. **Phases 4 / 5** — as needed, per template.

## Where the work happens
Storefront worktree (`spattoo-core-storefront`, branch off `dev`), dev harness at
`localhost:5173/storefront.html`, then re-vendor for the real customiser. Each phase = its own commit;
merge to `dev` (3-way, preserves unrelated changes) as we go.
