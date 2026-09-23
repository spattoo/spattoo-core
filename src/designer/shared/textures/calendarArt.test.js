import { describe, it, expect } from 'vitest';
import {
  calendarLayout, daysInMonth, firstWeekday, resolveDate,
  CALENDAR_DEFAULTS, DAY_INITIALS,
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
