/* ── Where a standing backdrop meets the floor ───────────────────────────────────────────────────
 *
 * Sandeep, 2026-10-28, on the first board that stood in the scene: the cake no longer floated, but
 * *the room did* — the picture's own floor ended in a hard horizontal seam partway up the frame and
 * the cake stood on plain grey in front of it. Two floors, one of them painted.
 *
 * ⚠️ A BACKDROP IS NOT FINISHED AT ITS BASE. A photographer's sweep works because the paper and the
 * table are the same colour where they meet; a printed board standing on a grey floor is obviously a
 * printed board. So the floor TAKES THE PICTURE'S OWN BASE COLOUR, and the join stops being a join.
 * This is the whole difference between "a cake in a bakery" and "a cake in front of a photo of one".
 *
 * ⚠️ READ FROM THE BOTTOM EDGE, NOT FROM THE WHOLE IMAGE. An average of the picture is the average
 * of shelves, plants and lamps — a muddy beige that matches nothing. Only the last few rows touch
 * the floor, so only those are asked, and the median-ish mean of them is what the eye reads as "the
 * colour it ends on".
 *
 * ⚠️ AND IT IS ONE FUNCTION, SO THE PREVIEW CAN ASK IT TOO (INVARIANTS #15). When the backdrop
 * becomes an authored row this same call decides the swatch an admin sees beside the image.
 */

/** The fraction of the image's height that counts as "where it meets the floor". */
export const BASE_BAND = 0.04;

/**
 * Mean colour of the bottom band of an already-loaded image, as `#rrggbb`.
 * Pure apart from the 2D canvas it borrows; returns null when it cannot read the pixels
 * (a cross-origin image taints the canvas, and a tainted canvas throws rather than lies).
 */
export function baseColourOf(img, makeCanvas) {
  const w = img?.width | 0, h = img?.height | 0;
  if (!w || !h) return null;
  /* Read it small. The band is a flat colour by definition, so full resolution buys nothing and
     costs a 40MB getImageData on a 4K backdrop — the same lesson `scanContentV` learned the
     expensive way (1024 → 256 took 2711ms to 719ms). */
  const band = Math.max(1, Math.round(h * BASE_BAND));
  const sw = Math.min(64, w);
  const sh = Math.max(1, Math.round(band * (sw / w)));
  const cv = makeCanvas(sw, sh);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  /* Draw ONLY the band, scaled down — never the whole picture cropped afterwards. */
  ctx.drawImage(img, 0, h - band, w, band, 0, 0, sw, sh);
  let data;
  try { data = ctx.getImageData(0, 0, sw, sh).data; } catch { return null; }
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;            // a transparent edge is not a colour
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1;
  }
  if (!n) return null;
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/* ── How far the board leans back to face the lens ───────────────────────────────────────────────
 *
 * The designer's camera looks DOWN at the cake. A board left bolt upright keystones under it: the
 * vertical panel lines in a wall photograph splay outwards towards the top of the frame, and it
 * reads as a tent rather than a wall. A photographer's backdrop faces the lens, so this one does
 * too — tilted by the camera's own pitch, about a pivot ON THE FLOOR so its base never leaves y = 0.
 *
 * ⚠️ THE SIGN IS THE WHOLE FUNCTION, AND IT WAS WRONG FIRST TIME. A positive rotation about +X
 * carries a plane's +Z normal towards -Y — it tilts the face DOWN, ADDING to the camera's pitch.
 * The render came back a sunburst, twice the fan it started with, and looked every bit as
 * deliberate as the right answer would have. Hence a test rather than a comment.
 */
export function wallTilt(dirY) {
  return Math.asin(Math.max(-1, Math.min(1, dirY)));
}
