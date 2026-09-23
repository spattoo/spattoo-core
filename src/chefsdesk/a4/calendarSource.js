import { composeCalendar, resolveDate, resolveCalendarCfg } from '../../designer/shared/textures/calendarArt.js';

// ── A calendar on the print sheet ────────────────────────────────────────────────────────────────
//
// The requirement in one line, Sandeep's: *"when this goes to x-ray, it should be shown in prints
// with the selected date rounded."*
//
// ⚠️ THIS EXISTS BECAUSE THE OBVIOUS PATH PRINTS THE WRONG DATE. `CutoutModal` builds its sheet from
// the CATALOGUE, not from the design — `OrdersPanel` says why in its own comment: *"a saved snapshot
// carries element IDs and placement, not image URLs"*, and the sheet needs pixels to trace. So the
// row it gets is the ELEMENT, and `elementSources` falls back to `element.thumbnail_url`, which the
// Calendar Studio bakes from a SAMPLE date. A calendar would therefore print a real, plausible,
// beautifully rendered calendar showing a date nobody chose — silently. That is worse than printing
// nothing, because nothing is obvious and a wrong date is not.
//
// ⚠️ SO THE SOURCE IS INSTANCE-SHAPED, NOT ELEMENT-SHAPED, and that is not a new idea here:
// `topperSource.js` already does it for a card topper, drawing from the piece's own `payload` with
// no image anywhere. `PhotoSheet` does the same for photo frames, reading `design_snapshot.stickers`
// so the print carries the customer's own crop. A calendar joins that set: the DATE is on the
// instance, so the instance is what must be printed.
//
// ⚠️ AND IT ASKS `composeCalendar`, the one the cake asks (INVARIANTS #15). A baker must never print
// a different calendar from the one the customer approved on screen.
//
// ⚠️ NOTHING HERE IS ASYNC, unlike every other source module on this sheet. They are async because
// they have pixels to fetch or fonts to wait for; a calendar is drawn from three integers and a
// recipe, so there is nothing to load and no failure mode to handle. Kept sync deliberately rather
// than wrapped in a Promise for symmetry — a fake await would imply a wait that cannot happen.

/* The source-id prefix, exported so a saved sheet's open path and this module agree on it in one
   place rather than each spelling it out. Mirrors TOPPER_PREFIX. */
export const CALENDAR_PREFIX = 'calendar:';

/* What a preview costs. 200 on the long edge, the same as a card topper's — big enough to read the
   month in the palette strip, small enough that a sheet of them is not a megabyte of data URLs. The
   EXPORT redraws at the size the PDF needs (see `draw`), because an edible sheet shows the
   difference between 200px upscaled and 300dpi. */
const PREVIEW_PX = 200;

/**
 * The calendars ON THIS CAKE, one per placement, read off the saved design.
 *
 * ⚠️ PER INSTANCE, keyed by the sticker's own id — NOT deduped by `elementId`. Two calendars on one
 * cake are usually two different dates (a birthday and an anniversary), and collapsing them to one
 * row would print one of them twice. This is exactly the bug `elementRows` in XrayDecorationSteps
 * still has, and the reason this reads the design rather than the catalogue.
 *
 * @param {{stickers?: Array, decorations?: Array}} design  a design_snapshot-shaped object
 */
export function calendarsIn(design) {
  const all = [...(design?.stickers ?? []), ...(design?.decorations ?? [])];
  return all
    .filter(s => s?.calendar)
    .map(s => ({
      id: String(s.id),
      name: s.name || 'Calendar',
      /* ⚠️ THE SHAPE IS THE CUSTOMER'S TOO, not just the date. A calendar can offer both layouts and
         the placement records which one was picked — so the sheet must print the shape on the cake,
         not the one the recipe happens to list first. Same class of bug as printing a sample date,
         and just as quiet. `resolveCalendarCfg` validates the choice against what the recipe
         actually offers, so a narrowed list cannot print a shape that is no longer on offer. */
      cfg: resolveCalendarCfg(s.calendar, s.calendarLayout),
      // The customer's date. `resolveDate` clamps a day the month does not have and falls back to
      // today for a value that never got set, so the sheet can always draw something real.
      date: resolveDate(s.calendarValues ?? {}),
    }));
}

/**
 * The sheet items one calendar offers. ONE, deliberately: a calendar is printed, or piped by hand
 * from the same picture. There is no cut-out — its outline is a circle or the edge of the paper,
 * and offering a card that traces that would put a blank-looking template in the strip.
 *
 * `calendar` and `date` ride ON the source so a SAVED sheet can redraw it. `printSheets.js` stores
 * items exactly as sent, which is how a topper's payload survives; the same is true here, and it
 * means a sheet keeps printing the date it printed even after the cake it came from is changed.
 * That is what a record of a print job should do.
 *
 * @param {{id: string, name?: string, cfg: object, date: {year,month,day}}} cal
 * @returns {Array} `[print]`
 */
export function calendarSources(cal) {
  if (!cal?.cfg || !cal?.date) return [];
  const { cfg, date } = cal;
  return [{
    id: `${CALENDAR_PREFIX}${cal.id}`,
    name: cal.name,
    kind: 'print',
    // Square by construction: composeCalendar draws into an S x S canvas, and both layouts are
    // authored in that square (the round one is a disc inscribed in it). `hPx` is accepted and
    // unused rather than absent — the sheet has ONE draw signature, and a source that quietly took
    // fewer arguments would be a shape only this caller knows about.
    aspect: 1,
    preview: composeCalendar(PREVIEW_PX, date, cfg).toDataURL('image/png'),
    calendar: cfg,
    date,
    draw: (ctx, x, y, wPx, _hPx) => {
      ctx.drawImage(composeCalendar(Math.max(1, Math.round(wPx)), date, cfg), x, y, wPx, wPx);
    },
  }];
}

/** Every calendar on a cake, as sheet sources. The one call a caller needs. */
export const calendarSourcesFor = (design) => calendarsIn(design).flatMap(calendarSources);
