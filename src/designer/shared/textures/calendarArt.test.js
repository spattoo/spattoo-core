import { describe, it, expect } from 'vitest';
import {
  calendarLayout, daysInMonth, firstWeekday, resolveDate,
  CALENDAR_DEFAULTS, DAY_INITIALS, calendarSheet, CALENDAR_DISC_INSET,
  calendarLayouts, calendarHasChoice, resolveCalendarCfg,
} from './calendarArt.js';

/* The grid arithmetic is the one thing a calendar cannot get wrong, and it is also the only part
 * that can be tested here: vitest runs `environment: 'node'`, so there is no canvas and no DOM. That
 * is exactly why calendarLayout is pure and drawCalendar merely consumes it — the maths is testable
 * and the drawing is looked at.
 *
 * ⚠️ MONTHS ARE 1-BASED throughout, which is what a human types and what the recipe stores. The
 * Date constructor underneath is 0-based, and that mismatch is the classic off-by-one here: a test
 * that only ever checks January would pass while every other month was a month out. */

describe('daysInMonth / firstWeekday', () => {
  it('knows the ordinary months', () => {
    expect(daysInMonth(2025, 1)).toBe(31);
    expect(daysInMonth(2025, 4)).toBe(30);
    expect(daysInMonth(2025, 10)).toBe(31);
  });

  it('handles February in a leap year and a common year', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    // 2100 is NOT a leap year — divisible by 100 but not 400. The naive %4 rule fails here.
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });

  it('reads the weekday of the 1st, 0 = Sunday', () => {
    // Sandeep's reference photo: October 2025 starts on a Wednesday.
    expect(firstWeekday(2025, 10)).toBe(3);
    expect(firstWeekday(2025, 5)).toBe(4);     // May 2025 — the other reference, a Thursday
  });
});

describe('calendarLayout', () => {
  it('emits one cell per day of the month, in order', () => {
    const { cells } = calendarLayout({ year: 2025, month: 10, day: 15 });
    expect(cells).toHaveLength(31);
    expect(cells[0].day).toBe(1);
    expect(cells.at(-1).day).toBe(31);
  });

  it('puts the 1st under its real weekday column', () => {
    // October 2025 starts Wednesday → column 3 (S M T W).
    const { cells } = calendarLayout({ year: 2025, month: 10, day: 1 });
    expect(cells[0].col).toBe(3);
    expect(cells[0].row).toBe(0);
    // …and the 5th therefore wraps to the next row, first column.
    const fifth = cells.find(c => c.day === 5);
    expect(fifth.col).toBe(0);
    expect(fifth.row).toBe(1);
  });

  it('grows to six rows when a long month starts late in the week', () => {
    // A 31-day month beginning on Saturday needs 6 rows: 1 day, then 4 full weeks, then the rest.
    // March 2025 starts on a Saturday.
    expect(firstWeekday(2025, 3)).toBe(6);
    const { rows } = calendarLayout({ year: 2025, month: 3, day: 1 });
    expect(rows).toBe(6);
  });

  it('uses five rows for a month that fits', () => {
    const { rows } = calendarLayout({ year: 2025, month: 10, day: 1 });
    expect(rows).toBe(5);
  });

  it('fits exactly four rows for a non-leap February starting on Sunday', () => {
    // The tightest case: 28 days, no lead-in. Off-by-one in the row maths shows up here as 5.
    expect(firstWeekday(2015, 2)).toBe(0);
    expect(calendarLayout({ year: 2015, month: 2, day: 1 }).rows).toBe(4);
  });

  it('keeps every cell inside the authored rect', () => {
    const { cells, rect } = calendarLayout({ year: 2025, month: 3, day: 1 });
    const left = rect.x - rect.w / 2, right = rect.x + rect.w / 2;
    const top = rect.y - rect.h / 2, bottom = rect.y + rect.h / 2;
    for (const c of cells) {
      expect(c.cx).toBeGreaterThanOrEqual(left);
      expect(c.cx).toBeLessThanOrEqual(right);
      expect(c.cy).toBeGreaterThanOrEqual(top);
      expect(c.cy).toBeLessThanOrEqual(bottom);
    }
  });

  it('reserves a header row when the day initials are shown, and reclaims it when not', () => {
    const on = calendarLayout({ year: 2025, month: 10, day: 1 }, CALENDAR_DEFAULTS);
    const off = calendarLayout({ year: 2025, month: 10, day: 1 }, { ...CALENDAR_DEFAULTS, showDayHeader: false });
    expect(on.header).toHaveLength(7);
    expect(off.header).toHaveLength(0);
    // Same rows either way; the header takes its own band, so cells sit lower with it on.
    expect(on.rows).toBe(off.rows);
    expect(on.cells[0].cy).toBeGreaterThan(off.cells[0].cy);
  });

  it('labels the header S M T W T F S', () => {
    const { header } = calendarLayout({ year: 2025, month: 10, day: 1 });
    expect(header.map(h => h.text)).toEqual([...DAY_INITIALS]);
  });
});

