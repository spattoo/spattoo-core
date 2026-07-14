import { newA4Canvas, canvasesToPdfBlob } from '../pdf.js';
import { layoutDiagram, DIAGRAM } from './xrayProject.js';
import { strengthColor } from './report.js';
import { loadImage } from '../framePhoto.js';

// ── The X-Ray report, as a sheet of paper ────────────────────────────────────────────────────────
// The screen version of this report is read at a desk. THIS one is carried to a bench, put down next
// to a mixer, and worked from with icing on your hands — which is the whole reason it exists as a
// download rather than a print dialog: the baker wants a file to keep with the order, not a tab to
// keep open.
//
// It renders the SAME data (report.js) and the SAME diagram layout (xrayProject.js) as the screen —
// only the drawing is different. Nothing here decides what the report SAYS.
//
// Text is rasterized (the page is one 300dpi JPEG — see pdf.js), which is why every size below is in
// canvas pixels at 300dpi and looks large. At A4/300dpi, 1mm ≈ 11.8px.

const PX_PER_MM = 300 / 25.4;
const mm = (v) => v * PX_PER_MM;

const INK   = '#2C2A26';
const MUTED = '#8A857D';
const RULE  = '#E4DFD7';

// Section accents — the same three the screen uses for its heading dots.
const ACCENT = { tins: '#1B5FA8', colours: '#C2569B', piping: '#1E7A35' };

// A page with a cursor. Everything is drawn top-down; when the cursor would run past the bottom
// margin the painter starts a fresh page — so a cake with a dozen pipings simply flows onto sheet 2
// instead of being silently cut off at the fold.
class Sheet {
  constructor({ dpi = 300 } = {}) {
    this.dpi = dpi;
    this.pages = [];
    this.margin = mm(14);
    this.newPage();
  }

  newPage() {
    const c = newA4Canvas({ dpi: this.dpi, portrait: true });
    this.pages.push(c);
    this.c = c;
    this.ctx = c.getContext('2d');
    this.ctx.textBaseline = 'top';
    this.y = this.margin;
    return this.ctx;
  }

  get W() { return this.c.width; }
  get H() { return this.c.height; }
  get contentW() { return this.W - this.margin * 2; }
  get bottom() { return this.H - mm(16); }   // room for the footer

  // Reserve `h` px of vertical space; break to a new page if it will not fit.
  space(h) {
    if (this.y + h > this.bottom) this.newPage();
    return this.y;
  }

  font(px, weight = 400) {
    this.ctx.font = `${weight} ${px}px Helvetica, Arial, sans-serif`;
  }

  // Draw `text` wrapped to `maxW`, return the height consumed.
  text(text, x, y, { size = mm(3.2), weight = 400, color = INK, maxW = this.contentW, lineHeight = 1.35 } = {}) {
    if (!text) return 0;
    this.font(size, weight);
    this.ctx.fillStyle = color;
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (this.ctx.measureText(next).width > maxW && line) { lines.push(line); line = w; }
      else line = next;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => this.ctx.fillText(l, x, y + i * size * lineHeight));
    return lines.length * size * lineHeight;
  }

  rule(y) {
    this.ctx.strokeStyle = RULE;
    this.ctx.lineWidth = Math.max(1, mm(0.2));
    this.ctx.beginPath();
    this.ctx.moveTo(this.margin, y);
    this.ctx.lineTo(this.W - this.margin, y);
    this.ctx.stroke();
  }

  heading(label, accent) {
    const size = mm(4);
    this.space(size * 2.6);
    const cy = this.y + size * 0.45;
    const r = mm(1.3);
    this.ctx.fillStyle = accent;
    this.ctx.beginPath();
    this.ctx.arc(this.margin + r, cy, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.text(label, this.margin + r * 3.4, this.y, { size, weight: 700 });
    this.y += size * 1.9;
  }

  swatch(hex, x, y, size) {
    this.ctx.fillStyle = hex || '#eee';
    this.ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    this.ctx.lineWidth = Math.max(1, mm(0.2));
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, size, size, mm(1.2));
    this.ctx.fill();
    this.ctx.stroke();
  }
}

