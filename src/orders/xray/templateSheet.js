// ── The furniture every printable template needs ─────────────────────────────────────────────────
//
// Two things get printed at true size — a decoration traced from the reference photo, and a chocolate
// panel drawn from its own paths — and both need the same three pieces of furniture: the page set up
// in millimetres, a caption that states the size, and a printed ruler.
//
// ⚠️ THE RULER IS NOT DECORATION. A page that came out of the printer scaled is the single most likely
// way a template goes wrong, and the one failure a baker cannot otherwise detect: everything looks
// right, the piece is 6% small, and it is discovered when it does not fit the cake. Holding a ruler
// against a printed 5 cm bar shows it in a second. Every template gets one.
//
// ⚠️ AND A TEMPLATE THAT CANNOT BE PRINTED TRUE-SIZE MUST SAY SO. A 9-inch piece on A4 is a real
// outcome. Shrinking it quietly and letting a baker cut to it is the one thing these sheets must
// never do — worse than no template, because it is believed.

export const A4_W_MM = 210, A4_H_MM = 297;
export const MARGIN_MM = 15;
export const CAPTION_MM = 25;             // reserved above the drawing for the title and the note

export const INK = '#2C2A26';
export const MUTED = '#6b6459';
export const HAIRLINE = '#B9B2A8';

/**
 * Fit a true size onto the printable area WITHOUT scaling it — which is the whole point.
 * Returns `{ widthMm, heightMm, tooLarge, xMm, yMm }`, or null when there is no size to lay out.
 */
export function templateLayout(widthMm, aspect) {
  if (!widthMm || !Number.isFinite(aspect) || aspect <= 0) return null;
  const heightMm = widthMm / aspect;
  const availW = A4_W_MM - MARGIN_MM * 2;
  const availH = A4_H_MM - MARGIN_MM * 2 - CAPTION_MM;
  if (widthMm > availW || heightMm > availH) return { widthMm, heightMm, tooLarge: true };
  return {
    widthMm, heightMm, tooLarge: false,
    xMm: (A4_W_MM - widthMm) / 2,
    yMm: MARGIN_MM + 20,
  };
}

/* A millimetre-space wrapper round the canvas `buildA4Pdf` hands over. Every template thinks in
 * millimetres — it is a physical sheet — and converting at each call site is how one of them ends up
 * in pixels by accident. */
export function mmSpace(ctx, W) {
  const pxPerMm = W / A4_W_MM;
  const mm = v => v * pxPerMm;
  return {
    mm,
    fill(color) { ctx.fillStyle = color; },
    text(str, xMm, yMm, { size = 3.4, weight = 500, color = MUTED } = {}) {
      ctx.fillStyle = color;
      ctx.font = `${weight} ${mm(size)}px sans-serif`;
      ctx.fillText(str, mm(xMm), mm(yMm));
    },
  };
}

/** Title, and the sentence that says whether this page can be trusted as a measure. */
export function drawTemplateHeader(ctx, W, { title, layout, note }) {
  const s = mmSpace(ctx, W);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, ctx.canvas.height);

  s.text(title || 'Template', MARGIN_MM, MARGIN_MM + 4, { size: 5, weight: 700, color: INK });
  s.text(
    layout.tooLarge
      ? `Actual size ${fmtCm(layout.widthMm)} × ${fmtCm(layout.heightMm)} cm — too large for A4, shown scaled. Measure, do not trace.`
      : note || `Printed at ACTUAL SIZE — ${fmtCm(layout.widthMm)} cm wide. Print at 100%, no page scaling.`,
    MARGIN_MM, MARGIN_MM + 11, { size: 3.4, weight: 500 },
  );
}

/** The 5 cm bar. See the note at the top of this file — this is a correctness device, not a flourish. */
export function drawRuler(ctx, W, yMm) {
  const s = mmSpace(ctx, W);
  const { mm } = s;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, mm(0.4));
  ctx.beginPath();
  ctx.moveTo(mm(MARGIN_MM), mm(yMm));
  ctx.lineTo(mm(MARGIN_MM + 50), mm(yMm));
  for (let i = 0; i <= 5; i++) {
    ctx.moveTo(mm(MARGIN_MM + i * 10), mm(yMm - 2));
    ctx.lineTo(mm(MARGIN_MM + i * 10), mm(yMm + 2));
  }
  ctx.stroke();
  s.text('5 cm — check with a ruler', MARGIN_MM + 54, yMm + 1.2, { size: 3, weight: 600 });
}

/* Scale to apply when a piece is too large to print true-size. 1 when it fits, which is the case the
 * whole feature exists for. */
export function fitScale(layout) {
  if (!layout.tooLarge) return 1;
  const availW = A4_W_MM - MARGIN_MM * 2;
  const availH = A4_H_MM - MARGIN_MM * 2 - CAPTION_MM;
  return Math.min(availW / layout.widthMm, availH / layout.heightMm);
}

export const fmtCm = v => (v / 10).toFixed(1);

export const slug = s => String(s || 'template').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