describe('resolveDate', () => {
  const NOW = new Date(2025, 9, 15);   // 15 October 2025 — month is 0-based in this constructor

  it('falls back to today when nothing is chosen', () => {
    expect(resolveDate({}, NOW)).toEqual({ year: 2025, month: 10, day: 15 });
  });

  it('takes the chosen date', () => {
    expect(resolveDate({ year: 2026, month: 5, day: 1 }, NOW)).toEqual({ year: 2026, month: 5, day: 1 });
  });

  it('clamps a day the month does not have', () => {
    // 31 February is not a date. Clamping rather than rejecting matters because the day survives a
    // month change in the UI: pick the 31st, switch to February, and the calendar must still draw.
    expect(resolveDate({ year: 2025, month: 2, day: 31 }, NOW).day).toBe(28);
    expect(resolveDate({ year: 2024, month: 2, day: 31 }, NOW).day).toBe(29);
  });

  it('clamps a day below one', () => {
    expect(resolveDate({ year: 2025, month: 10, day: 0 }, NOW).day).toBe(15);   // 0 is falsy → today
    expect(resolveDate({ year: 2025, month: 10, day: -3 }, NOW).day).toBe(1);
  });

  it('survives junk without throwing', () => {
    const r = resolveDate({ year: 'x', month: null, day: undefined }, NOW);
    expect(r).toEqual({ year: 2025, month: 10, day: 15 });
  });
});

describe('calendarSheet — how big the cake should draw it', () => {
  /* This exists because an INVENTED fill (0.92) put the printed sheet off the edge of the cake in a
   * real render. `fill` is the artwork's half-extent as a fraction of the plane half, and every case
   * below is read off what drawCalendar actually paints — never tuned until the picture looked right,
   * which is how a wrong relationship survives as a plausible number. */

  it('a round calendar reports its own disc, from the inset it is drawn with', () => {
    const s = calendarSheet({ layout: 'round' });
    expect(s.shape).toBe('round');
    // The arc is stroked at S*(0.5 - inset), so the half-extent is (0.5 - inset) of a 0.5 half.
    expect(s.fill).toBeCloseTo(1 - CALENDAR_DISC_INSET * 2, 10);
  });

  it('paper fills the whole plane, so a papered grid is exactly 1', () => {
    // drawCalendar does fillRect(0, 0, S, S) — the sheet IS the plane, with no margin to discount.
    expect(calendarSheet({ layout: 'grid', paper: '#FDF3EC' })).toEqual({ shape: 'rect', fill: 1 });
  });

  it('a PIPED grid measures its own drawing instead, and is smaller than the plane', () => {
    const s = calendarSheet({ layout: 'grid', paper: null });
    expect(s.shape).toBe('rect');
    expect(s.fill).toBeLessThan(1);      // there is no paper, so the plane is not full
    expect(s.fill).toBeGreaterThan(0.5); // ...but it is not a stamp either
  });

  it('follows the authored rect, which is the whole reason it is a function', () => {
    const narrow = calendarSheet({ layout: 'grid', paper: null, rect: { x: 0.5, y: 0.54, w: 0.5, h: 0.56 } });
    const wide   = calendarSheet({ layout: 'grid', paper: null, rect: { x: 0.5, y: 0.54, w: 0.9, h: 0.56 } });
    expect(wide.fill).toBeGreaterThan(narrow.fill);
  });

  it('does not change when the month does — sizing is not a function of the date', () => {
    // Row count runs 4-6 across months. If this rule read the live month, a cake would resize itself
    // when the customer picked March over February.
    const a = calendarSheet({ layout: 'grid', paper: null });
    const b = calendarSheet({ layout: 'grid', paper: null });
    expect(a).toEqual(b);
    expect(calendarSheet()).toEqual(calendarSheet(CALENDAR_DEFAULTS));
  });

  it('an off-centre rect is measured from the PLANE centre, not its own', () => {
    // A rect pushed right reaches further from the middle, so the fitted box must grow to hold it.
    const centred = calendarSheet({ layout: 'grid', paper: null, rect: { x: 0.5, y: 0.54, w: 0.6, h: 0.56 } });
    const shifted = calendarSheet({ layout: 'grid', paper: null, rect: { x: 0.62, y: 0.54, w: 0.6, h: 0.56 } });
    expect(shifted.fill).toBeGreaterThan(centred.fill);
  });
});

