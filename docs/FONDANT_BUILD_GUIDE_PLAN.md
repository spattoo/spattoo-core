# spattoo — Fondant Build Guide Plan

> Status: **planned / discussion** (drafted 2026-06-26). Living doc. An extension of the **X-Ray**
> order-help feature (`src/orders/xray/`), built on the **same craft-guide rail** that already serves
> piping-nozzle recommendations.

---

## 0. The idea in one paragraph

For a modelled figure (a fondant unicorn topper, a gumpaste flower, a modelling-chocolate character),
a baker needs a **step-by-step build guide** — materials, parts, ordered steps with tools, tips, and a
colour guide — exactly like the kind of how-to sheet you can ask ChatGPT to produce from a photo. We
want one of these for **every fondant element**, generated with GPT, stored in the DB as **master
data**, and surfaced inside the **X-Ray report** in order details. The guide is a **parametric
template**: the technique is invariant (authored once per element), and the variable bits — colours
today, names/sizes later — are **bound to the actual order at view time**. One guide serves infinite
colour variants.

---

## 1. Why this sits on the existing X-Ray rail (not a new system)

The X-Ray report already does exactly this shape for piping. `XrayReport.jsx` calls
`apiClient.fetchCraftGuides(elementIds)` → a DB table keyed by `element_id` → renders per-element
guidance (nozzle recs, cream consistency, technique). A fondant build guide is **a second guide type
on the same table**, not a new mechanism. We reuse:

- the **sidecar `element_craft_guides` table** (keyed by `element_id`),
- the **`fetchCraftGuides` fetch** the report already performs,
- the **per-element card rendering** pattern.

What's new: a `guide_type` discriminator, a structured `guide` JSON payload, a harvest path that
collects placed **figure** elements (today harvest only collects piping), and one new render section.

---

## 2. The two questions this plan answers

1. **How do we generate, store, and surface the guide?** → GPT generates it **once per element** as
   master data; stored as **structured JSON + R2 image keys**; surfaced read-only in X-Ray. (§4–§6)
2. **How do we know an element is a fondant figure?** → an explicit, author-set **`medium`** attribute
   on the element — never inferred from element type or slug. (§3)

---

## 3. Identifying a fondant figure — `cake_elements.medium`

Today nothing marks an element as a fondant figure. We must **not** infer it from element type or slug
(that's the anti-pattern `INVARIANTS.md` warns against — "fondant" is orthogonal to placement; a topper
can be fondant *or* edible-print). Instead, add an explicit author-set attribute:

```
cake_elements.medium  enum:
  'fondant' | 'gumpaste' | 'modelling_chocolate' | 'edible_print'
  | 'isomalt' | 'buttercream' | 'other'
```

Identification then splits into two clean, config-driven layers:

- **Eligibility** (does it *warrant* a build guide?): `medium ∈ {fondant, gumpaste,
  modelling_chocolate}` → admin offers "Generate build guide".
- **Presence** (does X-Ray *show* one?): the element has an `element_craft_guides` row with
  `guide_type = 'fondant_figure'`. **X-Ray keys off the guide's existence, never off `medium` or
  slug** — exactly how it keys off nozzle rows today.

This future-proofs the report: chocolate-work guides, isomalt, etc. become more `guide_type`s later
with no new plumbing.

---

## 4. Storage — `element_craft_guides` extension

The guide is **structured JSON**, not a markdown blob and not the GPT poster PNG. The PNG ChatGPT
produces is a *rendering* of structured data; we store the **data** and render the layout ourselves
(consistent styling, editable, localizable, parametric).

```
element_craft_guides
  element_id        fk  (existing)
  guide_type        'piping_nozzle' | 'fondant_figure'   ← discriminator (NEW)
  guide             jsonb                                 ← structured guide (NEW)
  source_image_url  text   -- what GPT saw (provenance)
  model             text   -- e.g. gpt-4o / image model id
  prompt_version    int    -- so we can backfill / regenerate on prompt changes
  status            'draft' | 'approved'   -- human-in-the-loop gate
  generated_at, updated_at
  -- existing nozzle_recs / consistency / technique remain for guide_type='piping_nozzle'
```

### 4a. The `guide` JSON shape (parametric template)

Steps reference **role tokens** (`{body}`, `{mane}`), **never literal colours**. Roles are the
element's recolourable groups (§5).

