# Cake Designer — Invariants

Read this before changing element placement, rendering, or the right‑side popups.
These rules exist because they were each violated and cost painful rework. Keep them true.

## 1. Placement & behavior are CONFIG‑driven, never element‑type‑driven
An element's behavior comes entirely from its data:
- `allowed_zones` — where it can go (`top_surface`, `side`, `middle_tier`, `board`, `rim`).
- `placement_config[zone]` — how it sits there, written EXPLICITLY by admin: `'hug'` | `'stand'`
  | `'perch'` | `'verge'`. Admin persists the mode for every applicable zone (default
  `'hug'`), so the renderer never guesses. (Legacy rows may omit it → treat absent as `'hug'`, the
  data-layer default in `addSticker`; the load-time backfill still seeds hero defaults, and an
  element's explicit config always wins via the spread.) NEVER hardcode a different per-zone default
  in render/popup code — read the value.
- `placement_config.r` — default scale (never hard‑coded; never force a value).
- `placement_config.scale` — optional `{ min, max, step }` bounding the Size dial and its increment
  (absolute‑scale dials only, never the hero‑hug `hugMul`). `r` is the default WITHIN this range.
  Read via `scaleRangeOf(el, dMin, dMax, dStep)`; each key falls back to the control's own default,
  so an element with no `scale` keeps its prior bounds (backward compatible). Never hard‑code
  per‑element bounds. (`SizeDial` clamps its output to `[min,max]` so an odd step can't overshoot.)
- `placement_config.rotation` — the GLB's authored facing offset, in **degrees** (e.g. toppers
  `[0,-90,0]`), gated by `rotation_unit: 'deg'`. Read ONLY via `facingOffsetRadians()` — one unit
  on each side (degrees in the DB, radians at runtime); never read `placement_config.rotation` raw.
- `placement_config.single_per_slot` — placement STYLE (see #4).

**Do NOT branch on element type/slug in rendering or popup code** (`=== 'topper'`,
`slug === '…'`, a second renderer for one type). If a type needs special behavior, express it
as `placement_config` and set it — ideally in admin, otherwise in the load‑time backfill in
`CakeDesigner.loadElementsIfNeeded` (the ONE place type→config mapping is allowed).

## 2. ONE renderer for every placed element
All placed decor — scattered, picks, image‑topper, topper, top&side — lives in
`design.stickers` and renders through the generic path (`DraggableTopSticker` /
`DraggableSideSticker` in `canvas/CakeCanvas.jsx`). There is no per‑type renderer.
`CakeTopper` / `design.topper` were deleted for this reason; the `FauxBall*` procedural cluster
renderers were likewise removed (balls are now GLB spheres on this same path) — do not reintroduce a
parallel one.

## 3. Reuse the shared components — do not reimplement
- `PreviewTile` — preview + corner checkbox + label. Used by the piping popup AND the placement chooser.
- `SizeDial` — the ONE size control (piping, hero chooser, scatter card). No parallel sliders.
- `PlacementChooser` — per‑(tier×surface) slot tiles with add/remove + per‑slot Size/Tilt.
- `cleanGlbScene`, `previewCake.jsx` (`buildPreviewTiers`, `PreviewCakeMeshes`).

When asked to do something "like the piping popup," **open the piping code and reuse it** — never
approximate from memory or build a parallel version.

This applies to shared **logic**, not just React components. Before writing new placement / seating /
geometry / de-overlap / hit-test logic, **grep for an existing helper that already does it**
(`placement.js`, `geometry/surface.js`, the hooks) and extend that ONE helper. A rule used in two
places lives in a single pure function both call — never a second copy. Cautionary tale: the
"nudge a seat off a coincident sibling" rule was pasted into **four** call sites (`addSticker` stand /
scatter-top / scatter-side / edge + `duplicateSticker`) with subtly different behaviour, until it was
unified into `deOverlapSeat`. Likewise `edgeSeatSeed` is the single front-edge seat used by both the
add and chooser-move paths. Duplicated logic silently drifts — treat a copy-paste as a defect.

### 3a. ALL popups are RIGHT‑SIDE panels — never centre‑screen modals
Every chooser/editor/placement popup is a right‑side panel using `s.editPopup` (`position:absolute;
right:10; top:12`), exactly like the piping popup and the decoration edit stack. **Never** build a
centred/`position:fixed` modal overlay, and never invent a new popup container — reuse `s.editPopup`.
A `decor_pattern` is ONE persistent card in that right‑side stack (keyed by `patternId`, the parts
abstracted away), with its surface chooser *inside the card* — exactly like a piping element's
rim/board. Never a throwaway "place" modal, and never one card per part. A user‑created **group**
(shared `groupId`) follows the SAME rule: ONE collapsed card keyed by `groupId`, members abstracted
away, with its group controls (proportional Size, Ungroup, Remove) and a drill‑in to edit one
member *inside the card* — reuse the `decor_pattern` card path, never build a parallel group panel.

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

## 6. The Decorations panel is type‑agnostic — ONE way onto the cake
The element picker (Decorations panel) has exactly one job: bring **any** element onto the cake
through its right‑side popup (#3a). It MUST NOT branch on element type, slug, or zone.
- **One uniform interaction:** a single click/tap on an element opens its placement popup, for every
  element. No drag‑only elements, no separate "Cream Piping" (or any per‑type) section with its own
  interaction, and **never** gate clickability / which popup opens on a zone (`rim`/`board`) or a
  type (piping). The panel surfaces elements and hands off to the popup — nothing more.
- **Placement lives in config, shown in the popup:** which surfaces an element offers
  (`top_surface`, `side`, `rim`, `board`, `middle_tier`) and how it sits on each (`stand` | `hug` |
  …) come entirely from its config (#1) and are chosen *inside* that one popup.
- **"Hug" is a per‑zone placement mode, available on ANY allowed surface** — top, side, rim, board.
  It is NOT a rim/board‑only or "piping" behavior. An element hugs the side because its config says
  `placement_config.side === 'hug'`, not because of its zone name or element type.
- **"Piping" is not a panel category** — it's just an element whose config places it as a hugging
  ring. Do not group, label, or special‑case the picker by piping vs decor.

## 7. No emojis in the UI
Never put emoji in UI text — buttons, labels, hints, card titles, toasts. Use plain words (and, where
an icon is wanted, the existing icon/style system). A control must look like the control it is: e.g. a
button gets a real button style (`s.toolbarBtn` / background + padding), not an emoji standing in for
one. (Cautionary tale: a "✨ Create automatic cluster" button — emoji + no button styling — was
rejected and changed to a plain filled "Create cluster" button.)

## Definition of Done (run through this before saying "done")
- [ ] No new `=== '<slug>'` / type branch in render or popup code (config instead).
- [ ] No emojis in any UI text; controls use real styles (a button looks like a button) (#7).
- [ ] No branch on zone (`rim`/`board`/…) to decide picker interaction, clickability, or which popup
      opens — the panel treats every element identically (#6).
- [ ] Reused the existing shared component rather than a new parallel one.
- [ ] No copy-pasted logic: grepped for an existing helper first; a rule used in 2+ places lives in
      ONE pure function both call (e.g. `deOverlapSeat`, `edgeSeatSeed`) — not a second copy.
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
