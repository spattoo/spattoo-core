import { buildA4Pdf, downloadPdf } from '../pdf.js';
import { corsUrl } from '../../designer/utils/assetUrl.js';

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
const A4_W_MM = 210, A4_H_MM = 297;
const MARGIN_MM = 15;

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

// Fit the decoration's true size onto the printable area WITHOUT scaling it — that is the whole
// point. Returns the draw box in mm, or null when it genuinely cannot be printed at size.
//
// A decoration wider than the page is a real outcome (a 9-inch topper on A4 portrait), and the
// honest response is to say so rather than to shrink it and hand the baker a template that lies.
export function templateLayout(widthMm, aspect) {
  if (!widthMm || !Number.isFinite(aspect) || aspect <= 0) return null;
  const heightMm = widthMm / aspect;
  const availW = A4_W_MM - MARGIN_MM * 2;
  const availH = A4_H_MM - MARGIN_MM * 2 - 25;   // 25mm reserved for the caption block
  if (widthMm > availW || heightMm > availH) return { widthMm, heightMm, tooLarge: true };
  return {
    widthMm, heightMm, tooLarge: false,
    xMm: (A4_W_MM - widthMm) / 2,
    yMm: MARGIN_MM + 20,
  };
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

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#2C2A26';
    ctx.font = `700 ${mm(5)}px sans-serif`;
    ctx.fillText(title || 'Decoration', mm(MARGIN_MM), mm(MARGIN_MM + 4));

    ctx.fillStyle = '#6b6459';
    ctx.font = `500 ${mm(3.4)}px sans-serif`;
    ctx.fillText(
      layout.tooLarge
        ? `Actual size ${fmt(layout.widthMm)} × ${fmt(layout.heightMm)} cm — too large for A4, shown scaled. Measure, do not trace.`
        : `Printed at ACTUAL SIZE — ${fmt(layout.widthMm)} cm wide. Print at 100%, no page scaling.`,
      mm(MARGIN_MM), mm(MARGIN_MM + 11),
    );

    // Too large to print true-size: fit it instead, and the caption above already says the drawing
    // is not to scale. Silently shrinking without saying so is the one thing this must never do.
    const availW = A4_W_MM - MARGIN_MM * 2;
    const availH = A4_H_MM - MARGIN_MM * 2 - 25;
    const scale = layout.tooLarge ? Math.min(availW / layout.widthMm, availH / layout.heightMm) : 1;
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

    // A printed ruler. If the page came out of the printer scaled — the single most likely way this
    // sheet goes wrong, and one the baker cannot otherwise detect — holding a ruler to this bar
    // shows it immediately.
    const barY = dy + dh + 12;
    ctx.strokeStyle = '#2C2A26';
    ctx.lineWidth = Math.max(1, mm(0.4));
    ctx.beginPath();
    ctx.moveTo(mm(MARGIN_MM), mm(barY));
    ctx.lineTo(mm(MARGIN_MM + 50), mm(barY));
    for (let i = 0; i <= 5; i++) {
      ctx.moveTo(mm(MARGIN_MM + i * 10), mm(barY - 2));
      ctx.lineTo(mm(MARGIN_MM + i * 10), mm(barY + 2));
    }
    ctx.stroke();
    ctx.fillStyle = '#6b6459';
    ctx.font = `600 ${mm(3)}px sans-serif`;
    ctx.fillText('5 cm — check with a ruler', mm(MARGIN_MM + 54), mm(barY + 1.2));
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
