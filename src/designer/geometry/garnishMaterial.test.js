import { describe, it, expect } from 'vitest';
import { garnishMaterialProps } from './garnishMaterial.js';

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

  it('hands the renderer the colour that was chosen, unaltered', () => {
    expect(garnishMaterialProps({ color: '#4EC5B0' }).color).toBe('#4EC5B0');
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
