import { describe, it, expect } from 'vitest';
import { ZONES } from './constants.js';

/* ── Where a filler may go is the ROW's answer ───────────────────────────────────────────────────
 *
 * Sandeep: *"placement is not driven by config. so many violations on driving the rendering from
 * config… we already have invariant to honor the config but surprisingly many times its missing."*
 *
 * The card's rule is two lines — `allowed_zones` when the row has them, everything when it does
 * not — and the second half is the one worth pinning. A row authored before zones existed, or one
 * saved without them, must keep all its placements: absent is not the same as empty, and getting
 * that backwards silently takes a baker's options away rather than showing one too many.
 *
 * ⚠️ THE GATE `check:zones-from-config` CATCHES THE OTHER HALF — a card that never asks at all. It
 * cannot check the ANSWER, only that the question is put, so this covers the answer.
 */
const mayGo = (allowed, zone) => {
  const zones = allowed?.length ? allowed : null;
  return !zones || zones.includes(zone);
};

describe('which placements a gypsophila card offers', () => {
  it('offers only what the row allows', () => {
    const row = ['top_surface', 'board'];
    expect(mayGo(row, ZONES.TOP_SURFACE)).toBe(true);
    expect(mayGo(row, ZONES.BOARD)).toBe(true);
    expect(mayGo(row, ZONES.SIDE)).toBe(false);
  });

  it('offers everything when the row says nothing — absent is not empty', () => {
    for (const nothing of [null, undefined, []]) {
      for (const z of [ZONES.TOP_SURFACE, ZONES.SIDE, ZONES.BOARD]) {
        expect(mayGo(nothing, z), `${JSON.stringify(nothing)} should not restrict ${z}`).toBe(true);
      }
    }
  });

  it('restricting to one zone leaves exactly one surface', () => {
    const row = ['side'];
    const offered = [ZONES.TOP_SURFACE, ZONES.SIDE, ZONES.BOARD].filter(z => mayGo(row, z));
    expect(offered).toEqual([ZONES.SIDE]);
  });

  /* The studio authors these three, so the fixture and the real row agree — the thing that was NOT
     true until the Where row started reading the field. */
  it('matches what the Gypsophila Studio authors', () => {
    const authored = ['top_surface', 'side', 'board'];
    for (const z of [ZONES.TOP_SURFACE, ZONES.SIDE, ZONES.BOARD]) {
      expect(mayGo(authored, z)).toBe(true);
    }
  });
});