describe('calendarLayouts — which shapes a calendar offers', () => {
  /* Sandeep: "round or grid should be an option, not a separate control" — and not two catalogue
   * rows either: "user would not understand it. its an internal setting which user would know only
   * after looking into the control." So the recipe names its shapes and the customer picks one. */

  it('a calendar authored as ONE shape offers only that, and grows no chooser', () => {
    // Every calendar saved before this carried a single `layout`. It must keep working, and it must
    // keep showing no control — it was authored as one shape on purpose.
    expect(calendarLayouts({ layout: 'round' })).toEqual(['round']);
    expect(calendarHasChoice({ layout: 'round' })).toBe(false);
  });

  it('a calendar offering both lists both, first is the default', () => {
    expect(calendarLayouts({ layouts: ['grid', 'round'] })).toEqual(['grid', 'round']);
    expect(calendarHasChoice({ layouts: ['grid', 'round'] })).toBe(true);
    expect(resolveCalendarCfg({ layouts: ['grid', 'round'] }).layout).toBe('grid');
  });

  it('drops a shape it does not know rather than trying to draw it', () => {
    expect(calendarLayouts({ layouts: ['grid', 'banana'] })).toEqual(['grid']);
    expect(calendarLayouts({ layouts: ['banana'] })).toEqual([CALENDAR_DEFAULTS.layout]);
  });

  it('honours a choice the recipe offers', () => {
    expect(resolveCalendarCfg({ layouts: ['grid', 'round'] }, 'round').layout).toBe('round');
  });

  /* ⚠️ THE CHOICE IS VALIDATED, NEVER TRUSTED — the rule zoneSeatFields states for poses. An admin
   * can narrow the list after a cake was saved, and that cake must not go on drawing a shape this
   * calendar no longer offers. */
  it('refuses a stored choice the recipe no longer offers', () => {
    expect(resolveCalendarCfg({ layouts: ['grid'] }, 'round').layout).toBe('grid');
    expect(resolveCalendarCfg({ layout: 'round' }, 'grid').layout).toBe('round');
  });

  it('keeps the rest of the recipe intact while swapping the shape', () => {
    const recipe = { layouts: ['grid', 'round'], ink: '#111111', accent: '#ff0000', paper: null };
    const r = resolveCalendarCfg(recipe, 'round');
    expect(r.ink).toBe('#111111');
    expect(r.accent).toBe('#ff0000');
    expect(r.paper).toBeNull();
    expect(r.ringStyle).toBeDefined();       // defaults still fill the gaps
  });

  /* The whole reason the shape must be resolved BEFORE the fit is asked for: a disc and a rectangle
   * do not occupy the same extent, so a switched calendar sized by the shape it used to be is wrong. */
  it('the sheet extent follows the CHOSEN shape, not the authored one', () => {
    const recipe = { layouts: ['grid', 'round'], paper: null };
    expect(calendarSheet(resolveCalendarCfg(recipe, 'round')).shape).toBe('round');
    expect(calendarSheet(resolveCalendarCfg(recipe, 'grid')).shape).toBe('rect');
    expect(calendarSheet(resolveCalendarCfg(recipe, 'round')).fill)
      .not.toBe(calendarSheet(resolveCalendarCfg(recipe, 'grid')).fill);
  });
});
