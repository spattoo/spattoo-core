# Decal print finish — config-driven roadmap

**Status:** Phase 0 shipped (global defaults + dev dials). Phases 1–3 are the plan to move it to
`placement_config`, admin-authored, per element. Not built yet.

---

## 1. Why this exists (root cause, measured)

A vivid 2D print (`elements/files/2D/*.webp`, measured **source saturation ≈ 0.96**) renders **dull on the
cake — ≈ 0.78 saturation** — while the *same file* previewed in the admin Relief Sticker Studio reads vivid
(≈ 0.84). An exhaustive A/B (2026‑07‑09) ruled out, by measurement, **every** first-suspect cause:

| Suspected cause | Verdict |
|---|---|
| The asset / WebP optimization | **Ruled out** — the exact R2 `.webp` loaded raw into the studio measures 0.96 and renders vivid. |
| Material props (roughness/sheen/env/emissive/transparent/tonemapped) | **Ruled out** — dumped identical in both apps; toggling each moved nothing. |
| Relief maps (normal/displacement) | **Ruled out** — flat decal is equally dull; stripping the maps changed nothing in core. |
| Environment / IBL | **Ruled out** — `envMapIntensity 0` changed nothing in either app. |
| three.js version / colour management | **Ruled out** — identical `three@0.183.2`. |
| Mipmap minification | **Ruled out** — `LinearFilter` (no mips) changed nothing. |
| Depth ratio, `transparent`, selection tint | Selection tint **was** a real bug (violet emissive → magenta), now fixed; the rest were no-ops. |

**What it actually is: the rendering _context_, not the material or asset.** The decisive test rendered core's
*exact flat material* inside the *admin scene* — it looked **vivid** there. So the material is innocent; the
decal reads dull in core only because it is drawn **small, curved, and often at a raking wall angle**, where the
scene lights are dimmer (luminance 125 vs the studio's 143–157) and a fixed specular white-wash is a larger
fraction of the signal → lower saturation. The admin studio flatters every sticker by previewing it **big,
head-on, and brightly lit**.

Confirmed separately that **per-pixel saturation _is_ the perceived "dullness"** (desaturating the studio to
≈0.75 made it read dull to the eye). So the fix is to make the print render vivid regardless of where the
customer places it.

**Rejected fix — global lighting.** Bumping scene ambient does brighten the print, but it is scene‑wide: it
re-lights every tier / cream / luster / foil / GLB and re-introduces the head-on wash the rig was softened to
avoid (see the `SceneLights` note). Decal vividness must be **decal-scoped**.

---

## 2. Phase 0 — SHIPPED (global, in code)

Two **sticker-scoped** knobs on the decal material (`canvas/CakeCanvas.jsx`), no effect on the cake:

- **`_decalSat`** (default **1.12**) — a chroma pre-boost applied to the albedo in `useStickerImageTexture`
  (one cached canvas pass, same pattern as `recolor`; tainted-canvas → untouched fallback). Pushes each pixel's
  colour away from its luma so the print survives the lighting wash. Garish above ~1.2.
- **`_decalEmissive`** (default **0.22**, was 0.12) — the decal's self-illumination (`emissive #fff` ×
  `emissiveMap = the artwork` × intensity) on both the flat and relief material paths. Brightens **and**
  re-saturates the print without touching the cake. Glowy/flat above ~0.35 (the print stops taking the cake's
  shading).

Committed as plain module constants `DECAL_SAT` / `DECAL_EMISSIVE` in `CakeCanvas.jsx` (the live dev dials +
listener plumbing used during tuning were removed at cleanup). These are the **fallback defaults** the config
phases below override — to re-tune, change the two constants.

---

## 3. Target — driven by `placement_config`

Per the project's config-driven / admin-authors-to-DB principle, the finish must be **authored per element and
persisted**, not a per-browser or global constant. It applies to **all 2D image stickers (flat AND relief)**, so
it is a **top-level `placement_config` block**, not nested under `relief`.

### 3.1 Schema (add to `PLACEMENT_CONFIG.md`)

