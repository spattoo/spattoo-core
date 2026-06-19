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
  "top_surface": "stand",          // stand | hug | faux_ball_single | faux_balls | perch
  "side":        "hug",
  "middle_tier": "hug",
  "board":       "hug",
  "rim":         "hug",

  // ── Sizing & placement style (§1) ──
  "r":               1.0,                              // default scale for `stand`
  "scale":           { "min": 0.5, "max": 1.5, "step": 0.05 },  // size-dial bounds (optional)
  "single_per_slot": true,                            // hero: one per tier×surface (vs free scatter)
  "scatter":         false,                           // density scatter (sprinkles); excl. single_per_slot
  "hug_fill":        0.7,                             // `hug`: fraction of wall height filled
  "side_proud":      false,                           // side: raised off the wall (deep pieces) vs flush

  // ── GLB facing offset (§1) — read ONLY via facingOffsetRadians() ──
  "rotation":      [0, -90, 0],                       // DEGREES
  "rotation_unit": "deg",                             // 'deg' (standard) | 'rad' (legacy)

  // ── GLB material / surface ──
  "roughness":               0.6,                     // GLB + 3D_GEOM
  "metalness":               0.0,
  "useSharedFondantTexture": false,                   // opt into the shared fondant surface

  // ── Folded sticker (2D image only, §1) ──
  "foldable": true,                                   // gate: split into two hinged wings
  "fold":     30,                                     // dihedral degrees (only when foldable)
  "spine":    0.5,                                    // body split 0–1 (only when foldable)

  // ── Pixel recolour (2D image only, §1) — needs allowed_actions.color to show the picker ──
  "recolor": { "method": "saturated", "sat": 0.25 },  // OR { "method": "blue_gt_green", "guard": 12 }
                                                      // OR { "method": "opaque" }

  // ── Perch (a figure seated on the top edge) ──
  "perch": { "tilt_deg": 0, "y_offset": 0, "edge_inset": 0 },

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
  // …bottom_* mirrors every top_* above (own defaults), plus two bottom-only flags:
  "bottom_y_adjustable":    false,                    // let the baker tune Y in the popup
  "bottom_flip_adjustable": false
}
```

> Keys present in the sample but not yet in the tables below (`scatter`, `side_proud`,
> `useSharedFondantTexture`, `perch`, `_model`, `roughness`, `metalness`) are read by `addSticker` /
> the GLB material path — tabulate them when next touched.

---

## 1. Common / decor fields

| Key | Type | Default | Meaning |
|---|---|---|---|
| `<zone>` | string (a placement mode) | — | One key per surface the element sits on: `top_surface`, `side`, `middle_tier`, `board`, `rim`. The value is the **mode** for that surface — see §2. e.g. `{ "top_surface": "stand", "side": "hug" }`. |
| `single_per_slot` | bool | `false` | Placement **style**, not mode. `true` = one instance per (tier×surface) slot, chosen via the checkbox chooser (topper, top&side decor). `false` = scatter freely (many independent stickers). Read by `isMultiSlotEl`. **Must not be inferred from `allowed_zones.length`.** |
| `r` | number | GLB `2.5` / 2D `1` | Default scale for a freshly placed sticker (`stand`). Never hard-code a scale elsewhere. |
| `hug_fill` | number (0–1) | `0.7` | For `hug` mode: fraction of the tier wall height the element fills. Derived at render time (dynamic hug). |
| `foldable` | bool | `false` | Capability **gate** (like `parts_deletable`). `true` = the flat 2D decal splits at the body spine into two wings that hinge into a shallow V — a folded card (e.g. butterfly). `false`/absent = an ordinary flat plane. The renderer only splits/folds when this is on. Copied to the instance as `foldable`; read by `StickerTexture` via `createFoldedPlane`. |
| `fold` | number (degrees) | `30` | Only read when `foldable`. The dihedral angle between the two wings. `0` = flat. |
| `spine` | number (0–1) | `0.5` | Only read when `foldable`. Where the body centerline splits the image (the hinge). `0.5` = centred; nudge if the asset's body isn't centred. |
| `recolor` | object | `null` | **2D image stickers only.** Pixel-recolour region descriptor — present = the renderer recolours just the matched pixels to the instance's `color` (driven by the SAME ColorWheel as GLB tint; gated to show by `allowed_actions.color`). Absent = the image renders unchanged. Shape: `{ method, …params }`. Methods (`matcher` in `shared/color/imageRecolor.js`): **`opaque`** (default) = every non-transparent pixel (whole image — solid stickers); **`saturated`** (+ optional `sat`, default `0.25`) = the vivid coloured fill of any hue, leaving black/grey/white lines untouched (for "one colour + black" decals); **`blue_gt_green`** (+ optional `guard`, default `12`) = blue-dominant fill only, excludes gold edges (green > blue) and white highlights. Applied by `recolorImageData`; brightness is preserved so shading survives. GLB material tint (`color`/`groupColors`) is a separate path — chosen by asset kind (`isGlb`), never by element type. |
| `rotation` | `[x,y,z]` **degrees** | `null` | The GLB's authored facing offset, baked into geometry before render (e.g. toppers `[0, -90, 0]` to face front). **Authored in degrees** — the calibrator's convention, unified with piping's `top_/bottom_rotation`. Read ONLY via `facingOffsetRadians()` (`placement.js`), which converts to the radians THREE uses. |
| `rotation_unit` | `'deg' \| 'rad'` | `'rad'` | Unit of `rotation`. `'deg'` = degrees (the standard). Absent/`'rad'` = legacy radians, passed through unchanged. **Rollout flag**: admin now always writes `'deg'`; DB rows migrated by `spattoo-api/migrations/008_rotation_unit_degrees.sql` (radians→deg, render-neutral). The absent/`'rad'` legacy branch in `facingOffsetRadians` is retained as a safety fallback **until that migration is confirmed applied in production**, then it (and this flag) can be dropped. |

## 2. Placement modes (the value of a `<zone>` key)

From `PLACEMENT_MODES` in `constants.js`:

| Mode | Used on | Behavior |
|---|---|---|
| `stand` | `top_surface` | Stands upright on the surface; billboarded for 2D, full model for GLB. Size from `r`/scale. |
| `hug` | `side`, `top_surface` | Lies flat against the surface; size derived from the wall (`hug_fill`), bends around round walls. |
| `faux_ball_single` | `side`, `middle_tier`, `top_surface` | Renders as a faux-ball cluster; collision-spaced against siblings. |

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
  "image_url":       "elements/files/2D/uuid.png",        // R2 key; .glb/.gltf ⇒ 3D, else 2D; null = file-less (faux_balls)
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
    "top_surface": "stand",                               // stand | hug | faux_ball_single | faux_balls | perch
    "side":        "hug",
    "middle_tier": "hug",
    "board":       "hug",
    "rim":         "hug",

    // ── Sizing & placement style ──
    "r":               1.0,
    "scale":           { "min": 0.5, "max": 1.5, "step": 0.05 },
    "single_per_slot": true,
    "scatter":         false,
    "hug_fill":        0.7,
    "side_proud":      false,

    // ── GLB facing offset (read via facingOffsetRadians) ──
    "rotation":      [0, -90, 0],                          // DEGREES
    "rotation_unit": "deg",

    // ── GLB material / surface ──
    "roughness":               0.6,
    "metalness":               0.0,
    "useSharedFondantTexture": false,

    // ── Folded sticker (2D image) ──
    "foldable": true,
    "fold":     30,
    "spine":    0.5,

    // ── Pixel recolour (2D image; needs allowed_actions.color) ──
    "recolor": { "method": "saturated", "sat": 0.25 },    // OR { "method": "blue_gt_green", "guard": 12 } OR { "method": "opaque" }

    // ── Perch (figure seated on the top edge) ──
    "perch": { "tilt_deg": 0, "y_offset": 0, "edge_inset": 0 },

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
