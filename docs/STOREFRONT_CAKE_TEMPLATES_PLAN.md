# Cake designs as an authoritative storefront-image source — Plan

**Status:** in progress · **Started:** 2026-07-03 · **Branch:** `feat/baker-cake-templates`

## Vision
The baker's storefront imagery should be their **real cake designs**, not stock uploads. So the baker's
saved cake-design templates (each with a rendered thumbnail) become an **authoritative image source**
the baker can pick from when filling the storefront — with uploads still allowed as a secondary option.
Baker stays fully in control (opt-in per image, nothing automatic).

**Pivoted 2026-07-03** away from an earlier idea (a separate shoppable "templates catalog" section on
the storefront) — no new section. Instead, template thumbnails feed the EXISTING image controls.

## Decisions (locked)
1. **No new storefront section.** Template thumbnails are an image *source*, used inside the existing
   customiser controls. Storefront render is unchanged.
2. **Surfaces:** the **gallery** ("Our creations") first, then the **hero image** (fast follow-up).
   Each control gets a "Choose from your designs" action next to Upload.
3. **Snapshot, not live link (Option A).** Picking a design copies its *current* thumbnail as an
   independent gallery/hero image — it stays exactly as picked and never changes if the design is later
   edited or deleted. The baker re-picks to refresh. (Chosen for baker control + robustness.)
4. **Snapshot done server-side.** A baker API endpoint COPIES the design's thumbnail R2 object into the
   baker's gallery folder + records the photo row — avoids CORS/lifecycle fragility of referencing the
   design's object, and keeps gallery images self-contained.
5. **Capability-gated UI.** The "Choose from your designs" button shows only when the host apiClient
   exposes `addStorefrontPhotoFromTemplate` (and the baker has designs) — safe to ship before the
   endpoint exists; it simply stays hidden until the web app wires the method.

## Status
- **DONE (core, verified in `dev/customiser.html`):** gallery "Choose from your designs" picker in
  `ThemePreview.jsx` — fetches designs via `apiClient.fetchTemplates()`, modal thumbnail grid, tap →
  optimistic add → reconcile with the persisted row via `apiClient.addStorefrontPhotoFromTemplate(id)`.
  Reuses the existing gallery list/remove/caption/preview unchanged. Capability-gated.
- **NEXT (api):** `POST /api/baker/storefront/photos/from-template { template_id }` — verify the baker
  can access the design (`scopeCatalogRead`: global or own), R2 CopyObject thumbnail →
  `storefront/gallery/…`, insert `baker_storefront_photos` (baker_id = req.bakerId), return the row.
- **NEXT (web):** add `addStorefrontPhotoFromTemplate` to the baker apiClient → unhides the button.
- **THEN:** hero-image control (same picker + snapshot), and (separately) baker "save design as
  template" so the picker fills with the baker's OWN designs (today `fetchTemplates` = own + globals).

## Reuse map (grounding — file:line)
- Save + thumbnail capture: `CakeDesigner.jsx:1518` `onSaveTemplate`, `utils/thumbnail.js:13`
  `captureThumbnailBlob`, R2 `templates/thumbnails/`.
- Gallery plumbing (unchanged): `ThemePreview.jsx` `addPhotos` / `addStorefrontPhoto` / `removePhoto`;
  public read `baker_storefront_photos` in `spattoo-api src/routes/storefront.js:73`.
- Template read: `apiClient.fetchTemplates()` (own + globals via `scopeCatalogRead`), thumbnails as
  public URLs (`spattoo-api src/routes/templates.js`).
- Baker-owned mirror for the new endpoint: `baker_storefront_photos` (`storefront_media.sql`),
  `assertBakerOwns` / `scopeCatalogRead` (`src/lib/tenantScope.js`).
