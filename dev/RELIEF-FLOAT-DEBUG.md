# Relief sticker — investigation log (2026-07-08)

**Supersedes the previous version of this file, which was WRONG.** It claimed `lift` caused the float,
that `surfaceR ≈ 0.47` (it is `1.225`), and that the admin studio "does not show this". All three were
false, and each sent a day's work down a dead end. Don't trust this file's git history.

**Status:** the original bug (decal floats off the wall at the tangent) is **FIXED**. Six other real bugs
were found and fixed on the way. **One symptom remains open: a RELIEF decal renders duller/darker than a
FLAT decal of the same artwork at the same size.** See §2.

Nothing is committed. Core is still `0.1.48`; `spattoo-web` still has the *wrong* attempt-2 relief fix
vendored. None of today's work has reached dev.

---

## 1. What was actually broken (all fixed, all measured)

Every one is the same shape: **a value that was correct in the frame it was written in, and wrong in the
frame it was used in.**

| # | Bug | Evidence |
|---|-----|----------|
| 1 | `createCurvedPlane(..., Math.min(curveRadius, 0.3), ...)` — a WORLD constant used as a LOCAL radius inside `<group scale={effScale}>`. World curve radius became `0.3 × scale`, so a scale-3 decal was a radius-0.9 arc pressed against a 0.445 wall. | Edge stood **0.089 world** off the cake at scale 3; **−0.011 (tucked IN)** at scale 1 — which is why every front-on scale-1 test looked fine. Fix (`curveRadius / stickerScale`, mirroring the GLB `bendRadius`) gives deviation `1e-16` at every radius × scale. |
| 2 | `SIDE_STICKER_SURFACE_OFFSET = 0.025` — an absolute world length. The seat gap grew as tiers shrank. | `gap/R` = 2.08% at R 1.2 but **5.56% at R 0.45**. Replaced by `SIDE_STICKER_SEAT_FRAC = 0.004 / 1.2` (derived from the studio's own frame, written as the quotient so provenance survives) + one pure `sideSeatOffset(radius)` shared by all 4 call sites. Now 0.33% on every tier. Test-enforced. |
| 3 | `THREE.DataTexture` defaults to `NearestFilter` on BOTH filters with `generateMipmaps = false`. The relief normal map (1024², grain-heavy) was point-sampled and minified ~17×. | Verified in three's source. Admin sidesteps it by using `CanvasTexture` (+ explicit `anisotropy 8`). Fixed in the SHARED `heightfieldToNormalMap` (relief, fondant grain, cream wave, foam). Displacement map: linear, **no mipmaps** — it's sampled in the VERTEX shader (LOD always 0) and a mipmapped `minFilter` with no mipmaps = incomplete texture = samples BLACK = lift silently gone. |
| 4 | Relief `emissiveIntensity 0.25` with `toneMapped: false` — an additive violet selection tint on an un-tone-mapped material. An orange sticker turned magenta. | The flat path already guarded this (`toneMapped → true` while selected, intensity `0.2`). Relief was cloned from it, kept `false`, and *raised* the intensity. Now at parity. |
| 5 | `bake.domeBlur: 34px` / `bake.edgeRound: 16px` are ABSOLUTE PIXEL radii, authored in the studio against the **raw** PNG while the designer renders the **normalized** master. | `prepareElementImage` → `normalizeThumbnail` trims to the alpha bbox and rescales the subject to `0.8 × 1024 = 819px`. The raw dino's subject is 429px at bake res — **1.93× smaller** — so the same 34px blur does half the work. Height field's flat plateau grew **42.7% → 65.5%** (measured): the dome collapsed into a slab with a hard shoulder. **Fixed at the source:** the studio now calls `prepareElementImage(f, { removeBgEnabled: false })` on file-select, so it bakes the exact image the designer loads, and displays the subject's pixel extent. |
| 6 | Relief `roughness: 0.7` + `sheen: 0.12` (white). Both ADD white, and additive white desaturates a print. | Measured on the real decal (texture saturation `0.907`): baseline **0.345** (62% lost) → `sheen 0` **0.397** → `roughness 0.95` **0.479** → both off **0.607**, which equals a flat decal (`0.629`). **It is NOT the HDRI** — `envMapIntensity 0` changes the result by *literally nothing*; the white is direct specular from the two key lights. Both values came from the studio's slider defaults, authored while previewing the decal ~2× larger than the designer draws it. Defaults now `0.95 / 0` in core AND admin, and **the studio no longer exports them at all** — they're a shared material contract, not a per-element choice. |
| 7 | The relief material was missing the flat path's `emissiveMap` lift (`emissive #ffffff`, `emissiveMap = texture`, `emissiveIntensity 0.12`) — 12% of the *artwork* added back as self-illumination. | Cloned code kept the comment's cousin but dropped the line. **Applied, but it did NOT visibly fix the remaining dullness** — see §2. |

Also fixed: a **null-deref** that would crash every flat sticker (`relief.lift` read before the
`if (reliefOn)` guard — `npm run build` can't catch it, and nothing renders `StickerTexture` in tests);
the snapshot path (`:2004`) never threaded `stickerScale`; and **CORS cache poisoning** (R2 omits
`Vary: Origin` on the no-Origin response, so a single non-CORS fetch of an asset poisons the browser cache
for three.js's `crossOrigin` load — `corsUrl()` now qualifies every texture URL, and `loadSeatImage`'s
hand-rolled `?cors=seat` folded into it).

---

## 2. OPEN: relief renders duller than flat

**Symptom.** With everything above fixed, a relief decal still reads darker/duller than the identical
artwork rendered as a flat decal — most visibly against its **own placement thumbnail**, which IS a flat
decal (the snapshot path at `CakeCanvas.jsx:~2004` never passes `relief`). Same artwork, same tiny size,
side by side on screen: one bright, one dull.

Adding the flat path's `emissiveMap` lift to the relief material (§1 item 7) did **not** visibly fix it.
That change is in the working tree — **decide tomorrow whether to keep it** (defensible on parity grounds
regardless) or revert.

### The decisive experiment (NOT YET RUN)
Place the SAME element twice — once with `relief` in `placement_config`, once without — **at the same
on-screen size, deselected** — and measure both:

```js
import('/diag.js?N')   // → mean LUMINANCE, mean saturation, sticker on screen (px)
```

We have **never** measured a flat decal in the real designer. Every sweep taken today landed on
`MeshPhysicalMaterial`, including runs where the element's config supposedly had no `relief` (stale
instance — see §4). The only flat-decal number in existence came from the harness: `0.6294` saturation.

If flat measures brighter at matched size, bisect the two materials prop by prop. They differ in:
`MeshPhysicalMaterial` vs `MeshStandardMaterial`; `alphaTest 0.5 + alphaToCoverage` vs
`alphaTest 0.05 + transparent + depthWrite:false`; `normalMap` + `displacementMap` present;
`sheenRoughness`; and `envMapIntensity` read from config.

### Numbers as of end of day (orange dino, deselected)
| | admin studio | core designer |
|---|---|---|
| lights | `ambient 0.45 + dir 1.1 + dir 0.4` | **identical** |
| `scene.environment` | present, 1024px | **identical** |
| toneMapping / exposure | ACESFilmic / 1 | **identical** |
| roughness / sheen | 0.95 / 0 | **identical** |
| normalScale | 0.8 | **identical** |
| bake image subject | 610×807px | 620×819px (**now matched**) |
| BUMP / WIDTH | **9.08%** | 5.74% → 9.08% after `lift: 0.07` |
| camera distance | 4.51 | 8.94 |
| decal px on screen | **83,518** | 21,298 |
| **mean LUMINANCE** | **143** | **115** |
| mean saturation | 0.8384 | 0.7587 |

Note the size gap: core draws the decal at **half the linear size**. Mipmapping costs luminance and
saturation at that scale. **A size-matched comparison (zoom until `sticker on screen (px) ≈ 195`) was
requested repeatedly and never completed — do it first.** It may account for the whole gap.

**A measurement error not to repeat:** relief measured `0.7261` saturation vs the flat harness's `0.6294`,
and I read that as "relief keeps more chroma." Wrong. Saturation is a RATIO — `(max−min)/max` — so it
survives darkening. **Luminance** is the number that shows dullness (`115` vs `143`). Compare luminance.

---

## 3. Ruled OUT (measured — do not re-chase)

- **The image optimization / WebP.** Raw PNG `0.9060` vs the R2 asset `0.9079` mean saturation, rendered
  side by side under identical conditions in `dev/compare.html`: **indistinguishable**. WebP `q0.9` costs
  0.25% saturation and **zero** alpha change. The pipeline's resize does NOT dull the sticker. (It *does*
  break the pixel-denominated bake params — §1 item 5 — but that's a geometry effect, not a colour one.)
- **Edge-bleed / transparent-RGB mipmap contamination.** Dilating the colour under the alpha (so mipmaps
  don't average in the transparent black that a canvas round-trip leaves behind — canvases store
  premultiplied alpha, so `getImageData` returns RGB 0 wherever alpha is 0) changed rendered saturation by
  **+1.3%**. Not the cause.
- **Clipping.** `0.0%` of decal pixels have any channel pinned at 255. `toneMapped: true` makes it *worse*.
  So `toneMapped: false` is correct and ACES is not the answer.
- **`envMapIntensity` / the HDRI.** Setting it to `0` changes the render by **literally nothing**.
- **`recolor` repainting the texture.** `material.map.image` is the `HTMLImageElement`; on-material pixels
  == file pixels to 4 decimals.
- **`buildReliefMaps` failing.** It succeeds; both `DataTexture`s returned; displacement map peak = `1.000`.
- **CORS taint.** `getImageData` on the R2 asset succeeds (canvas clean).
- **Missing environment map.** `scene.environment` is PRESENT in both apps.
- **Mesh tessellation.** Raised `RELIEF_SEGMENTS` 96 → 192 (matching admin's ~210 verts/world-unit):
  **no visible difference.** Reverted. The normal map carries the shoulder's shading, not the geometry.
- **The asset being "soft".** The sharpness metric that suggested this compared the teal dino's edge energy
  against a reference computed from the *orange* dino — a cross-artwork threshold. Meaningless. Discarded.

---

## 4. Traps that cost hours today

1. **`placement_config` is SNAPSHOTTED onto the sticker at placement time** (`useCakeDesign.js:645`:
   `relief: element.placement_config?.relief ?? null`). Editing the element in admin does **nothing** to an
   already-placed sticker, and there is no indication. **Always: hard-reload → delete the sticker → place it
   fresh.** This produced at least four wrong conclusions, including "the blue dino has no relief" while
   every probe reported `MeshPhysicalMaterial`.
2. **Selecting a sticker repaints it** with `SELECTION_COLOR #6c47ff` emissive — and placing a sticker
   selects it automatically. Saturation drops `0.7587 → 0.5246`. **You cannot judge a sticker's appearance
   while it is selected.** Fooled us three times. An outline would be a better cue than repainting the art.
3. **`catch (_) { return null }`** in `useReliefMaps` silently disables relief on any error.
4. **`SafeEnvironment`** silently degrades to no env map if the CDN HDRI fails.
5. **CORS cache poisoning** makes texture loads fail *intermittently* ("just reload a few times").
6. **`elements` are fetched once per page load** — a DB edit doesn't reach an open tab.

Every one of these fails **silently**. That is why a three-day bug stayed three days.

---

## 5. Tooling (delete when done)

- `dev/diag.js` — the probe. Import with a cache-busting query: `import('/diag.js?N')`. Prints scene/camera,
  lights, env, the relief material, textures, `BUMP/WIDTH %`, `mean LUMINANCE`, `mean saturation`,
  `sticker on screen (px)`, and the instance's live `relief` config. Exposes `__sweep(i)` (toggles each
  additive-white term and re-measures), `__matchAdmin()`, `__setBumpPct(n)`, `__resetBump()`.
  Copy it to `spattoo-admin/diag.js` to run the identical probe in the studio.
- `dev/compare.html` + `dev/compare.jsx` + `dev/compare-assets/` — a minimal harness: core's exact cake
  size, lights, environment, and the FLAT decal material copied verbatim. Switches the sticker between
  RAW / OPTIMIZED / OPTIMIZED+EDGE-BLEED / R2, with a camera-distance slider, a live on-screen px readout,
  and `__measureRender()`. This is what exonerated the optimization.
- `dev/overflow.js` — unrelated; finds elements overflowing the viewport.

---

## 6. Still to do

1. **Run the size-matched flat-vs-relief comparison** (§2). Everything else is downstream of it.
2. **Data:** other relief elements still carry `roughness: 0.7` / `sheen: 0.12`.
   ```sql
   update cake_elements
   set placement_config = (placement_config #- '{relief,roughness}') #- '{relief,sheen}'
   where placement_config ? 'relief';
   ```
   Also: templates/drafts with an already-placed relief sticker froze a copy at placement time. Decide
   whether a template should follow the element (probably) or freeze (an order, probably).
3. **Re-author the other relief elements' `bake` params** now that the studio previews the normalized
   master. The Dinosaur's `lift` is already `0.07`.
4. **The thumbnail path (`CakeCanvas.jsx:~2004`) never passes `relief`** — snapshots and picker cards render
   flat. Customer-visible.
5. **Ship:** bump `0.1.49`, repack, re-vendor to `spattoo-web` (still on `0.1.48`, with the wrong fix).
6. **R2 server-side:** a custom domain sending `Access-Control-Allow-Origin: *` on EVERY response (setting
   the bucket CORS policy to `*` does NOT do this — R2 only emits CORS headers when an `Origin` is present),
   drop the bucket CORS rules so the header isn't sent twice, and set a `Cache-Control` (there is none, which
   is why poisoned entries survive refreshes as 304s). `corsUrl()` is a mitigation, not the fix.
