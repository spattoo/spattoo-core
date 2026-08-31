import { buildA4Pdf, downloadPdf } from '../pdf.js';
import { corsUrl } from '../../designer/utils/assetUrl.js';
/* ⚠️ SHARED WITH THE CHOCOLATE TEMPLATE, not copied. Both print a physical sheet and both live or die
 * on the same ruler bar; two copies of it is two places for the page geometry to drift, and a
 * template whose ruler is wrong is worse than one with no ruler at all. */
import {
  A4_W_MM, MARGIN_MM, templateLayout, drawTemplateHeader, drawRuler, fitScale,
} from './templateSheet.js';

// ── The printable template ───────────────────────────────────────────────────────────────────────
// A cut-out guide at ACTUAL SIZE, so a baker can lay fondant over it and cut around the shape.
//
// This is the panel that makes the rest of the sheet usable. Steps and a reference picture answer
// "what shape" and "in what order"; neither answers "how big", and getting the scale wrong is the
// most common way a hand-modelled topper ends up looking wrong — a bow that should span a third of
// a 6-inch tier is 5cm across, and a baker working from an on-screen picture has no way to know
// that. Printing it at true size removes the judgement entirely.
//
// DETERMINISTIC. No model call, no cost, no stored asset: the size comes from arithmetic over
// numbers the X-Ray already holds, and the picture is the reference photo the order already has.

const MM_PER_INCH = 25.4;

// The decoration's real width, in millimetres.
//
//   tierWidthRatio  the model's judgement: how wide the decoration is against ITS TIER
//   tinInch         the tin plan's real diameter for that tier, derived from order weight
//
// Both are required and neither is guessable. A missing ratio is the common case (a piped border
// has no single width) and must produce null rather than a default — the baker CUTS to this, so a
// confident wrong number is worse than an absent one.
export function decorationWidthMm(tierWidthRatio, tinInch) {
  const r = Number(tierWidthRatio), t = Number(tinInch);
  if (!Number.isFinite(r) || !Number.isFinite(t)) return null;
  if (r <= 0 || r > 1 || t <= 0) return null;
  return +(r * t * MM_PER_INCH).toFixed(1);
}

// Which tier does this decoration sit on, and how big is that tier really? The spec groups
// decorations by tier index, and computeTinPlan returns one entry per tier in the same order.
export function tierInchFor(tinPlan, tierIndex) {
  const tiers = tinPlan?.tiers ?? [];
  const t = tiers[tierIndex] ?? tiers[0] ?? null;
  return t?.tinInch ?? null;
}

// Draw and download. `crop` is the same padded box the on-screen close-up uses, so the printed
// shape is the one the baker was just looking at.
export async function downloadDecorationTemplate({ photoUrl, bbox, widthMm, title, order }) {
  const img = await loadCrossOriginImage(photoUrl);

  // Pad exactly as the screen crop does — the two must not disagree about what "the decoration" is.
  const [x, y, w, h] = bbox;
  const padX = w * 0.25, padY = h * 0.25;
  const cx = Math.max(0, x - padX), cy = Math.max(0, y - padY);
  const cw = Math.min(1 - cx, w + padX * 2), ch = Math.min(1 - cy, h + padY * 2);

  const sx = cx * img.naturalWidth,  sw = cw * img.naturalWidth;
  const sy = cy * img.naturalHeight, sh = ch * img.naturalHeight;
  const layout = templateLayout(widthMm, sw / sh);
  if (!layout) throw new Error('This decoration has no measured size.');

  const blob = await buildA4Pdf((ctx, { W, H }) => {
    const pxPerMm = W / A4_W_MM;                 // buildA4Pdf gives a true-scale A4 canvas
    const mm = (v) => v * pxPerMm;

    drawTemplateHeader(ctx, W, { title: title || 'Decoration', layout });

    // Too large to print true-size: fit it instead, and the caption above already says the drawing
    // is not to scale. Silently shrinking without saying so is the one thing this must never do.
    const scale = fitScale(layout);
    const dw = layout.widthMm * scale, dh = layout.heightMm * scale;
    const dx = (A4_W_MM - dw) / 2, dy = MARGIN_MM + 20;

    ctx.drawImage(img, sx, sy, sw, sh, mm(dx), mm(dy), mm(dw), mm(dh));

    // A dashed box, not a traced outline: we have not cut the background out, so claiming an exact
    // cut line would be a lie. The box is a measuring frame the baker cuts inside.
    ctx.strokeStyle = '#B9B2A8';
    ctx.lineWidth = Math.max(1, mm(0.3));
    ctx.setLineDash([mm(2), mm(2)]);
    ctx.strokeRect(mm(dx), mm(dy), mm(dw), mm(dh));
    ctx.setLineDash([]);

    drawRuler(ctx, W, dy + dh + 12);
  });

  downloadPdf(blob, `decoration-template-${slug(title)}.pdf`);
}

const fmt = (mmValue) => (mmValue / 10).toFixed(1);
const slug = (t) => String(t || 'decoration').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'decoration';

// The reference photo is served from R2, and the canvas is tainted (and toBlob throws) unless the
// load is anonymous — the same rule check:cors enforces everywhere else images reach a canvas.
function loadCrossOriginImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the reference photo.'));
    img.src = corsUrl(url);
  });
}
