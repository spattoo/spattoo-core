import { describe, it, expect } from 'vitest';
import { layoutDiagram } from './xrayProject.js';

// Leader lines land two ways: a DESIGNED order projects a 3D anchor through the designer's exact
// camera, a PHOTO order uses the box the model reported. Same output, so nothing downstream knows
// which kind of order it is drawing — but the failure modes are not symmetric, and this is where
// that asymmetry is enforced.
describe('layoutDiagram — photo anchors', () => {
  const photo = (key, bbox) => ({ key, tierIndex: 0, zone: 'Rim', bbox });
  const projected = (key) => ({ key, tierIndex: 0, zone: 'Base' });

  it('anchors a photo item on the centre of its box', () => {
    const [a] = layoutDiagram([photo('a', [0.2, 0.6, 0.6, 0.1])], []);
    expect(a.ay).toBeCloseTo(0.65, 3);
  });

  it('draws photo items with no tier geometry at all', () => {
    // A photo order has no design_snapshot.tiers — that is exactly why projection cannot be used.
    expect(layoutDiagram([photo('a', [0, 0, 1, 1])], [])).toHaveLength(1);
  });

  it('DROPS an unanchored item rather than projecting it without tiers', () => {
    // The failure this prevents: a confident leader line onto a real photograph, pointing at the
    // wrong part of someone's cake. Worse than no line — the rest of the sheet is honest about
    // being an estimate, and this would quietly contradict it.
    const out = layoutDiagram([photo('a', [0.2, 0.6, 0.6, 0.1]), projected('b')], []);
    expect(out.map(o => o.key)).toEqual(['a']);
  });

  it('returns nothing when a photo order has no boxes at all', () => {
    expect(layoutDiagram([projected('b')], [])).toEqual([]);
  });

  it('still projects normally when tier geometry IS present', () => {
    // The designed-order path must be untouched by any of the above.
    expect(layoutDiagram([projected('b')], [{ radius: 0.5, height: 1 }])).toHaveLength(1);
  });
});