```jsonc
"print_finish": {          // 2D image stickers only; absent → renderer defaults (1.12 / 0.22)
  "saturation": 1.12,      // albedo chroma pre-boost multiplier (1 = off)
  "emissive":   0.22       // decal self-illumination intensity
}
```

- Config JSON, not a hot DB column → readable nested keys are fine (no surrogate-FK concern).
- No element-type/zone branch: the renderer reads `placement_config.print_finish` for every sticker; absent →
  the Phase‑0 defaults. Config-driven, INVARIANTS-clean.

### 3.2 Core read (`canvas/CakeCanvas.jsx`)

- `StickerFace`/`StickerTexture` take a `printFinish` prop from `sticker.placement_config?.print_finish`.
- `_decalSat` / `_decalEmissive` become the **fallbacks**: `finish?.saturation ?? DECAL_SAT_DEFAULT`,
  `finish?.emissive ?? DECAL_EMISSIVE_DEFAULT`.
- `useStickerImageTexture` takes the saturation as an argument (drop the module global + listener once the dev
  dial is removed).
- Keep the value in the thumbnail/snapshot path too (`CakeThumbnailScene`) so previews match the live cake
  (INVARIANTS #2 one-renderer rule).

### 3.3 Admin authoring

- **Relief Sticker Studio** (`spattoo-admin/src/admin/ReliefStickerStudio.jsx`): add "Print saturation" +
  "Print glow (emissive)" sliders, export them into `placement_config.print_finish`. **Preview at core's real
  draw size** (the studio currently previews ~2× large and head-on, which is what hid this whole issue) so the
  authored value reflects the cake, not the flattering preview.
- **AddElement / ManageElements**: same block for **flat** 2D elements (they need it too — the dullness is not
  relief-specific).

### 3.4 Migration / rollout

- Purely additive; absent → renderer default, so **no backfill required** and existing elements keep working.
- Optionally, once authored values exist, drop the module-global defaults to `1.0 / 0.12` so unauthored
  elements render "raw" and only intentionally-tuned ones boost — **decide after** a few elements are authored
  and compared on real cakes.
- Re-vendor core into `spattoo-web`; update the feature doc (below).

---

## 4. Phases

- **Phase 0 — DONE.** Global `_decalSat 1.12` / `_decalEmissive 0.22`, sticker-scoped, + dev dials.
- **Phase 1 — Core read.** `placement_config.print_finish` → renderer, defaults as fallback; thumbnail parity;
  `PLACEMENT_CONFIG.md` updated. Remove the dev-dial globals/listeners.
- **Phase 2 — Admin authoring.** Studio + AddElement sliders → `print_finish`; studio previews at core draw size.
- **Phase 3 — Tune & document.** Author the real element library, compare on real cakes, decide whether to lower
  the unauthored default. Create/refresh the `spattoo-docs` feature doc; add a Changelog row.

---

## 5. Open questions

- Do we want a single **global baseline** (Phase 0) *plus* per-element override, or per-element only? (Leaning:
  keep a sensible baseline so unauthored elements aren't dull, override for special art.)
- Should `saturation`/`emissive` also apply to **GLB** stickers (currently only 2D image decals)? GLBs are lit
  the same way and may read dull too — measure before extending.
- Is a **per-placement** (side vs top) finish ever needed (raking side vs flat top lighting differs), or is
  per-element enough? Per-element first; revisit only if measured.

---

## 6. Cleanup — DONE (2026-07-09)

The investigation scaffolding was removed after Phase 0 committed: the `__setDecalSat` / `__setDecalEmissive`
dev dials + listener plumbing (now plain `DECAL_SAT` / `DECAL_EMISSIVE` constants); the core `dev/` diag tools
`texsat.js`, `diag-mat.js`, `ab-transparent.js`, `interior-sat.js`, `relief-off-ab.js` and their `spattoo-admin/`
copies; and the admin studio's `__studioLoadUrl` / `__studioSatMul` / `__studioFlat` hooks + flat-decal toggle.
(Pre-existing `dev/diag.js` and the `__getStickers` test hook were left in place.)
