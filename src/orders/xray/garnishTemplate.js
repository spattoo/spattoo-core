import { buildA4Pdf, downloadPdf } from '../pdf.js';
import { garnishGuide } from '../../designer/geometry/garnishGuide.js';
import {
  A4_W_MM, A4_H_MM, MARGIN_MM, INK, MUTED,
  templateLayout, mmSpace, drawTemplateHeader, drawRuler, fitScale, slug,
} from './templateSheet.js';

// ── The cutting template for a chocolate panel ───────────────────────────────────────────────────
//
// Spread chocolate, let it set, lay this under the acetate and cut round the line. The piece comes
// out the size it was designed to be, which is the one thing a picture of it can never guarantee.
//
// ⚠️ THIS ONE CAN CLAIM A TRUE CUT LINE, and the photo template deliberately cannot. That sheet
// traces a decoration out of a reference photograph with the background still in it, so it prints a
// dashed measuring FRAME and says so — claiming an exact outline there would be a lie. Here the
// outline is the baker's own drawing, stored as points. The line on the page is the line they drew.
//
// ⚠️ SOLID MEANS CUT, DASHED MEANS PUNCH. Two different actions with two different tools, and a
// panel whose holes look like its outline gets cut into pieces.
//
// ⚠️ PIPED PIECES GET NO TEMPLATE. A filigree is not cut to a line — it is piped along one, and the
// thing a baker needs is the ORDER, which the numbered diagram in the report already gives. Printing
// a cut template for a piped piece would invite exactly the wrong technique.

export function canTemplate(garnish) {
  const guide = garnishGuide(garnish, { cakeDiameterMm: garnish?.cakeDiameterMm ?? null });
  // A size is required: a template printed at a guessed size is worse than none — the baker cuts to
  // it. `widthMm` is null precisely when the cake size is not known yet.
  return !!(guide && guide.kind === 'cut' && guide.panels.length && guide.widthMm);
}

export async function downloadGarnishTemplate({ garnish, cakeDiameterMm, title }) {
  const guide = garnishGuide(garnish, { cakeDiameterMm: cakeDiameterMm ?? garnish?.cakeDiameterMm });
  if (!guide || guide.kind !== 'cut' || !guide.panels.length) {
    throw new Error('Only a cut piece has a cutting template.');
  }
  if (!guide.widthMm) throw new Error('The cake size is not set, so this cannot be printed to size.');

  const layout = templateLayout(guide.widthMm, guide.size.w / guide.size.h);
  if (!layout) throw new Error('This piece has no measured size.');

  const blob = await buildA4Pdf((ctx, { W }) => drawGarnishTemplate(ctx, W, { guide, layout, title }));
  downloadPdf(blob, `chocolate-template-${slug(title)}.pdf`);
}

/* The page itself, separated from the download so it can be drawn into a visible canvas and LOOKED
 * at. A template is a physical measuring instrument; "the code ran" is not evidence that the sheet
 * is right. */
export function drawGarnishTemplate(ctx, W, { guide, layout, title }) {
  {
    drawTemplateHeader(ctx, W, {
      title: title || 'Chocolate panel',
      layout,
      note: `Printed at ACTUAL SIZE — ${(guide.widthMm / 10).toFixed(1)} cm wide. `
          + 'Print at 100%, no page scaling. Cut the solid line; punch the dashed circles.',
    });

    const s = mmSpace(ctx, W);
    const { mm } = s;
    const scale = fitScale(layout);
    const dw = layout.widthMm * scale, dh = layout.heightMm * scale;
    const dx = (A4_W_MM - dw) / 2, dy = MARGIN_MM + 20;

    /* Plate units → millimetres on the page. Taken from the drawn box rather than from the plate, so
       the piece fills the space it was measured for and the mm on the ruler mean what they say. */
    const k = dw / guide.size.w;
    const px = x => mm(dx + (x - guide.box.x0) * k);
    const py = y => mm(dy + (y - guide.box.y0) * k);

    const trace = pts => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
    };

    for (const panel of guide.panels) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1, mm(0.4));
      ctx.setLineDash([]);
      trace(panel.points);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = MUTED;
      ctx.lineWidth = Math.max(1, mm(0.3));
      ctx.setLineDash([mm(1.6), mm(1.6)]);
      for (const hole of panel.holePoints) { trace(hole); ctx.closePath(); ctx.stroke(); }
      ctx.setLineDash([]);
    }

    // A legend, because the difference between the two lines is the difference between two tools.
    let ly = dy + dh + 8;
    s.text('——  cut this line', MARGIN_MM, ly, { size: 3.4, weight: 700, color: INK });
    if (guide.panels.some(p => p.holeCount)) {
      s.text('- - -  punch these', MARGIN_MM + 45, ly, { size: 3.4, weight: 700, color: MUTED });
    }

    ly += 6;
    s.text('Spread the chocolate to about 2 mm on acetate. Let it set until firm but not brittle, '
         + 'lay this sheet underneath, and cut.', MARGIN_MM, ly, { size: 3.2, weight: 500, color: MUTED });

    drawRuler(ctx, W, Math.min(ly + 14, A4_H_MM - MARGIN_MM - 4));
  }
}
