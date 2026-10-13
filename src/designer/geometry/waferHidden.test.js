import { describe, it, expect } from 'vitest';
import { WAFER_PRESETS, WAFER_HIDDEN, waferPresetsOffered } from './waferPaper.js';

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