```json
{
  "title": "3D Fondant Unicorn",
  "roles": ["body", "mane", "inner_ear", "eye_ring", "eyelashes"],
  "materials": [
    { "role": "body", "label": "White fondant (head)" },
    { "role": "mane", "label": "Rainbow fondant (mane)" },
    { "role": "inner_ear", "label": "Pink fondant (inner ear & blush)" }
  ],
  "parts": [
    { "name": "Ear", "note": "outer {body}, inner {inner_ear}" },
    { "name": "Forelock", "note": "mane on forehead" }
  ],
  "steps": [
    { "n": 1, "title": "Make the Head",
      "instructions": ["Roll {body} fondant and shape into a unicorn head with an elongated muzzle"],
      "tools": ["Rolling Pin", "Ball Tool"],
      "image_key": null },
    { "n": 10, "title": "Build the Mane",
      "instructions": ["Roll ropes of {mane} fondant; alternate and overlap from behind the ear"],
      "tools": ["Brush (Water)"],
      "image_key": null }
  ],
  "tips": ["Use a little cornstarch while rolling to avoid sticking", "If fondant cracks, smooth with water"],
  "set_time": "2–4 hours",
  "poster_key": null
}
```

- `image_key` (per step) and `poster_key` (whole-sheet) are **R2 keys**, never inline image bytes.
- For non-GLB elements that have no groups yet, `roles` may be a single implicit role; the template
  still works.

### 4b. Images are R2 files — never base64 in the row

Even with images, they **must not** live inside the JSON as base64. A row with ~16 base64 images is
huge, re-downloaded in full on every `fetchCraftGuides` call, and can't be CDN-cached — a direct
violation of the scale principle, and inconsistent with every other asset (element files, thumbnails
are R2 keys). Images go to R2, e.g.:

```
craft-guides/<element_id>/poster.png
craft-guides/<element_id>/step-3.png
```

…and the JSON holds the key. Adding images later needs **no schema change** because the fields
already exist.

---

## 5. Parametric binding — one template, every colour variant

**The core design decision.** The technique is invariant; the colours come from the order. We separate:

1. **Template** (per element, generated once) — steps use `{role}` tokens.
2. **Binding** (per order, at X-Ray view time) — map each role → the customer's actual colour from
   `design_snapshot`, then substitute. "Roll `{body}` fondant" → "Roll **pink** fondant."

### 5a. Roles ARE the element's recolourable groups — reuse, don't invent

A recolourable GLB already carries named editable groups — `_model.groups` (the **GLB Recompose**
work) — and the customer recolours **per group**. The guide's `roles` **must be those same group
names**, not a parallel list. When the customer recolours group `mane` → pink, step "build the
`{mane}`" renders pink automatically, with zero extra mapping. We bind to the naming the recolour UI
already uses.

This also **constrains GPT**: we prompt it with the element's group/part names and force structured
output that references those tokens — it cannot invent colours, it must reference roles. Same
discipline as a typed tool definition.

For non-GLB elements (2D stickers, decor_pattern parts), fall back to declared parts using the same
`{role}` mechanism.

### 5b. The colour-guide section is per-order

The rendered colour guide shows **this order's** swatches per role (from the snapshot), not the
canonical authoring colours.

---

## 6. Images — the one thing that must stay parametric

A modelling guide is inherently visual; text-only is a reference sheet, not a guide. But a **baked
raster cannot recolour**, so it can't follow the role binding. Two ways to keep visuals parametric,
in priority order:

1. **Role-keyed SVG step diagrams (best).** Each shape's `fill` is tied to a role; we swap fills per
   order, so the picture turns pink with the text. Fully parametric, tiny files. GPT can draft simpler
   ones; complex figures we template or curate.
2. **Canonical raster + parametric swatch (pragmatic fallback).** The image shows the *shape /
   technique* in the element's reference colours, but each step also shows the **bound colour swatch**
   ("use this →") and the text names the real colour. Baker gets shape from the picture, colour from
   the text/swatch.

**Never colour-bake into a flat image** — that's the single thing the order needs to override.

### 6a. Consistency across step images

The trick the ChatGPT poster used: it generated the **whole multi-panel sheet in one image**, so every
panel shows the same figure. Reproduce that, seeded from the element's **own render** (we already have
the thumbnail / source image, so identity matches what the customer ordered):

- **One-shot poster (v1 with images).** One image-gen call → a multi-panel build sheet, internally
  consistent, cheap (1 call/element). We render our structured **text** from JSON; the poster carries
  the **pictures** (AI text-in-image is unreliable). Stored as a single `poster_key`.
- **Progressive edit chain (v2).** Each step image = an edit of the previous + "add next part",
  seeded from the element render. True per-step photo, keeps identity, but ~N calls and more fragile.

### 6b. Per-step regenerate + real-photo override

Admin can **regenerate a single step** or **upload a real photo** to replace any generated image.
Over time the best elements accumulate real baker photos — the most accurate possible — with **zero
schema change**, because the field is already an R2 key.

