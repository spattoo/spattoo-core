import { extractRegions } from '../designer/shared/color/imageRecolor.js';

// ── Image ingest — the ONE pipeline every picked image goes through ──────────────────────────────
// A user hands us a File (phone camera, gallery, a drag-drop). Before it reaches R2 it must be
// VALIDATED (is this even an image we can decode?) and OPTIMIZED (a 12MB 4032×3024 phone photo is not
// what should sit behind a 400px sticker). This module is that pipeline, and it is shared across the
// repos: the designer's Uploads paths call it, and spattoo-admin's element authoring calls the very
// same functions through @spattoo/designer — so a baker's uploaded decoration and an admin-authored
// element are produced by identical code and cannot drift (a second copy WOULD drift; it already had
// — admin's normalizeThumbnail lacked EXIF handling and hung forever on an undecodable file).
//
// TWO INGEST SHAPES, because there are two kinds of picture and squaring the wrong one ruins it:
//
//   compressImage(file)     ARTWORK-AGNOSTIC PHOTO. Aspect preserved, long edge capped. A birthday
//                           photo in a photo-cake frame, a finished-cake photo on an order. Cropping
//                           it to its alpha bounds would be meaningless (it has no alpha) and squaring
//                           it would distort the framing the customer chose.
//
//   normalizeArtwork(blob)  A DECORATION. Cropped to its non-transparent bounds and centred at 80% of
//                           a square, so every decoration frames consistently on the cake and in the
//                           picker regardless of how much empty space the source had around it.
//
// Both end as WebP (alpha preserved, several times smaller than PNG at the same visual quality —
// ASSET_OPTIMIZATION_PLAN.md §3; WebP not AVIF because Safari 15 is the floor). A browser that cannot
// encode WebP via canvas falls back to the ORIGINAL blob untouched, so every caller MUST derive the
// upload's extension AND Content-Type from the returned blob's REAL `type` (see `imageExt`) — the R2
// signed PUT signs the content type, so filename, signed type and PUT header must all agree.

// The formats we accept. An allowlist, not `image/*`: HEIC (a Mac drag-drop, an iPhone that hasn't
// transcoded) and SVG (a script vector, not a picture) both satisfy `image/*` and both then fail — HEIC
// because no browser canvas can decode it, SVG because it is markup we would be re-hosting. Saying no
// at the door with a sentence the user can act on beats an upload that silently produces nothing.
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const ACCEPT_IMAGE = IMAGE_TYPES.join(',');

// The size ceiling is CONFIG, and it lives on the API (env `UPLOAD_MAX_IMAGE_MB`) — one number, read at
// runtime via GET /api/storage/limits (see useUploadLimits.js). This constant is only the FALLBACK, for
// a host that hasn't wired the fetch: it must stay in step with the API's default, because a client that
// accepts more than the server will is a client that lets a user wait for an upload the server then 413s.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Validate a picked File BEFORE decoding it. Returns a human sentence to SHOW, or null if it's fine.
// The `accept` attribute is advisory only — it doesn't survive a drag-drop and it doesn't survive a
// user picking "All files" — so this is the real gate, at the entry point, not at the write-point.
export function validateImageFile(file, { maxBytes = MAX_IMAGE_BYTES } = {}) {
  if (!file) return 'Choose an image.';
  if (!IMAGE_TYPES.includes(file.type)) return 'That file isn’t a picture we can use. Choose a PNG, JPEG or WebP.';
  // Say what to DO about it. A phone shooting at its highest resolution can exceed the limit on a single
  // ordinary photo, and "too large" alone leaves her stuck with a picture she can plainly see is fine.
  if (file.size > maxBytes) {
    return `That image is too large (over ${Math.round(maxBytes / (1024 * 1024))}MB). Try a smaller photo, `
         + `or your phone's standard quality setting.`;
  }
  return null;
}

// File extension matching a blob's REAL MIME. Never guess from the source filename: the pipeline may
// have re-encoded (png in → webp out) or fallen back (webp encode unsupported → the original jpeg).
export function imageExt(blob) {
  switch (blob?.type) {
    case 'image/webp': return 'webp';
    case 'image/jpeg': return 'jpg';
    default:           return 'png';
  }
}

// Decode a File/Blob to something drawable. createImageBitmap honours EXIF orientation when asked —
// without it, a portrait phone photo lands sideways on the cake. <img> is the fallback for browsers
// without it; it REJECTS on a file it cannot decode (a HEIC that slipped past validation) rather than
// leaving the promise pending forever, which is what silently swallowed such files before.
export async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* fall through */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

const toBlob = (canvas, quality) => new Promise(res => canvas.toBlob(res, 'image/webp', quality));
const dims   = (bitmap) => [bitmap.width || bitmap.naturalWidth, bitmap.height || bitmap.naturalHeight];

