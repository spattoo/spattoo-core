import { describe, it, expect } from 'vitest';
import { RAINBOW_ARRANGEMENTS, arrangementOf, iconTiers } from './RainbowArrangements.jsx';

// ── The tiles a customer picks a rainbow from ───────────────────────────────────────────────────
// Untested until a SECOND wall tile existed, at which point the matcher's shortcut — "on the wall,
// the surface names the tile" — quietly stopped being true and would have highlighted the plain one
// for both. The studio held its own copy of that same rule, so the two would have disagreed.
//
// This is the list the customer's edit card and the admin studio BOTH read, so a wrong answer here
// is wrong in two places at once.
describe('rainbow arrangements', () => {
  it('gives every tile a distinct key and a label', () => {
    const keys = RAINBOW_ARRANGEMENTS.map(a => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of RAINBOW_ARRANGEMENTS) expect(a.label?.length).toBeGreaterThan(0);
  });

  it('identifies each tile from its own parameters', () => {
    // The round trip that matters: pick a tile, and the chooser must show THAT tile as chosen. Two
    // tiles that answer to the same shape mean one of them can never look selected.
    for (const a of RAINBOW_ARRANGEMENTS) {
      expect(arrangementOf({ surface: a.surface, ...a.params })?.key, a.key).toBe(a.key);
    }
  });

  it('tells the two WALL tiles apart by whether the ends curl', () => {
    const plain  = { surface: 'side', footLeft: 'board', footRight: 'board' };
    const curled = { surface: 'side', footLeft: 'board', footRight: 'curl' };
    expect(arrangementOf(plain).key).toBe('wall');
    expect(arrangementOf(curled).key).toBe('wall-curled');
  });

  it('still matches a wall rainbow with no feet at all', () => {
    // Why the feet are otherwise ignored on the wall: one of the shipped wall shapes floats partway
    // up with no feet, and a matcher that demanded they agree would leave the chooser blank.
    expect(arrangementOf({ surface: 'side', footLeft: 'none', footRight: 'none' })?.key).toBe('wall');
  });

  it('does not confuse a curled TOP rainbow with a curled wall one', () => {
    expect(arrangementOf({ surface: 'top', footLeft: 'top', footRight: 'curl' }).key).toBe('curled');
  });

  it('draws an icon for every tile, at every tier count', () => {
    // `draw` is hand-written per tile and runs inside an SVG — one that throws takes the whole
    // chooser down, not just its own tile.
    for (const tiers of [1, 2, 3]) {
      const boxes = iconTiers(tiers);
      for (const a of RAINBOW_ARRANGEMENTS) {
        for (let i = 0; i < tiers; i++) {
          const el = a.draw(boxes[i], i === 0 ? 41 : boxes[i - 1].top);
          expect(el?.props?.d, `${a.key} @ ${tiers} tiers, tier ${i}`).toMatch(/^M[\d.\-]/);
          expect(el.props.d).not.toMatch(/NaN|Infinity|undefined/);
        }
      }
    }
  });
});
