# `placement_config` — field reference

Every cake element row has `allowed_zones` (where it can go) and `placement_config` (how it
behaves there). Behavior is **100% data** — render/popup code never branches on element type or
slug, it only reads these fields (see `INVARIANTS.md`). This file lists every key the code reads.

> Values here are persisted to the DB and to saved designs, so **never rename a value**.
> Reference the enums in `constants.js` (`ZONES`, `PLACEMENT_MODES`) by name in code.

> **This is a LIVING document — keep EVERY section current.** §0 (superset sample), §1–§4 (the
> per-key tables), and §5 (full element structure) must all track the code. If you change what the
> code reads or writes, update the matching section(s) in the **same change**. Full rule at the bottom.

---

## 0. Superset sample — every possible key

A single annotated object listing **every** `placement_config` key the code reads, grouped by
concern. **This is a SUPERSET, not a real element** — no element uses all of these, and many groups
are mutually exclusive (a decor sticker, a GLB topper, a `decor_pattern`, and a `cream_piping` ring
each use a different subset). Comments are illustrative; real stored JSON has no comments. Each
section below (§1–§4) is the authoritative detail for its keys.

```jsonc
{
  // ── Zones × modes (§1 <zone>, §2) — one key per surface the element offers ──
  // Value is a mode STRING, or an OBJECT { mode, seat, … } carrying per-zone config (both read via
  // zoneCfg/zoneMode/zoneSeat). `seat` (wall-hug only) = "proud" | "flush"; default scatter?flush:proud.
  "top_surface": "stand",          // stand | hug | perch | verge
  "side":        { "mode": "hug", "seat": "proud" },   // solid piece sits ON the wall; or just "hug" (default proud)
  "middle_tier": "hug",
  "board":       "hug",
  "rim":         "hug",

  // ── Sizing & placement style (§1) ──
  "r":               1.0,                              // default scale for `stand`
  "scale":           { "min": 0.5, "max": 1.5, "step": 0.05 },  // size-dial bounds (optional)
  "single_per_slot": true,                            // hero: one per tier×surface (vs free scatter)
  "scatter":         false,                           // density scatter (sprinkles); excl. single_per_slot
  "scatter_count":   12,                               // scatter: default instances seeded per surface (admin-authored; else 12, capped to fit)
  "cluster":         { "min": 3, "max": 30, "sizes": [1.6, 1.35, 0.85, 0.5], "palette": ["#D4AF37"] },
                                                      // packed faux-ball clump; excl. scatter/single_per_slot
  "hug_fill":        0.7,                             // `hug`: fraction of wall height filled
  "side_proud":      false,                           // side: raised off the wall (deep pieces) vs flush

  // ── GLB facing offset (§1) — read ONLY via facingOffsetRadians() ──
  "rotation":      [0, -90, 0],                       // DEGREES
  "rotation_unit": "deg",                             // 'deg' (standard) | 'rad' (legacy)

  // ── GLB material / surface ──
  "roughness":               0.6,                     // GLB finish: override the baked material (matte ↑)
  "metalness":               0.0,                     // GLB finish: 0 = matte/plastic, ~0.9 = metallic
  "material": "satin",                                // decoration surface finish → resolved from the materials registry (a KEY tag)
  "useSharedFondantTexture": false,                   // opt into the shared fondant surface

  // ── Folded sticker (2D image only, §1) ──
  "foldable": true,                                   // gate: split into two hinged wings
  "fold":     30,                                     // dihedral degrees (only when foldable)
  "spine":    0.5,                                    // body split 0–1 (only when foldable)

  // ── Pixel recolour (2D image only, §1) — needs allowed_actions.color to show the picker ──
  "recolor": { "method": "saturated", "sat": 0.25 },  // OR { "method": "blue_gt_green", "guard": 12 }
                                                      // OR { "method": "opaque" }
                                                      // OR { "method": "hue_regions", "sat": 0.18 }  ← MULTI-colour
                                                      //    auto-detects the image's colours; one swatch each
                                                      // + optional "default": "#F0DEB8" — repaint to this AT LOAD.
                                                      //   Absent (the norm) = the artwork's own colours render;
                                                      //   `recolor` only means the customer MAY change them.

  // ── Print finish (2D image only, §1) — flat AND relief stickers. NORMALLY ABSENT, and absent is CORRECT:
  //    a print renders at exactly 1× its artwork by construction (shared/printExposure.js). These are
  //    OPTIONAL artistic overrides — never a fix for a print that looks wrong (that's a renderer bug).
  // "print_finish": { "gain": 1.0, "saturation": 1.0, "shading": 0.35 },

  // ── Photo-cake frame (2D image only, §1) — image_url is the FRAME overlay (border + transparent window) ──
  "photo": { "mask": "elements/files/2D/heart-frame-mask.png" },  // window silhouette (alpha): the
                                                      // customer's uploaded photo is drawn behind the
                                                      // overlay, clipped to this shape, with zoom/pan

  // ── Editable text placeholders (2D image only, §1) — the customer types {number}/{name} ──
  "text_slots": [                                     // absent/[] = a plain sticker (no text UI at all)
    { "key": "number",                                // {number} — unique within the element
      "label": "Age / number",                        // shown to the customer in the popup
      "kind": "number",                               // "number" (digits only) | "text"
      "default": "2",
      "maxLen": 2,
      "rect": { "x": 0.5, "y": 0.46, "w": 0.28, "h": 0.34, "rot": 0 },   // NORMALIZED 0..1 of the artwork
      "style_key": "scribble_brown",                  // → text_styles row (DB) / TEXT_STYLES seed
      "style_override": { "fill": "#5A3410" } }       // optional one-off tweak of that style
  ],

  // ── Perch (a figure seated on the top edge) ──
  "perch": { "tilt_deg": 0, "y_offset": 0, "edge_inset": 0 },

  // ── Verge (rests on the rim lip, reclines radially OUTWARD over the edge) ──
  "verge": { "seat": "center", "angle_deg": 35, "y_offset": 0, "edge_inset": 0 },

  // ── GLB Recompose — customer-recolourable part groups ──
  "_model": {
    "groups":   [ { "key": "wings", "label": "Wings", "default": "#cc88ff", "editable": true } ],
    "segments": []
  },

  // ── Pattern fields (decor_pattern / piping_pattern, §3) ──
  "pattern_only":    false,                           // building-block part, hidden from the picker
  "parts_deletable": false,                           // decor_pattern: delete singly vs whole-pattern
  "parts": [ { "element_id": "uuid", "dx": 0.1, "dz": 0.0, "mirror": false } ],

  // ── Piping (cream_piping / piping_pattern, §4) — every top_* has a bottom_* twin ──
  "top_arrangement":          "ring",                 // ring | single
  "top_arrangements_allowed": ["ring", "single"],
  "top_single_angle":         0,                      // RADIANS (single mode seed)
  "top_single_max":           12,
  "top_flip":                 false,
  "top_rotation":             [0, 0, 0],              // DEGREES
  "top_radial_offset":        0,
  "top_y_offset":             0,
  "top_spacing":              0,
  "top_softness":             0.7,                    // 0–1 cream look
  "top_alt_enabled":          false,                  // A/B alternation
  "top_alt_glb_url":          null,
  "top_alt_flip":             false,
  "top_alt_rotation":         [0, 0, 0],
  "top_alt_radial_offset":    0,
  "top_alt_y_offset":         0,
  "top_pattern":              "AB",
  "top_bend":                 false,                  // festoon / swag
  "top_bend_ring":            false,
  "top_festoons":             8,
  "top_bend_depth":           0,
  "top_bend_tilt":            0,
  "top_swag_count":           8,                      // swag (alt naming)
  "top_swag_depth":           0,
  "top_swag_tilt":            0,
  "top_wrap":                 false,                  // pre-formed band
  "top_wrap_tilt":            0,
  "top_wrap_size":            1.0,
  "top_drip":                 false,                  // procedural chocolate-drip ring (rim only, no GLB)
  "top_drip_config":          { "count": 22, "width": 0.05, "length": 0.55, "flat": 0.5, "webDepth": 0.16, "archHeight": 0.11, "lipRadius": 0.05, "seed": 1 },
  "top_drip_gloss":           0.85,                   // 0 matte … 1 wet (customer-editable default)
  "top_drip_length":          1,                      // customer Length dial: multiplier on top_drip_config.length
  "top_drip_flood":           false,                  // flood the whole tier top with chocolate (customer toggle)
  // …bottom_* mirrors every top_* above (own defaults), plus two bottom-only flags:
  "bottom_y_adjustable":    false,                    // let the baker tune Y in the popup
  "bottom_flip_adjustable": false
}
```

