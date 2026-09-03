import { describe, it, expect } from 'vitest';
import { garnishMaterialProps, garnishAlbedo } from './garnishMaterial.js';

// ── The chocolate a garnish is made of ───────────────────────────────────────────────────────────
//
// ⚠️ THE COLOUR CORRECTION THAT USED TO BE TESTED HERE IS GONE, DELIBERATELY. It pre-distorted the
// colour handed to the renderer so that what came back matched what was chosen — a hand-fitted
// constant, which is the exact failure `DECAL_FINISH_ROADMAP.md` warns about: each round of that bug
// was closed by a constant, and each constant became the next round's bug. Measuring showed the
// residual is not the material's to fix at all (see garnishMaterial.js), so the compensation was
// removed rather than re-tuned. A wrong model with tests around it is worse than no model.
describe('the garnish material', () => {
  /* ⚠️ NOTHING ADDS WHITE. A clearcoat, an environment reflection and a specular are light bouncing
     OFF the surface rather than through the pigment, so they are not multiplied by the colour — they
     land on every channel equally and wreck dark and saturated ones. The same rule a print follows. */
  it('adds no white to the pigment', () => {
    const m = garnishMaterialProps({ color: '#4EC5B0' });
    expect(m.clearcoat).toBe(0);
    expect(m.envMapIntensity).toBe(0);
    expect(m.specularIntensity).toBe(0);
  });

  /* ⚠️ IT DOES NOT HAND OVER THE RAW COLOUR, and that is the fix rather than a bug. The scene lights
     a garnish at 2.40× (measured), so the raw colour comes back far too light — a teal arrived as
     pale mint. The material is given the albedo that RENDERS as the chosen colour. */
  it('hands the renderer an albedo that renders as the colour chosen', () => {
    expect(garnishMaterialProps({ color: '#4EC5B0' }).color).toBe(garnishAlbedo('#4EC5B0'));
    expect(garnishMaterialProps({ color: '#4EC5B0' }).color).not.toBe('#4EC5B0');
  });

  /* Chocolate is glossy where a print is not, and that is served by ROUGHNESS: a smooth surface still
     catches a highlight from the lamps, which is a small bright spot rather than a uniform layer. */
  it('serves shine through roughness, not through reflection', () => {
    expect(garnishMaterialProps({ gloss: 1 }).roughness)
      .toBeLessThan(garnishMaterialProps({ gloss: 0 }).roughness);
    expect(garnishMaterialProps({ gloss: 1 }).clearcoat).toBe(0);
  });

  it('falls back to chocolate when asked for nothing', () => {
    expect(garnishMaterialProps({}).color).toBeTruthy();
  });
});

// ── The albedo handed to the material ────────────────────────────────────────────────────────────
//
// ⚠️ THE LIFT IS A MULTIPLY, AND RENDERING BLACK IS WHAT PROVED IT. Black came back black, and an
// additive white cannot do that — so four earlier attempts, all of which assumed an additive
// specular, were compensating for something that was not happening. Because it is a multiply,
// dividing the albedo by the measured light is exact rather than fitted.
describe('the albedo handed to the material', () => {
  const rgb = css => (css.match(/\d+/g) ?? []).map(Number);

  it('is darker than the colour asked for, since the scene over-lights it', () => {
    for (const c of ['#4EC5B0', '#C4626B', '#4A2C1B']) {
      const [r, g, b] = rgb(garnishAlbedo(c));
      const want = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
      expect(r + g + b).toBeLessThan(want[0] + want[1] + want[2]);
    }
  });

  /* A multiply preserves zero, which is the property that makes this exact where subtracting a white
     would clamp — and it is the same property that identified the bug. */
  it('leaves black alone', () => {
    expect(rgb(garnishAlbedo('#000000'))).toEqual([0, 0, 0]);
  });

  it('keeps the hue — a teal must not become a mint on the way in', () => {
    const hue = ([r, g, b]) => Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b);
    expect(Math.abs(hue(rgb(garnishAlbedo('#4EC5B0'))) - hue([0x4E, 0xC5, 0xB0]))).toBeLessThan(0.2);
  });

  it('reads either colour form, since these values pass between functions', () => {
    expect(rgb(garnishAlbedo('rgb(78, 197, 176)'))).toEqual(rgb(garnishAlbedo('#4EC5B0')));
  });

  it('leaves a colour it cannot read alone rather than guessing', () => {
    expect(garnishAlbedo('rgba(1,2,3,0.5)')).toBe('rgba(1,2,3,0.5)');
  });
});
