// ── The calendar, drawn from a recipe ────────────────────────────────────────────────────────────
//
// A month grid with ONE date ringed, generated onto a 2D canvas. Sandeep's two references: a piped
// freehand calendar with "15" circled in red gel, and a printed disc reading "October 2025" with a
// heart round the 15th.
//
// ⚠️ THE CALENDAR IS A RECIPE, NOT AN ASSET — and that is the whole reason this file exists rather
// than a folder of PNGs. `text_slots` already made this argument for placeholders and it holds here
// with more force: a calendar has 12 months × 31 dates × 2 layouts × however many years, so the
// per-value asset explosion is not a risk, it is a certainty. Generated, a date costs nothing.
//
// ⚠️ ONE RENDERER, CALLED BY EVERYONE. The admin studio previews with these functions, the designer
// composites the cake texture with them, and (when that half is built) the X-Ray print sheet will
// draw from them too. `textSlots.js` states the rule: "there is no second copy to drift." A baker
// must never be printing a different calendar from the one the customer saw.
//
// ⚠️ DATE MATHS IS NOT SHARED WITH OrdersCalendar, DELIBERATELY. `src/orders/OrdersCalendar.jsx`
// holds its own module-local `daysInMonth` / `firstWeekday` and nothing imports them. Reaching into
// an orders PANEL from a texture renderer would couple two unrelated surfaces for four lines of
// arithmetic, so this owns its own. ⚠️ That makes TWO copies of the same two lines in the codebase.
// A THIRD is the signal to extract them properly into a shared date module — do that rather than
// adding one more.
//
// Geometry is NORMALIZED (0..1 of the canvas) like text_slots, so a recipe survives any raster size:
// a 460px studio preview, a 1024px baked thumbnail and a true-scale A4 print are the same drawing.

// Single letters, because that is what the reference calendars show. Not in the codebase already —
// OrdersCalendar carries 'Sun'/'Mon' and 'Sunday'/'Monday', neither of which is this.
export const DAY_INITIALS = Object.freeze(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
export const MONTH_NAMES = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);

// How many days the month has, and which weekday its 1st falls on (0 = Sunday).
// `month` is 1-based, which is what a human types and what the recipe stores.
export const daysInMonth = (year, month) => new Date(year, month, 0).getDate();
export const firstWeekday = (year, month) => new Date(year, month - 1, 1).getDay();

/* ── The recipe ──────────────────────────────────────────────────────────────────────────────────
 *
 * Everything an admin authors, and nothing an instance chooses. The DATE is not here: it is the
 * customer's, and it rides on the instance (see the note on CALENDAR_VALUE_KEYS below).
 *
 * ⚠️ `layout` PICKS A STRATEGY, it is not a cosmetic flag — the same data↔code seam `text_slots`
 * uses for `algorithm` and `cake_textures` uses for its own keys. 'grid' is a rectangular month on
 * a square field; 'round' is the SAME grid bounded by a circle outline, sized to a round cake top.
 * Sandeep: "ring also - with grid lines only. but inside a circle outline. ring is to fit the round
 * cakes." So 'round' is a frame, never a polar arrangement of the dates.
 *
 * ⚠️ `medium` IS AUTHORED, NEVER INFERRED. `decorationLabel.js` records what it cost when X-Ray
 * guessed between printed and modelled: one cake's hat was called three different things on one
 * sheet. A piped calendar and a printed one are made completely differently — gel and a writing tip
 * versus an edible sheet — so the row says which it is.
 */
export const CALENDAR_DEFAULTS = Object.freeze({
  layout: 'grid',              // 'grid' | 'round'
  medium: 'printed',           // 'printed' | 'piped' — authored, never guessed
  ink: '#1A1A1A',              // the numbers
  accent: '#D8342B',           // the ring, the month name
  /* The field the calendar is drawn ON, or null for none.
   *
   * ⚠️ NULL IS A REAL VALUE, not "unset". A PIPED calendar has no background — it is gel straight
   * onto buttercream, which is Sandeep's first reference photo. A PRINTED one is an edible sheet and
   * always has paper, which is his second. So this is authored, not derived from `medium`: the two
   * usually agree, but a printed sheet on a coloured cake may want no field of its own, and coupling
   * them would take that choice away for a rule that is only usually true. */
  paper: '#FDF3EC',
  showDayHeader: true,         // S M T W T F S
  showMonthName: true,
  ringStyle: 'circle',         // 'circle' | 'heart' — the reference photos show one of each
  // Normalized: where the grid sits inside the canvas, leaving room for the month name above and a
  // caption below. Authored rather than computed so a studio operator can nudge it.
  rect: { x: 0.5, y: 0.54, w: 0.78, h: 0.56 },
  fontScale: 1,                // multiplies the derived cell font size
});