---

## 7. Generation flow — once per element, human-reviewed

**Generate once per element, never per order.** The same unicorn appears across hundreds of orders;
per-order generation would be slow, costly, non-deterministic (every baker sees different steps), and
un-reviewable. Generate once → store → X-Ray reads it (exactly how `fetchCraftGuides` works today).

This is also the CLAUDE.md rule: **admin authors master data into the DB via an API route**; the GPT
call runs **server-side in `spattoo-api`** (where `OPENAI_API_KEY` already lives), never in the
browser.

### 7a. Why the review gate is what makes images safe

The accuracy concern with AI guides is real **only for per-order, on-the-fly** generation. Because this
is **generate-once-per-element + admin review before it goes live**, a human approves / regenerates /
swaps in a real photo *before any baker sees it*. The `status` field is the quality control — not
avoiding images.

### 7b. The pipeline

1. Admin opens a fondant element (`medium ∈ modelled set`) → **Generate build guide**.
2. Server (`spattoo-api`): GPT-4o **vision** on the element's reference image + its known group/part
   names → **structured-output JSON** (roles, materials, parts, steps, tools, tips, set_time).
3. Server: image model (seeded by the element render) → **one-shot poster** → R2 → `poster_key`.
4. Admin **previews → edits → Approve** (`status: draft → approved`). Can regenerate a step or upload
   a real photo.
5. X-Ray fetches the row, **binds roles → order colours**, renders text + images.

---

## 8. Surfacing in X-Ray (core)

Two core changes, both small and config-driven (no element-type/slug branching):

1. **`harvest.js`** — add a path that collects placed **figure** element IDs (stickers / toppers /
   decorations) for craft-guide lookup. Today harvest only collects piping (`harvestPiping`) and
   colours (`harvestColors`). New: `harvestFigures(design)` → `{ elements, elementIds }`, where each
   element also carries its **per-role colour binding** read from the snapshot.
2. **`XrayReport.jsx`** — add a **"Fondant figures — how to make"** section that renders each guide:
   the bound steps (tokens substituted), tools, tips, colour guide, and the poster/step images. Drafts
   show an **"AI draft — unreviewed"** badge; approved guides render plain.

The existing `fetchCraftGuides(elementIds)` already returns rows by `element_id`; it just needs to
include `guide_type='fondant_figure'` rows for the new IDs.

---

## 9. Work split (when we build)

**api (`spattoo-api`)**
- Migrate `element_craft_guides`: `guide_type`, `guide` jsonb, `source_image_url`, `model`,
  `prompt_version`, `status`.
- Add `cake_elements.medium`.
- `POST /api/admin/elements/:id/craft-guide/generate` — server-side GPT-4o vision → JSON schema; image
  gen → R2; write a `draft` row.
- `PATCH /api/admin/elements/:id/craft-guide` — admin edits / approve; per-step regenerate; image
  upload.
- `fetchCraftGuides` returns `fondant_figure` rows alongside `piping_nozzle`.

**admin (`spattoo-admin`)**
- `medium` selector on AddElement / ManageElements.
- "Generate build guide" → preview → edit → Approve UI; per-step regenerate / upload-photo.

**core (`spattoo-core`)**
- `harvest.js`: `harvestFigures` + per-role colour binding from the snapshot.
- `XrayReport.jsx`: "Fondant figures" section; token substitution; draft badge; SVG/raster image
  rendering.

---

## 10. Scale & long-term notes

- **Generate once, cache forever.** Regenerate only on demand (image change, or `prompt_version`
  bump) — never per order render.
- **One template, all colours.** Parametric roles mean we store **one** guide per element regardless
  of how many colour variants customers order — not a raster per colour combo.
- **No base64 in rows.** Images are R2 files referenced by key; rows stay small and the fetch stays
  cheap and cacheable.
- **No type/slug branching.** Eligibility uses `medium`; presence uses the guide row's existence;
  rendering reads the JSON. The report never branches on element type or zone name.
- **Provenance + versioning.** `model` + `prompt_version` let us audit and backfill when the prompt or
  model improves.

---

## 11. Open decisions

- **Generation trigger:** admin-button-with-review (recommended) vs auto-on-create vs one-time
  backfill of existing fondant elements.
- **Draft visibility in X-Ray:** approved-only with drafts badged (recommended) vs approved-only
  (hide drafts) vs show-everything.
- **Image strategy for v1:** one-shot poster (recommended) vs role-keyed SVG from the start vs
  canonical-raster-plus-swatch only.
- **Role source for non-GLB elements:** how parts are declared for 2D stickers / decor_pattern so the
  `{role}` mechanism has tokens to bind.
