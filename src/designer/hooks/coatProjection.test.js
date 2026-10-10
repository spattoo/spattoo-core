import { describe, it, expect } from 'vitest';
import { toCanvasConfig } from './useCakeDesign.js';

/* Sandeep: "cover entire cake is not working. when i click on that on the element card - nothing
 * happens." It set the state, passed every gate and rendered nothing, because toCanvasConfig
 * rebuilds each tier from an explicit allow-list and `coat` was not on it. No crash, no warning —
 * the field simply was not in the object the renderer received. */
describe('toCanvasConfig carries a tier coat', () => {
  const design = { tiers: [{ radius: 1.2, height: 1.45,
    coat: { id: 'e1', glbUrl: 'x.glb', colors: ['#fff'], size: 0.26 } }] };

  it('passes the coat through to the canvas', () => {
    expect(toCanvasConfig(design).tiers[0].coat).toEqual(design.tiers[0].coat);
  });

  it('is null when there is none, never undefined', () => {
    expect(toCanvasConfig({ tiers: [{ radius: 1.2, height: 1.45 }] }).tiers[0].coat).toBeNull();
  });
});
