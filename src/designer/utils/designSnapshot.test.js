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
    texts: [], ages: [], stickers: [], writings: [], piping: [],
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

// ── Everything on the cake must survive being saved ─────────────────────────────────────────────
// The pinned test above guards ONE field, glaze, because glaze was once dropped. Grass, letter
// blocks, board grass and second-cream layers were dropped in exactly the same way and for exactly
// the same reason: the round-trip is a hand-maintained list of field names, and four element types
// were added to the cake without being added to it. A saved template then came back as a plain cake,
// and — because the thumbnail is captured from the CANVAS, not from the snapshot — its picture still
// showed the grass. The cake in the picture and the cake you got were different cakes.
//
// So this guards the ROUND-TRIP ITSELF rather than any one field: whatever the renderer reads
// (toCanvasConfig) must be identical after design → snapshot → load. A new element type that is not
// added to OPTIONAL_TIER_FIELDS / buildDesignSnapshot / normalizeDesign fails here, at the moment it
// is added, instead of on a customer's cake.
describe('a saved design comes back as the same cake', () => {
  // Every field the renderer reads, set to something recognisable. layerIds are explicit because
  // loading assigns them to piping that has none, and that is a legitimate difference, not a loss.
  const FULL = {
    tiers: [{
      color: '#f3f0ec', radius: 1.2, height: 1.45,
      shape: 'round', shapeFamily: 'circle', shapeConfig: { r: 1 },
      width: 2.4, depth: 2.4, cornerR: 0.1,
      frostingType: 'buttercream', frostingStyle: 'wave', styleParams: { depth: 0.4 },
      gradient: { stops: [{ color: '#fff', at: 0 }] },
      stripes: { palette: ['#F1EEDC', '#ABD76B'], count: 16, weights: [1, 1], softness: 0.18, wobble: 0.3 },
      glaze: { colors: ['#2a1810'], flow: 2 },
      dusting: { splashes: [{ u: 0.2, v: 0.4 }], color: '#d4af37' },
      foil: { flakes: [{ u: 0.1, v: 0.3 }], finish: 'gold' },
      grass: { color: '#4caf3d', height: 0.2, overhang: 0.5, patches: [{ u: 0.1, v: 0.5, r: 0.3 }] },
      creamLayers: [{ id: 'c1', color: '#e0479e', from: 0.1, to: 0.6 }],
      topPipings: [{ layerId: 'p1', glbUrl: 'x.glb', color: '#fff' }],
      bottomPipings: [{ layerId: 'p2', glbUrl: 'y.glb', color: '#eee' }],
    }],
    texts:    [{ id: 't1', content: 'HELLO', theta: 0, y: 0.7, fontSize: 0.2, color: '#e0479e' }],
    ages:     [{ id: 'a1', value: '30', size: 0.95, finish: 'gold' }],
    stickers: [{ id: 's1', elementId: 'e1', imageUrl: 'lion.glb', zone: 'top_surface', tierIndex: 0, x: 0, z: 0, scale: 1 }],
    writings: [{ id: 'w1', text: 'Happy Birthday', font: 'script', surface: 'top', color: '#ffffff' },
               { id: 'w2', text: 'Love, Mum',      font: 'script', surface: 'board', color: '#e0479e' }],
    piping:   [{ id: 'k1', points: [[0, 0], [1, 1]], color: '#fff' }],
    boardGrass: { color: '#3f9c33', height: 0.16, ringWidth: 0.8, patches: [{ u: 0.5, v: 0.9, r: 0.3 }] },
    nameBlocks: { zone: 'board', text: 'CAKE', size: 0.3, blockColor: '#f7f5f2',
                  blocks: [{ char: 'C', u: 0.1, v: 0.9, yaw: 0.6 }] },
  };

  const roundTrip = d => normalizeDesign(buildDesignSnapshot(d));

  it('reaches the renderer with every field intact', () => {
    expect(toCanvasConfig(roundTrip(FULL))).toEqual(toCanvasConfig(FULL));
  });

  // Named individually as well as in the whole-config check above, so a failure says WHICH element
  // type was lost rather than printing two large objects and leaving you to diff them.
  for (const key of ['grass', 'creamLayers', 'dusting', 'foil', 'gradient', 'glaze', 'styleParams']) {
    it(`tier.${key} survives`, () => {
      expect(roundTrip(FULL).tiers[0][key]).toEqual(FULL.tiers[0][key]);
    });
  }

  for (const key of ['boardGrass', 'nameBlocks', 'writings', 'texts', 'ages', 'stickers', 'piping']) {
    it(`design.${key} survives`, () => {
      expect(roundTrip(FULL)[key]).toEqual(FULL[key]);
    });
  }

  // A message became a LIST on 2026-08-22. Every template and order saved before that holds a single
  // nullable `writing` OBJECT, and those are not ours to rewrite — a saved order is a record of what
  // somebody bought. So the promotion is the compatibility guarantee, and it is asserted rather than
  // assumed: drop it and every old cake silently loses its message on load, with nothing to see.
  it('a legacy single `writing` object is promoted to the writings list', () => {
    const legacy = { ...FULL, writing: { text: 'Happy Birthday', font: 'script', surface: 'top', color: '#ffffff' } };
    delete legacy.writings;
    const out = roundTrip(legacy).writings;
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: 'Happy Birthday', surface: 'top', color: '#ffffff' });
    expect(out[0].id).toBeTruthy();          // minted on promotion — the list is addressable by id
  });
});
