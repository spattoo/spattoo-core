// ── Picked-image compression ────────────────────────────────────────────────────────────────────
// Downscale + re-encode a user-PICKED image File (phone camera / gallery) to a compact WebP blob
// before upload. Distinct from designer/utils/thumbnail.js, which snapshots a WebGL canvas — here the
// input is an arbitrary File (often a multi-MB phone photo). Finished-cake photos are both uploaded
// AND rendered inline in the order-ready email, so capping the long edge + re-compressing keeps the
// upload and the email light (ASSET_OPTIMIZATION_PLAN.md §3). Browsers that can't encode WebP fall
// back to the original File, so callers must derive the upload's extension + Content-Type from the
// returned blob's REAL `type` (the R2 signed PUT signs the content type — all three must agree).

async function loadBitmap(file) {
  // createImageBitmap honours EXIF orientation (phone photos) when asked; fall back to <img>.
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall through */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function compressImageFile(file, { maxEdge = 1600, quality = 0.82 } = {}) {
  try {
    const bitmap = await loadBitmap(file);
    const srcW = bitmap.width || bitmap.naturalWidth;
    const srcH = bitmap.height || bitmap.naturalHeight;
    if (!srcW || !srcH) return file;
    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/webp', quality));
    return blob ?? file;   // encode unsupported → upload the original File untouched
  } catch {
    return file;
  }
}
