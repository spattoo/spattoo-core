import { describe, it, expect } from 'vitest';
import { brushBandRings } from './brushStrokeOnCake.js';

/* Sandeep: "by default dont surround the cake with the strokes. 'strokes round the cake' and
 * 'drawing' need to be two different options explicitly user need to choose."
 *
 * ⚠️ THE THIRD STATE IS THE POINT. A band used to be either there or not; now it can also be on the
 * tier while the baker decides, with nothing on the wall. */
describe('brushBandRings', () => {
  it('rings the cake when asked to', () => {
    expect(brushBandRings({ mode: 'band' })).toBe(true);
  });

  it('does not while the baker is still choosing, or is drawing by hand', () => {
    expect(brushBandRings({ mode: 'ask' })).toBe(false);
    expect(brushBandRings({ mode: 'draw' })).toBe(false);
  });

  /* ⚠️ THE BACK-COMPAT CASE, AND IT IS NOT A DETAIL. Every band saved before this field existed
     carries no `mode`. Reading a missing value as "ask" would take the band off every one of those
     cakes the moment they were opened — a silent edit to work somebody had finished. */
  it('a band saved before the field existed still rings', () => {
    expect(brushBandRings({ colors: ['#fff'], count: 30 })).toBe(true);
    expect(brushBandRings({ mode: undefined })).toBe(true);
  });

  it('nothing at all is nothing at all', () => {
    expect(brushBandRings(null)).toBe(false);
    expect(brushBandRings(undefined)).toBe(false);
  });
});
