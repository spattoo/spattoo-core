# Asset Optimization & Memory Budget Plan

> Status: DRAFT for review — created 2026-06-28
> Owners: core (render), admin (ingest), api (storage/variants)
> Related: [CI_CD_PIPELINE_PLAN.md](./CI_CD_PIPELINE_PLAN.md), [AR_PREVIEW_PLAN.md](./AR_PREVIEW_PLAN.md)

## 1. Why this exists (the problem, stated for scale)

Spattoo cakes are composed at runtime from many GLB elements. Some source GLBs are
**6–7 MB even compressed**, and a single cake can place dozens of elements (scatter,
cluster, decor patterns). On phones — our primary baker AND customer surface — this
threatens three distinct things that people keep merging into the word "memory":

1. **Runtime RAM** (GPU + JS heap) while the designer is open. Exceed it → jank, then the
   OS silently kills the tab / WebView. iOS Safari is the most aggressive.
2. **Disk / cache footprint** — cached GLBs accumulating so "Spattoo" shows hundreds of MB
   in the phone's Storage list. This is a **trust / retention** problem (users assume bloat
   or spyware), not a crash problem.
3. **Store approval** — Apple/Google do **not** reject for being "heavy" per se, but they
   reject the *symptoms*: an **OOM crash on the reviewer's mid-range device** (Apple 2.1
   performance/crash; Google pre-launch crash report + Android vitals). So bounding memory
   is directly de-risking review, not just polishing UX.

**Scale assumption:** model for a **named target device** (see §3), not for a flagship phone
or "today's tiny library." The element library grows to thousands of items; a cake composes
tens of them; both bakers and customers are on mid-range phones. Optimize the **hot path**
(every element loaded on every device), fix it **once at ingest** so all consumers benefit.

## 2. The insight that reframes everything

**File size is the SMALL part of the memory cost. Decoded textures dominate RAM.**

A 2048×2048 texture is a few hundred KB as JPG/PNG on disk, but decompresses to
**~16 MB of raw RGBA in GPU memory** (~22 MB with mipmaps). A 6 MB GLB with 3–4 such
textures can occupy **60–90 MB of GPU RAM**. A multi-element cake is therefore **not**
"7 MB × N" in memory — it can be **hundreds of MB**.

Consequence: compressing the *download* further (gzip/Draco geometry alone) barely helps
RAM. The decisive lever is keeping **textures compressed *in GPU memory*** (KTX2/Basis →
ASTC/ETC2). That is the single highest-impact change in this whole plan.

## 3. Target device & budgets (the caps — "right from now")

These are the **proposed** caps to lock in immediately. Tune the numbers, but adopt the
**shape** (per-element + per-scene budget against a named device) now.

### Target device floor — DECIDED 2026-06-28 (Floor B, one conservative floor, India reach prioritised)

**One floor for everyone, driven by the (uncontrolled, stricter) customer storefront.** Bakers
inherit the headroom. India budget-Android reach is an explicit priority, so the floor is held
*and* a graceful degrade path protects the sub-floor long tail (never crash, just lighter).

- **iPhone floor:** ~3 GB RAM class (iPhone XR / 11 / SE2), iOS Safari/WKWebView.
- **Android floor:** ~4 GB RAM mid-range, ~3 years old, WebGL2.
- At/above the floor → a full cake loads with **no OOM**, full quality.
- Below the floor (e.g. 2–3 GB budget Android, big in India) → **degrade, never crash** (see
  degrade policy below).

**The binding constraint is page memory, not device RAM.** A 3 GB phone gives a single web page
only a few hundred MB before Safari/WebView kills it (~200–400 MB band, device-dependent, **not**
published — measure empirically). So the floor translates to a concrete, testable ceiling:

- **Page-memory ceiling (3 GB iPhone):** target **≤ ~250 MB** total page memory for a full design,
  measured on the real device. The §3 scene budget (120 soft / 150 hard GPU) is sized to fit under
  this with headroom for JS heap + browser overhead. **Re-measure and pin the real number** on the
  floor iPhone before locking the GPU budget.

### Degrade-below-floor policy (protects the India budget-Android tail)

Sub-floor devices must get a lighter experience, never an OOM — and **never a smaller cake**. The
ladder reduces **fidelity**, never the number of elements the user placed. Applied by the runtime
budget guard (§4) when device class / live memory pressure indicates risk:

1. Force **mobile LOD + ≤1K (or smaller) textures** on every element.
2. **Globally step down fidelity** further (lower LOD / smaller textures across the *whole* scene)
   — every placed element stays; they just render at lower detail. (NOT a cap on element count.)
