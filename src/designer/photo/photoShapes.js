/* ── The shape of a photo ────────────────────────────────────────────────────────────────────────
 *
 * A reel is always 9:16. A photo is not, and the shape is the FIRST thing a baker chooses, because
 * it decides what the frame can hold: a 4:5 portrait of a tall three-tier cake and a 4:3 landscape of
 * the same cake are different photographs, not the same photograph cropped.
 *
 * The four here are the four places a cake picture actually goes. Nothing is offered because it is a
 * familiar ratio — 16:9 is missing on purpose, since a cake is a tall object and a wide frame spends
 * two thirds of itself on the tablecloth.
 *
 * ⚠️ THE ASPECT IS THE PREVIEW BOX AND THE DRAWING BUFFER, FROM ONE NUMBER. The designer constrains
 * the canvas container to this ratio and R3F sizes the buffer from the container, so what is on
 * screen is what is captured — the same mechanism the reel's 9:16 preview already relies on. Two
 * separate constants, one for the CSS and one for the render, is exactly how a preview starts lying.
 */

export const PHOTO_SHAPES = [
  {
    key: 'portrait', label: '4:5', aspect: 4 / 5,
    // The largest an Instagram feed post is allowed to be. A square posted to the feed is a 4:5 with
    // the top and bottom given away for nothing.
    hint: 'Instagram feed — the biggest a post can be',
  },
  {
    key: 'square', label: '1:1', aspect: 1,
    hint: 'Safe everywhere — feed, catalogue grids, WhatsApp',
  },
  {
    key: 'tall', label: '9:16', aspect: 9 / 16,
    hint: 'Stories and WhatsApp status',
  },
  {
    key: 'landscape', label: '4:3', aspect: 4 / 3,
    hint: 'Websites, quotes, anything printed',
  },
];

export const DEFAULT_SHAPE = 'portrait';

export function shapeByKey(key) {
  return PHOTO_SHAPES.find(s => s.key === key) ?? PHOTO_SHAPES[0];
}

/* How big, on the long edge.
 *
 * 2048 rather than 1080. A reel is capped by what a phone can ENCODE thirty times a second; a photo
 * is one render with no encoder behind it, so the ceiling is a different question entirely and there
 * is no reason to hand a baker a picture the size of a video frame. At 2048 a 4:5 comes out
 * 1638×2048 — above Instagram's native 1080×1350, and large enough to sit in a quote document or go
 * on a shop-front card without looking resampled.
 *
 * Not larger: past this the file is megabytes for detail that survives no platform's recompression,
 * and it is the phones with the least memory that would pay for it.
 */
export const LONG_EDGE = 2048;

/* Pixel size for a shape, on an even grid.
 *
 * ⚠️ ROUNDED TO EVEN. Odd dimensions are legal in a PNG and cause no trouble here, but a baker who
 * hands the file to any tool that re-encodes to a video codec (Instagram does, for one) meets
 * chroma-subsampling maths that assumes an even grid, and the symptom is a one-pixel green or
 * magenta seam down an edge. Free to avoid, miserable to diagnose.
 */
export function photoSize(aspect, longEdge = LONG_EDGE) {
  const a = Number(aspect) > 0 ? Number(aspect) : 1;
  const even = n => Math.max(2, Math.round(n / 2) * 2);
  return a >= 1
    ? { width: even(longEdge), height: even(longEdge / a) }
    : { width: even(longEdge * a), height: even(longEdge) };
}

/* Shrink to something the device can actually allocate.
 *
 * ⚠️ THE FAILURE THIS AVOIDS DOES NOT THROW. Asking a WebGL context for a drawing buffer past
 * MAX_RENDERBUFFER_SIZE does not raise — the resize is refused or the context is lost, and what
 * comes back is a blank or half-height picture that looks like a bug in the cake rather than in the
 * request. Older mobile GPUs sit at 4096 and a few at 2048, so 2048 is not comfortably clear of it.
 *
 * Scales BOTH edges by the same factor, so the shape the baker chose survives — a clamp that capped
 * one edge would silently hand back a different aspect ratio from the preview they approved.
 *
 * Returns `clamped` so the UI can say it came out smaller. Silence there means a baker eventually
 * notices one photo is softer than the rest with nothing to attribute it to.
 */
export function clampToDevice({ width, height }, maxDim) {
  const max = Number(maxDim) > 0 ? Number(maxDim) : Infinity;
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height, clamped: false };
  const k = max / longest;
  const even = n => Math.max(2, Math.round((n * k) / 2) * 2);
  return { width: even(width), height: even(height), clamped: true };
}

/* The file name a baker finds in their downloads.
 *
 * Named for the CAKE, not for the app: somebody photographing six cakes for a customer ends up with
 * six files in one folder, and "spattoo-photo (3).png" tells them nothing about which is which. The
 * shape is in there for the same reason — the whole point of the feature is producing the same cake
 * in more than one shape.
 */
export function photoFilename(designName, shapeKey) {
  const safe = String(designName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${safe || 'cake'}-${shapeKey || 'photo'}`;
}
