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
//
// The capture is also CROPPED to the cake before it is flattened. The camera frames a scene, not a
// picture: the same ~72% of empty pixels noted above is dead space in every consumer, and the
// template picker is where it shows — a 120px card rendering `objectFit: contain` gives the cake
// barely a third of its height, so the grid reads as mostly blank boxes. Cropping must happen HERE,
// while the alpha still marks what is cake and what is nothing; once flattened onto white the two
// are indistinguishable, and a white cake on a white field cannot be recovered by any later pass.
import { imageExt, alphaBounds } from '../../shared/image.js';

const THUMB_QUALITY = 0.85;
const THUMB_BACKGROUND = '#FFFFFF';
// 3:2 matches the template card's 180x120 box, so every thumbnail letterboxes identically and the
// grid stays even however tall or wide a given cake happens to be.
const THUMB_ASPECT = 3 / 2;
// Breathing room around the cake, as a fraction of its longest side. Without it the crop is flush
// to the icing and the card looks cropped rather than composed.
const THUMB_MARGIN = 0.06;

// The crop rectangle for `bounds` inside a canvasW x canvasH frame: padded, grown to `aspect`, and
// clamped to the canvas. Pure, so the geometry is testable — the suite runs in node with no canvas.
// It never returns a rect smaller than `bounds`: a cake that will not fit the target aspect widens
// the rect instead, because letterboxing a thumbnail is a cosmetic loss and clipping the cake is not.
export function contentCrop(bounds, canvasW, canvasH, { aspect = THUMB_ASPECT, margin = THUMB_MARGIN } = {}) {
  if (!bounds || !canvasW || !canvasH) return null;

  const pad = Math.max(bounds.w, bounds.h) * margin;
  let w = Math.min(canvasW, bounds.w + pad * 2);
  let h = Math.min(canvasH, bounds.h + pad * 2);

  // Grow the short side toward the target aspect, never past the canvas.
  if (w / h < aspect) w = Math.min(canvasW, h * aspect);
  else                h = Math.min(canvasH, w / aspect);

  w = Math.round(w);
  h = Math.round(h);

  // Centre on the cake, then slide back inside the frame if that pushed an edge out.
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const x = Math.max(0, Math.min(Math.round(cx - w / 2), canvasW - w));
  const y = Math.max(0, Math.min(Math.round(cy - h / 2), canvasH - h));

  return { x, y, w, h };
}

// Where to put the enlarged preview for a card at `rect`, inside a viewport of `vw` x `vh`.
// Beside the card by preference, flipped to its other side when that would overflow, and always
// clamped fully on-screen — a preview half off the edge is worse than no preview. Pure, so the
// flip-and-clamp is testable without a DOM.
export function previewPosition(rect, size, vw, vh, gap = 12, edge = 8) {
  let left = rect.right + gap;
  if (left + size.w > vw - edge) left = rect.left - size.w - gap;     // flip to the other side
  left = Math.max(edge, Math.min(left, vw - size.w - edge));          // and clamp regardless

  const top = Math.max(edge, Math.min(
    rect.top + rect.height / 2 - size.h / 2,                          // centred on the card
    vh - size.h - edge,
  ));
  return { left: Math.round(left), top: Math.round(top) };
}

// The opaque bounds of a (possibly WebGL) source canvas. Needs a 2D copy because getImageData is a
// 2D-context call and the source is a WebGL canvas.
function contentBounds(source) {
  const probe = document.createElement('canvas');
  probe.width = source.width;
  probe.height = source.height;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  // Bail before drawing anything if pixels can't be read back — no point paying for a composite
  // whose result we cannot inspect.
  if (typeof ctx?.getImageData !== 'function') return null;
  ctx.drawImage(source, 0, 0);
  return alphaBounds(ctx.getImageData(0, 0, probe.width, probe.height).data, probe.width, probe.height);
}

// Composite a (possibly transparent) source canvas onto an opaque one, optionally taking only
// `crop` of it. The source is a WebGL canvas created with preserveDrawingBuffer, so drawImage sees
// the rendered frame rather than a cleared one.
function flattenOnto(source, background, crop) {
  const rect = crop ?? { x: 0, y: 0, w: source.width, h: source.height };
  const flat = document.createElement('canvas');
  flat.width = rect.w;
  flat.height = rect.h;
  const ctx = flat.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, flat.width, flat.height);
  }
  ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return flat;
}

export function captureThumbnailBlob(canvas, { quality = THUMB_QUALITY, timeoutMs = 4000, background = THUMB_BACKGROUND, crop = true } = {}) {
  return new Promise(resolve => {
    if (!canvas) return resolve(null);
    try {
      const timeout = setTimeout(() => resolve(null), timeoutMs);
      // A crop of null (nothing drawn, or the probe failed) falls through to the whole frame, which
      // is exactly the old behaviour — a thumbnail is never worth failing a save over.
      let rect = null;
      if (crop) {
        try { rect = contentCrop(contentBounds(canvas), canvas.width, canvas.height); } catch { rect = null; }
      }
      const source = (background || rect) ? flattenOnto(canvas, background, rect) : canvas;
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