/* What the CUSTOMER chooses, and therefore what must travel on the instance rather than the row.
 *
 * ⚠️ THIS IS THE PART X-RAY HAS TO LEARN TO CARRY, and it is why the keys are declared here rather
 * than being implicit. `design.stickers[]` already persists per-instance values this way for
 * text_slots (`useCakeDesign.js` writes `textSlots` + `textValues`), so a date needs no new channel
 * into `design_snapshot`. What it needs is for X-Ray's `elementRows` to stop keying on `elementId`
 * alone — two calendars with different dates currently collapse into one row. Naming the keys here
 * gives that work one thing to read instead of a calendar special case.
 */
export const CALENDAR_VALUE_KEYS = Object.freeze({ YEAR: 'year', MONTH: 'month', DAY: 'day' });

/** The chosen date, defaulted so a freshly placed calendar draws something real. */
export function resolveDate(values, now = new Date()) {
  const year = Number(values?.year) || now.getFullYear();
  const month = Number(values?.month) || (now.getMonth() + 1);
  const max = daysInMonth(year, month);
  const day = Math.min(Math.max(Number(values?.day) || now.getDate(), 1), max);
  return { year, month, day };
}

/* ── Where every cell sits ───────────────────────────────────────────────────────────────────────
 *
 * PURE — no canvas, no DOM — so the layout can be unit-tested in node, which is where this project's
 * vitest runs (`environment: 'node'`, no jsdom). The drawing below consumes this; a test asserts it.
 *
 * Returns cells in NORMALIZED space, plus the header row, so a caller can draw, hit-test or measure
 * without re-deriving the arithmetic.
 */
export function calendarLayout(date, cfg = CALENDAR_DEFAULTS) {
  const { year, month } = date;
  const rect = { ...CALENDAR_DEFAULTS.rect, ...(cfg.rect || {}) };
  const total = daysInMonth(year, month);
  const lead = firstWeekday(year, month);
  const rows = Math.ceil((lead + total) / 7);
  const headerRows = cfg.showDayHeader ? 1 : 0;

  const left = rect.x - rect.w / 2;
  const top = rect.y - rect.h / 2;
  const cellW = rect.w / 7;
  const cellH = rect.h / (rows + headerRows);

  const header = cfg.showDayHeader
    ? DAY_INITIALS.map((t, i) => ({
        text: t, col: i,
        cx: left + cellW * (i + 0.5),
        cy: top + cellH * 0.5,
      }))
    : [];

  const cells = [];
  for (let d = 1; d <= total; d++) {
    const idx = lead + d - 1;
    const col = idx % 7;
    const row = Math.floor(idx / 7);
    cells.push({
      day: d, col, row,
      cx: left + cellW * (col + 0.5),
      cy: top + cellH * (row + headerRows + 0.5),
    });
  }
  return { cells, header, rows, cellW, cellH, rect };
}

// ── Drawing ─────────────────────────────────────────────────────────────────────────────────────
// Everything below takes a 2D context and a SIZE, and draws in normalized space scaled by it.

function ringPath(ctx, cx, cy, rx, ry, style) {
  ctx.beginPath();
  if (style === 'heart') {
    /* A piped heart, drawn as two arcs meeting at a point — the shape in the first reference photo,
     * where the 15 is circled with a red gel heart rather than a plain ring. */
    const w = rx * 1.15, h = ry * 1.15;
    ctx.moveTo(cx, cy + h * 0.75);
    ctx.bezierCurveTo(cx - w * 1.6, cy - h * 0.35, cx - w * 0.45, cy - h * 1.35, cx, cy - h * 0.45);
    ctx.bezierCurveTo(cx + w * 0.45, cy - h * 1.35, cx + w * 1.6, cy - h * 0.35, cx, cy + h * 0.75);
  } else {
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }
}

