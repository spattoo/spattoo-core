import { loadImage } from '../../orders/framePhoto.js';
import { outlineMm, toPathData } from '../../designer/geometry/traceOutline.js';

// ── A decoration on the print sheet, two ways ────────────────────────────────────────────────────
//
// A baker printing for one cake wants different things from the same decoration:
//
//   PRINT   the artwork itself, on edible paper — the sticker goes straight onto the cake.
//   CUTOUT  its outline only, on ordinary paper — a template to lay on fondant and cut around.
//
// Both are offered and neither is chosen for them, because which one it is depends on how they are
// making that cake today, not on anything we can read from the design.
//
// ── Why the baker sizes these, and we do not ────────────────────────────────────────────────────
// The obvious thing is to print each shape at the size it appears on the 3D cake. We cannot: nothing
// in a saved design records a real-world size. `cake_shapes` has no inch column, tier geometry is
// world units with no stated scale, and the one constant that looks like a conversion
// (SHEET_INCH_TO_WORLD) says in its own comment that it was picked so sheet cakes LOOK right beside
// round ones. Taken literally it makes a standard tier twenty inches across.
//
// Asking the baker for the tier size instead would move the guess rather than remove it. So the A4
// sheet is to scale and they size it there, which is a judgement they can actually make — and the
// one they already make in the Edible Print Studio, so nothing new has to be learned.

const CUT_COLOR  = '#2C2A26';   // the line you cut along — dark, thin, unambiguous
const MARK_COLOR = '#b9b3bf';   // a hole: DRAWN, never cut. Same grey as every other cut guide.
const CUT_WIDTH_MM  = 0.4;
const MARK_WIDTH_MM = 0.3;

/** Read an image's pixels. Canvas-based, so it needs a DOM — the tracing itself does not. */
async function alphaOf(url) {
  const img = await loadImage(url);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return { img, ...ctx.getImageData(0, 0, w, h) };
}

/**
 * Stroke an outline into a 2D context, scaled to fit a box. Pure drawing — no canvas creation, no
 * DOM — so the sheet's live preview and the PDF export share one definition of what a cutout LOOKS
 * like. Two renderers would drift, and the one that drifted would be the printed one.
 */
export function strokeOutline(ctx, outline, x, y, wPx, hPx) {
  const sx = wPx / (outline.widthMm  || 1);
  const sy = hPx / (outline.heightMm || 1);
  const mm = Math.min(sx, sy);           // line widths follow the smaller axis, so they stay even

  const drawLoops = (loops, color, widthMm) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.75, widthMm * mm);   // never thinner than a hairline on screen
    ctx.lineJoin = 'round';
    for (const pts of loops) {
      if (pts.length < 2) continue;
      ctx.beginPath();
      pts.forEach(([px, py], i) => {
        const cx = x + px * sx, cy = y + py * sy;
        i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy);
      });
      ctx.closePath();
      ctx.stroke();
    }
  };

  ctx.save();
  // Holes first, so a cut line always sits on top where the two touch. A template is read by
  // following the dark line, and it must never be the one interrupted.
  ctx.setLineDash([4, 3]);
  drawLoops(outline.mark, MARK_COLOR, MARK_WIDTH_MM);
  ctx.setLineDash([]);
  drawLoops(outline.cut, CUT_COLOR, CUT_WIDTH_MM);
  ctx.restore();
}

/** A small canvas of the outline, for the sheet's source strip. */
function previewOf(outline, px = 220) {
  const c = document.createElement('canvas');
  const aspect = (outline.widthMm || 1) / (outline.heightMm || 1);
  c.width = px; c.height = Math.max(1, Math.round(px / aspect));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  const pad = px * 0.06;
  strokeOutline(ctx, outline, pad, pad, c.width - pad * 2, c.height - pad * 2);
  return c.toDataURL('image/png');
}

/**
 * The two sources one decoration offers the sheet.
 *
 * @param {{ id, name, image_url, thumbnail_url }} element
 * @returns {Promise<Array>} `[print, cutout]` — or just `[print]` when nothing traced, which is the
 *   honest answer for a 3D model or a photograph with no clean silhouette. Offering an empty cutout
 *   would put a blank card in the strip and make the baker work out why.
 */
export async function elementSources(element) {
  const url = element.image_url || element.thumbnail_url;
  if (!url) return [];

  const { img, data, width, height } = await alphaOf(url);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const print = {
    id: `${element.id}:print`,
    name: element.name,
    kind: 'print',
    aspect: w / h,
    preview: url,          // nothing is composed, so rendering it first would spend memory for the same pixels
    draw: (ctx, x, y, wPx, hPx) => ctx.drawImage(img, x, y, wPx, hPx),
  };

  // widthMm is arbitrary HERE — the baker sizes the item on the sheet, and only the shape's
  // proportions survive that. 100 keeps the numbers readable while tracing.
  const outline = outlineMm({ data, width, height }, 100);
  if (!outline.cut.length) return [print];

  return [print, {
    id: `${element.id}:cutout`,
    name: `${element.name} — cutout`,
    kind: 'cutout',
    aspect: outline.widthMm / (outline.heightMm || outline.widthMm),
    preview: previewOf(outline),
    outline,               // kept so the PDF export strokes the same paths rather than an image of them
    draw: (ctx, x, y, wPx, hPx) => strokeOutline(ctx, outline, x, y, wPx, hPx),
  }];
}

/** SVG paths for one cutout, if a caller would rather have vectors than a canvas. */
export const cutoutPaths = (outline) => ({
  cut:  outline.cut.map(toPathData),
  mark: outline.mark.map(toPathData),
});
