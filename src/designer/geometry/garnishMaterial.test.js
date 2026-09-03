import { describe, it, expect } from 'vitest';
import { materialBase, garnishMaterialProps } from './garnishMaterial.js';

const rgb = css => (css.match(/\d+/g) ?? []).map(Number);

// ── Handing the renderer a base that lands on the chosen colour ──────────────────────────────────
//
// ⚠️ THE CORRECTION GOES IN THE MATERIAL, NOT THE SWATCH. Washing the studio out until it matched a
// bad render made the two agree about a colour nobody asked for. The renderer is what is wrong.
//
// ⚠️ AND IT IS NOT FINISHED. Measured on the real cake, a compensated teal still arrives too light in
// the red channel — something is adding white that is neither the environment nor the clearcoat, both
// of which were tested and ruled out. These tests pin what IS known, so the remainder cannot be
// quietly re-broken while it is chased.
describe('the base handed to the material', () => {
  it('is darker than the colour asked for, because the scene over-lights it', () => {
    for (const c of ['#4EC5B0', '#C4626B', '#4A2C1B']) {
      const [r, g, b] = rgb(materialBase(c));
      const want = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
      expect(r + g + b).toBeLessThan(want[0] + want[1] + want[2]);
    }
  });

  it('keeps the hue — a teal must not become a mint on the way in', () => {
    const hue = ([r, g, b]) => Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b);
    const src = [0x4E, 0xC5, 0xB0];
    expect(Math.abs(hue(rgb(materialBase('#4EC5B0'))) - hue(src))).toBeLessThan(0.3);
  });

  it('reads either colour form, since these values are passed between functions', () => {
    expect(rgb(materialBase('rgb(78, 197, 176)'))).toEqual(rgb(materialBase('#4EC5B0')));
  });

  it('clamps at black rather than asking for a negative colour', () => {
    expect(rgb(materialBase('#000000'))).toEqual([0, 0, 0]);
  });

  it('leaves a colour it cannot read alone rather than guessing', () => {
    expect(materialBase('rgba(1,2,3,0.5)')).toBe('rgba(1,2,3,0.5)');
    expect(materialBase(null)).toBeTruthy();
  });

  it('moves the lacquer with Shine, in the direction the material does', () => {
    expect(garnishMaterialProps({ gloss: 1 }).clearcoat)
      .toBeGreaterThan(garnishMaterialProps({ gloss: 0 }).clearcoat);
  });
});
