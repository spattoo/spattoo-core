import { describe, it, expect } from 'vitest';
import { RAINBOW_ARRANGEMENTS, arrangementOf, iconTiers, arrangementShape } from './RainbowArrangements.jsx';
import { RAINBOW_DEFAULTS } from '../geometry/rainbow.js';

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


  it('offers them in the order a customer reads them', () => {
    // Plainest first, flourishes last. The order IS the menu, and it is the one thing about this
    // list a test can hold that reading the array cannot: a tile added later lands wherever the
    // person adding it happened to type it.
    expect(RAINBOW_ARRANGEMENTS.map(a => a.key)).toEqual([
      'on-top', 'wall', 'fall-left', 'fall-right', 'curled', 'wall-curled',
    ]);
  });

  it('keeps the two curled ones at the end', () => {
    const keys = RAINBOW_ARRANGEMENTS.map(a => a.key);
    const curled = keys.filter(k => k.includes('curled'));
    expect(keys.slice(-curled.length)).toEqual(curled);
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

  // ── What a NEWLY ADDED rainbow is ──────────────────────────────────────────────────────────────
  // RAINBOW_DEFAULTS reads like a neutral base and is not one: its feet and its offsetX are the
  // FALLING RIGHT shape. So a catalogue row that authors part of a shape inherits the rest from a
  // different shape, and the customer gets an arrangement no tile can draw.
  //
  // The shipped Rainbow row is exactly that case — both feet 'top', no offsetX — and it arrived as
  // an on-top arch carrying a falling rainbow's 0.71 lean. It looked centred only because addRainbow
  // then shoved it back by -0.71 to hide a lean it should never have had, and none of the sliders
  // could reach the shape because the shape was not one of the six.
  describe('a new rainbow is always one of the tiles', () => {
    // What CakeDesigner.addRainbow builds. Same order, so a change there fails here.
    const seed = tuned => ({ ...RAINBOW_DEFAULTS, ...arrangementShape(RAINBOW_ARRANGEMENTS[0]), ...tuned });

    it('lands on the first tile when the row says nothing', () => {
      expect(arrangementOf(seed({}))?.key).toBe(RAINBOW_ARRANGEMENTS[0].key);
    });

    it('lands on the first tile for the SHIPPED row, which under-specifies', () => {
      // Copied from the row's placement_config.rainbow as exported 2026-08-26: it sets the feet and
      // the look and is silent about offsetX, which is the whole bug.
      const shipped = { bands: 6, scale: 0.75, spring: 1, flatten: 0,
                        footLeft: 'top', footRight: 'top', thickness: 0.115, innerRadius: 0.3,
                        colors: ['#F5A3B8', '#F7C59F', '#F7E7A0', '#A8D5A2', '#A3C7E8', '#C9AEDD'] };
      expect(seed(shipped).offsetX).toBe(0);              // was 0.71, inherited from falling-right
      expect(arrangementOf(seed(shipped)).key).toBe('on-top');
      // The old merge is what shipped, and it is the thing this test exists to keep out.
      expect({ ...RAINBOW_DEFAULTS, ...shipped }.offsetX).toBe(0.71);
    });

    it('still lets a row author a different arrangement outright', () => {
      // The tile fills what the row leaves unsaid; it must not overrule what the row says. An admin
      // who authors a wall rainbow has to get one, or authoring is decoration.
      const wall = RAINBOW_ARRANGEMENTS.find(a => a.key === 'wall');
      expect(arrangementOf(seed(arrangementShape(wall))).key).toBe('wall');
    });

    it('keeps the row\'s LOOK, which the tiles say nothing about', () => {
      const look = { colors: ['#000000'], bands: 3, thickness: 0.2, innerRadius: 0.5 };
      const got = seed(look);
      for (const [k, v] of Object.entries(look)) expect(got[k]).toEqual(v);
    });
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