// The kitchen needs the cake in front of it. The thumbnail is on R2 — a cross-origin image TAINTS the
// canvas and makes toBlob throw, so it must load CORS-clean (framePhoto.loadImage sets crossOrigin).
// A thumbnail that will not load is never fatal: the report's words are the point, the picture is the
// comfort. Same for the baker's logo.
async function tryLoad(url) {
  if (!url) return null;
  try { return await loadImage(url); } catch { return null; }
}

function drawHeader(sheet, { order, baker, logo }) {
  const { ctx } = sheet;
  const top = sheet.y;

  if (logo) {
    const h = mm(12);
    const w = Math.min(mm(34), (logo.width / logo.height) * h);
    ctx.drawImage(logo, sheet.margin, top, w, h);
  }

  // The bakery's name sits opposite the logo, right-aligned, so the sheet reads as the baker's own
  // kitchen document rather than ours.
  if (baker?.name) {
    sheet.font(mm(3.6), 700);
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    ctx.fillText(baker.name, sheet.W - sheet.margin, top + mm(1));
    ctx.textAlign = 'left';
  }

  sheet.y = top + mm(16);
  sheet.y += sheet.text('X-Ray — how to make this cake', sheet.margin, sheet.y, { size: mm(6), weight: 700 });
  sheet.y += mm(2);

  // Which cake this is. On a bench with four orders on it, a build sheet that does not say whose cake
  // it is, is a hazard.
  const bits = [
    order?.id != null ? `Order #${order.id}` : null,
    customerName(order),
    order?.delivery_date ? `Delivery ${formatDate(order.delivery_date)}` : null,
  ].filter(Boolean);
  sheet.y += sheet.text(bits.join('   ·   '), sheet.margin, sheet.y, { size: mm(3.4), color: MUTED, weight: 700 });

  sheet.y += mm(4);
  sheet.rule(sheet.y);
  sheet.y += mm(6);
}

function customerName(order) {
  const c = order?.customers;
  if (!c) return null;
  const n = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
  return n || null;
}

function formatDate(d) {
  try {
    return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return String(d);
  }
}

// The annotated cake: the thumbnail with a leader line onto each piping and the nozzle in the margin.
// Identical geometry to the screen (layoutDiagram) — fractions of the box, scaled into canvas px.
function drawDiagram(sheet, { thumb, diagram, tiers }) {
  const all = layoutDiagram(diagram, tiers);
  if (!thumb || !all.length) return;

  const boxW = sheet.contentW;
  const boxH = boxW / DIAGRAM.aspect;
  const top = sheet.space(boxH + mm(4));
  const { ctx } = sheet;
  const X = (fx) => sheet.margin + fx * boxW;
  const Y = (fy) => top + fy * boxH;

  const cakeX = X(DIAGRAM.cakeX);
  const cakeW = DIAGRAM.cakeW * boxW;
  ctx.drawImage(thumb, cakeX, top, cakeW, boxH);

  for (const it of all) {
    const isL = it.side === 'L';
    const lx = isL ? cakeX - mm(3) : cakeX + cakeW + mm(3);

    // leader line — dashed, so it reads as an annotation rather than part of the cake
    ctx.strokeStyle = '#9a958d';
    ctx.lineWidth = Math.max(1, mm(0.25));
    ctx.setLineDash([mm(0.8), mm(1.2)]);
    ctx.beginPath();
    ctx.moveTo(lx, Y(it.ly));
    ctx.lineTo(X(it.ax), Y(it.ay));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.textAlign = isL ? 'right' : 'left';
    const tx = isL ? cakeX - mm(4) : cakeX + cakeW + mm(4);
    sheet.font(mm(3.2), 700);
    ctx.fillStyle = strengthColor(it.strength);
    ctx.fillText(it.primaryLabel, tx, Y(it.ly) - mm(2));
    if (it.strength) {
      sheet.font(mm(2.4), 700);
      ctx.fillStyle = MUTED;
      ctx.fillText(`${it.strength.pct}% match`, tx, Y(it.ly) + mm(1.4));
    }
    ctx.textAlign = 'left';
  }

  sheet.y = top + boxH + mm(6);
}