7. **`radialOffset` and `FLAT_STICKER_Y_OFFSET`** are still absolute world lengths (INVARIANTS #8).
8. Consider reading `placement_config` live at render instead of snapshotting (trap 1), and replacing the
   selection tint with an outline (trap 2).

---

## 7. Files changed (uncommitted)

**spattoo-core**
`canvas/CakeCanvas.jsx` (curved plane ÷ scale · `sideSeatOffset()` · relief matte + sheenless · emissive
lift · selection tint tone-mapped · albedo `anisotropy 8` · `corsUrl()` on 5 loaders · relief null-deref ·
`stickerScale` threaded to the snapshot path · `RELIEF_SEGMENTS`) ·
`constants.js` (`SIDE_STICKER_SEAT_FRAC`) · `placement.js` (`sideSeatOffset`) ·
`utils/assetUrl.js` (new — `corsUrl`) ·
`shared/textures/heightfieldNormal.js` (mipmaps, linear, anisotropy, `NoColorSpace`) ·
`shared/textures/reliefMaps.js` (disp map linear, no mipmaps, `NoColorSpace`) ·
`canvas/TopperPreview.jsx` (both seat sites) ·
`placement.test.js` + `utils/assetUrl.test.js` (11 new tests) ·
`INVARIANTS.md` (**new #8a** — local geometry inside a scaled group must be pre-divided by that scale) ·
`PLACEMENT_CONFIG.md` (relief row + worked example corrected)

**spattoo-admin**
`ReliefStickerStudio.jsx` — fixed a JSX syntax error that had the studio 500-ing before we started; previews
the NORMALIZED master (`prepareElementImage`) and shows the subject's pixel extent; `roughness`/`sheen`
defaults `0.95` / `0` and **no longer exported** into the element config, with a visible warning if the
sliders are moved off them.

`npm run verify` green (92 tests). Both apps build.
