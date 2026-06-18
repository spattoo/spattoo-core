# Design note — Instanced rendering for scatter decor

Status: **deferred / banked.** Build only when measured need appears (see Trigger). This note
captures the scope so it's ready to execute, not a commitment to build now.

## Context

Scatter decor (`placement_config.scatter === true` — sprinkles, pearls, balls) drops many
instances of one element on a surface. Each instance is a full sticker record in `design.stickers`
and is drawn by its own interactive component (`DraggableTopSticker` / `DraggableSideSticker`,
`canvas/CakeCanvas.jsx:509` / `:1095`). Each instance also clones the GLB scene **and its geometry**
per record (`CakeCanvas.jsx:347–357`), so N instances = N geometries + N draw calls.

This came up while wiring "Gold sprinkles." A recurring instinct is "use procedural geometry for
scatter because it's lighter than a GLB." That conflates two costs:

- **File size** (GLB download): a primitive GLB is a few KB, fetched **once**, cached by URL
  (`useGLTF`). It does **not** scale with instance count.
- **Per-instance runtime cost** (scales with count): identical whether the source is a GLB or a
  `THREE.SphereGeometry` — once in memory it's just THREE geometry. The levers are **poly count**
  and **draw calls**, both format-independent.

Decision already taken: author shapes as geometry and **bake to a low-poly GLB at creation**
(`spattoo-admin` GenerateShape does this; a "Can scatter" toggle was added there). That keeps the
simple authoring workflow and reuses the one art-based render path with zero new branches. We do
**not** add a live procedural-geometry render path (that's what `faux_balls` is, and it rotted into
a top-only, non-scatterable, preview-less special case — the cautionary tale).

The real performance lever for high scatter counts is **`InstancedMesh`**: collapse N draw calls +
N geometries to ~1, with per-instance transform and colour preserved. That is this note.

## What instancing keeps vs shares

`InstancedMesh` = one geometry + one material uploaded once, drawn N times in a single draw call.
Instances are **not** identical clones — there are N addressable slots.

- **Per-instance (kept):** transform (`setMatrixAt`) → position/rotation/scale; colour
  (`setColorAt` / `instanceColor`); selection/drag/delete via the raycast `instanceId`.
- **Shared (the boundary):** the geometry itself, and material properties **other than colour**
  (roughness, metalness, maps). Varying those per instance means one InstancedMesh per variant.
- **Not possible:** different geometry per instance.

For scatter this is a clean fit — every instance is the same element, varying only
position/rotation/scale/(optional colour). We lose nothing scatter actually uses.

## Approach: change rendering, not the data model

Keep **one sticker record per instance** in `design.stickers`. Only change how a *group* of them is
drawn — from N components to one `InstancedMesh` reading those records. This leaves all of
`CakeDesigner.jsx` untouched: `placeScatter`, `scatterInstances`, `setScatterDensity`,
`scaleStickers`, `removeSticker`, `toggleScatterSurface`, and the scatter card (`renderScatterBody`)
keep mutating records; the renderer just reads them.

## What changes (file-by-file)

1. **New `InstancedScatter` component** (`canvas/CakeCanvas.jsx`) — the bulk.
   - Group a scatter element's instances by `(elementId, zone, tierIndex)`.
   - Build a per-instance matrix from each record's seat: **top** = `x/z` (+ `yOffset`, scale);
     **side** = `position + yaw` from `theta` (GLB side stickers are yaw-oriented, **not**
     geometry-bent — confirmed `CakeCanvas.jsx:1745` — so they instance cleanly, no per-instance
     deformation).
   - Multi-mesh GLBs: one `InstancedMesh` **per sub-mesh/material**, all sharing the same matrices.
     Single-mesh art (sphere/sprinkle) is trivial; complex art is a bounded loop.

2. **Selection / drag / delete via `instanceId`** — the fiddly part.
   - Raycast returns the slot index → map `instanceId → sticker.id`.
   - Reuse the existing drag math (`planeHit`, clamp, collision) from the Draggable components
     **once** for the group instead of per-instance. Rebind long-press, orbit-enable, and the
     selection outline to the hit index.
   - Delete = remove record `i` and compact the matrix buffer.

3. **Colour** — drive the `instanceColor` buffer; the card's shared colour sets all slots.
   Per-instance colour is then free if ever wanted.

4. **Read-only sticker map** (`CakeCanvas.jsx:1727`, the non-interactive render used by
   preview/export) — also instanced. Easier: no handlers.

## Risk / tricky bits

- `instanceId ↔ sticker.id` plumbing for click/drag/long-press/selection parity with today.
- Multi-sub-mesh GLB decomposition (bounded, not hard).
- **INVARIANTS #2 (one renderer for every placed element):** an instanced path is a *second*
  render path for placed decor. Acceptable only because it's keyed by the `scatter` flag /
  placement mode (config-driven, not element type), and must stay behavior-consistent with the
  generic path. This is the standing maintenance cost — weigh it before building.

Non-goals: a live procedural-geometry renderer; per-instance material variation beyond colour;
changing the scatter data model or the admin authoring flow.

## Effort

- **Single-mesh scatter art** (sprinkles/pearls/balls), full select/drag/delete/colour parity:
  ~**1 focused day**.
- **Arbitrary multi-mesh scatter elements** + read-only/preview/template renders + de-overlap
  parity: ~**2 days** (mostly sub-mesh decomposition and pixel-parity on drag/selection).

## Trigger (when to build)

Today scatter defaults to **12** instances (cap ~400, `scatterMaxCount`). At 12–50, no GPU janks —
instancing would be premature and adds a second render path to maintain. Build when a real design
pushes ~**150–400** instances and shows frame drops. At that point the win (N draw calls → ~1) is
large and helps **every** scatter element, not just primitives.

## Anchors (verified)

- Interactive sticker render map: `canvas/CakeCanvas.jsx:1573`; read-only map: `:1727`.
- Per-instance scene + geometry clone: `canvas/CakeCanvas.jsx:347–357`.
- GLB side stickers yaw-oriented, not curved: `canvas/CakeCanvas.jsx:1745`.
- Scatter data flow (`CakeDesigner.jsx`): `placeScatter`, `scatterInstances`, `setScatterDensity`,
  `toggleScatterSurface`, `renderScatterBody`; instance `scatter` flag set in
  `hooks/useCakeDesign.js` `addSticker` (`placement_config.scatter === true`).