function drawTins(sheet, tins) {
  if (!tins?.tiers?.length) return;
  sheet.heading('Tins & weight', ACCENT.tins);

  if (!tins.totalKg) {
    sheet.y += sheet.text('Add a weight to the order to size the tins.', sheet.margin, sheet.y, { size: mm(3.2), color: MUTED });
    sheet.y += mm(6);
    return;
  }

  sheet.y += sheet.text(
    `${tins.totalKg} kg  ·  ${tins.tiers.length} tier${tins.tiers.length > 1 ? 's' : ''}`,
    sheet.margin, sheet.y, { size: mm(3.2), color: MUTED, weight: 700 },
  );
  sheet.y += mm(3);

  for (const t of tins.tiers) {
    const rowH = mm(9);
    const y = sheet.space(rowH);
    sheet.text(t.label, sheet.margin, y + mm(1.5), { size: mm(3.4), weight: 700 });
    const size = `${t.tinInch}″ ${t.shape}`;
    sheet.font(mm(3.4), 700);
    sheet.ctx.fillStyle = ACCENT.tins;
    sheet.ctx.fillText(size, sheet.margin + mm(45), y + mm(1.5));
    sheet.font(mm(3.2), 400);
    sheet.ctx.fillStyle = MUTED;
    sheet.ctx.fillText(`${t.weightKg} kg`, sheet.margin + mm(80), y + mm(1.5));
    sheet.rule(y + rowH - mm(1));
    sheet.y = y + rowH;
  }
  sheet.y += mm(5);
}

function drawColors(sheet, colors) {
  if (!colors?.length) return;
  sheet.heading(`Cream colours (${colors.length})`, ACCENT.colours);

  for (const c of colors) {
    // Measure the recipe first: a long "closest match" line must not be split across a page break.
    const recipe = c.recipe?.recipe
      ? `${c.recipe.recipe}${c.recipe.approx ? ' (closest match — adjust by eye)' : ''}`
      : 'No gel match — mix by eye.';
    const sw = mm(9);
    const textX = sheet.margin + sw + mm(4);
    const maxW = sheet.contentW - sw - mm(4);

    sheet.font(mm(3.2), 400);
    const recipeH = Math.ceil(sheet.ctx.measureText(recipe).width / maxW) * mm(4.3) + mm(4.3);
    const rowH = Math.max(sw + mm(4), recipeH + mm(7));
    const y = sheet.space(rowH);

    sheet.swatch(c.hex, sheet.margin, y, sw);
    sheet.text(`${c.hex}   ${c.uses.join(', ')}`, textX, y, { size: mm(3), weight: 700, color: MUTED, maxW });
    sheet.text(recipe, textX, y + mm(4.6), { size: mm(3.2), maxW });

    sheet.rule(y + rowH - mm(1.5));
    sheet.y = y + rowH;
  }
  sheet.y += mm(5);
}

