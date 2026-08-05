import { loadImage } from '../../orders/framePhoto.js';

// ── A baker's own image, printed as it is ─────────────────────────────────────────────────────────
// The other kind of source the Edible Print Studio draws (the first being an order's photo-frame,
// clipped to a customer's mask — see orders/PhotoSheet.jsx).
//
// This one is not clipped to anything. A name banner, a logo, a sheet of the same rose to cut out:
// the image IS the artwork, at its own proportions, and the baker cuts along a rectangle.
//
// Both kinds satisfy one contract and the sheet cannot tell them apart. That is the whole reason the
// sheet takes `draw` rather than a mask — a masked photo and a plain image have nothing in common
// except that something ends up on the page.

// Faint grey, matching renderCutGuide's ring so a mixed sheet has one visual language for "cut here".
const CUT_GUIDE_COLOR = '#b9b3bf';
const CUT_GUIDE_PAD = 0.012;   // of the item's width, same proportion the masked ring uses

/**
 * Build a source for one already-uploaded image.
 *
 * @param {{ id, name, url }} upload  a row from `baker_uploads`
 * @returns {Promise<object>} the source, ready for A4Sheet
 */
export async function plainSource(upload) {
  // loadImage qualifies the url and sets crossOrigin itself (framePhoto.js → corsUrl). Going direct
  // to `new Image()` here would taint the export canvas the first time a plain <img> elsewhere had
  // cached an ACAO-less copy of the same asset — the exact bug that stopped the order sheet's photos
  // loading, which is why the guarantee lives in the loader and not at call sites.
  const img = await loadImage(upload.url);
  const w = img.naturalWidth || img.width || 1;
  const h = img.naturalHeight || img.height || 1;

  return {
    id: String(upload.id),
    name: upload.name || 'Image',
    // The image's OWN shape. Everything the studio does to keep a print from being squashed starts
    // here: get this wrong and the item is born distorted, and no amount of careful resizing later
    // recovers the proportions.
    aspect: w / h,
    // The upload url IS the preview. There is nothing to compose — no mask, no transform — so
    // rendering it to a canvas first would spend memory to produce the same pixels.
    preview: upload.url,
    draw: (ctx, x, y, wPx, hPx) => {
      // The cut line, drawn behind and slightly proud of the image, so there is something to follow
      // with a knife. A rectangle here rather than a mask silhouette: an unframed print IS a
      // rectangle, and drawing a shape it does not have would be a line to cut along that ruins it.
      const pad = Math.round(wPx * CUT_GUIDE_PAD);
      ctx.fillStyle = CUT_GUIDE_COLOR;
      ctx.fillRect(x - pad, y - pad, wPx + 2 * pad, hPx + 2 * pad);
      ctx.drawImage(img, x, y, wPx, hPx);
    },
  };
}
