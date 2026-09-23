import { describe, it, expect } from 'vitest';
import { writingScaleFrom, WRITING_SCALE_DEFAULTS } from './writingScale.js';

/* The live "Texts" row (0c53a84d-13b6-4ff7-a0e9-11afe5edaf08) authors exactly this, and the dial
   ignored all four numbers. */
const LIVE = { r: 0.5, side: 'hug', board: 'hug', procedural: 'writing',
               scale: { min: 0.2, max: 2.5, step: 0.25 }, top_surface: 'hug' };

describe('writingScaleFrom', () => {
  it('takes every number the row authored', () => {
    expect(writingScaleFrom(LIVE)).toEqual({ min: 0.2, max: 2.5, step: 0.25, r: 0.5 });
  });

  it('falls back per FIELD, so authoring one bound does not lose the other', () => {
    const r = writingScaleFrom({ scale: { max: 4 } });
    expect(r.max).toBe(4);
    expect(r.min).toBe(WRITING_SCALE_DEFAULTS.min);
    expect(r.step).toBe(WRITING_SCALE_DEFAULTS.step);
  });

  it('keeps a zero, which is a real bound and not an absent one', () => {
    expect(writingScaleFrom({ scale: { min: 0 }, r: 0 })).toMatchObject({ min: 0, r: 0 });
  });

  it('refuses a non-number rather than handing NaN to a dial', () => {
    const r = writingScaleFrom({ scale: { min: '0.2', max: null, step: undefined }, r: 'big' });
    expect(r).toEqual({ ...WRITING_SCALE_DEFAULTS, r: null });
  });

  it('answers with the shipped defaults for a row that says nothing', () => {
    expect(writingScaleFrom(null)).toEqual({ ...WRITING_SCALE_DEFAULTS, r: null });
    expect(writingScaleFrom({})).toEqual({ ...WRITING_SCALE_DEFAULTS, r: null });
  });

  it('leaves `r` null when unauthored, so the material default still answers', () => {
    expect(writingScaleFrom({ scale: { min: 0.4 } }).r).toBe(null);
  });
});
