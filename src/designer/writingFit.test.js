import { describe, it, expect } from 'vitest';
import { WRITING_FIT, WRITING_CUT, writingFit } from './constants.js';

/* ── The starting size of a message, and the fact it is routed by ───────────────────────────────
 *
 * ⚠️ WHAT THIS CATCHES IS A LOOKUP THAT FALLS THROUGH. `writingFit` used to be
 * `WRITING_FIT[style] ?? WRITING_FIT.cream`, and `WRITING_FIT` deliberately has no `fondant` key —
 * so fondant silently took CREAM's 0.8 while every other line of code treated it as a cut look that
 * should start at 0.4. Twice the size, on the one Look whose letters are sized by width alone and
 * so have no height clamp to hide it. Reported as "why suddenly texts element showing too big".
 *
 * ⚠️ THE POINT IS THE ROUTING, NOT THE NUMBERS. These assert that a cut Look gets the cut size and
 * a piped one does not — a test that froze 0.4 would fail the first honest re-tune by eye, which is
 * how every size in this area is set. */
describe('writingFit', () => {
  it('gives every cut Look the same starting size', () => {
    for (const [style, cut] of Object.entries(WRITING_CUT)) {
      if (cut) expect(writingFit(style), style).toBe(WRITING_FIT.acrylic);
    }
  });

  it('gives piped cream its own, larger, starting size', () => {
    expect(writingFit('cream')).toBe(WRITING_FIT.cream);
    expect(WRITING_FIT.cream).toBeGreaterThan(WRITING_FIT.acrylic);
  });

  /* An absent style has always meant cream — see DEFAULT_WRITING. */
  it('falls back to cream for a style that says nothing', () => {
    expect(writingFit(undefined)).toBe(WRITING_FIT.cream);
    expect(writingFit('a-look-that-was-withdrawn')).toBe(WRITING_FIT.cream);
  });

  /* ⚠️ The regression itself, named. Fondant must never again be sized like piped cream. */
  it('does not size fondant like piped cream', () => {
    expect(writingFit('fondant')).not.toBe(WRITING_FIT.cream);
    expect(writingFit('fondant')).toBe(writingFit('acrylic'));
  });
});
