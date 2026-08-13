import { describe, it, expect } from 'vitest';
import { FROSTINGS, applyMaterialConfig } from './frostings.js';
import { GLAZE_DEFAULTS } from './shared/glaze/glazeMaterial.js';

// The DB overlay (materials.config) retunes a finish's NUMBERS without a release — the shader recipe stays
// code, the params come from the row (INVARIANTS §1a). These pin that seed+overlay contract.
describe('applyMaterialConfig — DB overlay of material physics + glaze defaults', () => {
  it('overlays material scalar knobs onto the seed; a partial override keeps the rest', () => {
    const seedSheen = FROSTINGS.buttercream.material.sheen;
    applyMaterialConfig([{ key: 'buttercream', config: { material: { roughness: 0.42 } } }]);
    expect(FROSTINGS.buttercream.material.roughness).toBe(0.42);
    expect(FROSTINGS.buttercream.material.sheen).toBe(seedSheen);   // untouched keys keep the seed
  });

  it('overlays the glaze palette + pattern defaults onto GLAZE_DEFAULTS', () => {
    applyMaterialConfig([{ key: 'glaze', config: { glaze: { colors: ['#abcdef', '#123456'], flow: 4.2 } } }]);
    expect(GLAZE_DEFAULTS.colors).toEqual(['#abcdef', '#123456']);
    expect(GLAZE_DEFAULTS.flow).toBe(4.2);
    expect(GLAZE_DEFAULTS.contrast).toBe(3.2);                      // unspecified pattern params keep the seed
  });

  it('a row without config.material keeps the seed material, and an unknown key is ignored', () => {
    const before = { ...FROSTINGS.fondant.material };
    applyMaterialConfig([{ key: 'fondant', config: { styles: [] } }, { key: 'nope', config: { material: { roughness: 9 } } }]);
    expect(FROSTINGS.fondant.material).toEqual(before);
    expect(FROSTINGS.nope).toBeUndefined();
  });

  it('the label + style list still overlay (unchanged behaviour)', () => {
    applyMaterialConfig([{ key: 'whipped', label: 'Cloud', config: { styles: ['wave'] } }]);
    expect(FROSTINGS.whipped.label).toBe('Cloud');
    expect(FROSTINGS.whipped.styles).toEqual(['wave']);
  });
});