/**
 * Draw the calendar onto `ctx` at `S`×`S`.
 *
 * ⚠️ A 'grid' calendar draws NO background. It is piped or printed straight onto the cake's own
 * surface, so filling paper behind it would put a white square on a buttercream lid. Only 'round'
 * fills, because its disc IS the printed sheet in the reference photo.
 */
export function drawCalendar(ctx, S, date, cfg = CALENDAR_DEFAULTS, opts = {}) {
  const c = { ...CALENDAR_DEFAULTS, ...(cfg || {}) };
  const { cells, header, cellW, cellH } = calendarLayout(date, c);
  const px = (n) => n * S;

  /* ── The field it is drawn on ──────────────────────────────────────────────────────────────────
   * Sandeep, looking at the first cut: "only thing missing is - ability to change the background
   * colour." It was offered on 'round' only, because I had assumed a grid is always piped straight
   * onto the lid. His own second reference — a printed disc — is the case that disproves it: a
   * PRINTED calendar carries its own paper whatever its shape, and a rectangular printed sheet needs
   * a field exactly as much as a round one does.
   *
   * So both layouts fill, and `paper: null` is how a calendar says it has none — which is what a
   * piped one wants, drawn in gel on the cake's own surface. */
  if (c.layout === 'round') {
    const r = S * 0.5 - S * 0.012;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    if (c.paper) { ctx.fillStyle = c.paper; ctx.fill(); }
    // The outline is drawn whether or not there is a fill: on a round cake it is the edge of the
    // sheet, and piped it is the ring the dates sit inside.
    ctx.lineWidth = Math.max(1, S * 0.006);
    ctx.strokeStyle = c.accent;
    ctx.stroke();
  } else if (c.paper) {
    // A printed rectangular sheet. Fills the whole frame rather than just the grid's rect, because
    // the month name and any caption sit on the same piece of paper.
    ctx.fillStyle = c.paper;
    ctx.fillRect(0, 0, S, S);
  }

  const cellFont = px(Math.min(cellW, cellH)) * 0.54 * (c.fontScale ?? 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (c.showMonthName) {
    ctx.fillStyle = c.accent;
    ctx.font = `${Math.round(cellFont * 1.5)}px ${opts.titleFont || 'cursive'}`;
    const top = px(c.rect.y - c.rect.h / 2);
    ctx.fillText(`${MONTH_NAMES[date.month - 1]} ${date.year}`, S / 2, top - cellFont * 1.1);
  }

  if (header.length) {
    ctx.fillStyle = c.ink;
    ctx.font = `600 ${Math.round(cellFont * 0.82)}px ${opts.bodyFont || 'sans-serif'}`;
    for (const h of header) ctx.fillText(h.text, px(h.cx), px(h.cy));
  }

  ctx.font = `${Math.round(cellFont)}px ${opts.bodyFont || 'sans-serif'}`;
  for (const cell of cells) {
    const chosen = cell.day === date.day;
    if (chosen) {
      ctx.save();
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = Math.max(1.2, px(Math.min(cellW, cellH)) * 0.075);
      ctx.lineJoin = 'round';
      ringPath(ctx, px(cell.cx), px(cell.cy), px(cellW) * 0.40, px(cellH) * 0.40, c.ringStyle);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = chosen && c.ringStyle !== 'heart' ? c.accent : c.ink;
    ctx.fillText(String(cell.day), px(cell.cx), px(cell.cy));
  }
}

/** The whole calendar on a fresh canvas — the studio preview, its thumbnail bake, and (later) the
 *  designer's own texture all go through this, so none of them can draw a different calendar.
 *  Mirrors composeTextTopper's shape deliberately. */
export function composeCalendar(S, date, cfg = CALENDAR_DEFAULTS, opts = {}) {
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  drawCalendar(c.getContext('2d'), S, date, cfg, opts);
  return c;
}
