import { loadImage, renderFramedPhoto, renderCutGuide } from '../../orders/framePhoto.js';

// ── A baker's own image, as a sheet source ────────────────────────────────────────────────────────
// The Edible Print Studio draws two kinds of thing, and this file builds both from one upload:
//
//   UNFRAMED  the image IS the artwork — a name banner, a logo — at its own proportions, cut along a
//             rectangle.
//   FRAMED    the image seen through a photo-frame element's mask: a heart, a round plaque. Square,
//             because the masks are, and cut along the shape's own silhouette.
//
// ONE loader and ONE preview path, because the difference between them is entirely "is there a mask"
// — and that question is answered here, once, rather than at every call site. The sheet itself never
// asks it: it receives a source that already knows how to draw itself.
//
// The frame's mask is the SAME asset the cake renderer uses (an element's
// `placement_config.photo.mask`), so a photo framed here and the same photo on a cake are cut to the
// same shape. A separate set of print-only shapes would drift from the catalogue the first time a
// frame was added, and a baker would be printing a heart the cake does not have.

// Faint grey, matching renderCutGuide's ring so a mixed sheet has one visual language for "cut here".
const CUT_GUIDE_COLOR = '#b9b3bf';
const CUT_GUIDE_PAD = 0.012;   // of the item's width, the same proportion the masked ring uses

/** The mask url of a photo-frame element, or null if it is not one. */
export const frameMaskOf = (element) => element?.placement_config?.photo?.mask ?? null;

/** Every photo frame in a list of elements — config-gated, never on element type or slug. */
export const framesIn = (elements = []) => elements.filter(frameMaskOf);

/**
 * Build a sheet source for one upload.
 *
 * @param {{ id, name, url }} upload           a row from `baker_uploads`
 * @param {object}            [opts]
 * @param {object}            [opts.frame]     a photo-frame element, or null for unframed
 * @param {object}            [opts.transform] { x, y, zoom, rot } within the frame
 */
export async function imageSource(upload, { frame = null, transform = null } = {}) {
  // loadImage qualifies the url and sets crossOrigin itself (framePhoto.js → corsUrl). Going direct
  // to `new Image()` here would taint the export canvas the first time a plain <img> elsewhere had
  // cached an ACAO-less copy of the same asset — the exact bug that stopped the order sheet's photos
  // loading, which is why the guarantee lives in the loader and not at call sites.
  const img = await loadImage(upload.url);
  const maskUrl = frameMaskOf(frame);
  const mask = maskUrl ? await loadImage(maskUrl) : null;

  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;
  const t = transform ?? { x: 0, y: 0, zoom: 1, rot: 0 };

  const base = {
    id: String(upload.id),
    name: upload.name || 'Image',
    frameId: frame ? String(frame.id) : null,     // what the frame picker shows as chosen
    transform: t,
    maskUrl,                                       // persisted with the sheet; the mask itself is not
  };

  if (!mask) {
    return {
      ...base,
      // The image's OWN shape. Everything that keeps a print from being squashed starts here: get
      // this wrong and the item is born distorted, and no careful resizing later recovers it.
      aspect: w / h,
      // The upload url IS the preview — nothing is composed, so rendering it to a canvas first would
      // spend memory to produce the same pixels.
      preview: upload.url,
      draw: (ctx, x, y, wPx, hPx) => {
        // A RECTANGLE, because an unframed print is one. Drawing a silhouette it does not have would
        // be a line to cut along that ruins it.
        const pad = Math.round(wPx * CUT_GUIDE_PAD);
        ctx.fillStyle = CUT_GUIDE_COLOR;
        ctx.fillRect(x - pad, y - pad, wPx + 2 * pad, hPx + 2 * pad);
        ctx.drawImage(img, x, y, wPx, hPx);
      },
    };
  }

  return {
    ...base,
    // SQUARE, always — a frame's mask is square and renderFramedPhoto cover-fits the photo into it.
    // The photo's own proportions live in the transform, not in the item's shape.
    aspect: 1,
    // Rendered rather than pointed at: what the baker must see is the photo AS THE MASK CUTS IT, and
    // the raw upload would show the corners the print will not have.
    preview: renderFramedPhoto(img, mask, t, 420).toDataURL('image/png'),
    draw: (ctx, x, y, wPx) => {
      // The cut guide is the SHAPE's silhouette here, slightly proud of the photo — a heart printed
      // with a rectangle around it is a heart nobody can cut out.
      const pad = Math.round(wPx * CUT_GUIDE_PAD);
      ctx.drawImage(renderCutGuide(mask, wPx), x - pad, y - pad, wPx + 2 * pad, wPx + 2 * pad);
      // Re-rendered at the export size rather than upscaling `preview` — on an edible sheet the
      // difference is visible.
      ctx.drawImage(renderFramedPhoto(img, mask, t, wPx), x, y, wPx, wPx);
    },
  };
}
