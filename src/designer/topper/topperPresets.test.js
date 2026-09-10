import { describe, it, expect } from 'vitest';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import helvetikerBold from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { TOPPER_PRESETS, presetPaths } from './topperPresets.js';
import { topperShapes } from '../geometry/topperShape.js';

const font = new FontLoader().parse(helvetikerBold);

/* The studio's orthographic camera shows roughly 2.7 x 2.5 of the composer's units. A preset has to
 * arrive INSIDE that — the whole point of one is to show what a topper looks like, and one that hangs
 * off all four edges shows a colour. */
const STAGE_W = 2.7, STAGE_H = 2.5;

describe('topper presets', () => {
  it('has some', () => {
    expect(TOPPER_PRESETS.length).toBeGreaterThan(2);
  });

  /* ⚠️ THIS TEST EXISTS BECAUSE REASONING ABOUT IT FAILED. A shape's `size` is the box its plate is
   * fitted AROUND, not the plate's width, so a heart at size 2.0 came out 4.2 across and filled the
   * studio. Nothing threw; it just looked wrong, and only in a browser. */
  it.each(TOPPER_PRESETS.map(p => [p.key, p]))('%s fits on the stage', (_key, preset) => {
    const box = presetPaths(preset.objects, font);
    expect(box).not.toBeNull();
    expect(box.width).toBeLessThan(STAGE_W);
    expect(box.height).toBeLessThan(STAGE_H);
  });

  /* And is not a speck in the middle of it — a preset that arrives tiny is as useless as one that
   * overflows, and "Happy Birthday" was 0.79 wide before it was measured. */
  it.each(TOPPER_PRESETS.map(p => [p.key, p]))('%s is big enough to read', (_key, preset) => {
    const box = presetPaths(preset.objects, font);
    expect(Math.max(box.width, box.height)).toBeGreaterThan(STAGE_W * 0.4);
  });

  /* ⚠️ A MULTI-LINE PRESET MUST HAVE MATCHING LETTER HEIGHTS. `size` is the word's WIDTH, so two
   * lines given the same size come out at different letter sizes — "Happy" was visibly bigger than
   * "Birthday", which reads as a mistake rather than a style. The cut height is size / width-at-1. */
  it('draws every line of a multi-line preset at the same letter height', () => {
    for (const p of TOPPER_PRESETS) {
      const words = p.objects.filter(o => o.kind === 'text');
      if (words.length < 2) continue;
      const heights = words.map(o => {
        const probe = topperShapes(font, o.text, { height: 1 });
        return o.size / probe.width;
      });
      for (const h of heights) expect(h).toBeCloseTo(heights[0], 2);
    }
  });

  it('mints no ids — the studio does that, so picking one twice cannot collide', () => {
    for (const p of TOPPER_PRESETS) {
      for (const o of p.objects) expect(o.id).toBeUndefined();
    }
  });

  it('uses only the block face, so a preset draws the instant the studio opens', () => {
    for (const p of TOPPER_PRESETS) {
      for (const o of p.objects) {
        if (o.kind === 'text') expect(o.face).toBe('__block');
      }
    }
  });
});
