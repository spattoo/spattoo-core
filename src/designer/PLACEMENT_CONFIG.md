# `placement_config` — field reference

Every cake element row has `allowed_zones` (where it can go) and `placement_config` (how it
behaves there). Behavior is **100% data** — render/popup code never branches on element type or
slug, it only reads these fields (see `INVARIANTS.md`). This file lists every key the code reads.

> Values here are persisted to the DB and to saved designs, so **never rename a value**.
> Reference the enums in `constants.js` (`ZONES`, `PLACEMENT_MODES`) by name in code.

---

## 1. Common / decor fields

| Key | Type | Default | Meaning |
|---|---|---|---|
| `<zone>` | string (a placement mode) | — | One key per surface the element sits on: `top_surface`, `side`, `middle_tier`, `board`, `rim`. The value is the **mode** for that surface — see §2. e.g. `{ "top_surface": "stand", "side": "hug" }`. |
| `single_per_slot` | bool | `false` | Placement **style**, not mode. `true` = one instance per (tier×surface) slot, chosen via the checkbox chooser (topper, top&side decor). `false` = scatter freely (many independent stickers). Read by `isMultiSlotEl`. **Must not be inferred from `allowed_zones.length`.** |
| `r` | number | GLB `2.5` / 2D `1` | Default scale for a freshly placed sticker (`stand`). Never hard-code a scale elsewhere. |
| `hug_fill` | number (0–1) | `0.7` | For `hug` mode: fraction of the tier wall height the element fills. Derived at render time (dynamic hug). |
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

_Generated from the code (`pipingPlacementFromConfig`, `placement.js`, `addSticker`,
`loadElementsIfNeeded`, `filterEl`). If you add a `placement_config` key, add it here._
