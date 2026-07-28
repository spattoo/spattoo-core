// ── Thumbnail capture ─────────────────────────────────────────────────────────────────────────
// Capture an off-screen WebGL canvas as a compact thumbnail blob for the order-snapshot and
// template-thumbnail surfaces. WebP (lossy, alpha-preserving) is several times smaller than PNG
// at visually-identical quality for these flat cake snapshots — and like the element picker these
// surfaces load many images at once, so download size is the lever (ASSET_OPTIMIZATION_PLAN.md §3).
//
// Older browsers that can't encode WebP via canvas silently return PNG instead, so the caller must
// derive the upload's file extension AND Content-Type from the REAL `blob.type` (`imageExt`, shared
// with every other upload path in shared/image.js) — the R2 signed PUT signs the content type, so the
// extension, the type passed to sign-upload, and the PUT header must all agree.
//
// The capture is FLATTENED onto an opaque background before encoding. The cake scene renders on a
// transparent canvas, which leaves ~72% of a typical snapshot at RGBA(0,0,0,0) — black pixels held
// invisible by the alpha channel alone. Every in-app surface honours that alpha, but EMAIL does not:
// the order snapshot is embedded in the quote-request mail, and a webmail image proxy that re-encodes
// to a format without alpha (Gmail transcodes) keeps the RGB and drops the mask, so the cake arrives
// on a solid black slab. Baking the background in costs nothing — every consumer (order cards, invite
// panel, X-ray PDF, email) composites onto white or near-white anyway — and it cannot be undone by a
// renderer we don't control. Pass `background: null` for a genuinely transparent capture.
import { imageExt } from '../../shared/image.js';

const THUMB_QUALITY = 0.85;
const THUMB_BACKGROUND = '#FFFFFF';

// Composite a (possibly transparent) source canvas onto an opaque one. The source is a WebGL canvas
// created with preserveDrawingBuffer, so drawImage sees the rendered frame rather than a cleared one.
function flattenOnto(source, background) {
  const flat = document.createElement('canvas');
  flat.width = source.width;
  flat.height = source.height;
  const ctx = flat.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(source, 0, 0);
  return flat;
}

export function captureThumbnailBlob(canvas, { quality = THUMB_QUALITY, timeoutMs = 4000, background = THUMB_BACKGROUND } = {}) {
  return new Promise(resolve => {
    if (!canvas) return resolve(null);
    try {
      const timeout = setTimeout(() => resolve(null), timeoutMs);
      const source = background ? flattenOnto(canvas, background) : canvas;
      source.toBlob(blob => { clearTimeout(timeout); resolve(blob ?? null); }, 'image/webp', quality);
    } catch {
      resolve(null);
    }
  });
}

// Upload a captured thumbnail blob to R2 via a signed URL → the stored key, or null on ANY failure
// (a missing thumbnail is always non-fatal). `folder` must be an allowed sign-upload folder. This is
// the ONE copy of the signed-PUT block that order placement, template save, and share-the-draft all
// used to inline — the extension, the type passed to sign-upload, and the PUT header all agree.
export async function uploadThumbnail(blob, apiClient, folder) {
  if (!blob || !apiClient?.getSignedUploadUrl) return null;
  try {
    const filename = `${crypto.randomUUID()}.${imageExt(blob)}`;
    const { url, key } = await apiClient.getSignedUploadUrl(folder, filename, blob.type, blob.size);
    await fetch(url, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob });
    return key;
  } catch {
    return null;   // non-fatal — caller proceeds without a thumbnail
  }
}

// Convenience: capture the off-screen canvas AND upload in one step → the stored key (or null).
export async function captureAndUploadThumbnail(canvas, apiClient, folder) {
  const blob = await captureThumbnailBlob(canvas);
  return uploadThumbnail(blob, apiClient, folder);
}
