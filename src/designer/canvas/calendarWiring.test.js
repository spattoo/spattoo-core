import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── The prop chain, pinned — because the suite it joins would have shipped a bug ────────────────
 *
 * The shape control was driven end to end and reported FIVE passes: the design's `calendarLayout`
 * flipped to 'round', `sheetShape` followed, the scale re-fitted from 6.061 to 8.782 — every number
 * exactly as predicted. The cake went on drawing a GRID, now oversized, because the scale had
 * followed the switch and the drawing had not.
 *
 * Every one of those assertions read `__getStickers()`. Not one could see the renderer, so not one
 * could fail. The fault was a prop that was never threaded: `useCalendarTexture(calendar, values)`
 * composed `{...CALENDAR_DEFAULTS, ...calendar}`, and a recipe offering `layouts` carries no
 * singular `layout`, so it silently resolved to the default.
 *
 * Source-text, like stickerColour and garnishColour: a scope error or an unthreaded prop is valid
 * JavaScript that survives the build and every gate, and shows only when something renders.
 */
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const canvas = read('./CakeCanvas.jsx');
const hook   = read('./useCalendarTexture.js');

const bodyOf = (src, name) => {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `${name} should be a top-level function`).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('\n}\n', start));
};

describe('the chosen shape reaches the cake', () => {
  it('both StickerFace call sites pass the instance\'s layout', () => {
    // Two: the side wall and the top surface. A calendar is top-only today, but a prop threaded to
    // one call site and not the other is how the next zone quietly gets the default.
    const passes = canvas.match(/calendarLayout=\{sticker\.calendarLayout\}/g) ?? [];
    expect(passes).toHaveLength(2);
  });

  it('StickerFace accepts it and hands it to CalendarFace', () => {
    expect(canvas).toMatch(/function StickerFace\([^)]*calendarLayout/s);
    expect(bodyOf(canvas, 'StickerFace')).toMatch(/<CalendarFace[\s\S]*?calendarLayout=\{calendarLayout\}/);
  });

  it('CalendarFace hands it to the texture hook', () => {
    const body = bodyOf(canvas, 'CalendarFace');
    expect(body).toMatch(/useCalendarTexture\(\s*calendar,\s*calendarValues,\s*calendarLayout\s*\)/);
  });

  /* ⚠️ THE DECISION HAS ONE HOME. `resolveCalendarCfg` validates the choice against what the recipe
   * offers; spreading the recipe by hand is what lost the shape the first time. */
  it('the hook resolves the shape rather than spreading the recipe', () => {
    expect(hook).toMatch(/resolveCalendarCfg\(calendar,\s*layout\)/);
    /* ⚠️ SCOPED TO CODE, NOT THE WHOLE FILE — this assertion failed on its own first run because the
     * comment above the fix QUOTES the old expression while explaining it. A grep that cannot tell
     * code from prose is the same mistake as one that matched "PENDING" in a Razorpay sentence. */
    const code = hook.split('\n').filter(l => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
    expect(code).not.toMatch(/\{\s*\.\.\.CALENDAR_DEFAULTS,\s*\.\.\.calendar\s*\}/);
  });

  it('a shape change actually re-derives the texture', () => {
    // Without `layout` in the memo deps the canvas is cached and the cake never redraws — the same
    // bug wearing a different hat.
    expect(hook).toMatch(/\}, \[cfgKey, layout, year, month, day\]\);/);
  });
});
