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
const card   = read('../CakeDesigner.jsx');

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

describe("the customer's colours reach the calendar, not sticker.color", () => {
  /* A calendar draws from its own recipe — ink, accent, paper — and never reads `sticker.color`.
   * Writing the generic field would be a wheel that visibly does nothing, which is the failure the
   * striped-tier note in CakeDesigner records, and the same shape as the layout prop that was never
   * threaded to the renderer. Pinned here because neither is visible to a state assertion. */

  it('the wheel READS the named colour off the instance recipe', () => {
    expect(card).toMatch(/calendarColorKey && st\?\.calendar/);
    expect(card).toMatch(/cal\[calendarColorKey\]/);
  });

  it('the wheel WRITES back into calendar, not into color', () => {
    expect(card).toMatch(/calendar: \{ \.\.\.stCal\.calendar, \[calendarColorKey\]: c,/);
  });

  /* ⚠️ ONE ROUTE NOW, AND THAT IS THE POINT. The swatch used to reach the card two ways — its own
   * group push AND the merged Size row — so gating only the first left it on screen beside the three
   * working ones, and gating both meant writing the exclusion twice. It is one control with one
   * gate; the calendar exclusion lives in that gate and nowhere else. See stickerColour.test.js,
   * which pins the count. */
  it('the generic whole-element swatch is suppressed for a calendar', () => {
    expect(card).toMatch(/!editGroups\.length && !inst\?\.calendar/);
    const gate = card.slice(card.indexOf('const hasColourControl ='),
                            card.indexOf('if (hasColourControl) colourCtls'));
    expect(gate).toMatch(/!inst\?\.calendar/);
  });

  it("the 'which colour' selection does not outlive its popup", () => {
    // Otherwise a second calendar opens on whichever colour the first one had selected.
    const close = card.slice(card.indexOf('function closeAllPopups'), card.indexOf('function resetEditors'));
    expect(close).toMatch(/setCalendarColorKey\(null\)/);
  });

  it('switching the background off remembers the colour', () => {
    // `paper: null` is a real value; without lastPaper, re-ticking falls back to the authored
    // default and the swatch shows a colour that is not the one that comes back.
    expect(card).toMatch(/lastPaper/);
  });

  /* ⚠️ THE ELEMENT, NOT THE INSTANCE — and this assertion PINNED THE BUG in its first form. It read
   * `/caps\?\.color \? \[/` and passed, because the code did exactly that; what it could not see is
   * that `caps` is the sticker's own allowedActions, seeded at placement and then frozen into the
   * saved snapshot (`buildDesignSnapshot` passes `design.stickers` through wholesale). So an admin
   * ticking "Color changeable" never reached a calendar already on a cake, and never would for any
   * saved order. A test that asserts the mechanism it was written beside certifies whatever that
   * mechanism does. Both directions are pinned here so the instance copy cannot creep back. */
  it("the three colours are gated on the ELEMENT's admin flag, not the frozen instance", () => {
    expect(card).toMatch(/const calColourAllowed = elementById\.get\(inst\?\.elementId\)\?\.allowed_actions\?\.color === true/);
    expect(card).toMatch(/\.\.\.\(calColourAllowed \? \[/);
    expect(card).not.toMatch(/\.\.\.\(caps\?\.color \? \[/);
  });
});
