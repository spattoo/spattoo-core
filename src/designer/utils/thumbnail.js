// ── Thumbnail capture ─────────────────────────────────────────────────────────────────────────
// Capture an off-screen WebGL canvas as a compact thumbnail blob for the order-snapshot and
// template-thumbnail surfaces. WebP (lossy, alpha-preserving) is several times smaller than PNG
// at visually-identical quality for these flat cake snapshots — and like the element picker these
// surfaces load many images at once, so download size is the lever (ASSET_OPTIMIZATION_PLAN.md §3).
//
// Older browsers that can't encode WebP via canvas silently return PNG instead, so the caller must
// derive the upload's file extension AND Content-Type from the REAL `blob.type` (see `blobExt`) —
// the R2 signed PUT signs the content type, so the extension, the type passed to sign-upload, and
// the PUT header must all agree. The ONE copy; both CakeDesigner call sites use it.
const THUMB_QUALITY = 0.85;

export function captureThumbnailBlob(canvas, { quality = THUMB_QUALITY, timeoutMs = 4000 } = {}) {
  return new Promise(resolve => {
    if (!canvas) return resolve(null);
    try {
      const timeout = setTimeout(() => resolve(null), timeoutMs);
      canvas.toBlob(blob => { clearTimeout(timeout); resolve(blob ?? null); }, 'image/webp', quality);
    } catch {
      resolve(null);
    }
  });
}

// File extension matching a captured blob's MIME (webp when supported, png on fallback).
export function blobExt(blob) {
  return blob?.type === 'image/webp' ? 'webp' : 'png';
}