function drawPiping(sheet, { elements, freehand }) {
  const n = (elements?.length ?? 0) + (freehand?.length ?? 0);
  if (!n) return;
  sheet.heading(`Piping & nozzles (${n})`, ACCENT.piping);

  for (const el of elements ?? []) {
    const y = sheet.space(mm(20));
    const sw = mm(7);
    sheet.swatch(el.color, sheet.margin, y + mm(0.5), sw);
    const x = sheet.margin + sw + mm(4);
    const maxW = sheet.contentW - sw - mm(4);

    let dy = y;
    dy += sheet.text(
      `${el.tier} · ${el.zone}${el.count > 1 ? ` · ×${el.count}` : ''}`,
      x, dy, { size: mm(3), weight: 700, color: MUTED, maxW },
    );

    if (el.primary.length) {
      sheet.font(mm(3.6), 700);
      sheet.ctx.fillStyle = ACCENT.piping;
      sheet.ctx.fillText(el.primaryLabel, x, dy + mm(0.8));
      if (el.strength) {
        const w = sheet.ctx.measureText(el.primaryLabel).width;
        sheet.font(mm(2.6), 700);
        sheet.ctx.fillStyle = MUTED;
        sheet.ctx.fillText(`${el.strength.pct}% match`, x + w + mm(3), dy + mm(1.8));
      }
      dy += mm(6);
    } else {
      dy += sheet.text('No nozzle tagged yet', x, dy + mm(0.8), { size: mm(3.2), color: MUTED, maxW }) + mm(1);
    }

    if (el.others.length) {
      dy += sheet.text(`Also: ${el.othersLabel}`, x, dy, { size: mm(3), color: MUTED, maxW });
    }
    if (el.guide?.consistency || el.guide?.technique) {
      const cons = el.guide.consistency ? `${el.guide.consistency[0].toUpperCase()}${el.guide.consistency.slice(1)} cream. ` : '';
      dy += sheet.text(`${cons}${el.guide.technique ?? ''}`, x, dy, { size: mm(3), color: MUTED, maxW });
    }

    const rowH = Math.max(dy - y, sw) + mm(5);
    sheet.rule(y + rowH - mm(2));
    sheet.y = y + rowH;
  }

  for (const f of freehand ?? []) {
    const y = sheet.space(mm(14));
    const sw = mm(7);
    sheet.swatch(f.color, sheet.margin, y + mm(0.5), sw);
    const x = sheet.margin + sw + mm(4);
    let dy = y;
    dy += sheet.text(`Cream pen — ${f.shape}${f.tier ? `  ·  ${f.tier}` : ''}`, x, dy, { size: mm(3.4), weight: 700 });
    sheet.font(mm(3.6), 700);
    sheet.ctx.fillStyle = ACCENT.piping;
    sheet.ctx.fillText(f.tip, x, dy + mm(0.8));
    dy += mm(6);

    const rowH = Math.max(dy - y, sw) + mm(5);
    sheet.rule(y + rowH - mm(2));
    sheet.y = y + rowH;
  }
  sheet.y += mm(4);
}

// "Sheet 2 of 3" on every page. A multi-page build sheet that does not number itself is a build sheet
// the baker will work from half of, having left page 3 by the printer.
function drawFooters(sheet, { order }) {
  sheet.pages.forEach((c, i) => {
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = `700 ${mm(2.8)}px Helvetica, Arial, sans-serif`;
    ctx.fillStyle = MUTED;
    const y = c.height - mm(11);
    ctx.fillText(order?.id != null ? `Order #${order.id}` : 'X-Ray report', sheet.margin, y);
    ctx.textAlign = 'right';
    ctx.fillText(`Sheet ${i + 1} of ${sheet.pages.length}`, c.width - sheet.margin, y);
    ctx.textAlign = 'left';
  });
}

// Build the whole report → a PDF Blob. `report` is buildXrayReport()'s output; `baker` is optional
// (name + logo_url) and only affects the letterhead.
export async function buildXrayPdf({ order, report, baker, dpi = 300 } = {}) {
  const [thumb, logo] = await Promise.all([
    tryLoad(order?.design_thumbnail_url),
    tryLoad(baker?.logo_url),
  ]);

  const sheet = new Sheet({ dpi });
  drawHeader(sheet, { order, baker, logo });
  drawDiagram(sheet, { thumb, diagram: report.diagram, tiers: order?.design_snapshot?.tiers });
  drawTins(sheet, report.tins);
  drawColors(sheet, report.colors);
  drawPiping(sheet, { elements: report.elements, freehand: report.freehand });
  drawFooters(sheet, { order });

  return canvasesToPdfBlob(sheet.pages);
}
