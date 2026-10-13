import { describe, it, expect } from 'vitest';
import { occupantRadius, surfaceOccupants } from './placement.js';
import { STICKER_SIZE } from './constants.js';

/* ⚠️ THE RULE EXISTED AND WAS TRAPPED IN ONE COMPONENT. `CakeCanvas` has cached every GLB's measured
 * half-width since the faux-ball work and used it to push a DRAGGED piece off its siblings — written
 * inline three times in one function. Trapped there it answers only "where may this piece be
 * dragged", so a filler looking for gaps between roses, or a piping ring that should not drive
 * through a decoration, had no way to ask. Sandeep: *"we should block penetration of gypsophila into
 * roses are any other elements. it can find gaps in the rose bunch and fill those gaps."* */
describe('occupantRadius — how wide is a placed thing', () => {
  it('uses the measured radius when the model has loaded', () => {
    expect(occupantRadius({ scale: 1 }, 0.4)).toBeCloseTo(0.4, 6);
    expect(occupantRadius({ scale: 2 }, 0.4)).toBeCloseTo(0.8, 6);
  });

  /* ⚠️ A FALLBACK IS NOT OPTIONAL. Seats are computed long before a GLB finishes loading, and a
     radius of 0 would let a ring seat itself straight through a rose for the first second of every
     page load — the kind of fault that only shows on a cold cache. */
  it('falls back to a nominal radius before the model has loaded', () => {
    expect(occupantRadius({ scale: 1 }, null)).toBeCloseTo(STICKER_SIZE / 4, 6);
    expect(occupantRadius({ scale: 1 })).toBeCloseTo(STICKER_SIZE / 4, 6);
  });

  it('scales with the instance, not just the model', () => {
    expect(occupantRadius({ scale: 0.5 }, 0.4)).toBeLessThan(occupantRadius({ scale: 1.5 }, 0.4));
  });

  it('survives a sticker with no scale at all', () => {
    expect(occupantRadius({}, 0.3)).toBeCloseTo(0.3, 6);
  });
});

describe('surfaceOccupants — what is standing on this surface', () => {
  const stickers = [
    { id: 'a', tierIndex: 0, zone: 'top_surface', x: 0.1, z: 0.2, scale: 1 },
    { id: 'b', tierIndex: 0, zone: 'top_surface', x: -0.3, z: 0.0, scale: 2 },
    { id: 'c', tierIndex: 1, zone: 'top_surface', x: 0.0, z: 0.0, scale: 1 },   // another tier
    { id: 'd', tierIndex: 0, zone: 'side', x: 0.5, z: 0.5, scale: 1 },          // another surface
    { id: 'e', tierIndex: 0, zone: 'top_surface', x: null, z: null, scale: 1 }, // not seated yet
  ];
  const opts = { tierIndex: 0, zone: 'top_surface' };

  it('takes only what is on the same tier and the same surface', () => {
    expect(surfaceOccupants(stickers, opts).map(o => o.id)).toEqual(['a', 'b']);
  });

  it('carries each one its own radius', () => {
    const got = surfaceOccupants(stickers, { ...opts, radiusOf: (s) => (s.id === 'b' ? 0.5 : 0.2) });
    expect(got.find(o => o.id === 'a').r).toBeCloseTo(0.2, 6);
    expect(got.find(o => o.id === 'b').r).toBeCloseTo(1.0, 6);   // 0.5 measured × scale 2
  });

  /* The piece being placed must not be asked to clear ITSELF, or it shoves itself across the cake
     the moment it is dragged. */
  it('can skip one by id', () => {
    expect(surfaceOccupants(stickers, { ...opts, skipId: 'a' }).map(o => o.id)).toEqual(['b']);
  });

  /* ⚠️ IT ASKS WHAT IS THERE, NEVER WHAT IT IS. A candle, a topper and a rose all occupy space and
     the rule is identical for each — there is no type, slug or category anywhere in the answer. */
  it('says nothing about what kind of thing each is', () => {
    for (const o of surfaceOccupants(stickers, opts)) {
      expect(Object.keys(o).sort()).toEqual(['id', 'r', 'x', 'z']);
    }
  });

  it('is empty rather than undefined when nothing is placed', () => {
    expect(surfaceOccupants(null, opts)).toEqual([]);
    expect(surfaceOccupants([], opts)).toEqual([]);
  });
});
