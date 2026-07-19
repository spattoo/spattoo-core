# Cake Designer — Invariants

Read this before changing element placement, rendering, or the right‑side popups.
These rules exist because they were each violated and cost painful rework. Keep them true.

> **Scope:** the CROSS-CUTTING principles here — **DRY / reuse-scan (#3), config-driven not
> type-branching (#1/#6), no pictographic emoji (#7), and verify-in-the-real-app** — are
> **PROJECT-WIDE**: they apply to every screen/module (storefront, settings/customiser, admin, api),
> not just the designer. They're stated once, authoritatively, in the root `CLAUDE.md`
> ("REUSE & CONFIG-DRIVEN … ALL MODULES"). Everything else below is designer-SPECIFIC
> (placement modes, zones, the ONE renderer, right-side popups).

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

### 1a. "Config‑driven" ≠ "admin‑authorable" — every TUNABLE VALUE must be DB‑overlaid, not a hardcoded final
These are TWO different rules and both must hold:
- **Config‑driven** (this section) = behaviour flows from data/keys, never a type branch. A finish/style
  ALGORITHM (a shader or geometry recipe) legitimately stays in code — it can't be a DB row — but is
  reached through a KEY (`render`, `wall`, `grain`), never a literal‑name branch.
- **Admin‑authorable** (CLAUDE.md "ADMIN AUTHORS MASTER DATA") = every VALUE an admin would tune — params,
  **defaults**, palettes, material numbers, enabled set, labels — is master config and MUST be **DB‑overlaid
  from day one** (seed‑in‑code + DB overlay via an API route), NEVER a hardcoded final. Being config‑driven
  does NOT by itself make a value admin‑authorable: if an admin can't change it without a **deploy**, it's
  in the wrong place. When you build an admin **Studio** for a finish, its output MUST land in that DB
  overlay — a Studio whose result can only be pasted into code is not authoring, it's a mock‑up.
- The pattern already exists: `cake_textures → applyTextureConfig` overlays cream‑STYLE params (incl.
  defaults); `materials → applyMaterialConfig` overlays a frosting's label/styles. Extend that seam; do not
  invent a parallel store, and never `localStorage`/in‑code‑final for authored config.
- **KNOWN GAP (fix when touched):** frosting **material physics** are still code‑only (`applyMaterialConfig`
  overlays only label/styles), and the **glaze** shipped the same way — its material params AND
  `GLAZE_DEFAULTS` (palette + flow/warp/contrast/streak) are hardcoded, so admin can't retune the look the
  Glaze Studio produced without a release. Cream STYLE params are already overlaid; frosting materials +
  glaze are not. The correct fix is a DB overlay for finish material/pattern config (+ Studio persistence),
  not more code constants.

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

### 5a. Selection is a BORDER tracing the HIT PLANE — never a tint on the element's material
The selection cue is `SelectionBox`, a rectangle drawn as a **sibling** of the element. **Never**
express selection by mutating the element's material (`emissive`, colour, tone‑mapping). An emissive
highlight is ADDITIVE, so it corrupts the very albedo it advertises — a saturated orange decal
rendered **magenta** while selected (blue pushed hard, green barely), and deselecting snapped it back.
Three separate cues had grown — an emissive tint on decals, a white inverted‑hull outline on GLB
models, an ad‑hoc rectangle on text — so what "selected" looked like depended on the asset kind.
There is now ONE.

**The border traces the element's HIT PLANE, not its artwork's silhouette.** The hit plane
(`isStickerHitPlane`) is the ONLY thing that receives pointer events — a GLB's own meshes have
`raycast` disabled — so it, not the visible art, is what the customer grabs and what steals a click
from a neighbour. A heart on a square PNG intercepts clicks across its whole transparent margin. A
border hugging the art would be prettier and would **hide the one fact the customer needs** when a
decoration underneath won't respond: another element's invisible half is lying on top of it. For a
**2D decal the plane is the full `STICKER_SIZE` square** — its transparent margin genuinely steals
clicks and must be shown; don't "improve" that into an alpha‑tight box. A **GLB has no transparent
margin**, so its plane narrows to the model's measured **per-axis footprint** (`StickerModel` reports
`halfW`/`seatHalf`; `seatedHitBox` builds the rect): a tall‑narrow bow gets a tall‑narrow box, not a
square. This is the SAME principle (trace the clickable region), applied to a tighter region — not the
banned alpha‑tight box.

**A 2D decal gets a flat rectangle; a GLB with real DEPTH gets a 3D wireframe BOX.** A flat border
only looks right head-on — a bent, proud model (a side bow) is a curved 3D object, so a flat plane
placed in front of it *slides off the moment you orbit the cake* (no flat-plane placement fixes this;
it's the wrong primitive). The GLB cue is therefore a **box enclosing the model's actual 3D bounds**,
which wraps it from every camera angle. `StickerModel` measures the RENDERED model's `Box3` in its
local frame — the meshes' OWN `geometry.boundingBox` union, NOT `setFromObject` (whose world matrices
read effScale-scaled coords once the scene mounts, flip-flopping the size per render) — and reports
`{ w, h, d, cy, cz }`; `SelectionBox` builds `EdgesGeometry(BoxGeometry)` at `centerZ`. The box inherits
bend/tilt/proud-seat for free because it's a sibling in the element's local frame. `SelectionBox` still
takes only geometry (`width`/`height`/`centerY`/`z`/`depth`/`centerZ`) — no type, slug or zone (#1/#2/#6).
This supersedes the flat GLB rect (and the old inverted-hull outline). A 2D decal has no depth → `depth`
0 → it keeps its flat rect at the full `STICKER_SIZE` square (its transparent margin genuinely steals
clicks and must be shown; don't "improve" that into an alpha-tight box).

**The hit plane itself stops at a base-seated element's SEAT** — `seatedHitBox` (`placement.js`) is
the one source for the plane, the border and the grips. A stand/base-verge element is lifted by
`seatHalf` (its lowest opaque pixel) so its visible base rests on the surface; if the artwork has
empty space below it, the square's bottom edge would hang below that contact point, buried in the
cake. That strip is not merely ugly: the hit plane billboards toward the camera, so it is NEARER than
the tier behind it and **wins the raycast** — clicking the bare cake in front of a standing element
would select the element. Trim ONLY the strip below the seat; the side and top margins stay, because
those genuinely do intercept clicks over a neighbour and showing that is the border's whole job. A
perch/verge that deliberately overhangs the rim is not base-seated (its underside hangs in air, not
in cake) and keeps its full square.

The mirror rule for MOVEMENT: a side-wall element's vertical **clamp** (`wallClampY`) uses its
VISIBLE content extent (`down`/`up` = lowest/highest opaque pixel), not the transparent square. A
banner with empty margin above and below its flags must be draggable until its flags touch the rim,
not stopped short by the empty square. `down`/`up` come from the SAME one alpha scan as the seat
(`scanContentV`, reported up via `onVExtent`); a GLB fills its box so reports a symmetric half-height
(unchanged behaviour); unmeasured falls back to the full square. Note this is the OPPOSITE trade-off
from the hit plane: the plane/border stay the full square (they must reveal what steals clicks), while
the clamp shrinks to the content (empty margin must not block travel). Two different questions —
"what did I click?" vs "how far can I drag?" — so two different boxes, deliberately.

### 5b. ONE size path — `stickerSizeControl` decides the field, the value and the bounds
`ResizeHandles` (the corner grips on a selected element) and the edit popup's `SizeDial` are two
INPUTS to the same control, not two controls. Both read `stickerSizeControl(element, sticker, tier)`
(`placement.js`) and both write through `resizeSticker` (`CakeDesigner.jsx`). Never re-derive a size
range at a call site. That helper owns three rules, each of which a caller previously got wrong:
- **Which field** carries size — a hero hug sizes by `hugMul`, everything else by absolute `scale`.
  Flag-driven (`isDynamicHug`), never an element type.
- **The config bounds** — `placement_config.scale { min, max, step }` (rule #1). A hand-rolled slider
  once hard-coded `0.25–3.0` and silently ignored config; the old canvas handle did the same.
- **The cake-geometry cap** — a photo frame (and its border ring) may only grow until it reaches the
  rim / wall edges. Config-gated on `photoMask`.

A grip drag is clamped through `clampSizeValue`, so dragging can never reach a size the dial refuses.
Resize is **centre-anchored** (an element's position IS its centre), so it grows symmetrically.
Grips hold a constant APPARENT size (re-derived per frame from camera distance) — a fixed world-size
grip becomes an untappable dot on a phone. Edge pills are deliberately absent: `scale` is a scalar,
and a pill that silently resized uniformly would be a lie.

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

## 7. No emojis in the UI — RULE IS ON. ZERO pictographic emoji, anywhere.
This is a **hard rule and a recurring offender** — emoji keep creeping back in and getting removed
(✨ cluster button, 🎂 "no preview" placeholder, 🔍 filter banner, 🏪/📷 settings, 🔒 lock state, …).
The app is professional; it must never show a pictographic/colour emoji (`U+1F000–1FAFF` and friends:
🎂🔍🏪📷🔒✨ etc.) — **including empty-states, placeholders, fallbacks, and "no preview" cells**, which
is exactly where they hide.
- **Never** put an emoji in UI text — buttons, labels, hints, card titles, toasts, **placeholders/empty
  states**. Use plain words, or the existing **SVG icon/glyph system** (e.g. `PhotoGlyph`, the `*Icon`
  components) for a visual.
- A control must look like the control it is: a real button style (`s.toolbarBtn` / bg + padding), not
  an emoji standing in for one.
- Plain typographic glyphs used as functional controls (the `✕` close, `✓` saved tick, `★` rating) are
  acceptable — the ban is on **pictographic emoji**, not every non-ASCII char.
- When you add ANY placeholder/empty-state, reach for a muted `*Glyph`/text — never an emoji.
(Cautionary tales: "✨ Create automatic cluster" → plain "Create cluster"; the 🎂 order-preview
placeholder → plain "No preview" / `PhotoGlyph`.)

## 8. Cake radius/size is NEVER fixed — geometry scales, never hardcode a world dimension
The cake is not one size. Multiple tier sizes exist today and more sizes will be authored in future,
so **the wall radius, height, and every derived world dimension are VARIABLES read at render time —
never constants you may assume.** Any quantity that must sit correctly on the wall (a lift/relief
height, an offset, a bevel, a curve radius, a gap) MUST be expressed **relative to the actual cake
dimension** it rides on — a **dimensionless fraction of the live `surfaceR`/`radius`/`height`** —
and multiplied by that live value at render. NEVER:
- hardcode a world-space length tuned for one cake size (e.g. `lift = 0.07` because "the tier is ~1.2");
- scale between two frames by a ratio of two fixed radii (e.g. `coreR / 1.2`) — both numbers are
  assumptions that break the moment a new cake size ships;
- carry an **absolute** value authored in one tool's coordinate frame (e.g. the Relief Studio's
  `TIER_R = 1.2`) straight into a differently-scaled cake — re-express it as a fraction of that
  tool's radius, and let each renderer multiply by ITS OWN live radius.
Reason: a value that looks right on today's cake pokes off the silhouette / floats / clips the instant
the same element is placed on a bigger or smaller tier. Model the fraction, apply the live radius.
(Lesson: the ported relief `lift` was an absolute `0.07` from the studio's 1.2-radius tier; on the
smaller designer cake `0.07 / R` was ~2.7× too tall and the sticker floated off the wall at the
tangent. Fixed by treating lift as a fraction of the live wall radius.)

### 8a. Geometry built in LOCAL space must be pre-divided by the group's scale
A sticker's mesh is built in local space and then rendered inside `<group scale={effScale}>`. So **every
world-space target a local geometry must hit has to be divided by that scale when the geometry is built**
— otherwise the group silently multiplies it. If a decal must curve at the live wall radius `surfaceR`,
build it at local radius `surfaceR / effScale` (this is what the GLB `bendRadius` has always done). The
same applies to `displacementScale`, which THREE applies along the object-space normal *before* the model
matrix: `worldLift = displacementScale × effScale`, so a world lift of `L` needs `displacementScale = L / effScale`.
NEVER clamp or cap a local-space radius against a world-space constant (the old `Math.min(curveRadius, 0.3)`):
the cap is in the wrong coordinate frame, and the error grows with the element's scale.
(Lesson: a 3× relief sticker's decal was built at local radius `0.3` → world curve radius `0.9` pressed
against a `0.445` wall — a far flatter arc than the wall, so its edges bowed **0.089 world units off the
cake** at the silhouette tangent and you saw the board through the gap. This was a base-geometry bug
affecting FLAT decals too; relief only made it visible. Three successive displacement-magnitude "fixes"
failed because the displacement was never the cause. Verify curved decals at **scale 3, at the tangent** —
scale 1 tucks the edges slightly *inward* and hides the bug.)

## Definition of Done (run through this before saying "done")
- [ ] No new `=== '<slug>'` / type branch in render or popup code (config instead).
- [ ] No hardcoded world dimension that assumes a fixed cake radius/size — value is a fraction of the
      live `surfaceR`/`radius`/`height` (#8).
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
