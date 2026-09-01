# Cake Designer — Invariants

Read this before changing element placement, rendering, or the right‑side popups.
These rules exist because they were each violated and cost painful rework. Keep them true.

> **Scope:** the CROSS-CUTTING principles here — **DRY / reuse-scan (#3), config-driven not
> type-branching (#1/#6), no pictographic emoji (#7), mobile-compatible UI (#9), and
> verify-in-the-real-app** — are
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

### 2b. ONE renderer for the whole cake, not just for decor
`CakeContent` draws **everything a design contains** — the board, tiers and their finishes, grass,
letter blocks, writing, cream strokes, text, ages, decorations. Every surface that shows a cake renders
THAT: the live editor (`CakeScene`), the off-screen capture behind template thumbnails and order
snapshots (`CakeThumbnailScene`), and the inline previews (`CakePreview`). Its `edit` prop carries the
whole interactive surface and is optional — absent, everything renders static — so no element renderer
needs to know which surface it is on.

The line is cake vs. not-cake, and it is drawn twice. Editing FURNITURE (drag handles, catchers, style
pickers, the FRONT marker) and the ROOM (floor plane, studio background) both stay in `CakeScene`,
which is why neither is ever photographed. The BOARD is cake: no cake stands on its own, every real
cake photograph has one, and it is what board-level finishes are placed against.

A new element type is added HERE, once. `canvas/cakeContent.test.js` fails if a field
`toCanvasConfig` puts on a design is read by nobody.

Cautionary tale: the capture used to be a second, hand-copied scene, and it silently skipped every
element type added after it was written — grass, letter blocks, second-cream layers, 3D text. A
football template was saved with a grass top and its thumbnail came back bald, and nothing anywhere
reported a failure. **A cake that is drawn twice will eventually be two different cakes.**

## 3. Reuse the shared components — do not reimplement
- `PreviewTile` — preview + corner checkbox + label. Used by the piping popup AND the placement chooser.
- `SizeDial` — the ONE size control (piping, hero chooser, scatter card). No parallel sliders.
- `ColorWheel` — the ONE colour control. **Every** colour a customer picks goes through it: tiers,
  piping, cream pen, writing, decorations, grass, letter blocks. Round chips at 32px inside a 44px
  tap area, a gradient picker, and `cakeColors` — the colours already on THIS cake, so a name can be
  matched to a border without eyedropping it. Never a row of hand-rolled swatches and never a native
  `<input type="color">`: both are a second answer to a question this already answers, and they look
  like one. Cautionary tale: the letter-blocks card shipped with square swatches + a native picker
  and was spotted in a screenshot within the hour.
- `PlacementChooser` — per‑(tier×surface) slot tiles with add/remove + per‑slot Size/Tilt.
- `cleanGlbScene`, `previewCake.jsx` (`buildPreviewTiers`, `PreviewCakeMeshes`).

When asked to do something "like the piping popup," **open the piping code and reuse it** — never
approximate from memory or build a parallel version.

### 3b. Nothing a customer places may PENETRATE what is already there
A cake is built in layers, and anything added later has to make room for what is already on it. There
is ONE rule for this and it is not per-element:

- `resolveSidePipingBands({ topPipings, bottomPipings, topY, yBase, height, radius })` — a tier's
  stacked piping as absolute bands, each with its outward reach (`out`) off the wall.
- `sidePipingClearance({ bands, yBottom, yTop })` — how far out something spanning that vertical
  range must sit to clear every band it overlaps. Zero when it overlaps none.

Pass the NEW object's own vertical span and add the answer to its seat — a tall thing overlaps a
border a short one passes under. A proud side decoration has done this since the helper was written;
letter blocks and board grass do it now. **A new placed element that can collide is not finished
until it asks this question** — and the answer comes from here, never from a fresh copy of the maths.
Cautionary tale: letter blocks shipped without it and drove straight through a bottom border on the
first cake that had one; board grass had the identical hole and nobody had hit it yet.

Clamp where the value is WRITTEN, not where it is drawn. Clamping only the render leaves a placed
thing's stored position disagreeing with its picture — its drag handle sits inside the border while
the thing itself stands outside.

**Some elements will legitimately want to penetrate** (a sauce, a topper that sinks in). When that
day comes it is a CONFIG flag on the element, read by the caller before it asks for clearance — never
a branch on element type (#1), and never a second seating path. Until then the rule is universal.

**Known gap: the TOP surface.** These helpers answer a RADIAL question — how far off the wall. A
decoration on a tier's top colliding with its rim ring is a different question (an inward limit on
the footprint, akin to `topClampInset`) and nothing asks it yet. Anything placed on a top surface can
still meet a rim border.

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

## 9. Every UI works on a phone — a baker's screen is a phone
**PROJECT-WIDE** (like #1/#3/#6/#7). A baker reads a new enquiry standing in a kitchen, on the
handset in their apron. Anything that only works at desktop width is broken for the person it was
built for.

Two separate failures, and the second is the one that keeps happening:

**WIDTH.** A hardcoded pixel width overflows a narrow screen. The fix is already in this codebase —
`SessionPanel.jsx` pairs `width: 300` with `maxWidth: 'calc(100% - 24px)'`. Copy that, do not invent
a second way.

**ANCHORING — the subtle one.** A panel positioned *relative to a control* is only on-screen if that
control is where you assumed. The notification bell sits top-RIGHT on desktop and near the LEFT of
the header on mobile; a 320px panel anchored `right: 0` to it therefore hung off the left edge of the
phone — and an overflowing panel does not scroll into view, **it clips**. A baker read "sand" where a
customer's name should have been. No width guard would have caught it, because the width was fine and
the position was not.

- A control whose placement DIFFERS by breakpoint cannot have a fixed anchor. Pin the panel to the
  VIEWPORT on narrow (`position: fixed`, `left`/`right` insets setting the width) and keep the
  anchored dropdown on wide.
- Tap targets are fingers, not cursors: ~40px minimum, and never rely on hover to reveal an action.
- Long content — customer names, cake titles, flavour lists — must wrap or ellipsis, never widen its
  container.

**Detecting narrow, safely.** `settings/controls.jsx` exports a `useIsMobile` that reads
`window.innerWidth` in its `useState` initialiser. It throws on the server and under
`renderToStaticMarkup`, so it is unusable in any component that is server-rendered or has a render
test. In those, start `false` and correct in an effect — a one-frame desktop layout on a phone is
invisible; a crash is not. (Worth fixing at the source; until then, know which you are importing.)

**No gate protects this**, and that is not an oversight: the width half is checkable and the
anchoring half is not, so a gate would pass the exact bug that caused this rule to exist. Check it by
looking — see Verification.

## 11. A control and what it changes must be VISIBLE AT THE SAME TIME — RULE IS ON
**PROJECT-WIDE** (like #1/#3/#6/#7/#9). This is the single most repeated correction in this project.
It has been raised on the photo editor, on the garnish studio twice, and on the X-ray build guide,
each time as a fresh bug and each time it was the same rule. Writing it down is the fix; the
individual repairs were not.

**The rule.** If moving a control changes something on screen, the person must be able to see BOTH
without scrolling, without switching tabs, and without remembering what the other one looked like.
Anything else asks them to hold a picture in their head and compare it to the screen, which is
exactly the thing a screen is for.

⚠️ **"It is on the page" is not the same as "it can be seen".** Every one of these shipped, and every
one was reported:

| What was built | What it did to the person using it |
|---|---|
| Brightness sliders below the photo | Drag, scroll up, look, scroll down. The control and its effect were never both in view. |
| Fill options at the bottom of the studio column, past the library and the name field | A baker had no reason to believe the feature existed at all. |
| The step caption UNDER the animation it describes | You can watch the drawing or read the words. Not both — which is the whole point of a narrated guide. |
| Colour picker open by default, taking the top third of the column | It pushed the control the studio exists for below the fold. |

**What to do instead**, in order of preference:

1. **Side by side** — control beside effect. The default for anything wide enough.
2. **Effect first, then control** — put the words ABOVE the picture they describe, and the picture
   above the settings that change it. Reading order is top-down; the thing being explained should
   arrive before the explanation of how to change it.
3. **Tabs or an accordion** — only when 1 and 2 genuinely do not fit. Tabs mean one thing is always
   hidden, so they are a last resort and never the first idea.

⚠️ **Text that narrates a moving thing goes BESIDE it or BEFORE it, never after.** Below, the reader
has to look down, look back, and by then the motion has moved on.

**No gate protects this** and one could not: whether two things are visible together depends on
viewport, content length and what the person is doing. Check it by **looking at the real screen at
phone width**, which is what Verification already says and what would have caught every row above.

## 12. Layout follows USE, not the order the code was written — RULE IS ON
**PROJECT-WIDE.** A settings column tends to end up in the order its features were built, which is a
record of our history and nothing to do with the job in front of the person using it.

**Order the surface by how often a control is touched, and put related ones together.** In the
garnish studio the true order is: draw → pick a shape → fill it → colour it → say where it goes →
name it. It shipped as: colour → how it is made → shapes → thickness → where it goes → library →
name → **fill**. Fill is why the studio exists and it was last, because it was built last.

Three questions to ask before laying anything out:

- **How often is this touched?** Constantly while working (fill, undo) beats once at the end
  (placement, naming). Frequent goes higher and nearer the work.
- **Where are the hands already?** Undo belongs ON the drawing, not below it — it is reached for the
  instant a stroke goes wrong. A control that acts on something should sit next to that thing.
- **What is set once and left?** Colour, name, placement. These can collapse, and a collapsed control
  that shows its current value costs one line instead of a third of the column.

⚠️ **A label must name what the control acts on.** "Fill the last shape" kept its name for weeks after
it had started acting on the PICKED shape — so it described behaviour that no longer existed, and
anyone who had just picked a shape had every reason to distrust it.

## 13. Unsaved work is never dismissed by an accident — RULE IS ON
**PROJECT-WIDE.** A backdrop click and Esc are for a panel somebody opened and does not want. They are
NOT for a panel holding work: a stray click outside the garnish studio threw away a drawing that had
taken five minutes, with no undo and no warning.

⚠️ **THIS KEEPS HAPPENING, AND THE MECHANISM ALREADY EXISTS.** `Panel` takes `guardUnsaved` — pass it
and Esc and the backdrop are ignored while it is true. Every occurrence of this bug has been a panel
that simply never passed it. The fix is never new code; it is remembering that the panel has state.

**The rule.** Any surface that can hold work the person has not committed — a drawing, a form part-
filled, an upload mid-flight — passes `guardUnsaved` with the condition that says work exists
(`strokeCount > 0`, `isDirty`, `text.trim()`). ⚠️ **The deliberate exits must stay one press away:** ✕
and Cancel still close, because guarding everything is how people learn to fear the panel.

⚠️ **"They can just redo it" is not an answer.** The work being small to rebuild is exactly why nobody
warned them; the cost is the surprise, and the lesson they take is to distrust the tool.

**No gate protects this** — whether a panel holds work is a question about meaning, not syntax. Ask it
of every panel you add, and check it by opening yours and clicking the backdrop mid-task.

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

## 10. A dragged decoration signs the movable contract — RULE IS ON, gated by `check:movable`

Four decorations are dragged on the cake: the rainbow, the cloud, the number topper and cream
writing. In one week the first two broke six different ways, and **every one was found by the person
using it**:

* the cloud moved on ONE axis — the renderer skipped the yaw its selection box applied
* the cloud SHRANK as it was dragged toward the rim
* the rainbow's border turned about its own centre while the arch turns about the cake's axis, so at
  any yaw the box was not where the rainbow was
* the rainbow's drag was DEAD over the middle 71% of the cake top, then threw it backwards
* the cloud could not be grabbed at all — nothing took the pointer but the cake
* three grab planes were single-sided, so they stopped being targets once the cake turned

None of those is exotic. They are four mistakes, repeated. So they get asked mechanically.

**1. One place says where it is.** The renderer, the selection box and the drag all read the same
answer. Never two implementations of one transform — that is what detached both the cloud and the
rainbow from their own borders.

**2. Every pointer position moves it.** No dead patch, no discontinuity. A drag that SOLVES for its
parameters can have no answer over part of its domain, which is exactly how the rainbow lost 71% of
the cake top. If a freedom does not move the thing, it is not a freedom — do not offer it.

**3. A drag moves; it never resizes or reshapes.** Position and size are separate, and neither one
moves the other. There is a size control; that is what a size control is for.

**4. What you can grab is what you can see, from every angle.** A grab target at least as big as the
selection border, and `side={THREE.DoubleSide}` — a plane's default `FrontSide` is not hit from
behind, and the decoration silently stops being a target with nothing on screen to explain why.

**5. `handleAt` and `dragTo` are exact inverses** on the freedoms that exist.

### How it is enforced

* **`movableContract(name, spec)`** in `src/designer/geometry/movableContract.js` — one shared suite
  that asks laws 2, 3 and 5 of a registration. All four decorations are registered.
* **`npm run check:movable`** — reads `PROCEDURAL_TOOLS` out of `CakeDesigner` and fails if a
  dragged tool has no registration, so a new one cannot ship without signing. It also greps for law
  1's and law 4's two smells: a `SelectionBox` group carrying its own `rotation=`, and an invisible
  grab plane or circle without `DoubleSide`.

**Law 1 is not fully enforced**, and the guard says so. Doing it structurally means geometry
returning world-space points with nothing downstream free to add a transform. `rainbowBands` still
returns the arch in its own frame and `RainbowArch` spins it — `rainbowPlacedPoints` is the one
shared answer for everything except the renderer, which leaves exactly one copy left to remove.

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
- [ ] **Checked at PHONE width**, not just desktop — no clipped panel, no overflow, no anchor that
      assumes a control's desktop position (#9). A baker's screen is a phone.
- [ ] **Verified visually** in the real app, not by reading code — see below.

## Verification
The designer is WebGL; reading code is not enough — confirm changes by looking at the rendered
result. Drive the real app with Playwright + Chromium against `npm run dev`
(http://localhost:5173, behind login): log in once and persist `storageState`, then place each
element type on each surface, screenshot, and inspect. Use `waitUntil:'domcontentloaded'` (the HMR
socket never goes idle).

## Quality gates
`npm run verify` runs all of these; the commit hook runs it. (This section used to read "none exist
yet — spattoo-core has no CI/lint/test setup". That stopped being true and the doc did not notice,
which is the failure mode this file exists to prevent.)
- `check:paths` — element-type/slug literals in render/popup code (#1/#2).
- `check:fonts` — no third-party font CDN; every `<Text>` names its font.
- `check:cors` — every `crossOrigin` image load goes through `corsUrl()`.
- `check:hooks` — no hook below an early return (React #310, shipped twice from one file).
- `check:dup` — jscpd over every module directory. **Add a new directory here when you create one**,
  or the one thing it is for — a second copy appearing unnoticed — is exactly what it will miss.
- `npm test` — vitest, including render tests. A scope error in JSX is valid JavaScript: it survives
  the build and every other gate, and only appears when something RENDERS the component.

Not gated, and deliberately: **#9 (mobile)**. The width half is checkable, the anchoring half is not,
and a gate that passed the bug which prompted the rule would be worse than none.
- Playwright visual‑regression — per element × placement, diffed against baselines.
