import { describe, it, expect } from 'vitest';
import { surfaceRelief, applyTextureConfig, styleDef } from './creamStyles.js';

// surfaceRelief tells the seating how far a cream-wall finish pushes the SIDE out, so placed side
// elements clear it. It must stay config-driven: read `reliefKey` from the style, never branch on name.
describe('surfaceRelief — radial relief is config-driven (reliefKey), scaled by radius', () => {
  it('geometry walls return (their depth param) × radius', () => {
    // wave: reliefKey 'relief', default 0.06 → 0.06 × radius
    expect(surfaceRelief('wave', undefined, 2)).toBeCloseTo(0.12, 6);
    // swirl: reliefKey 'amp', default 0.045
    expect(surfaceRelief('swirl', undefined, 2)).toBeCloseTo(0.09, 6);
  });

  it('honours overrides over the param default', () => {
    expect(surfaceRelief('wave', { relief: 0.1 }, 1)).toBeCloseTo(0.1, 6);
    expect(surfaceRelief('wave', { relief: 0 }, 1)).toBe(0);
  });

  it('non-displacing finishes (smooth, normal-map) have zero relief', () => {
    expect(surfaceRelief('smooth', undefined, 5)).toBe(0);
    expect(surfaceRelief('rustic', undefined, 5)).toBe(0);   // surfaceMap finish: no silhouette push
  });

  it('relief scales linearly with the tier radius', () => {
    expect(surfaceRelief('wave', { relief: 0.05 }, 3)).toBeCloseTo(0.15, 6);
  });
});

describe('applyTextureConfig — reliefKey rides in cake_textures.config, with seed fallback', () => {
  it('keeps the seed reliefKey when a DB row omits it (older rows still seat correctly)', () => {
    applyTextureConfig([{ key: 'wave', label: 'Cream Wave', algorithm: 'wave',
      config: { params: [{ key: 'relief', default: 0.08 }] } }]);   // note: no reliefKey in config
    expect(styleDef('wave').reliefKey).toBe('relief');
    expect(surfaceRelief('wave', undefined, 1)).toBeCloseTo(0.08, 6);
  });

  it('a brand-new DB texture works purely from its config.reliefKey (no code change)', () => {
    applyTextureConfig([{ key: 'newgeo', label: 'New Geo', algorithm: 'wave',
      config: { reliefKey: 'relief', params: [{ key: 'relief', default: 0.05 }] } }]);
    expect(surfaceRelief('newgeo', undefined, 2)).toBeCloseTo(0.1, 6);
  });
});
