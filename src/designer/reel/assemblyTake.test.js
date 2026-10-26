import { describe, it, expect } from 'vitest';
import {
  assemblyPose, assemblyTotal, assemblyDone, pieceStart, atSpeed, ASSEMBLY_DEFAULTS,
} from './assemblyTake.js';

const P = ASSEMBLY_DEFAULTS;

describe('the cake assembles one piece at a time', () => {
  it('lasts the last piece\'s start plus its own flight', () => {
    expect(assemblyTotal(1, P)).toBeCloseTo(P.perPiece, 9);
    expect(assemblyTotal(10, P)).toBeCloseTo(9 * P.stagger + P.perPiece, 9);
    // A cake with nothing on it takes no time, rather than one piece's worth.
    expect(assemblyTotal(0, P)).toBe(0);
  });

  /* ⚠️ PIECES OVERLAP IN THE AIR. `stagger` is shorter than `perPiece` on purpose: a strict queue,
     where each piece lands before the next starts, reads as a progress bar rather than as a cake
     being built. If a change ever makes stagger ≥ perPiece, the shot loses its whole character. */
  it('starts the next piece before the last one has landed', () => {
    expect(P.stagger).toBeLessThan(P.perPiece);
    const secondStarts = pieceStart(1, P);
    const firstLands = pieceStart(0, P) + P.perPiece;
    expect(secondStarts).toBeLessThan(firstLands);
  });

  /* ⚠️ NOT RENDERED, NOT TRANSPARENT. A GLB carries its own materials, so fading one in means
     reaching into every material it brought. Not drawing it is exact and works for any mesh. */
  it('does not show a piece before its turn', () => {
    expect(assemblyPose(3, 0, P).visible).toBe(false);
    expect(assemblyPose(3, pieceStart(3, P) - 0.01, P).visible).toBe(false);
    expect(assemblyPose(3, pieceStart(3, P), P).visible).toBe(true);
  });

  it('descends from above its seat and settles exactly on it', () => {
    const i = 2, s = pieceStart(i, P);
    expect(assemblyPose(i, s, P).rise).toBeCloseTo(P.rise, 6);
    const mid = assemblyPose(i, s + P.perPiece / 2, P).rise;
    expect(mid).toBeLessThan(P.rise);
    expect(mid).toBeGreaterThan(0);
    // ⚠️ EXACTLY zero at the end: a finished build has to be the design as saved, not nearly it.
    expect(assemblyPose(i, s + P.perPiece, P).rise).toBe(0);
    expect(assemblyPose(i, s + 99, P).rise).toBe(0);
  });

  /* ⚠️ EASED OUT ONLY. A piece placed by hand slows as it arrives; it does not ease into leaving.
     Asserted as a property — it covers more ground early than late — so the curve can be replaced
     without rewriting the test. */
  it('falls fast and lands gently', () => {
    const i = 0, s = pieceStart(i, P);
    const r = (f) => assemblyPose(i, s + P.perPiece * f, P).rise;
    const firstQuarter = r(0) - r(0.25);
    const lastQuarter  = r(0.75) - r(1);
    expect(firstQuarter).toBeGreaterThan(lastQuarter * 2);
  });

  it('never puts a piece below its seat', () => {
    for (let i = 0; i < 6; i++) {
      for (let t = 0; t <= assemblyTotal(6, P) + 1; t += 0.05) {
        expect(assemblyPose(i, t, P).rise).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('is finished only once the last piece has landed', () => {
    const n = 5, total = assemblyTotal(n, P);
    expect(assemblyDone(n, total - 0.01, P)).toBe(false);
    expect(assemblyDone(n, total, P)).toBe(true);
    // And every piece really is home at that moment.
    for (let i = 0; i < n; i++) expect(assemblyPose(i, total, P).rise).toBe(0);
  });

  /* ⚠️ A ZERO IN THE PLAN MUST NOT PRODUCE NaN. The panel lets these reach 0 — somebody wanting
     every piece at once sets stagger to nothing — and `(t - start) / per` is 0/0 when perPiece is
     0. NaN in a position is a decoration that vanishes, with nothing to say why. */
  it('survives zeroes in the plan', () => {
    for (const plan of [
      { perPiece: 0, stagger: 0.2, rise: 0.5 },
      { perPiece: 0.4, stagger: 0, rise: 0.5 },
      { perPiece: 0.4, stagger: 0.2, rise: 0 },
      { perPiece: 0, stagger: 0, rise: 0 },
    ]) {
      for (let i = 0; i < 4; i++) {
        for (let t = 0; t <= 2; t += 0.25) {
          const { rise, visible } = assemblyPose(i, t, plan);
          expect(Number.isFinite(rise), `rise i=${i} t=${t} ${JSON.stringify(plan)}`).toBe(true);
          expect(typeof visible).toBe('boolean');
        }
      }
    }
  });

  /* ⚠️ SLOW MOTION STRETCHES TIME, NOT DISTANCE. A piece travels exactly as far; it takes longer
     about it. Scaling `rise` too would start the pieces further away, which is a different shot —
     and it is the mistake that makes CG slow motion look like a speed slider rather than slow
     motion. */
  describe('slow motion', () => {
    it('halves the pace without moving the pieces further', () => {
      const half = atSpeed(P, 0.5);
      expect(half.perPiece).toBeCloseTo(P.perPiece * 2, 9);
      expect(half.stagger).toBeCloseTo(P.stagger * 2, 9);
      expect(half.rise).toBe(P.rise);
      expect(assemblyTotal(6, half)).toBeCloseTo(assemblyTotal(6, P) * 2, 9);
    });

    it('shows the same poses, just later', () => {
      const half = atSpeed(P, 0.5);
      for (const f of [0.25, 0.5, 0.75, 1]) {
        const t = pieceStart(2, P) + P.perPiece * f;
        const tHalf = pieceStart(2, half) + half.perPiece * f;
        expect(assemblyPose(2, tHalf, half).rise).toBeCloseTo(assemblyPose(2, t, P).rise, 9);
      }
    });

    it('refuses a speed that would stop time', () => {
      for (const bad of [0, -3, NaN, null]) {
        const plan = atSpeed(P, bad);
        expect(Number.isFinite(plan.perPiece)).toBe(true);
        expect(plan.perPiece).toBeGreaterThan(0);
      }
    });
  });

  /* The order is the order the pieces were placed — which replays how the cake was really built.
     Piece 0 is always first and the last is always last, whatever the plan. */
  it('builds in placement order', () => {
    for (let i = 1; i < 8; i++) {
      expect(pieceStart(i, P)).toBeGreaterThan(pieceStart(i - 1, P));
    }
  });
});
