import { describe, it, expect } from 'vitest';
import { WAFER_PRESETS, WAFER_HIDDEN, waferPresetsOffered, waferPresetFor } from './waferPaper.js';

/* ── Two presets are withheld from customers, not deleted ────────────────────────────────────────
 * Sandeep: *"'pink notched hem' is looking worse. pls remove it… hide 'white broad', its not
 * looking good either… we need to enable them some time in future."* The risk a test can actually
 * cover is the quiet kind: a hidden preset creeping back into what a baker is offered, or the
 * numbers being thrown away so re-enabling means measuring four reference cakes again. */
describe('the wafer presets a baker is offered', () => {
  it('withholds the two that are not good enough yet', () => {
    expect([...WAFER_HIDDEN].sort()).toEqual(['Pink, notched hem', 'White, broad']);
  });

  it('still KEEPS them — hidden is not deleted', () => {
    for (const name of WAFER_HIDDEN) {
      expect(WAFER_PRESETS[name], `${name} must stay in the table`).toBeTruthy();
      expect(WAFER_PRESETS[name].count).toBeGreaterThan(0);
    }
  });

  it('offers the rest, in the table\'s own order', () => {
    expect(waferPresetsOffered().map(([n]) => n))
      .toEqual(['White, waved', 'White, rippled', 'White, on edge']);
  });

  it('names only presets that exist, so a rename cannot silently un-hide one', () => {
    for (const name of WAFER_HIDDEN) expect(Object.keys(WAFER_PRESETS)).toContain(name);
  });

  /* ⚠️ WHAT ARRIVES WHEN WAFER PAPER IS TURNED ON. `waferPresetFor` picks a preset by contrast
   * against the cake, and it used to search the WHOLE table — so on a white cake, where no white
   * preset clears the bar, it landed on the coral one. Once coral was withheld that meant a PINK
   * skirt with no chip active and no way back to it: *"pink option has been moved from the popup
   * but default only pink coming. default should be 'white waved'."* */
  it('never arrives on a preset the baker cannot see selected', () => {
    for (const wall of ['#ffffff', '#F1EEDC', '#f2766d', '#2e2e2e', '#9EC5E8', '#000000']) {
      const got = waferPresetFor(wall);
      const name = Object.keys(WAFER_PRESETS).find(k => WAFER_PRESETS[k].colour === got.colour
        && WAFER_PRESETS[k].count === got.count);
      expect(WAFER_HIDDEN.has(name), `a ${wall} cake arrives on the withheld "${name}"`).toBe(false);
    }
  });

  it('opens on "White, waved" for a white cake, which is the asked-for default', () => {
    const got = waferPresetFor('#ffffff');
    expect(got.colour).toBe(WAFER_PRESETS['White, waved'].colour);
    expect(got.count).toBe(WAFER_PRESETS['White, waved'].count);
  });

  it('falls back to an offered preset when asked for a withheld one by name', () => {
    const got = waferPresetFor('#F1EEDC', 'Pink, notched hem');
    expect(got.colour).not.toBe(WAFER_PRESETS['Pink, notched hem'].colour);
  });

  /* ⚠️ THE REPORTED FAULT, PINNED. *"'white rippled'… does not go till the height of the cake."*
   * The hem is LEVEL — `buildWaferSkirt` jitters the RISE, so the tops are ragged and the bottoms
   * line up — which means `height` alone decides how far down a skirt reaches. At 0.92 it left 8%
   * of the wall bare the whole way round. Anything a customer is offered must reach the board. */
  it('every offered preset reaches the board', () => {
    for (const [name, p] of waferPresetsOffered()) {
      expect(p.height, `${name} leaves ${((1 - p.height) * 100).toFixed(0)}% of the wall bare`)
        .toBeGreaterThanOrEqual(0.95);
    }
  });
});
