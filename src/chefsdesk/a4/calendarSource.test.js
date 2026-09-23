import { describe, it, expect } from 'vitest';
import { calendarsIn, calendarSources, CALENDAR_PREFIX } from './calendarSource.js';

/* ⚠️ ONLY THE PURE HALF IS TESTED HERE, and deliberately: `calendarSources` calls `composeCalendar`,
 * which reaches for `document.createElement('canvas')`, and vitest runs `environment: 'node'`. The
 * same split calendarArt.js already makes — the arithmetic is asserted, the drawing is looked at.
 *
 * What `calendarsIn` decides is the thing that was actually WRONG before this module existed: WHICH
 * calendar gets printed and with WHOSE date. The drawing was never in doubt.
 */

const sticker = (id, values, extra = {}) => ({
  id, name: 'Month calendar', elementId: 'el-cal',
  calendar: { layout: 'grid', accent: '#D8342B' },
  calendarValues: values,
  ...extra,
});

describe('calendarsIn — which calendars are on this cake', () => {
  it('finds only the stickers that carry a calendar', () => {
    const design = { stickers: [
      sticker(1, { year: 2026, month: 12, day: 25 }),
      { id: 2, name: 'Lion', imageUrl: 'lion.png' },          // an ordinary decal
      { id: 3, name: 'Frame', photoMask: 'm.png' },            // a photo frame
    ] };
    const out = calendarsIn(design);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('1');
  });

  /* ⚠️ THE BUG THIS MODULE EXISTS FOR. Two calendars on one cake are usually two different dates —
   * a birthday and an anniversary. Keying on `elementId` (which XrayDecorationSteps' elementRows
   * still does) collapses them to one row and prints one of the two dates twice. */
  it('keeps BOTH placements of the same element, with their own dates', () => {
    const design = { stickers: [
      sticker(1, { year: 2026, month: 12, day: 25 }),
      sticker(2, { year: 2027, month: 3, day: 14 }),
    ] };
    const out = calendarsIn(design);
    expect(out).toHaveLength(2);
    expect(out.map(c => c.date)).toEqual([
      { year: 2026, month: 12, day: 25 },
      { year: 2027, month: 3, day: 14 },
    ]);
    expect(new Set(out.map(c => c.id)).size).toBe(2);
  });

  it('reads decorations as well as stickers', () => {
    const out = calendarsIn({ stickers: [], decorations: [sticker(9, { year: 2026, month: 5, day: 1 })] });
    expect(out).toHaveLength(1);
    expect(out[0].date.month).toBe(5);
  });

  it('merges the authored recipe over the defaults, so a partial config still draws', () => {
    const out = calendarsIn({ stickers: [sticker(1, { year: 2026, month: 1, day: 1 })] });
    expect(out[0].cfg.layout).toBe('grid');          // authored
    expect(out[0].cfg.accent).toBe('#D8342B');       // authored
    expect(out[0].cfg.ringStyle).toBeDefined();      // from CALENDAR_DEFAULTS
    expect(out[0].cfg.rect).toBeDefined();
  });

  it('clamps a day the month does not have rather than printing a date that is not one', () => {
    // 31 February is not a date. The sheet must still draw something real.
    const out = calendarsIn({ stickers: [sticker(1, { year: 2026, month: 2, day: 31 })] });
    expect(out[0].date).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it('survives a calendar whose values were never set', () => {
    const out = calendarsIn({ stickers: [sticker(1, undefined)] });
    expect(out[0].date.year).toBeGreaterThan(2000);   // resolveDate falls back to today
    expect(out[0].date.month).toBeGreaterThanOrEqual(1);
    expect(out[0].date.day).toBeGreaterThanOrEqual(1);
  });

  it('names an unnamed calendar rather than printing a blank card', () => {
    const out = calendarsIn({ stickers: [sticker(1, { year: 2026, month: 5, day: 1 }, { name: '' })] });
    expect(out[0].name).toBe('Calendar');
  });

  it('answers an empty list for a design with none, and for no design at all', () => {
    expect(calendarsIn({ stickers: [{ id: 1, name: 'Lion' }] })).toEqual([]);
    expect(calendarsIn({})).toEqual([]);
    expect(calendarsIn(null)).toEqual([]);
  });
});

describe('calendarSources — the sheet item', () => {
  it('refuses a calendar with nothing to draw instead of returning a blank card', () => {
    expect(calendarSources(null)).toEqual([]);
    expect(calendarSources({ id: '1', cfg: null, date: null })).toEqual([]);
  });

  it('prefixes its id, so a saved sheet can tell a calendar from an upload', () => {
    // The id is built before any drawing happens, so this much is safe without a canvas.
    expect(CALENDAR_PREFIX).toBe('calendar:');
  });
});
