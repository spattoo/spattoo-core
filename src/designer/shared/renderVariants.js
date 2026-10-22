/* ── Which copy of a decoration's artwork the CAKE is drawn from ─────────────────────────────────
 *
 * A 2D decoration has two pictures of itself, and they are not interchangeable:
 *
 *   image_url   the MASTER. What an edible print is made from — the A4 sheet exports at 300 dpi, so
 *               1024 px is 87 mm of printed decoration and there is no headroom to give away.
 *   render_key  a ≤512 WebP copy, made at ingest (api: services/thumbnails.js, migration 132).
 *               What the 3D cake is textured from.
 *
 * ⚠️ THE REASON IS GPU MEMORY, AND IT HAS NOTHING TO DO WITH FILE SIZE. A 1024² sticker is maybe
 * 300 KB on the wire and 1024·1024·4·1.33 ≈ 5.3 MB of decoded RGBA once it is a texture. At 512²
 * the same arithmetic gives 1.3 MB — a QUARTER, because the cost follows the AREA. Measured on one
 * relief sticker: 8.3 MB resident for a single decoration. A busy cake is twenty of those, and the
 * device we are sized for is a 3 GB phone (docs/ASSET_OPTIMIZATION_PLAN.md §3, Floor B).
 *
 * Nobody can see the difference. A decoration occupies a few hundred pixels of a phone screen.
 *
 * ── Why a registry and not a prop ───────────────────────────────────────────────────────────────
 *
 * ⚠️ THE RENDERER IS HANDED A DESIGN, NOT A CATALOGUE. `toCanvasConfig` is pure and takes only the
 * design; a saved sticker carries `imageUrl` and an `elementId`, and `CakePreview` — the storefront,
 * order thumbnails, the template picker — is given nothing else at all. So the small copy's URL
 * cannot arrive as a prop without threading a catalogue through every one of those call sites.
 *
 * It must not be baked into the design either. The design JSON is the SAVED record, and writing a
 * derived asset into it means every cake saved before today stays expensive forever — including the
 * templates, which are the busiest cakes we have and the ones a customer loads first.
 *
 * So the host registers what it loaded, exactly as `configureEnvMap` is told which HDRI lights the
 * scene. Unregistered is a correct state, not a broken one: the master gets drawn, which is what
 * happened yesterday.
 *
 * ── The one thing this must never touch ─────────────────────────────────────────────────────────
 *
 * ⚠️ PRINTING. `chefsdesk/a4/cutoutSource.js` reads `element.image_url` and must keep reading it;
 * `corsUrl()` is deliberately NOT the hook for any of this, because the print path goes through
 * corsUrl too (framePhoto.js → loadImage) and folding the lookup in there would halve the
 * resolution of every edible sheet with no error and nothing to see — until a cake came out soft.
 * cutoutSource.test.js holds that line.
 */

import { useSyncExternalStore } from 'react';

/* Keyed on the master's FILE NAME, not its full URL, and that is deliberate. The same decoration
 * arrives spelled several ways — the API composes a public URL, a saved design carries whatever URL
 * it was given when it was saved, and the asset base has moved before (r2.dev → spattoocdn.com). A
 * uuid file name is the part that is stable across all of them, and it is a uuid, so it cannot
 * collide with another element's. */
const byName = new Map();

/* ── And it has to WAKE the renderer, not just answer it ─────────────────────────────────────────
 *
 * ⚠️ OPENING A SAVED CAKE LOSES THE RACE, which is the case this store exists for. A design that
 * already has decorations triggers an eager catalogue fetch on mount (CakeDesigner) — and the canvas
 * mounts in the same commit, so every sticker renders from its master before a single row has come
 * back. A plain lookup would be asked once, answer "nothing registered", and stay on the master for
 * the life of the page: the authoring path (open the picker, place a decoration) would get the
 * small copy and the revisit path — a baker reopening last week's cake — would never get it.
 *
 * So registration is an external store and the render seam subscribes. The cost of being right is
 * one wasted download of the master per distinct sticker, once, on the first cake of a session; the
 * registry is module-level, so every cake after that resolves on its first render. The master is
 * ref-counted like any other artwork and goes back when the last user of it leaves
 * (CakeCanvas → stickerAlbedoCache).
 */
let version = 0;
const listeners = new Set();

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const getVersion = () => version;

function nameOf(url) {
  if (!url || typeof url !== 'string') return null;
  if (/^(data|blob):/i.test(url)) return null;          // belongs to one instance; nothing to share
  const path = url.split(/[?#]/)[0];
  const last = path.split('/').pop();
  return last || null;
}

/**
 * Record the small copies of whatever element rows a host has just loaded. Idempotent and additive,
 * so it can be called on every catalogue page/category fetch.
 *
 * @param {Array<{image_url?: string, render_key?: string}>} rows — element rows as the API returns
 *   them: `render_key` already resolved to a public URL (api: withPublicUrls), null when there is no
 *   small copy. A row without one is skipped rather than recorded as null — the lookup's own default
 *   is the master, so there is nothing to say.
 */
export function registerRenderVariants(rows) {
  let changed = false;
  for (const r of rows ?? []) {
    const master = nameOf(r?.image_url);
    if (!master || !r?.render_key) continue;
    if (byName.get(master) === r.render_key) continue;
    byName.set(master, r.render_key);
    changed = true;
  }
  /* Only on a real change, and this guard is load-bearing: the catalogue is re-read on every
     category open and after a decoration is saved, so notifying unconditionally would re-render
     every sticker on the cake for a fetch that taught us nothing. */
  if (!changed) return;
  version++;
  for (const fn of listeners) fn();
}

/**
 * The URL to TEXTURE a decoration from: its small copy if one was registered, otherwise the master
 * unchanged. Pure, and identity for anything unknown — a generated image, an upload, a studio
 * preview, or simply a catalogue nobody has loaded yet.
 *
 * ⚠️ BOTH HALVES OF A RECOLOUR MUST CALL THIS, or neither. `useImageRegions` clusters the artwork's
 * hues to build one swatch per colour and `useStickerImageTexture` clusters it again to repaint
 * them; the two line up only because they derive from the SAME pixels. Resolve one to the small
 * copy and not the other and the swatch at index 2 recolours a region that is not the one it shows
 * — and it downloads the picture twice to do it.
 */
export function renderVariantUrl(url) {
  const name = nameOf(url);
  return (name && byName.get(name)) || url;
}

/**
 * The hook form, for a component that must REDRAW when the catalogue arrives — which is every
 * render seam, for the reason set out beside the store above. Same answer as `renderVariantUrl`,
 * plus a subscription.
 */
export function useRenderVariantUrl(url) {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return renderVariantUrl(url);
}

/** Test seam. Not for production code — a host registers, it never un-registers. */
export function __resetRenderVariants() {
  byName.clear();
  version++;
  for (const fn of listeners) fn();
}
