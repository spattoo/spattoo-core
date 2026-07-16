import { describe, it, expect } from 'vitest';
import { buildDesignSnapshot } from './designSnapshot.js';
import { toCanvasConfig, normalizeDesign } from '../hooks/useCakeDesign.js';

// A glaze cake must survive being SAVED (order snapshot / template) and reloaded, and reach the renderer
// config — else a saved glaze design (and its thumbnail) would come back as a plain cake. Pins the
// tier.glaze round-trip through the three seams: snapshot build, load-normalise, and canvas config.
describe('glaze survives the snapshot round-trip and reaches the renderer', () => {
  const glaze = { colors: ['#2a1810', '#8a5a30', '#efd9b8'], flow: 2.6, warp: 1.1, contrast: 3.2, streak: 0.12, drip: 0.18 };
  const design = {
    tiers: [{ shape: 'round', color: '#ffffff', frostingType: 'glaze', glaze, topPipings: [], bottomPipings: [], creamLayers: [] }],
    texts: [], ages: [], stickers: [], writing: null, piping: [],
  };

  it('buildDesignSnapshot preserves tier.glaze', () => {
    expect(buildDesignSnapshot(design).tiers[0].glaze).toEqual(glaze);
  });

  it('normalizeDesign restores tier.glaze on load', () => {
    const loaded = normalizeDesign(buildDesignSnapshot(design));
    expect(loaded.tiers[0].glaze).toEqual(glaze);
    expect(loaded.tiers[0].frostingType).toBe('glaze');
  });

  it('toCanvasConfig forwards glaze to the renderer (CakeTier reads it here)', () => {
    const cfg = toCanvasConfig(design);
    expect(cfg.tiers[0].glaze).toEqual(glaze);
    expect(cfg.tiers[0].frostingType).toBe('glaze');
  });

  it('a design with no glaze keeps glaze absent (no accidental default in the snapshot)', () => {
    const plain = { tiers: [{ shape: 'round', color: '#fff', frostingType: 'buttercream', topPipings: [], bottomPipings: [], creamLayers: [] }], texts: [], ages: [], stickers: [] };
    expect(buildDesignSnapshot(plain).tiers[0].glaze).toBeUndefined();
  });
});
