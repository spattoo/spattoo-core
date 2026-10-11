import { describe, it, expect } from 'vitest';
import { writingScaleFrom, WRITING_SCALE_DEFAULTS, writingMaxFit, WRITING_TOP_MAX_FIT } from './writingScale.js';
import { buildCreamWriting } from './creamText.js';

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

/* ── The surface's own ceiling ───────────────────────────────────────────────────────────────────
 *
 * Sandeep: "can we guard it not to go beyond cake when we increase size. right now at full size,
 * its going out of cake."
 *
 * ⚠️ MEASURED AGAINST THE REAL BUILDER, not against the constant. Asserting `writingMaxFit('top')
 * === 0.85` would pass for ever while the geometry changed underneath it — the claim worth holding
 * is that a message built at the ceiling STAYS ON THE CAKE, and the number is only how that is
 * currently achieved. On the top the builder fills the width, so the block's half-diagonal is what
 * has to stay inside the radius.
 */
describe('a message cannot be sized off the cake', () => {
  const R = 1.2;                       // a typical top radius
  const halfDiagOf = (text, fit) => {
    const m = 2 * R * fit;
    const geo = buildCreamWriting({ text, font: 'ems_allure', thickness: 0.03, maxW: m, maxH: m,
                                    lineGap: 1.4, letterSpacing: 0, curve: 0, wrapRadius: 0 });
    geo.computeBoundingBox();
    const b = geo.boundingBox;
    const [w, h] = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]
      .sort((p, q) => q - p);          // the two in-plane extents once it is laid on the top
    return Math.hypot(w / 2, h / 2);
  };

  /* ⚠️ A SHORT MESSAGE IS THE HARD CASE, which is the opposite of the intuition. The builder fills
     the WIDTH, so three letters get a tall block and a long sentence a shallow one — "Ava" leaves
     the circle at 0.95 while "BABY loading" is still inside. The ceiling is set by the one that
     fails first, so both have to be checked. */
  for (const text of ['Ava', 'BABY loading', 'Happy Birthday']) {
    it(`"${text}" stays on the cake at the ceiling`, () => {
      expect(halfDiagOf(text, writingMaxFit('top', 2.5))).toBeLessThanOrEqual(R);
    });
  }

  it('and the ceiling is doing work — the authored max alone would go off', () => {
    expect(halfDiagOf('Ava', 2.5)).toBeGreaterThan(R);
    expect(writingMaxFit('top', 2.5)).toBeLessThan(2.5);
  });

  /* An admin's tighter bound still wins; the surface only ever narrows, never widens. */
  it('never overrules a row upward', () => {
    expect(writingMaxFit('top', 0.6)).toBe(0.6);
    expect(writingMaxFit('board', 2.5)).toBe(2.5);
    expect(writingMaxFit('side', 2.5)).toBe(2.5);
  });

  /* The board's box is under half the drum at fit 1, which is why its ceiling was RAISED once —
     capping it to the top's number would undo that. */
  it('leaves the board and the side alone', () => {
    expect(writingMaxFit('board', 2.5)).toBeGreaterThan(WRITING_TOP_MAX_FIT);
  });
});
