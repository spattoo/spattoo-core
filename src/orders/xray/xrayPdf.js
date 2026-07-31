import { newA4Canvas, canvasesToPdfBlob } from '../pdf.js';
import { layoutDiagram, DIAGRAM } from './xrayProject.js';
import { strengthColor } from './report.js';
import { loadImage } from '../framePhoto.js';
import { corsUrl } from '../../designer/utils/assetUrl.js';
import { hasAllergen, dietaryLine } from '../dietary.js';

// ── The X-Ray report, as a sheet of paper ────────────────────────────────────────────────────────
// The screen version of this report is read at a desk. THIS one is carried to a bench, put down next
// to a mixer, and worked from with icing on your hands — which is the whole reason it exists as a
// download rather than a print dialog: the baker wants a file to keep with the order, not a tab to
// keep open.
//
// It renders the SAME data (report.js) and the SAME diagram layout (xrayProject.js) as the screen —
// only the drawing is different. Nothing here decides what the report SAYS.
//
// Text is rasterized (the page is one JPEG — see pdf.js), which is why every size below is in canvas
// pixels and looks large: mm() converts millimetres of PAPER into pixels of canvas.
//
// The DPI is fixed at 300 and is deliberately NOT a parameter. Every dimension in this file is
// derived from mm(), which bakes 300 in — so a caller passing a different dpi would get a page whose
// canvas shrank while its content did not, and the report would silently spill across seven sheets
// instead of two. A knob that quietly corrupts the layout is worse than no knob.
const DPI = 300;
const PX_PER_MM = DPI / 25.4;
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
  constructor() {
    this.pages = [];
    this.margin = mm(14);
    this.newPage();
  }

  newPage() {
    const c = newA4Canvas({ dpi: DPI, portrait: true });
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

  // `keepWith` reserves room for what FOLLOWS the heading as well, so a section title can never be
  // stranded at the foot of a page with its rows overleaf — on a printed sheet that reads as an empty
  // section ("Piping & nozzles (7)" … nothing), and the baker turns the page only if he doubts it.
  heading(label, accent, keepWith = mm(16)) {
    const size = mm(4);
    this.space(size * 2.6 + keepWith);
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
//
// And it MUST go through corsUrl(). The orders list renders this very thumbnail as a plain <img>, a
// request that carries no Origin — so R2 answers it with no Access-Control-Allow-Origin and no Vary,
// and Chrome then treats that response as valid for ANY later request to the same URL, including this
// crossOrigin='anonymous' one. The load is blocked by a cache entry the *screen behind us* poisoned,
// and it fails intermittently — the exact bug corsUrl exists to prevent (see utils/assetUrl.js). The
// qualifier gives us a separate cache entry.
//
// A picture that will not load is never fatal: the words are the point, the picture is the comfort.
async function tryLoad(url) {
  if (!url) return null;
  try { return await loadImage(corsUrl(url)); } catch { return null; }
}

function drawHeader(sheet, { order, baker, logo, conflicts, spec }) {
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
    shortRef(order) ? `Order ${shortRef(order)}` : null,
    customerName(order),
    order?.delivery_date ? `Delivery ${formatDate(order.delivery_date)}` : null,
  ].filter(Boolean);
  sheet.y += sheet.text(bits.join('   ·   '), sheet.margin, sheet.y, { size: mm(3.4), color: MUTED, weight: 700 });

  sheet.y += mm(4);

  // The dietary band, above the rule so it is the last thing read before the cake and
  // impossible to skim past. Deliberately BLACK ON WHITE inside a heavy black frame,
  // not the screen's tinted chip: this sheet gets printed on whatever mono laser is in
  // the kitchen, and a requirement encoded as a colour would simply vanish. The screen
  // may use colour to help scanning; paper cannot rely on it. (See dietary.js — also
  // for why this is imperative wording and not a veg certification mark.)
  const reqs = order?.dietary_requirements ?? [];
  if (reqs.length) {
    const allergen = hasAllergen(reqs);
    const padY = mm(3), boxTop = sheet.y;
    const lineH = sheet.text(dietaryLine(reqs), sheet.margin + mm(3), boxTop + padY, { size: mm(4.6), weight: 800 });
    let inner = padY + lineH;
    if (allergen) {
      inner += sheet.text('Allergen — use clean equipment and keep this batch separate.',
        sheet.margin + mm(3), boxTop + inner + mm(0.5), { size: mm(3.2), weight: 700, color: MUTED });
      inner += mm(0.5);
    }
    const boxH = inner + padY;
    ctx.strokeStyle = INK;
    ctx.lineWidth = allergen ? mm(1.0) : mm(0.5);   // an allergen gets the heavier frame
    ctx.strokeRect(sheet.margin, boxTop, sheet.contentW, boxH);
    sheet.y = boxTop + boxH + mm(4);
  }

  // The contradiction band, under the requirement band. Two separate boxes on purpose:
  // the one above says what the customer asked for, this one says the order disagrees
  // with itself, and a baker who reads only one of them must not be left thinking the
  // other was covered. It carries the heaviest rule on the sheet — of everything printed
  // here, this is the line that should stop someone before they start creaming butter.
  if (conflicts?.length) {
    const padY = mm(3), boxTop = sheet.y;
    let inner = padY + sheet.text('CHECK BEFORE BAKING',
      sheet.margin + mm(3), boxTop + padY, { size: mm(3.0), weight: 900, color: INK });
    for (const line of conflicts) {
      inner += mm(1.0);
      inner += sheet.text(line, sheet.margin + mm(3), boxTop + inner, { size: mm(4.0), weight: 800 });
    }
    const boxH = inner + padY;
    ctx.strokeStyle = INK;
    ctx.lineWidth = mm(1.2);
    ctx.strokeRect(sheet.margin, boxTop, sheet.contentW, boxH);
    sheet.y = boxTop + boxH + mm(4);
  }

  // ── Read off a photo, not measured ─────────────────────────────────────────
  // Below the two customer-requirement bands (an allergen is always read first) but still above
  // the rule, so it is read before any number on the sheet.
  //
  // This band matters MORE on paper than on screen. The screen version is seen once, by whoever
  // pressed the button and therefore already knows the order had no design; the sheet is what
  // reaches the bench, possibly in someone else's hands, hours later. A tin size printed in the
  // same typeface as a measured one is indistinguishable from it — so the page has to say where
  // the numbers came from, and name what could not be read.
  if (spec?.fromPhoto) {
    const padY = mm(3), boxTop = sheet.y;
    let inner = padY + sheet.text('READ BY AI FROM THE REFERENCE PHOTO — CHECK BEFORE YOU BAKE',
      sheet.margin + mm(3), boxTop + padY, { size: mm(3.0), weight: 900, color: INK });
    inner += mm(1.0);
    // Says AI outright, which the screen band did not. Paper is the copy that reaches the bench,
    // is read at 6am, and carries no context around it — and a sheet that looks measured is
    // indistinguishable from one that was. Naming the source is what lets a baker weigh it.
    inner += sheet.text(
      'This order had no 3D design. Tiers, colours and tin sizes below were worked out by AI from the '
      + `customer's photo${spec.edited ? ' and corrected by the baker' : ''}, and may be wrong.`,
      sheet.margin + mm(3), boxTop + inner, { size: mm(3.6), weight: 700 });

    // A guide about a photo that is no longer on the order. On PAPER this matters more than on
    // screen: the sheet outlives the moment, and whoever picks it up at 6am has no way to know the
    // picture changed. Printed inside the provenance band, in the same heavy frame.
    if (spec.stale) {
      inner += mm(1.2);
      inner += sheet.text(
        'THE REFERENCE PHOTO HAS CHANGED SINCE THIS SHEET WAS MADE — check the order before baking.',
        sheet.margin + mm(3), boxTop + inner, { size: mm(3.6), weight: 900 });
    }

    const missed = spec.coverage?.unidentified ?? [];
    if (missed.length) {
      inner += mm(1.2);
      inner += sheet.text(
        `NOT in the list below (${missed.length} could not be identified): `
        + missed.map(u => u.what).join(', '),
        sheet.margin + mm(3), boxTop + inner, { size: mm(3.6), weight: 800 });
    }
    if (spec.coverage?.shapeRecognised === false) {
      inner += mm(1.0);
      inner += sheet.text(
        `Cake shape read as "${spec.coverage.reportedShape}" — tin sizes assume a round tin.`,
        sheet.margin + mm(3), boxTop + inner, { size: mm(3.6), weight: 700 });
    }

    const boxH = inner + padY;
    ctx.strokeStyle = INK;
    ctx.lineWidth = mm(0.8);
    ctx.strokeRect(sheet.margin, boxTop, sheet.contentW, boxH);
    sheet.y = boxTop + boxH + mm(4);
  }

  sheet.rule(sheet.y);
  sheet.y += mm(6);
}

// A cake needs an identity on paper, but the order id is a 36-character UUID the app never shows
// anyone — printing it whole is noise a baker has to read past. The first segment is short enough to
// read aloud over a bench and still matches what he'd search for.
export function shortRef(order) {
  const id = order?.id;
  if (id == null) return null;
  const first = String(id).split('-')[0];
  return first.length > 10 ? first.slice(0, 8).toUpperCase() : first.toUpperCase();
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

// The cake — with a leader line onto each piping and the nozzle in the margin WHEN there is piping to
// annotate. The picture is drawn either way: it is the first thing the baker looks for on the sheet
// ("which cake is this?"), and a cake with no piping at all — a photo-cake, say — would otherwise have
// printed with no cake on it, which is how this shipped and is plainly wrong. Annotations are an
// enrichment of the picture, not the reason for it.
//
// Leader-line geometry is layoutDiagram's, identical to the screen's — fractions of the box, scaled
// into canvas px here.
function drawDiagram(sheet, { thumb, diagram, tiers }) {
  if (!thumb) return;
  const all = layoutDiagram(diagram, tiers);

  // Nothing to point at → no margins to reserve for labels, so give the cake a plain centred block
  // rather than stranding it in a third of the page.
  if (!all.length) {
    const h = mm(58);
    const top = sheet.space(h + mm(6));
    sheet.ctx.drawImage(thumb, sheet.margin + (sheet.contentW - h) / 2, top, h, h);
    sheet.y = top + h + mm(6);
    return;
  }

  const boxW = Math.min(sheet.contentW, mm(150));
  const x0 = sheet.margin + (sheet.contentW - boxW) / 2;   // centred when capped
  const cakeW = DIAGRAM.cakeW * boxW;                      // the thumbnail is SQUARE — this is its side

  // Crop the square vertically to the band the cake and its labels actually occupy. The thumbnail is a
  // fixed camera render, so the cake sits low in its own frame with a lot of sky above it — printed
  // whole, a third of page one is empty. The band is derived from the projected anchors themselves
  // (`ay`) and the label positions (`ly`), so it tracks the cake rather than assuming where it sits:
  // a one-tier cake and a four-tier cake each get cropped to their own extent.
  //
  // The crop is a straight linear remap of the SAME fractions layoutDiagram produced, so every leader
  // line still lands exactly where it did — it is a zoom, not a different projection.
  const PAD = 0.08;
  const ys = all.flatMap(it => [it.ay, it.ly]);
  const cy0 = Math.max(0, Math.min(...ys) - PAD);
  const cy1 = Math.min(1, Math.max(...ys) + PAD);
  const vh  = Math.max(0.2, cy1 - cy0);          // fraction of the square kept

  const boxH = cakeW * vh;
  const top = sheet.space(boxH + mm(4));
  const { ctx } = sheet;
  const X = (fx) => x0 + fx * boxW;
  const Y = (fy) => top + (fy - cy0) * cakeW;    // 1.0 of fraction = one square side, cropped

  const cakeX = X(DIAGRAM.cakeX);
  ctx.drawImage(
    thumb,
    0, cy0 * thumb.height, thumb.width, vh * thumb.height,   // source: the cropped band
    cakeX, top, cakeW, boxH,                                 // destination
  );

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
    // What goes IN the tin. The sheet has never said, and a baker reading "7in round,
    // 1.54 kg" wants it at exactly this moment. Baking a tier in the wrong flavour is not
    // a blemish to patch — it is a remake.
    if (t.flavour) {
      sheet.font(mm(3.4), 700);
      sheet.ctx.fillStyle = INK;
      sheet.ctx.fillText(t.flavour, sheet.margin + mm(105), y + mm(1.5));
    }
    sheet.rule(y + rowH - mm(1));
    sheet.y = y + rowH;
  }
  sheet.y += mm(5);
}

// ── The checklist ─────────────────────────────────────────────────────────────
// Everything that has to go ON the cake, in the order it gets assembled. Numbered 1..N
// unbroken across groups, matching the screen exactly — the number is assigned in
// report.js precisely so a baker and whoever is on the phone are looking at the same
// "number 7".
//
// The boxes are HERE and nowhere else. Ticking is a claim about the physical cake, made
// at the bench with icing on your hands; the screen shows the same numbered list to read
// from, and the paper carries the marks. (An on-screen box would have to persist to mean
// anything, and one that silently forgets gets trusted.)
//
// The box sits hard RIGHT, in one column: the eye runs straight down a column of empty
// squares and stops at the first one still empty, which is the entire job of this
// section. Boxes tucked beside variable-length text would zig-zag down the page and
// defeat it.
//
// Drawn in plain black outline, like the dietary band, because this sheet gets printed
// on whatever mono laser is in the kitchen.
// How tall `text` will be once wrapped to `maxW` — measured with the SAME rule Sheet.text
// wraps by, so the row height reserved and the text drawn cannot disagree.
function wrappedHeight(sheet, text, maxW, size) {
  sheet.font(size, 700);
  let lines = 1, line = '';
  for (const w of String(text).split(/\s+/)) {
    const next = line ? `${line} ${w}` : w;
    if (sheet.ctx.measureText(next).width > maxW && line) { lines++; line = w; }
    else line = next;
  }
  return lines * size * 1.35;
}

function drawChecklist(sheet, checklist, total) {
  if (!checklist?.length) return;
  sheet.heading(`Checklist — ${total} item${total === 1 ? '' : 's'}`, INK);

  const boxSize = mm(4.5);
  const boxX    = sheet.margin + sheet.contentW - boxSize;

  for (const group of checklist) {
    const gy = sheet.space(mm(6));
    sheet.text(group.title.toUpperCase(), sheet.margin, gy + mm(1),
      { size: mm(2.8), weight: 800, color: group.kind === 'instruction' ? INK : MUTED });
    sheet.y = gy + mm(6);

    // Remember where the instruction block starts, and which page it started on, so it
    // can be framed once its height is known. A darker heading alone is not enough
    // separation for the one group on this sheet that is the customer's own words.
    const frameTop  = sheet.y - mm(6);
    const framePage = sheet.pages.length;

    for (const item of group.items) {
      // An instruction is the CUSTOMER'S OWN WORDS and must never be clipped — truncating
      // "no nuts in the buttercream but nuts on top are fine" at the column edge inverts
      // its meaning. So it wraps to the full width left of the box and the row grows to
      // fit, rather than being forced into the fixed row height a derived item uses.
      const isInstr = group.kind === 'instruction';
      const textX   = sheet.margin + mm(8);
      const textW   = boxX - textX - mm(4);
      const label   = item.count > 1 ? `${item.what}  × ${item.count}` : item.what;

      if (isInstr) {
        sheet.font(mm(3.6), 700);
        const h = wrappedHeight(sheet, label, textW, mm(3.6));
        const rowH = Math.max(mm(8), h + mm(3));
        const y = sheet.space(rowH);
        sheet.text(`${item.seq}.`, sheet.margin, y + mm(1.2), { size: mm(3.2), weight: 800, color: INK });
        sheet.text(label, textX, y + mm(1.2), { size: mm(3.6), weight: 700, maxW: textW });
        sheet.ctx.strokeStyle = INK;
        sheet.ctx.lineWidth = mm(0.4);
        sheet.ctx.strokeRect(boxX, y + mm(0.4), boxSize, boxSize);
        sheet.rule(y + rowH - mm(1));
        sheet.y = y + rowH;
        continue;
      }

      const rowH = mm(8);
      const y = sheet.space(rowH);

      sheet.text(`${item.seq}.`, sheet.margin, y + mm(1.2), { size: mm(3.2), weight: 800, color: MUTED });
      sheet.text(label, textX, y + mm(1.2), { size: mm(3.6), weight: 700 });
      if (item.where) {
        // FIXED column, not offset from the label's measured width. Keying it to the text
        // length makes the "where" zig-zag down the page, which defeats the one thing this
        // layout is for — running the eye down a straight column. Same reason drawTins
        // pins its size and weight columns to fixed offsets.
        sheet.font(mm(3.0), 400);
        sheet.ctx.fillStyle = MUTED;
        sheet.ctx.fillText(item.where, sheet.margin + mm(95), y + mm(1.2));
      }

      // The box itself — empty, to be penned.
      sheet.ctx.strokeStyle = INK;
      sheet.ctx.lineWidth = mm(0.4);
      sheet.ctx.strokeRect(boxX, y + mm(0.4), boxSize, boxSize);

      sheet.rule(y + rowH - mm(1));
      sheet.y = y + rowH;
    }

    // Frame the instruction block. Skipped if it spilled onto a new page mid-group — a
    // rectangle drawn from a start point on the previous page would streak down the sheet,
    // and no frame reads better than a broken one.
    if (group.kind === 'instruction' && sheet.pages.length === framePage) {
      sheet.ctx.strokeStyle = INK;
      sheet.ctx.lineWidth = mm(0.5);
      sheet.ctx.strokeRect(
        sheet.margin - mm(2), frameTop - mm(1),
        sheet.contentW + mm(4), sheet.y - frameTop + mm(1),
      );
      sheet.y += mm(2);
    }

    sheet.y += mm(2);
  }
  sheet.y += mm(4);
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
    } else if (el.seenTechnique) {
      // No curated nozzle, but the model read the technique off the photo. Worth printing — the
      // baker can act on "star tip (1M), check it" and can do nothing at all with silence.
      //
      // Deliberately NOT drawn in the green tip pill the curated recommendations use. On paper
      // there is no hover, no colour legend and no way back to ask, so the only thing separating a
      // human's catalogue match from a model's guess is that they must not look alike.
      dy += sheet.text(`Read from the photo: ${el.seenTechnique} — not a matched nozzle, check it.`,
        x, dy + mm(0.8), { size: mm(3.2), color: MUTED, maxW }) + mm(1);
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
    ctx.fillText(shortRef(order) ? `Order ${shortRef(order)}` : 'X-Ray report', sheet.margin, y);
    ctx.textAlign = 'right';
    ctx.fillText(`Sheet ${i + 1} of ${sheet.pages.length}`, c.width - sheet.margin, y);
    ctx.textAlign = 'left';
  });
}