> Keys present in the sample but not yet in dedicated tables below (`scatter`, `scatter_count`, `side_proud`,
> `useSharedFondantTexture`, `perch`, `verge`, `_model`) are read by
> `addSticker` / the GLB material path (`verge` is summarised in the §2 modes table) — tabulate them
> when next touched.

---

## 1. Common / decor fields

| Key | Type | Default | Meaning |
|---|---|---|---|
| `<zone>` | string **or** object | — | One key per surface the element sits on: `top_surface`, `side`, `middle_tier`, `board`, `rim`. The value is either the **mode** string for that surface (see §2) — `{ "side": "hug" }` — **or** an object carrying per-zone config: `{ "side": { "mode": "hug", "seat": "proud" } }`. Both forms are read through `placement.js` `zoneCfg()` (→ `{ mode, seat, … }`); every consumer uses `zoneMode()`/`zoneSeat()`, never the raw value, so the two forms are interchangeable and future per-zone keys ride on the object. Legacy string configs keep working unchanged. |
| `<zone>.seat` | `"proud"` \| `"flush"` | `scatter ? "flush" : "proud"` | **Wall-hug seat DEPTH** for that zone (ignored by verge/stand/perch, which seat by their own logic). `proud` = a solid body's back sits ON the wall, whole body outside — a 3D piece (bow, topper, cluster ball) never half-buried. `flush` = centred on the wall (back half tucks in) — right for a thin 2D decal, and for **scatter** decor which nestles better tucked in. Default is config-driven off the `scatter` flag; an explicit value overrides it. The seat magnitude is **measured** (half the model's rendered depth, `geometry/seating.js` `seatHalfDepth` — the SAME rule piping uses to sit its shells on the rim). Read via `zoneSeat()` → the instance's `sideProud`; applied in the side bend path (`StickerModel`). No element-type branch. Supersedes the old top-level `side_proud` (still honored, now redundant under the proud default). |
| `single_per_slot` | bool | `false` | Placement **style**, not mode. `true` = one instance per (tier×surface) slot, chosen via the checkbox chooser (topper, top&side decor). `false` = scatter freely (many independent stickers). Read by `isMultiSlotEl` (returns `false` when `cluster` is set). **Must not be inferred from `allowed_zones.length`.** |
| `cluster` | object | `null` | Placement **style** (peer of `scatter`/`single_per_slot`, mutually exclusive). Present = a **packed faux-ball clump**: the element drops as ONE single ball (drag-to-place, no chooser); a per-card **Cluster** toggle grows it into a tangent, non-overlapping clump of mixed-size GLB spheres that clings top→rim→side. Multiple clusters per cake, each its own `clusterId`. Shape: `{ min, max, sizes, palette }` — `min`/`max` = ball-count slider bounds (default 3/30); `sizes` = `[largest, 2nd, 3rd, small]` relative scale multipliers (default `[1.6, 1.35, 0.85, 0.5]`); `palette` = default mix colours (the customer can recolour; default `[default_color ?? '#D4AF37']`). Read by `clusterConfigOf`; packed by `geometry/spherePacking.js`. A cluster ball is always seated **proud** on the side wall regardless of `side_proud`. |
| `r` | number | GLB `2.5` / 2D `1` | Default scale for a freshly placed sticker (`stand`). Never hard-code a scale elsewhere. |
| `hug_fill` | number (0–1) | `0.7` | For `hug` mode: fraction of the tier wall height the element fills. Derived at render time (dynamic hug). |
| `foldable` | bool | `false` | Capability **gate** (like `parts_deletable`). `true` = the flat 2D decal splits at the body spine into two wings that hinge into a shallow V — a folded card (e.g. butterfly). `false`/absent = an ordinary flat plane. The renderer only splits/folds when this is on. Copied to the instance as `foldable`; read by `StickerTexture` via `createFoldedPlane`. |
| `fold` | number (degrees) | `30` | Only read when `foldable`. The dihedral angle between the two wings. `0` = flat. |
| `spine` | number (0–1) | `0.5` | Only read when `foldable`. Where the body centerline splits the image (the hinge). `0.5` = centred; nudge if the asset's body isn't centred. |
| `recolor` | object | `null` | **2D image stickers only.** Pixel-recolour region descriptor — present = the customer **MAY change** the matched pixels' colour (via the SAME ColorWheel as GLB tint; gated to show by `allowed_actions.color`). Absent = the image renders unchanged. **Presence alone does NOT repaint**: a recolourable sticker starts from **its own artwork**, and the matched pixels only move to the instance's `color` once the customer picks one. **`recolor.default`** (hex, optional) is the explicit opt-in to an **at-load repaint** — the sticker is drawn in that colour before the customer touches anything (e.g. `Cream layer`, whose artwork is pink but which ships cream). The element column `default_color` does **NOT** seed a recolourable sticker (it still seeds GLB material tint and the photo-frame border); coupling those two unrelated fields is what made a palm tree render uniformly green — trunk, leaves and flower — the moment someone set a `default_color` on the row. Shape: `{ method, default?, …params }`. Methods (`matcher` in `shared/color/imageRecolor.js`): **`opaque`** (default) = every non-transparent pixel (whole image — solid stickers); **`saturated`** (+ optional `sat`, default `0.25`) = the vivid coloured fill of any hue, leaving black/grey/white lines untouched (for "one colour + black" decals); **`blue_gt_green`** (+ optional `guard`, default `12`) = blue-dominant fill only, excludes gold edges (green > blue) and white highlights. Applied by `recolorImageData`; brightness is preserved so shading survives. **`hue_regions`** (+ optional `sat`, default `0.18`; `maxRegions`, default `5`) = **MULTI-colour**: auto-clusters the image's coloured pixels **by hue** and exposes each dominant colour as its own recolourable region (an orange body + yellow belly → two swatches). This one **reuses the GLB `groupColors` path** — regions are index-keyed groups fed into the same "Customise colours" swatch panel (`useImageRegions` derives them for the UI; `extractRegions`+`recolorRegions` in `imageRecolor.js` do the render). Whites/blacks/near-greys stay untouched; clustering is hue-only, so same-hue/different-lightness areas group together (brown ⊂ orange). Single-region methods above recolour to the instance's one `color`. GLB material tint (`color`/`groupColors`) is a separate path — chosen by asset kind (`isGlb`), never by element type. |
| `relief` | object | `null` | **2D image stickers only — raised fondant cut-out.** Present = the renderer lifts the flat sticker into a **3D relief**: from the image's alpha (silhouette) + luminance it bakes a **displacement map** (macro form — a rounded-bevel shoulder, so no grid "sawtooth", blended slab↔dome) and a **normal map** (form + luminance detail + fondant grain), applied to a **subdivided** mesh (~96×96) via `meshPhysicalMaterial` (real GPU lift + shadow + sheen). Absent = the sticker renders flat. Shape: `{ lift, normalScale, roughness, sheen, envIntensity, toneMapped, solid, solidEdge, solidFinish, solidWallColor, solidColor, bake:{ puff, domeBlur, edgeRound, detail, grain, delit, flipY, flattenThin, flatTop } }` — the top-level keys tune the material/lift per element. **`relief.solid`** (bool, default absent/false) renders the relief as an **extruded SOLID slab** — the alpha silhouette is traced, extruded to `lift` thickness (flat printed front cap + side walls + flat back cap) and bent around the wall (reusing the GLB `bendStickerScene` cylinder math) — INSTEAD of the single displaced shell, so the piece reads solid from a grazing side angle (a real fondant cut-out, not a thin curved surface). The slab uses a two-material array — the printed albedo on the caps, and on the side walls a **wall colour** (see `relief.solidColor`) with an author-chosen surface finish (see `relief.solidFinish`) — and its thickness = `lift × reliefRadius` (the SAME world lift the displaced path raises to, so switching `solid` on/off keeps the height identical). Pairs naturally with `bake.flatTop` (a flat plaque). **`relief.solidEdge`** (0..1 of the slab depth, default `0` = sharp) bevels the front/back rim into a rounded fondant edge (the rounded rim is part of the side/wall group, so it reads in the wall colour; the print stays on the flat front cap). **`relief.solidFinish`** (string, default `fondant`) picks the side-wall **surface finish** — `fondant`, `buttercream`, `chocolate`, `ganache`, `royal_icing`, `hard_sugar` — i.e. the element's material feel (gloss/grain/self-illumination); the finish sets only gloss/grain, never the wall **colour** (see `relief.solidColor`). Presets live in `geometry/solidFinishes.js` (`SOLID_FINISHES`) and are built by the shared `buildSolidWallMaterial` (studio + designer, no drift). **`relief.solidColor`** (hex string, default absent = **auto**) pins the side-wall colour. Absent, the walls **auto-sample the print's dominant hue** off the FINAL albedo (`dominantColorOfImage`, the one shared helper the studio's picker also seeds from) so the cut-out reads as one solid fondant colour matching the front, not plain white. **When `recolor` is set, `solidColor` is IGNORED and the auto-sample always wins** — the customer repaints the print, so the walls must follow the hue they just picked rather than freeze at an authored one (the auto path samples the recoloured albedo, so it tracks for free). That precedence is config-driven off `recolor`'s presence, not an element-type branch; the studio disables the picker there instead of offering a control that wouldn't apply. A greyscale/CORS-tainted image makes the sample `null` → the instance `color`, else a neutral fondant tone. **`relief.solidWallColor`** (`"dominant"` (default) | `"print"`) chooses the wall colour's SOURCE. `dominant` paints all walls ONE flat hue (as above). **`print`** samples the print's colour at each point of the silhouette, so a multi-coloured element reads correctly edge-on — a tree's trunk wall is brown while its leaf walls are green — instead of one averaged hue. It is implemented per-FRAGMENT, not per-vertex: `buildSolidReliefGeometry` writes a second UV set (`uv1`) holding the front-print registration for the wall vertices, and `buildSolidWallMaterial` gives the wall a **clone** of the albedo with `map.channel = 1` (a clone because `channel` lives on the texture — setting it on the shared albedo would drag the front cap onto the wall's UVs). The wall's own `uv` (channel 0) stays free for the tiling fondant grain. Because the wall samples the SAME albedo as the cap, a customer's `recolor` tracks for free with no geometry rebuild. The sample is taken **inset `WALL_SAMPLE_INSET` (2% of `size`) INWARD** along the unbent wall normal — sampling the silhouette itself would pick up the alpha-antialiased rim (and any dark outline) and paint the wall with a halo; the inward direction comes from vertex normals on the unbent extrude, which is exact on concave shapes where offsetting toward the centroid is not. Precedence: an explicit `solidColor` (flat) beats `print`; `recolor` beats both. Default `dominant` keeps every element authored before this key renders identically. **v1: the largest outer silhouette only — interior holes are not cut.** Built by `geometry/solidRelief.js` (`buildSolidReliefGeometry`); read at `StickerTexture`. Config-gated on `relief.solid`, no element-type branch. `false`/absent leaves the displaced shell exactly as before. **`bake.flattenThin`** (0 = off) keeps THIN protrusions (spikes, thin edges) FLUSH on the wall so they hug the cake instead of poking out at a grazing angle — **colour-independent** (decided by feature width via silhouette erosion, never brightness); **`bake.flatTop`** (0 = off) blends the per-pixel domed height toward a UNIFORM plateau — the whole silhouette (thin parts included) lifts to ONE flat height with just a small rounded edge, so the relief reads as a flat plaque instead of a sculpted mound. the thick body stays raised. Applied to the macro form in `buildFields` (must match core ⟷ studio). **`relief.flatMask`** (a RELIEF-level sibling of `bake`, NOT inside it) is an authored **inline data-URI** paint-mask (a downscaled ~128px grayscale PNG where **BLACK = flush**, white = raised) the author brushes in the studio over the exact parts to keep flat; it multiplies on top of `bake.flattenThin` in `buildFields` and is **colour-independent** like `flattenThin`. Stored inline in config (~1–3KB, no R2 asset); absent = fully raised. Core decodes it async (`useReliefMaps` → `buildReliefMaps(img, bake, flatMaskImg)`) and rebuilds the maps once loaded. **`lift` is the raised height as a FRACTION of the live wall/tier radius, NOT an absolute world length and NOT tied to the sticker's size** — the renderer applies `displacementScale = lift × reliefRadius / scale`, so the world lift = `lift × reliefRadius`, independent of both the cake size and the element's `scale` (a 3× sticker can't poke off the wall). This keeps the raised height physical on any tier (the studio authored it on its fixed 1.2-radius preview, but the cake is any size and stickers scale freely — INVARIANTS.md #8). **Note:** the long-standing "relief floats off the wall at the tangent" bug was NOT caused by `lift` at all — it was the curved base plane being built at a capped local radius (`min(curveRadius, 0.3)`) inside a scaled group; see INVARIANTS.md #8a.  the `bake` block are the params the maps are baked from (authored in the admin **Relief Sticker Studio**). Baked by `shared/textures/reliefMaps.js` (`buildReliefMaps`, reusing `heightfieldToNormalMap`); read at `StickerTexture` (`canvas/CakeCanvas.jsx`). Config-gated, no element-type branch. **Non-foldable stickers only.** Composes with `recolor` (relief maps come from the original luminance; recolour preserves it, so they stack). |
| `print_finish` | object | `null` | **2D image stickers only (flat AND relief).** **Normally ABSENT — and absent is CORRECT.** A print renders at **exactly 1× its artwork** by construction (`shared/printExposure.js`), so an element needs no calibration: same brightness wrapped on the wall, standing as a topper, on any cake. These keys are **optional artistic overrides**, never a correction for a render that is wrong. If an element looks wrong with `print_finish` absent, that is a RENDERER bug — fix the model, do not tune the element. Shape: `{ gain, saturation, shading }`, all optional — **`gain`** = exposure (`1` = the artwork; `<1` dims, `>1` brightens); **`saturation`** = chroma boost applied when the texture is composited (`1` = the artwork's own colour); **`shading`** = how much of the cake's light/shadow falls on the print (`0.35` default; `0` = flat, immune to where it sits). **`emissive` is a LEGACY key and is deliberately IGNORED** — it was raw additive self-illumination in the pre-exposure model, i.e. precisely the overshoot the model removes; honouring it would blow out the very elements that were authored to work around it. Re-saving an element in admin drops it. <br><br>**THE HISTORY, so it is not repeated.** A decal used to be drawn as an ordinary lit PBR surface with tone mapping off — `screen = albedo × whatever light hits it`, with no rolloff and nothing tying it to the artwork. Measured on the real cake, a print rendered at **1.4× its own artwork**, and with no rolloff every pale colour clipped to white. That ONE defect produced BOTH long-running bugs: *"the print is DULL"* (the ACES-tone-mapped era — ACES compressed **and** desaturated it) and *"the print is OVER-BRIGHT"* (the fix for dull — tone mapping off + a chroma boost + emissive — landed at 1.4×). Each was patched with another hand-tuned constant (`DECAL_SAT 1.12`, `DECAL_EMISSIVE 0.22`, then a `gain`). They were the same bug with opposite signs: **a print had no defined exposure.** Knobs could never close it — the next pale artwork or new zone reopened it, and the Relief Studio stamped its defaults into every element it touched, freezing the overshoot across the library. <br><br>**THE MODEL** (`shared/printExposure.js`, pure + unit-tested, shared by designer AND the admin studios so a preview cannot drift from the cake): `screen = gain × albedo × ((1 − shading) + shading × light / REFERENCE_LIGHT)`. The `1 − shading` part is self-illumination — **orientation-INDEPENDENT**, so it cannot be blown out by where the decal sits; the `shading` part still takes some of the cake's light so the print isn't a sticker pasted over the render. At the reference light the two sum to exactly 1. Every term is a **multiplier on the albedo**, never an additive white (additive white is what desaturates a print) — which is also why the print's own **specular and env reflection are switched OFF** (`specularIntensity: 0`, `envMapIntensity: 0`): a print is INK, and that additive white wrecked the DARK pixels specifically (measured: browns 1.19× while pale areas sat at 1.03×, i.e. flattened contrast). **`REFERENCE_LIGHT` is MEASURED, NOT DERIVED** — adding the rig up on paper gives 1.16 and is wrong; the render is the authority (see the re-calibration recipe in that file, and measure in **linear** light — sRGB ratios are meaningless). Applies to all three printed surfaces (flat decal, displaced relief, solid front cap; not nested under `relief`). Copied to the instance as `printFinish` (the whole object); threaded `StickerFace → StickerTexture`. Authored in the admin **Relief Sticker Studio** and **Manage Elements** — both OMIT any value still sitting on neutral, so the common case writes nothing. Config-gated, no element-type/zone/placement-mode branch. |
| `photo` | object | `null` | **2D image stickers only — photo-cake frame.** Present = this element is a photo frame: its `image_url` is the **frame overlay** (border art + a transparent window), and `photo.mask` is the **window silhouette** (an alpha PNG; white = show photo). The renderer draws the customer's uploaded photo behind the overlay, **clipped to the mask** (cover-fit, then zoom/pan), so it shows through the window while the overlay's opaque border hides the seam. Shape: `{ mask }` (R2 key→URL). Copied to the instance as `photoMask`; the customer's upload lands on the instance as `photoUrl` (persisted in the design JSON) with `photoTransform` `{ x, y, zoom }`. The Upload + zoom/pan controls appear in the popup **only when `photoMask` is present** — config-gated, never an element-type/slug branch. Works on `top_surface` (flat) and `side` (curved) via the standard `hug` path; resize is the standard Size dial. Read by `StickerTexture`/`PhotoBacking` (`canvas/CakeCanvas.jsx`). |
| `text_slots` | array | `null` | **2D image stickers only — editable text placeholders.** Present = the artwork declares named slots (`{number}`, `{name}`, …) whose VALUES the customer types; the value is composited into the sticker's texture at design time, so **a value is never an asset** — one element serves `2`, `47` and `Amara`. Absent/`[]` = a plain sticker (no text UI at all). Shape per slot: `{ key, label, kind, default, maxLen, rect, style_key, style_override? }`. **`rect`** (`{x,y,w,h,rot}`) is **NORMALIZED 0..1 of the artwork**, so a slot survives any raster size; the glyph is auto-fitted (binary search on real measured metrics) to ~`style.fit` of the box, so a 1-char `2` and a 9-char name both sit right. **`kind`** `number` = digits only. **`style_key`** names a row in the shared **`text_styles`** table (seed/fallback: `TEXT_STYLES` in `textStyles.js`, overlaid by `applyTextStyleConfig` from `apiClient.fetchTextStyles` — the same seed+DB-overlay contract as `cake_textures`/`creamStyles`); an unknown key falls back to the seed default rather than dropping the value. A style is a SHARED preset (font, fill, hatch, outline) reused across templates — restyle it once and every template using it follows — with an optional per-slot `style_override`. Its **`algorithm`** (`scribble` \| `flat`) KEYS into `ALGORITHMS` in `shared/textures/textSlots.js` (the data↔code seam): a new LOOK needs a strategy in code, but tuning colours/hatch/outline/typeface is pure config, no deploy. The **typeface is DATA** (`font: {family, url}` → an uploaded woff2 in R2 `elements/fonts`), never a hardcoded family. Copied to the instance as `textSlots`; the customer's values land on the instance as `textValues` (persisted in the design JSON, seeded from each slot's `default`). The text fields appear in the popup **only when `textSlots` is present** — config-gated, never an element-type/slug branch (exactly like the photo frame's Upload). Composited in `useStickerImageTexture` (`canvas/CakeCanvas.jsx`) **after** `recolor` (a recolour targets the ARTWORK's regions and must not repaint the typed glyph) and **before** the `print_finish` chroma boost (so the number takes the same print finish as the art it sits on). The composite waits on the webfont (`loadSlotFonts`): `ctx.fillText` with an unloaded `FontFace` silently falls back to sans-serif, and that would be BAKED into the texture. **Seat/clamp is unaffected**: `requestStickerContentV` scans the raw artwork's alpha (cached by `imageUrl`) and the glyph is drawn INSIDE the artwork's already-opaque area, so extents don't change — authoring a slot over transparent space is the one case that would break that, and is an authoring-time footgun, not a runtime one. Authored in the admin **Text Topper Studio**; the studio previews with the SAME renderer (imported from `@spattoo/designer`), so preview and cake cannot drift. |
| `rotation` | `[x,y,z]` **degrees** | `null` | The GLB's authored facing offset, baked into geometry before render (e.g. toppers `[0, -90, 0]` to face front). **Authored in degrees** — the calibrator's convention, unified with piping's `top_/bottom_rotation`. Read ONLY via `facingOffsetRadians()` (`placement.js`), which converts to the radians THREE uses. |
| `rotation_unit` | `'deg' \| 'rad'` | `'rad'` | Unit of `rotation`. `'deg'` = degrees (the standard). Absent/`'rad'` = legacy radians, passed through unchanged. **Rollout flag**: admin now always writes `'deg'`; DB rows migrated by `spattoo-api/migrations/008_rotation_unit_degrees.sql` (radians→deg, render-neutral). The absent/`'rad'` legacy branch in `facingOffsetRadians` is retained as a safety fallback **until that migration is confirmed applied in production**, then it (and this flag) can be dropped. |
| `roughness` / `metalness` | number | `null` | **GLB only.** Config-driven material finish — when set, override the GLB's baked material (copied per instance in `cleanGlbScene`, never mutating the cached GLB). `metalness` ~0 + high `roughness` = matte; `metalness` ~0.9 + low `roughness` = metallic. Lets one sphere/asset read as matte or metallic from config (e.g. sugar pearls vs gold balls). `null`/absent = keep the GLB's own baked material. Colour is a separate path (`color` / recolour). |
| `material` | string | `null` | **GLB decorations only.** A **material TAG** — the readable key of a decoration surface finish in the **materials registry** (`designer/materials.js` `DECOR_MATERIALS`, seed + `materials` DB overlay via `applyDecorMaterialConfig`). Resolved by `materialSurface(key)` → a `surface` finish (`{ roughness, metalness, sheen, sheenColor, sheenRoughness, clearcoat, clearcoatRoughness, envMapIntensity, anisotropy, anisotropyRotation }`, all optional) applied to the GLB's material in `StickerModel` (`canvas/CakeCanvas.jsx`). The finish lives ONCE in the registry, so many elements share it by name (DRY). **`applies_to` gate:** a decoration resolves only materials whose `applies_to` includes `"element"` — a body-only material (buttercream) can never land on a decoration, and satin can never land on the cake body. **`satin`** is the first entry (anisotropic silk — needs the GLB to carry a `TANGENT` attribute, baked in the asset pipeline, or the streak mottles). A GLB usually loads as `MeshStandardMaterial`; a finish with sheen/clearcoat/anisotropy upgrades it to `MeshPhysicalMaterial`. Recolour still tints the base colour on top. `null`/absent = the GLB's own baked material. Config-gated, no element-type branch. (An inline `surface` object may override for a one-off, but prefer the tag.) |

## 2. Placement modes (the value of a `<zone>` key)

From `PLACEMENT_MODES` in `constants.js`:

| Mode | Used on | Behavior |
|---|---|---|
| `stand` | `top_surface` | Stands upright on the surface; billboarded for 2D, full model for GLB. Size from `r`/scale. |
| `hug` | `side`, `top_surface` | Lies flat against the surface; size derived from the wall (`hug_fill`), bends around round walls. |
| `perch` | `rim` | A figure seated on the top edge — its centre straddles the edge (legs over the side, body above). Leans on world-X. Calibrated by `perch` (§ below). Legged 3D toppers. |
| `verge` | `rim` | Reclines radially **OUTWARD** by `verge.angle_deg` so the body cantilevers over the edge into the air. World-oriented (never billboarded); auto-faces outward, re-orienting as it's dragged round the rim. For butterflies, flowers. Conventionally `rim`, but like every mode it's a config value usable on any allowed surface. Calibrated by `verge`: `{ seat, angle_deg, y_offset, edge_inset }` — **`seat`** = `'center'` (default; the MID-SPINE/geometry centre rests on the rim edge and the body drapes over the lip) or `'base'` (the body BASE seats on the top surface and leans from there); **`angle_deg`** default-tilt in degrees (default 35; seeds the per-instance Tilt control); **`edge_inset`** radial pull-in from the rim (− pushes out over the lip); **`y_offset`** height nudge. Dragging an edge-seated element rim-locks it (snaps to the perimeter — never inward, so a centre-seat element can't bury itself); a base-seat verge drags freely on the top like `stand`. _Planned (with the faux-ball work): **`edge_drag`** = `'rim'` (default, locked to the perimeter) \| `'outward'` (may be dragged OUT over the lip for a "spill over the edge" look, while inward is always clamped to the rim — for faux balls)._ |

`ZONES`: `top_surface`, `side`, `middle_tier`, `board`, `rim` (`top` is an internal alias).

## 3. Pattern fields (`decor_pattern` and `piping_pattern`)

| Key | Type | Default | Meaning |
|---|---|---|---|
| `pattern_only` | bool | `false` | `true` = a building-block part; hidden from the picker (`filterEl` / piping picker). Still loaded so a pattern can resolve it by id. Parts stay top-level (`parent_id` NULL). |
| `parts` | array | — | The pattern's pieces. Each entry references a part element by id. **decor_pattern:** `[{ element_id, dx, dz, mirror? }]` — each spawns a real sticker, sharing a `patternId`; `mirror: true` flips that part across its vertical axis (reuse one element as its symmetric twin, e.g. right eye = mirrored left eye). Offset is in the **drop surface's** coordinates: on the **top** `dx`/`dz` are x/z in cake units; on a **wall** (side / middle tier) `dx` is an **angular** offset in radians (parts fan around the wall, e.g. eyes on the front face), height stays level. **piping_pattern:** `[{ element_id }, { element_id }]` — `[0]`=shape A, `[1]`=alternate B. |
| `parts_deletable` | bool | `false` | decor_pattern only. `false` = deleting any part removes the whole pattern (orphan guard — no half-placed pair). `true` = parts delete singly. |

## 4. Piping fields (`cream_piping` / `piping_pattern`)

Piping has a **top** (rim) and **bottom** (board) set with identical shapes — `top_*` and
`bottom_*`. Listed once below; swap the prefix. Read in `pipingPlacementFromConfig`.

**Arrangement**
| Key | Type | Meaning |
|---|---|---|
| `top_arrangement` / `bottom_arrangement` | string | Default arrangement: `ring` or `single`. |
| `top_arrangements_allowed` / `bottom_…` | string[] | Which arrangements the baker may pick. |
| `top_single_angle` / `bottom_…` | number (radians) | Seed angle when arrangement is `single`. |
| `top_single_max` / `bottom_…` | number | Max instances in `single` mode. |

**Placement / look**
| Key | Type | Default | Meaning |
|---|---|---|---|
| `top_flip` / `bottom_flip` | bool | top `false`, bottom `true` | Flip the ring's facing. |
| `top_rotation` / `bottom_rotation` | `[x,y,z]` **degrees** | `null` | Facing rotation. **Degrees** — the canonical convention the decor `rotation` field is being unified onto (piping was already degrees; converted to radians at render in `renderShells`, `CakeTier.jsx`). |
| `top_radial_offset` / `bottom_…` | number | `null` | Push the ring out from / into the wall. |
| `top_y_offset` / `bottom_…` | number | `null` | Raise/lower the ring. |
| `top_spacing` / `bottom_…` | number | `null` | Gap between repeats. |
| `top_softness` / `bottom_…` | number (0–1) | `null` | Cream look: 0–1 → roughness/sheen (0.7 = original). |
| `bottom_y_adjustable` | bool | — | Bottom only: let the baker tune Y in the popup. |
| `bottom_flip_adjustable` | bool | — | Bottom only: let the baker toggle flip. |

**Alternating A/B pattern**
| Key | Type | Meaning |
|---|---|---|
| `top_alt_enabled` / `bottom_…` | bool | Turn on A/B alternation. |
| `top_alt_glb_url` / `bottom_…` | string (R2 key→URL) | Version B's GLB. |
| `top_alt_flip` / `bottom_…` | bool | Flip B. |
| `top_alt_rotation` / `bottom_…` | `[x,y,z]` | B's rotation. |
| `top_alt_radial_offset` / `bottom_…` | number | B's radial offset. |
| `top_alt_y_offset` / `bottom_…` | number | B's Y offset. |
| `top_pattern` / `bottom_pattern` | string | Repeat cycle, default `"AB"`. |

**Bend / festoon (U-shaped swags)**
| Key | Type | Meaning |
|---|---|---|
| `top_bend` / `bottom_…` | bool | Enable festoon bending. |
| `top_bend_ring` / `bottom_…` | bool | Bend as a continuous ring. |
| `top_festoons` / `bottom_…` | number | Number of swags. |
| `top_bend_depth` / `bottom_…` | number | Swag droop depth. |
| `top_bend_tilt` / `bottom_…` | number | Swag tilt. |

**Swag (alt naming, also read)**
| Key | Type | Meaning |
|---|---|---|
| `top_swag_count` / `bottom_…` | number | Swag count. |
| `top_swag_depth` / `bottom_…` | number | Swag depth. |
| `top_swag_tilt` / `bottom_…` | number | Swag tilt. |

**Wrap (pre-formed band)**
| Key | Type | Meaning |
|---|---|---|
| `top_wrap` / `bottom_…` | bool | Wrap one pre-formed ring GLB round the wall as a single band. |
| `top_wrap_tilt` / `bottom_…` | number | Band tilt. |
| `top_wrap_size` / `bottom_…` | number | Band size. |
| `top_drip` | bool | Render this rim ring as a procedural **chocolate drip** (no GLB) instead of shells. Rim/top only. |
| `top_drip_config` | object | The authored drip GEOMETRY bundle (`count`, `width`, `length`, `flat`, `webDepth`, `archHeight`, `lipRadius`, `seed`, …). Tuned in the admin drip studio; linear dims scale with tier radius at render. Built by `geometry/chocolateDrip.js`. |
| `top_drip_gloss` | number (0–1) | Customer-editable default: 0 matte … 1 wet ganache (drives roughness + clearcoat). |
| `top_drip_length` | number | Customer Length dial — a multiplier on `top_drip_config.length` (the base run). |
| `top_drip_flood` | bool | Customer toggle — flood the whole tier top with chocolate (vs. just the rim + drips). |

---

## 5. Full element structure (the row that holds `placement_config`)

The complete `cake_elements` row — `placement_config` is one field of it. Written by the admin
`createGlobalElement` / `updateGlobalElement` payloads (`AddElement.jsx`, `ManageElements.jsx`);
`id` / `created_at` are DB-assigned. Comments are illustrative; real stored JSON has none.

```jsonc
{
  "id":              "uuid",                              // DB-assigned
  "name":            "Lilac Butterfly",
  "description":     "Folded card butterfly",             // | null
  "element_type_id": "uuid",                              // FK → element_types
  "parent_id":       null,                                // FK → cake_elements (pattern part / variant); null = top-level
  "image_url":       "elements/files/2D/uuid.png",        // R2 key; .glb/.gltf ⇒ 3D, else 2D
  "thumbnail_url":   "elements/thumbnails/uuid.png",
  "file_size":       48213,                               // bytes | null
  "is_active":       true,
  "sort_order":      0,
  "default_color":   null,                                // hex seed for recolour / GLB tint | null
  "allowed_zones":   ["top_surface", "side"],             // subset of ZONES — where it can go

  "allowed_actions": {                                    // capabilities — gate the edit-popup controls
    "resize":    true,
    "duplicate": true,
    "color":     true,                                    // shows the ColorWheel (GLB tint OR 2D recolour)
    "gradient":  false,
    "delete":    true,
    "move":      false,
    "tilt":      true
  },

  "placement_config": {                                   // HOW it behaves — the FULL superset (= §0).
                                                          // A real element uses only a subset; many
                                                          // groups below are mutually exclusive.
    // ── Zones × modes — one key per surface the element offers ──
    "top_surface": "stand",                               // stand | hug | perch | verge
    "side":        "hug",
    "middle_tier": "hug",
    "board":       "hug",
    "rim":         "hug",

    // ── Sizing & placement style ──
    "r":               1.0,
    "scale":           { "min": 0.5, "max": 1.5, "step": 0.05 },
    "single_per_slot": true,
    "scatter":         false,
    "scatter_count":   12,
    "hug_fill":        0.7,
    "side_proud":      false,

    // ── GLB facing offset (read via facingOffsetRadians) ──
    "rotation":      [0, -90, 0],                          // DEGREES
    "rotation_unit": "deg",

    // ── GLB material / surface ──
    "roughness":               0.6,
    "metalness":               0.0,
    "material": "satin",                                // decoration surface finish → resolved from the materials registry (a KEY tag)
    "useSharedFondantTexture": false,

    // ── Folded sticker (2D image) ──
    "foldable": true,
    "fold":     30,
    "spine":    0.5,

    // ── Pixel recolour (2D image; needs allowed_actions.color) ──
    "recolor": { "method": "saturated", "sat": 0.25 },    // OR blue_gt_green/opaque (single colour) OR
                                                          // { "method": "hue_regions", "sat": 0.18 } — MULTI-colour, one swatch per detected colour
    "relief":  { "lift": 0.07, "normalScale": 0.8, "roughness": 0.95, "sheen": 0, "envIntensity": 0.4, "toneMapped": false, "solid": false, "solidEdge": 0, "solidFinish": "fondant", "solidWallColor": "dominant", "solidColor": "#c8748f",  // solidWallColor: "dominant" (default, one flat hue) | "print" (walls sample the print per-point — brown trunk, green leaves).
                                                                                                                                                                                              // solidColor absent = auto (print's dominant hue); an explicit hex overrides solidWallColor; both ignored when "recolor" is set (walls follow the customer's recolour)
                 "bake": { "puff": 0.5, "domeBlur": 34, "edgeRound": 16, "detail": 0.4, "grain": 0.5, "delit": 0, "flipY": false, "flattenThin": 0, "flatTop": 0 } },  // raised fondant cut-out (admin Relief Studio); solid=true → extruded SOLID slab (front+walls+back) instead of a displaced shell; flattenThin>0 keeps thin protrusions flush; flatTop>0 = flat plaque; optional sibling "flatMask": "data:image/png;base64,…" (authored ~128px paint-mask, black=flush)
                 // roughness/sheen MUST stay matte+sheenless: both add WHITE over the albedo, and additive white
                 // desaturates a print. Measured (texture sat 0.907): 0.7+0.12 → 0.345; neither → 0.607, the same
                 // as a plain flat decal. Not the HDRI — envMapIntensity 0 changes nothing; it's direct specular.
                 // Elements authored before 2026-07 carry roughness:0.7 / sheen:0.12 and need re-authoring.
    // "print_finish": { "gain": 1.0, "saturation": 1.0, "shading": 0.35 },  // optional artistic override; ABSENT = the print IS the artwork
    "photo":   { "mask": "elements/files/2D/heart-frame-mask.png" },  // photo-cake frame: window-shape mask (alpha)
    "text_slots": [                                    // editable {number}/{name} the customer types; absent = plain sticker
      { "key": "number", "label": "Age / number", "kind": "number", "default": "2", "maxLen": 2,
        "rect": { "x": 0.5, "y": 0.46, "w": 0.28, "h": 0.34, "rot": 0 },   // NORMALIZED 0..1 of the artwork
        "style_key": "scribble_brown", "style_override": { "fill": "#5A3410" } }
    ],

    // ── Perch (figure seated on the top edge) ──
    "perch": { "tilt_deg": 0, "y_offset": 0, "edge_inset": 0 },

    // ── Verge (rests on the rim lip, reclines radially OUTWARD over the edge) ──
    "verge": { "seat": "center", "angle_deg": 35, "y_offset": 0, "edge_inset": 0 },

    // ── GLB Recompose — customer-recolourable part groups ──
    "_model": {
      "groups":   [ { "key": "wings", "label": "Wings", "default": "#cc88ff", "editable": true } ],
      "segments": []
    },

    // ── Pattern fields (decor_pattern / piping_pattern) ──
    "pattern_only":    false,
    "parts_deletable": false,
    "parts": [ { "element_id": "uuid", "dx": 0.1, "dz": 0.0, "mirror": false } ],

    // ── Piping (cream_piping / piping_pattern) — every top_* has a bottom_* twin ──
    "top_arrangement":          "ring",                   // ring | single
    "top_arrangements_allowed": ["ring", "single"],
    "top_single_angle":         0,                        // RADIANS
    "top_single_max":           12,
    "top_flip":                 false,
    "top_rotation":             [0, 0, 0],                // DEGREES
    "top_radial_offset":        0,
    "top_y_offset":             0,
    "top_spacing":              0,
    "top_softness":             0.7,
    "top_alt_enabled":          false,
    "top_alt_glb_url":          null,
    "top_alt_flip":             false,
    "top_alt_rotation":         [0, 0, 0],
    "top_alt_radial_offset":    0,
    "top_alt_y_offset":         0,
    "top_pattern":              "AB",
    "top_bend":                 false,
    "top_bend_ring":            false,
    "top_festoons":             8,
    "top_bend_depth":           0,
    "top_bend_tilt":            0,
    "top_swag_count":           8,
    "top_swag_depth":           0,
    "top_swag_tilt":            0,
    "top_wrap":                 false,
    "top_wrap_tilt":            0,
    "top_wrap_size":            1.0,
    // …bottom_* mirrors every top_* above (own defaults), plus two bottom-only flags:
    "bottom_y_adjustable":      false,
    "bottom_flip_adjustable":   false
  }
}
```

> §5's `placement_config` is the same superset as §0 (here shown nested inside the full element row).
> Keep the two in sync — or treat §5 as the single complete sample and §0 as the quick placement-only
> view of it.

---

_Generated from the code (`pipingPlacementFromConfig`, `placement.js`, `addSticker`,
`loadElementsIfNeeded`, `filterEl`, `createGlobalElement` / `updateGlobalElement`)._

> **Keep this living.** Whenever you add, rename, or remove a `placement_config` key (or a `recolor`
> method / placement mode), update the superset in BOTH §0 **and** §5's nested `placement_config`
> (they're the same superset), **and** the relevant table — all in the same change. When an
> element-level field changes (a new `cake_elements` column or `allowed_actions` capability), update
> the full element structure (§5) too.