3. As a final fallback, render the **pinned 2D snapshot** of the design instead of the live 3D
   scene — which still shows the **full** design, every element included, just flat (the same
   snapshot used for quotes/AR — reuse, don't build new).

### Test matrix (a floor you don't test isn't a floor)

- **Manual:** one ~3 GB iPhone (XR/11/SE2) on Safari + the Capacitor WKWebView.
- **Android:** Google Play **pre-launch report** on a low-RAM device, plus one ~4 GB mid-range
  handset (Redmi/Realme/Samsung-A class — representative of the India market).
- Verify a **worst-case full cake** (max elements / scatter / cluster) stays under the page-memory
  ceiling without a crash, and that sub-floor devices hit the degrade ladder rather than OOM.

### Per-element caps — 3-class tiered model (DECIDED 2026-06-28), enforced at ingest (§5)

**Caps scale inversely with expected element count.** High-count classes (which multiply and
are the real OOM risk) are squeezed hard; single-instance toppers get quality headroom. The
India-reach tilt lands on scatter/decor (the multipliers); topper is the most lenient. The class
is **derived at ingest from placement/usage** — scatter/cluster → *small*, topper → *hero*, else
→ *decor* — NOT a new schema branch. (Caps are per **unique asset**; placing it many times is
free via dedup + instancing, §4 — so these caps never constrain composition.)

| Class | Textures (mobile / desktop) | Triangles (mobile / desktop) | Optimized GLB (mobile / desktop) | Decoded GPU (mobile) |
|---|---|---|---|---|
| **Scatter / small** (sprinkles, beads, pearls — high count, instanced) | ≤512 / ≤1024 | ≤3k / ≤8k | ≤250 KB / ≤500 KB | **≤1.5 MB** |
| **Decor** (flowers, bows, standard decorations — moderate count) | ≤1024 / ≤2048 | ≤25k / ≤50k | ≤1 MB / ≤2 MB | **≤4 MB** *(tightened)* |
| **Topper / hero** (centerpiece — usually 1 instance) | ≤1024 / ≤2048 | ≤75k / ≤150k | ≤2 MB / ≤3.5 MB | **≤10 MB** *(tightened)* |

**Universal (all classes):** KTX2/Basis textures required (`KHR_texture_basisu`, never raw
JPG/PNG-only) · Draco or Meshopt geometry required (`KHR_draco_mesh_compression` /
`EXT_meshopt_compression`) · power-of-two, mip-friendly textures.

**Decoded-GPU is computed, not eyeballed** (auditable at ingest, stored on the element row):
`Σ_textures (w·h·bytes-per-format · 1.33 mips) + tris · ~32 B`.

**Budget sanity check:** ~20 unique decor assets at ≤4 MB ≈ 80 MB — comfortably under the
120 MB soft ceiling *before* the runtime fidelity guard engages, leaving room for a 10 MB topper
+ base cake/finishes. A busy, creative cake fits on the floor device without a crash.

### Thumbnail spec (picker images) — DECIDED 2026-06-28

The Elements/Decorations picker is the **hottest image surface** in the app — it loads **all tiles
at once, upfront**, unlike the cake (which loads element assets only as they're placed). Oversized
thumbnails hit harder here than anywhere else.

**Evidence (2026-06-28):** `elements/thumbnails/` held **full-res PNGs, 45 KB–1 MB each** — not
thumbnails at all. At ~512²–1024² they decode to **1–4 MB of RAM each**, ×dozens in the picker =
tens–hundreds of MB on the floor device. (A broken `/cdn-cgi/image/` Cloudflare transform was a
band-aid trying to shrink these on the fly — it **404s on the `r2.dev` endpoint** and is
unnecessary once a thumbnail is pre-baked.)

| Field | Spec |
|---|---|
| Format | **WebP** (alpha preserved). **NOT AVIF** — Safari 15 (our floor) can't decode AVIF; WebP works on Safari 14+. |
| Max dimension | **≤256 px** (covers a ~128 px tile at 2×) |
| Quality | ~80 |
| Target size | **≤ ~15 KB** (~100× smaller than today's PNGs) |
| Delivery | **Served DIRECTLY from R2** — no per-request `/cdn-cgi/image/` transform (pre-baked is deterministic + cacheable, and the transform doesn't work on `r2.dev` anyway) |
| Generation | At **ingest** (§5 optimizer), stored under its own key (`thumb_key`); the picker reads that key |
| Fallback | Picker shows a **placeholder tile** on load error — never the browser's broken-`?` |

**Back-catalog:** the existing oversized PNGs get re-processed by the §6 sweep into spec WebP
thumbnails; the misfiled full-res originals are moved out of `thumbnails/` (or deleted if a
higher-res source is retained elsewhere).

### Per-scene budget (enforced at runtime — §4)

**PRINCIPLE: composition is never capped.** Limiting how many elements a user may place would
kill the creativity that is the entire point of the app. Memory scales with **unique assets and
fidelity**, NOT with element count. The budget is held by making each asset cheap (§5 ingest),
sharing/instancing repeats, and reducing *fidelity* (never *count*) under pressure — never by
refusing a placement.

- **GPU memory:** soft budget **~120 MB**, hard ceiling **~150 MB** → on approach, **globally
  reduce fidelity** (drop LOD / texture tier across the whole scene). Never block adding an
  element; never silently drop one the user placed.
- **Disk cache:** **150 MB** LRU cap with eviction.
- **Draw calls / memory:** scale with **unique assets**, not placements — dedup shared
  geometry/textures and instance repeats (scatter/cluster/decor-pattern).

> These numbers are starting points sized to the target device. The **mechanism** (caps at
> ingest + budget at runtime + a named device) is the durable part; revisit the digits with
> real telemetry (§7).

## 4. Runtime measures (spattoo-core / designer)

Biggest-impact first:

1. **KTX2 / Basis textures** — load via `KTX2Loader` (Three.js). Textures stay GPU-compressed
   (ASTC/ETC2/BC), cutting texture RAM 4–8×. **This is the top priority.**
2. **Shared-asset dedup (the key to unlimited composition)** — cache decoded geometry/material/
   texture by asset key and **share one GPU copy across every placement**. A cake with 100
   elements of 10 unique types costs ~10 types, not 100. Memory tracks **unique assets**, so the
   user can place freely without linear memory growth. Build/extend a single asset cache; never
   re-decode an already-loaded asset.
3. **Instancing** — repeats of the *same* element (scatter/cluster/decor-pattern) use
   `InstancedMesh`: one geometry upload, N transforms. Placing 200 sprinkles ≈ the cost of one.
   (Audit current scatter/cluster paths for accidental duplication.)
4. **Dispose discipline** — on element removal, explicitly `.dispose()` geometry, material, and
   textures (respecting the shared cache — only free when the last placement is gone). Users add/
   remove constantly; a missing dispose is a leak, not a micro-opt. Route every removal through a
   single shared teardown helper (DRY).
5. **Dynamic LOD by screen size / distance** — elements that are small on screen or far from the
   camera render at lower LOD automatically. As a design grows busier, distant/tiny pieces quietly
   shed detail — fidelity flexes, **count never does**.
6. **Mobile LOD / texture tier selection** — phones load the mobile variant (≤1K textures, lower
   poly); desktop gets the high tier. Config/device-driven, not a per-element branch.
7. **Per-scene budget guard (fidelity, never count)** — track `renderer.info` + an estimated
   GPU-mem accumulator; as a design approaches the ceiling, **globally step down LOD/texture
   tier** so every placed element stays on screen at lower detail. The guard NEVER refuses a
   placement or removes a user's element — it only trades fidelity to stay under the ceiling, and
   only falls to the 2D snapshot (full design) as the absolute last resort on sub-floor devices.

## 5. Ingest optimizer pipeline (spattoo-admin + spattoo-api)

**Principle:** the heavy 6–7 MB raw asset must **never reach a device**. Optimization happens
**once, at element ingest**, and stores optimized variants in R2 — consistent with
"admin authors master data, all consumers read the optimized result."

On element upload (admin `AddElement` → api):
1. **Validate against §3 caps.** Reject (or auto-downscale) anything over the hard limits;
   report the violation to the admin with the measured numbers.
2. **Geometry:** compress with Draco or Meshopt.
3. **Textures:** transcode to **KTX2/Basis**; generate **mobile (≤1K)** and **desktop (≤2K)**
   tiers; strip unused channels.
4. **LOD:** generate at least a mobile LOD (decimated) for high-tri elements.
5. **Store variants in R2** alongside the original, with keys recorded on the element row
   (e.g. `glb_mobile_key`, `glb_desktop_key`, `glb_raw_key`). Designer reads the device-correct
   variant; raw is kept only as the re-processing source.
6. **Record measured stats** on the element (tri count, texture dims, decoded-mem estimate,
   optimized size) so caps are auditable and the budget guard can read them.

Thumbnails: the same job also generates the **picker thumbnail** per the §3 thumbnail spec
(WebP ≤256 px, q~80, stored under `thumb_key`, served directly — never via `/cdn-cgi/image/`).

Tooling candidates: `gltf-transform` (Draco/Meshopt/KTX2/resize/prune in one pipeline),
`gltfpack` (Meshopt), Basis Universal encoder. Run server-side (api worker / BullMQ job) so the
admin UI stays responsive; surface progress + final stats back to the admin.

## 6. Migration — existing library

Existing elements were authored before these caps. Add a **re-optimization job** that runs the
§5 pipeline over the current library, writes the new variants + stats, and flags any element
that can't meet caps for manual attention. New uploads are gated from day one; the back-catalog
is swept in a batch.

## 7. Enforcement & measurement

- **Ingest gate:** api rejects/auto-fixes over-cap uploads (hard fail on the worst; warn +
  auto-downscale on the rest). No over-cap element enters the library silently.
- **CI check:** a `check:assets` step (mirrors the existing `check:paths`/`check:schema`
  pattern) that fails if any referenced element variant exceeds caps. Wire into `npm run verify`.
- **Runtime telemetry:** report per-scene peak GPU-mem estimate, element count, and any
  budget-guard trips (via the existing `reportError`/telemetry wrapper). This is how we tune
  the §3 digits with real data instead of guesses.
- **Disk/UX:** bounded LRU cache + a visible "Storage used: ~X MB / Clear cache" control in
  settings, so the Storage-report number never reads as unexplained bloat.

## 8. Honest expectation-setting

A detailed 3D cake is not free. Done right, an active design stays **bounded and predictable**
(target: under the §3 ceilings on the named device); done wrong, a few elements crash mid-range
phones and risk store rejection (§1.3). The promise is **"a defined budget on a defined device,
enforced at ingest,"** not "it'll be tiny." That is the expectation we set internally and the
bar every new element is held to.

## 9. How this feeds the other two docs

- **CI/CD:** the optimizer is a pipeline stage; `check:assets` is a gate. The same KTX2/Draco
  outputs are what CI ships.
- **AR:** the GLB/USDZ baked for AR Quick Look / Scene Viewer inherits the same KTX2/LOD
  discipline; cap-compliant elements export smaller, faster AR assets. Custom-shader finishes
  must bake to geometry/standard-PBR before export (shared concern with this plan's LOD step).

## 10. Open decisions (need sign-off)

1. ~~Confirm the **target device** floor (§3)~~ — **DECIDED 2026-06-28: Floor B (3 GB iPhone /
   4 GB Android), one conservative customer-driven floor, India reach prioritised, degrade-below-
   floor policy.** Remaining sub-task: **measure & pin the real page-memory ceiling** on the floor
   iPhone (the ~250 MB target is provisional until measured).
2. ~~Confirm/adjust the **cap digits** (§3 tables).~~ — **DECIDED 2026-06-28: 3-class tiered
   model (scatter/decor/topper), India-tilt on the multipliers; decor decoded tightened to
   ≤4 MB, topper to ≤10 MB.**
3. ~~Optimizer **location**~~ — **DECIDED 2026-06-28: api-side BullMQ worker job** (reuse existing
   Redis/BullMQ; CPU-heavy + async; one code path serves new uploads AND the §6 back-catalog
   sweep). Admin uploads raw → api stores raw → enqueues optimize job → worker writes variants +
   stats → admin UI shows progress/final numbers.
4. ~~Variant **storage keys** schema~~ — **DECIDED 2026-06-28: flat columns on `cake_elements`**
   (bounded master data): `glb_raw_key`, `glb_mobile_key`, `glb_desktop_key`, `thumb_key` (text R2 keys),
   `asset_class smallint` (1=scatter/2=decor/3=topper, compact FK, readable via lookup),
   `tri_count int`, `texture_max_dim smallint`, `decoded_mem_kb int`, `optimized_size_kb int`,
   `optimizer_version smallint`, `optimized_at timestamptz`. If tiers ever proliferate beyond
   mobile/desktop, migrate to a child `element_variants` table.
5. ~~Auto-downscale vs hard-reject~~ — **DECIDED 2026-06-28: principled hybrid.** Always run the
   safe/lossless optimizations (KTX2, Draco, resize oversized textures to the tier ceiling). If
   the asset still exceeds caps after that (typically tri-count), **hard-reject with measured
   numbers shown to the admin** — never silently degrade authored quality. Optional explicit
   admin "force-accept + auto-decimate" override for the rare accepted-quality-hit case.