// Render the report → the page canvases. Split from the PDF wrapping below so the sheet can be LOOKED
// AT — a layout you cannot see is a layout you are guessing at, and every bug so far in this file
// (a missing cake, an orphaned heading) was one only the eye caught.

// ── How to make the decorations ─────────────────────────────────────────────
// A modelled topper is usually made DAYS before the cake, at a bench, from paper — which is why
// this belongs on the sheet at all and not only on a screen. Drawn last: everything above is about
// the cake itself, this is a separate making session.
//
// Role tokens ({body}) print as the role word. The colours live in the colour table above; naming
// them twice would be a second place for them to disagree.
// ── The reference block, printed above each decoration's steps ──────────────────────────────────
// The three deterministic panels from spattoo-docs plans/visual-decoration-guide.md, on paper. On
// screen they are optional detail a baker can scroll past; on paper they are the difference
// between a recipe and a set of instructions for a shape nobody has seen.
//
// Returns the height consumed so the caller can advance. Draws nothing, and consumes nothing, when
// a decoration has none of the three — which is the normal case for an element-backed guide with
// no colours read.
function drawDecorationReference(sheet, photo, meta, guide) {
  const colours = (guide?.colours ?? []).filter(c => /^#[0-9a-f]{6}$/i.test(String(c?.hex ?? '')));
  const bbox    = meta?.bbox;
  const canCrop = !!(photo && bbox);
  if (!canCrop && !colours.length && !meta?.widthMm) return 0;

  const readable = (t) => String(t ?? '').replace(/\{(\w+)\}/g, (_, r) => r.replace(/_/g, ' '));
  const size = mm(26);
  const top  = sheet.y + mm(1.5);
  let textX  = sheet.margin;

  if (canCrop) {
    // Same quarter-box pad as the screen crop (cropStyle) and the printable template, so all three
    // agree about where the decoration ends. drawImage clips to the source rect, which is what
    // background-size/position does on screen.
    const [x, y, w, h] = bbox;
    const padX = w * 0.25, padY = h * 0.25;
    const cx = Math.max(0, x - padX), cy = Math.max(0, y - padY);
    const cw = Math.min(1 - cx, w + padX * 2), ch = Math.min(1 - cy, h + padY * 2);

    // Cover the square frame without distorting: take the largest centred source square.
    const sW = cw * photo.naturalWidth, sH = ch * photo.naturalHeight;
    const side = Math.min(sW, sH);
    const sx = cx * photo.naturalWidth + (sW - side) / 2;
    const sy = cy * photo.naturalHeight + (sH - side) / 2;

    sheet.ctx.drawImage(photo, sx, sy, side, side, sheet.margin, top, size, size);
    sheet.ctx.strokeStyle = RULE;
    sheet.ctx.lineWidth = Math.max(1, mm(0.2));
    sheet.ctx.strokeRect(sheet.margin, top, size, size);
    textX = sheet.margin + size + mm(4);
  }

  let ty = top;
  if (meta?.widthMm) {
    // The one real measurement on the sheet. Printed beside the picture because that is where the
    // question "how big is it" is actually asked.
    ty += sheet.text(`Actual size: ${(meta.widthMm / 10).toFixed(1)} cm wide`,
      textX, ty, { size: mm(3.6), weight: 800 });
    ty += sheet.text('Print the template from the app to cut to size.',
      textX, ty, { size: mm(3.0), weight: 600, color: MUTED }) + mm(1);
  }

  if (colours.length) {
    ty += sheet.text('COLOURS', textX, ty, { size: mm(2.8), weight: 900, color: MUTED }) + mm(0.8);
    for (const c of colours) {
      const sw = mm(3.4);
      sheet.swatch(c.hex, textX, ty + mm(0.4), sw);
      // Hex printed alongside the role: the steps carry role tokens rather than colour names so one
      // guide serves every colour variant, and this is the only place that trade is paid back.
      sheet.text(`${readable(c.role)} · ${c.hex}`, textX + sw + mm(2), ty,
        { size: mm(3.2), weight: 700 });
      ty += Math.max(sw, mm(3.2)) + mm(1.2);
    }
  }

  return Math.max(canCrop ? size + mm(3) : 0, ty - top + mm(2));
}

// The generated build sequence, printed above the written steps.
//
// It carries NO TEXT by design — the model draws, we write — so it never replaces the steps below
// it, and its absence is not an error: the picture is best-effort at generation time and a guide
// without one is still a complete guide.
//
// Reserved whole. Half a build sequence at the foot of a page, with the rest overleaf, is worse
// than starting it on the next page: a baker reads the panels as a sequence and a broken one reads
// as a shorter sequence.
function drawStageGrid(sheet, img) {
  if (!img) return;
  const w = sheet.contentW;
  const h = w * (img.naturalHeight / img.naturalWidth);
  sheet.space(h + mm(10));
  sheet.y += sheet.text('STEP BY STEP', sheet.margin, sheet.y, { size: mm(2.8), weight: 900, color: MUTED }) + mm(1);
  sheet.ctx.drawImage(img, sheet.margin, sheet.y, w, h);
  sheet.ctx.strokeStyle = RULE;
  sheet.ctx.lineWidth = Math.max(1, mm(0.2));
  sheet.ctx.strokeRect(sheet.margin, sheet.y, w, h);
  sheet.y += h + mm(1.5);
  sheet.y += sheet.text('Drawn by AI from the reference photo — a guide to the shape, not a photograph of this cake.',
    sheet.margin, sheet.y, { size: mm(3.0), weight: 600, color: MUTED }) + mm(2);
}

function drawDecorationSteps(sheet, decorationSteps, photo, meta, stageImages) {
  // Same shape from both sources: { <key>: { guide, … } }. An element-backed guide is keyed by
  // element id, a photo one by the decoration's id within the spec — the sheet does not care which.
  const entries = Object.entries(decorationSteps ?? {}).filter(([, r]) => r?.guide?.steps?.length);
  if (!entries.length) return;

  const readable = (s) => String(s ?? '').replace(/\{(\w+)\}/g, (_, r) => r.replace(/_/g, ' '));

  sheet.heading('Decorations — how to make them', ACCENT.colours);
  // A DESIGNED order gets no provenance band above, but these steps are still model-written. The
  // warning belongs wherever the steps are, not only where the tin plan is.
  sheet.y += sheet.text('Written by AI. Check before you build.',
    sheet.margin, sheet.y, { size: mm(3.2), weight: 700, color: MUTED }) + mm(1.5);

  for (const [key, row] of entries) {
    const g = row.guide;
    sheet.space(mm(20));
    sheet.y += sheet.text(readable(g.title || 'Decoration'), sheet.margin, sheet.y, { size: mm(4.4), weight: 800 });
    sheet.y += drawDecorationReference(sheet, photo, meta?.[key], g);
    drawStageGrid(sheet, stageImages?.[key]);

    // An unreviewed model guess must not read like a curated craft guide — and on paper there is
    // no tooltip to explain it later.
    if (row.status !== 'approved') {
      sheet.y += sheet.text('AI draft — not reviewed. Check before you build.',
        sheet.margin, sheet.y, { size: mm(3.2), weight: 700, color: MUTED });
    }
    if (g.set_time) {
      sheet.y += sheet.text(`Allow ${g.set_time} to firm up.`, sheet.margin, sheet.y, { size: mm(3.4), weight: 700, color: MUTED });
    }
    if (g.materials?.length) {
      sheet.y += mm(1);
      sheet.y += sheet.text(`You will need: ${g.materials.map(m => readable(m.label)).join(', ')}`,
        sheet.margin, sheet.y, { size: mm(3.4), weight: 600 });
    }
    sheet.y += mm(2);

    for (const step of g.steps) {
      // Reserve the whole step: a title stranded at the foot of a page with its instructions
      // overleaf reads as an empty step, and a baker turns the page only if he doubts it.
      sheet.space(mm(14));
      const n = `${step.n}.`;
      sheet.text(n, sheet.margin, sheet.y, { size: mm(3.6), weight: 800 });
      const x = sheet.margin + mm(7);
      let h = sheet.text(readable(step.title), x, sheet.y, { size: mm(3.6), weight: 800, maxW: sheet.contentW - mm(7) });
      for (const line of step.instructions ?? []) {
        h += sheet.text(readable(line), x, sheet.y + h, { size: mm(3.4), weight: 500, maxW: sheet.contentW - mm(7) });
      }
      if (step.tools?.length) {
        h += sheet.text(step.tools.join(' · '), x, sheet.y + h, { size: mm(3.2), weight: 600, color: MUTED, maxW: sheet.contentW - mm(7) });
      }
      sheet.y += h + mm(2.5);
    }

    for (const tip of g.tips ?? []) {
      sheet.space(mm(8));
      sheet.y += sheet.text(`· ${readable(tip)}`, sheet.margin, sheet.y, { size: mm(3.3), weight: 600, color: MUTED }) + mm(1);
    }
    sheet.y += mm(4);
  }
}

export async function renderXrayPages({ order, report, baker, conflicts, spec, decorationSteps, photoUrl, decorationMeta } = {}) {
  const [thumb, logo] = await Promise.all([
    tryLoad(order?.design_thumbnail_url),
    tryLoad(baker?.logo_url),
  ]);
  // The decoration close-ups are crops of this same photo, so it is loaded once here rather than
  // per decoration. `thumb` above IS that photo for a manual order, but not for a designed one,
  // and the two must not be conflated — a designed order's decorations are library elements.
  const photo = photoUrl ? await tryLoad(photoUrl) : null;

  // The build-sequence images, one per decoration that has one. Loaded here rather than inside the
  // draw pass because Sheet drawing is synchronous — and loaded in PARALLEL, since a sheet with six
  // decorations would otherwise wait on six sequential fetches before a single page appears.
  const stageEntries = Object.entries(decorationMeta ?? {}).filter(([, m]) => m?.stagesUrl);
  const stageImages = Object.fromEntries(
    await Promise.all(stageEntries.map(async ([k, m]) => [k, await tryLoad(m.stagesUrl)])),
  );

  const sheet = new Sheet();
  drawHeader(sheet, { order, baker, logo, conflicts, spec });
  drawDiagram(sheet, { thumb, diagram: report.diagram, tiers: order?.design_snapshot?.tiers });
  drawTins(sheet, report.tins);
  // Before the colour/nozzle detail: the checklist is what a baker returns to repeatedly
  // during assembly, and the mixing tables are read once at the start.
  drawChecklist(sheet, report.checklist, report.checklistTotal);
  drawColors(sheet, report.colors);
  drawPiping(sheet, { elements: report.elements, freehand: report.freehand });
  drawDecorationSteps(sheet, decorationSteps, photo, decorationMeta, stageImages);
  drawFooters(sheet, { order });

  return sheet.pages;
}

// Build the whole report → a PDF Blob. `report` is buildXrayReport()'s output; `baker` is optional
// (name + logo_url) and only affects the letterhead. `conflicts` is an array of ready-made bench
// lines — the SCREEN derives them and hands them over, so the sheet a baker carries in cannot say
// something different from the screen he just read it off.
export async function buildXrayPdf(opts = {}) {
  return canvasesToPdfBlob(await renderXrayPages(opts));
}
