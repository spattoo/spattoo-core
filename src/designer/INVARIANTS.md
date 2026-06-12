# Cake Designer — Invariants

Read this before changing element placement, rendering, or the right‑side popups.
These rules exist because they were each violated and cost painful rework. Keep them true.

## 1. Placement & behavior are CONFIG‑driven, never element‑type‑driven
An element's behavior comes entirely from its data:
- `allowed_zones` — where it can go (`top_surface`, `side`, `middle_tier`, `board`, `rim`).
- `placement_config[zone]` — how it sits there: `stand` | `hug` | `faux_balls` | `faux_ball_single`.
- `placement_config.r` — default scale (never hard‑coded; never force a value).
- `placement_config.rotation` — the GLB's authored facing offset (e.g. toppers `[0,-π/2,0]`).
- `placement_config.single_per_slot` — placement STYLE (see #4).

**Do NOT branch on element type/slug in rendering or popup code** (`=== 'topper'`,
`slug === '…'`, a second renderer for one type). If a type needs special behavior, express it
as `placement_config` and set it — ideally in admin, otherwise in the load‑time backfill in
`CakeDesigner.loadElementsIfNeeded` (the ONE place type→config mapping is allowed).

## 2. ONE renderer for every placed element
All placed decor — scattered, picks, image‑topper, faux‑ball, topper, top&side — lives in
`design.stickers` and renders through the generic path (`DraggableTopSticker` /
`DraggableSideSticker` / `FauxBall*` in `canvas/CakeCanvas.jsx`). There is no per‑type renderer.
`CakeTopper` / `design.topper` were deleted for this reason — do not reintroduce a parallel one.

## 3. Reuse the shared components — do not reimplement
- `PreviewTile` — preview + corner checkbox + label. Used by the piping popup AND the placement chooser.
- `SizeDial` — the ONE size control (piping, hero chooser, scatter card). No parallel sliders.
- `PlacementChooser` — per‑(tier×surface) slot tiles with add/remove + per‑slot Size/Tilt.
- `cleanGlbScene`, `previewCake.jsx` (`buildPreviewTiers`, `PreviewCakeMeshes`).

When asked to do something "like the piping popup," **open the piping code and reuse it** — never
approximate from memory or build a parallel version.

## 4. Two placement STYLES, both flag‑driven (not type‑driven)
- `single_per_slot: true` (topper, top&side decor) → ONE card per element (`type: 'decorEl'`); its
  chooser manages one instance per (tier×surface) slot via independent add/remove checkboxes.
- otherwise (scattered, picks, image‑topper) → scatter freely: many independent stickers, one card each.

`isMultiSlotEl` reads `placement_config.single_per_slot` — it must NOT infer style from
`allowed_zones.length` (scattered decor legitimately allows many zones but is not single‑per‑slot).

## 5. Selection‑state types ≠ element types
`selectedEl.type` (`tier | piping | text | sticker | decorEl | writing`) is the editor's selection
state machine — that's a legitimate switch. It is NOT the same as branching on an element's
DB type/slug. Don't conflate the two when reading rule #1.

## Definition of Done (run through this before saying "done")
- [ ] No new `=== '<slug>'` / type branch in render or popup code (config instead).
- [ ] Reused the existing shared component rather than a new parallel one.
- [ ] All element kinds still behave: topper, top&side, scattered, picks, image‑topper, piping.
- [ ] **Verified visually** in the real app, not by reading code — see below.

## Verification
The designer is WebGL; reading code is not enough — confirm changes by looking at the rendered
result. Drive the real app with Playwright + Chromium against `npm run dev`
(http://localhost:5173, behind login): log in once and persist `storageState`, then place each
element type on each surface, screenshot, and inspect. Use `waitUntil:'domcontentloaded'` (the HMR
socket never goes idle).

## Quality gates
Aspirational until added (none exist yet — `spattoo-core` has no CI/lint/test setup):
- `npm run check:paths` — fail if element‑type/slug literals appear in render/popup code (prevents #1/#2).
- Contract test (needs `vitest`) — run every element type through the same placement invariants.
- Playwright visual‑regression — per element × placement, diffed against baselines.
