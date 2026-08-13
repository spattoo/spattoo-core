# AR Preview Plan — "View your cake in the room"

> Status: DRAFT for review — created 2026-06-28
> Feature: place the *designed* Spattoo cake, to scale, in the real space via the phone camera.
> Related: [ASSET_OPTIMIZATION_PLAN.md](./ASSET_OPTIMIZATION_PLAN.md), [CI_CD_PIPELINE_PLAN.md](./CI_CD_PIPELINE_PLAN.md)

## 1. What it is

A "View in your space" action that renders **the exact cake the user composed in the Spattoo
designer** — its tiers, finishes, colours, piping, drips, decorations — at real scale in the
room, through the camera. Your design on the actual table, not a generic stock cake.

A marquee differentiator and a genuine **sales tool**: a baker can show a customer the cake in
the room during a consultation; a customer can preview before they commit.

## 2. Key realisation — it's WebGL, so AR goes through the OS model viewers

`@spattoo/designer` is React + Three.js (WebGL). A React Native AR rewrite would mean rebuilding
the entire DOM/CSS designer UI in RN primitives — a second copy of the hardest component. **Don't.**

Instead, AR consumes a **baked 3D file** handed to the platform's native AR viewer:

- **iOS → AR Quick Look** (consumes **USDZ**)
- **Android → Scene Viewer** (consumes **glTF/GLB**)

Both are **launchable straight from a web page** (e.g. `<a rel="ar" href="cake.usdz">`). So —
the rare case where iOS does NOT block us: Safari refuses immersive WebXR, but it happily opens
AR Quick Look from a link. **AR preview works from the web/PWA on both platforms, no native app
required.** A custom ARKit/ARCore experience (richer, branded, interactive) is a later, native-app
upgrade — not a prerequisite.

## 3. Decided: bake from the SNAPSHOT, not the live studio

The cake isn't a static file — it's a Three.js scene composed at runtime from the `design` config.
**AR is a pure function of that config:** `AR = f(snapshot config) → GLB/USDZ → AR viewer`.

**DECIDED 2026-06-28: generate from the pinned quote snapshot, not the live studio session.** This
is better, not a fallback:

- **Decouples from the 6.5k-line `CakeDesigner`** — no export button bolted into active editing;
  AR becomes a standalone "config → asset" step.
- **One mechanism, two entry points (DRY):** the customer's **share screen after sending the
  quote** and the baker's **quote-review screen** consume the *same* snapshot → the *same* asset.
- **Fits design-pinned quotes:** the design is already frozen at quote submit, so the baked AR
  asset is correct forever and never drifts.
- **Baker side stays light:** the baker doesn't re-run the heavy composition — they just open a
  pre-baked file. Works whether the baker app is the Capacitor shell or plain web.

### Entry points
- **Customer:** "View in AR" on the **share screen** shown after sending the quote.
- **Baker:** "View in AR" on the **quote-review** screen (the snapshot is how the baker first
  sees the customer's design anyway).

## 4. Export path (feasible with Three.js's own exporters)

The bridge already exists in the stack:

- **`THREE.GLTFExporter`** → **GLB** (Android Scene Viewer)
- **`THREE.USDZExporter`** → **USDZ** (iOS AR Quick Look)

Both run **in JavaScript, client-side, from the composed scene** — no headless-WebGL server needed.

**Recommended flow (generate-once, cache, reuse):**
1. At **quote submit**, the customer's browser (which already has the designer engine loaded)
   composes the pinned design and exports **GLB + USDZ**.
2. Upload both to **R2** (existing asset storage); store the keys on the quote/order record
   (e.g. `ar_glb_key`, `ar_usdz_key`).
3. Customer share screen and baker quote-review both open the **stored** assets — no per-view
   re-export.

This reuses three things we already have/planned: the **pinned-design quote**, **R2 storage**,
and the **share screen**.

## 5. Fidelity caveat (the one real piece of work)

Standard PBR meshes export cleanly; **custom runtime shaders do not serialise.**

- Finishes built on **real geometry displacement** (e.g. cream-wave) **export fine** — the detail
  is in the geometry.
- Finishes that rely on a **custom shader / normal-map trickery** may flatten or drop → they must
  **bake to geometry / standard-PBR** before export.
- **Metallic gold** survives as PBR metalness; AR Quick Look / Scene Viewer supply their own
  image-based lighting, so it renders reasonably without our env map.

Part of the build is an audit: for each finish/decoration, does it export faithfully as-is, or
does it need a bake step? This shares discipline with the optimization plan's LOD/standard-PBR
work — track it jointly.

## 6. Inherits the optimization discipline (cross-ref)

The baked GLB/USDZ is a 3D asset on a phone — same constraints as
[ASSET_OPTIMIZATION_PLAN.md](./ASSET_OPTIMIZATION_PLAN.md): KTX2/Draco, mobile LOD, the §3 caps.
A cap-compliant cake exports a **smaller, faster** AR asset. Reuse the same optimization pipeline
outputs rather than exporting raw full-res geometry.

## 7. Phasing

- **Phase 1 — AR via OS viewers, from the web/PWA (high reach, no native app).**
  Bake GLB+USDZ at quote submit → R2 → "View in AR" buttons on the customer share screen and the
  baker quote view. AR Quick Look (iOS) + Scene Viewer (Android). Includes the §5 finish-export
  audit + any bake steps.
- **Phase 2 — custom native AR (marquee, native baker app).**
  Full ARKit/ARCore in the Capacitor shell: branded UI, live interaction/animation, place-and-walk-
  around. Also a strong App Store 4.2 "genuine native value" anchor (see
  [CI_CD_PIPELINE_PLAN.md](./CI_CD_PIPELINE_PLAN.md) §7).

## 8. Open decisions

1. **Export trigger/location:** client-side at quote submit (recommended — engine already loaded,
   no server GL) vs. a server-side headless renderer. Confirm client-side.
2. **Where to bake:** exactly at quote-submit, or lazily on first "View in AR" then cache to R2?
3. **Quote/order schema:** confirm `ar_glb_key` / `ar_usdz_key` columns (+ `ar_baked_at`,
   `ar_exporter_version` for re-bake when finishes improve).
4. **Finish-export audit:** enumerate which current finishes export as-is vs. need a bake step
   (feeds Phase 1 scope).
5. **Customer-side AR scope:** storefront PWA only, or also a future customer native app (customers
   are PWA per the scale model — AR Quick Look/Scene Viewer cover them in-browser).