// Re-encode to WebP at the SAME dimensions (alpha preserved). Already-WebP passes straight through.
// Use when the pixels are already right and only the container is heavy.
export async function encodeWebp(blob, quality = 0.9) {
  if (!blob || blob.type === 'image/webp') return blob;
  try {
    const bitmap = await decodeImage(blob);
    const [w, h] = dims(bitmap);
    if (!w || !h) return blob;
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return (await toBlob(canvas, quality)) ?? blob;
  } catch {
    return blob;   // undecodable or no WebP encoder → the original, untouched
  }
}

// PHOTO. Downscale so the long edge is at most `maxEdge`, keep the aspect ratio, re-encode to WebP.
export async function compressImage(file, { maxEdge = 1600, quality = 0.82 } = {}) {
  try {
    const bitmap = await decodeImage(file);
    const [srcW, srcH] = dims(bitmap);
    if (!srcW || !srcH) return file;
    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return (await toBlob(canvas, quality)) ?? file;
  } catch {
    return file;   // never lose the picture over a failed optimization
  }
}

// DECORATION. Crop to the non-transparent bounding box, then scale to fill `fill` of a square `size`
// frame, centred. Alpha > ALPHA_FLOOR counts as content — anti-aliased edges and remove.bg's soft
// fringe are near-zero alpha and would otherwise inflate the bounds back to the full image.
export const ALPHA_FLOOR = 10;

// The opaque bounding box of RGBA `data`, or null when nothing clears the floor (a fully
// transparent image). Extracted so the upload-time crop (normalizeArtwork) and the render-time
// logo trim (useTrimmedLogo) cannot disagree about what "the edge of the artwork" means — and so
// the pixel logic is unit-testable, since the tests run in node with no canvas.
export function alphaBounds(data, w, h, floor = ALPHA_FLOOR) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > floor) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export async function normalizeArtwork(blob, { size = 1024, fill = 0.8, quality = 0.9 } = {}) {
  try {
    const bitmap = await decodeImage(blob);
    const [srcW, srcH] = dims(bitmap);
    if (!srcW || !srcH) return blob;

    const src = Object.assign(document.createElement('canvas'), { width: srcW, height: srcH });
    const sCtx = src.getContext('2d', { willReadFrequently: true });
    sCtx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const { data } = sCtx.getImageData(0, 0, srcW, srcH);
    // Fully transparent (or fully opaque, where the bbox IS the image) — either way, fit the source.
    const box = alphaBounds(data, srcW, srcH);
    const cx = box ? box.x : 0;
    const cy = box ? box.y : 0;
    const cw = box ? box.w : srcW;
    const ch = box ? box.h : srcH;

    const out = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const scale = (size * fill) / Math.max(cw, ch);
    const dw = cw * scale;
    const dh = ch * scale;
    out.getContext('2d').drawImage(src, cx, cy, cw, ch, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return (await toBlob(out, quality)) ?? blob;
  } catch {
    return blob;
  }
}

// ── Brand-colour suggestion from a logo ──────────────────────────────────────────────────────────
// Onboarding pre-fills a baker's primary/accent pickers from their uploaded logo — the two most
// dominant, perceptually DISTINCT colours. Reuses extractRegions (the SAME dominant-colour clustering
// the sticker-recolour path runs), which already skips the transparent margin + grey/white/black AND
// forces its hue peaks ≥16° apart — so primary and accent can never come back as two shades of one
// colour (the trap a naïve "1st- and 2nd-most-common pixel" count falls into). Samples a small copy:
// dominant colour is a low-frequency signal, so full resolution buys nothing but time.
//
// Returns { primary, accent } as '#rrggbb' (accent null when the logo is effectively one colour), or
// null when nothing qualifies — a greyscale/transparent logo, or a CORS-tainted/undecodable file — so
// the caller keeps its existing defaults. These are only a SUGGESTION: the baker can still change them.
// Shared by the self-signup wizard (spattoo-web) and the admin onboarding helper (spattoo-admin), which
// both import it through @spattoo/designer, so the two flows can't drift.
export async function extractLogoPalette(fileOrBlob, { sample = 160 } = {}) {
  try {
    const bitmap = await decodeImage(fileOrBlob);
    const [srcW, srcH] = dims(bitmap);
    if (!srcW || !srcH) return null;
    const scale = Math.min(1, sample / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const regions = extractRegions(ctx.getImageData(0, 0, w, h).data, w, h);   // ranked by share, distinct hues
    if (!regions.length) return null;
    return { primary: regions[0].hex, accent: regions[1]?.hex ?? null };
  } catch {
    return null;   // undecodable / CORS-tainted → caller keeps its defaults
  }
}
