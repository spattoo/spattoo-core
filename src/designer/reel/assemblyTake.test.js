import { describe, it, expect } from 'vitest';
import {
  assemblyPose, assemblyTotal, assemblyDone, pieceStart, pieceFlight,
  ASSEMBLY_DEFAULTS, MAX_SPREAD,
} from './assemblyTake.js';

const P = ASSEMBLY_DEFAULTS;
/* Real sticker counts, read off the live templates rather than imagined: a cricket cake holds 3
   and a space theme holds 181. Sixty-fold is the range the timing has to survive. */
const COUNTS = [1, 3, 8, 13, 52, 137, 181];

describe('the cake assembles itself in a fixed time', () => {
  /* ⚠️ THE PIECE COUNT MUST NOT CHANGE THE LENGTH, and this is the test the first version failed.
     It set a fixed GAP between pieces, which gave a 1.6s build on the cricket cake and a 65.7s
     build on the space theme. A 65-second opening shot is not an opening shot. */
  it('takes the same time whatever the cake holds', () => {
    for (const n of COUNTS) {
      expect(assemblyTotal(P), `${n} pieces`).toBe(P.total);
      // ...and the last piece really has landed by then.
      expect(assemblyPose(n - 1, n, P.total, P).rise).toBe(0);
    }
  });

  /* ⚠️ THE GRACEFUL ONE, and the default: every piece in the air from the first frame, landing
     together. Sandeep: "if all elements come together from air and assemble on cake at once, it ll
     look even more graceful." */
  it('brings every piece at once when spread is 0', () => {
    const plan = { ...P, spread: 0 };
    for (const n of [3, 52, 181]) {
      for (let i = 0; i < n; i++) {
        expect(pieceStart(i, n, plan)).toBe(0);
        expect(assemblyPose(i, n, 0, plan).visible).toBe(true);
      }
      // They are all at the same height the whole way down, and all land together.
      const mid = assemblyPose(0, n, P.total / 2, plan).rise;
      for (const i of [1, n - 1]) {
        expect(assemblyPose(i, n, P.total / 2, plan).rise).toBeCloseTo(mid, 9);
      }
    }
  });

  it('deals them out as spread rises, in placement order', () => {
    const plan = { ...P, spread: 0.6 };
    const n = 10;
    for (let i = 1; i < n; i++) {
      expect(pieceStart(i, n, plan)).toBeGreaterThan(pieceStart(i - 1, n, plan));
    }
    expect(pieceStart(0, n, plan)).toBe(0);
  });

  /* ⚠️ `count - 1` IN THE DENOMINATOR. The last piece must start exactly when the starting window
     closes, or the take ends with dead air that grows as pieces are added — the off-by-one that
     makes a progress bar never quite finish. */
  it('starts its last piece exactly when the window closes', () => {
    for (const spread of [0.2, 0.5, MAX_SPREAD]) {
      const plan = { ...P, spread };
      for (const n of [2, 13, 181]) {
        expect(pieceStart(n - 1, n, plan)).toBeCloseTo(P.total * spread, 9);
      }
    }
  });

  it('lands the last piece exactly on time, at any spread', () => {
    for (const spread of [0, 0.3, MAX_SPREAD]) {
      const plan = { ...P, spread };
      for (const n of COUNTS) {
        expect(assemblyPose(n - 1, n, P.total - 0.01, plan).rise).toBeGreaterThan(0);
        expect(assemblyPose(n - 1, n, P.total, plan).rise).toBe(0);
      }
    }
  });

  /* ⚠️ A CEILING ON SPREAD. At 1 the starting window fills the whole take and the last piece has no
     time at all to fall — a teleport, not a landing. */
  it('always leaves a piece time to fall', () => {
    for (const spread of [0.9, 1, 4, Infinity]) {
      expect(pieceFlight({ ...P, spread }, 10)).toBeGreaterThan(0);
    }
    expect(pieceFlight({ ...P, spread: MAX_SPREAD }, 10)).toBeCloseTo(P.total * (1 - MAX_SPREAD), 9);
    /* ⚠️ ONE PIECE FALLS FOR THE WHOLE TAKE. There is no starting window to leave room for, and
       without this a lone decoration at spread 0.85 landed after 0.75s of a 5s take. */
    expect(pieceFlight({ ...P, spread: MAX_SPREAD }, 1)).toBeCloseTo(P.total, 9);
  });

  it('descends from above its seat and settles exactly on it', () => {
    const i = 2, n = 10, plan = { ...P, spread: 0.4 };
    const s = pieceStart(i, n, plan);
    expect(assemblyPose(i, n, s, plan).rise).toBeCloseTo(plan.rise, 6);
    const mid = assemblyPose(i, n, s + pieceFlight(plan, n) / 2, plan).rise;
    expect(mid).toBeLessThan(plan.rise);
    expect(mid).toBeGreaterThan(0);
    // ⚠️ EXACTLY zero at the end: a finished build has to be the design as saved, not nearly it.
    expect(assemblyPose(i, n, s + pieceFlight(plan, n), plan).rise).toBe(0);
    expect(assemblyPose(i, n, 999, plan).rise).toBe(0);
  });

  /* ⚠️ EASED OUT ONLY — a piece placed by hand slows as it arrives. Asserted as a property so the
     curve can be replaced without rewriting the test. */
  it('falls fast and lands gently', () => {
    const f = pieceFlight(P, 5);
    const r = (k) => assemblyPose(0, 5, f * k, P).rise;
    expect(r(0) - r(0.25)).toBeGreaterThan((r(0.75) - r(1)) * 2);
  });

  it('never puts a piece below its seat', () => {
    for (const spread of [0, 0.5, MAX_SPREAD]) {
      const plan = { ...P, spread };
      for (let i = 0; i < 8; i++) {
        for (let t = 0; t <= P.total + 1; t += 0.1) {
          expect(assemblyPose(i, 8, t, plan).rise).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('is finished only when the time is up', () => {
    expect(assemblyDone(P.total - 0.01, P)).toBe(false);
    expect(assemblyDone(P.total, P)).toBe(true);
  });

  /* ⚠️ ZEROES AND NONSENSE MUST NOT PRODUCE NaN. The panel lets total and rise reach their floors,
     and `(t - start) / flight` is 0/0 when the total is 0. NaN in a position is a decoration that
     vanishes, with nothing to say why. */
  it('survives zeroes and rubbish in the plan', () => {
    for (const plan of [
      { total: 0, spread: 0.3, rise: 0.5 },
      { total: 5, spread: 0, rise: 0 },
      { total: 5, spread: -2, rise: 0.5 },
      { total: NaN, spread: NaN, rise: NaN },
      {},
      null,
    ]) {
      for (const n of [1, 7]) {
        for (let i = 0; i < n; i++) {
          for (let t = 0; t <= 3; t += 0.5) {
            const { rise, visible } = assemblyPose(i, n, t, plan);
            expect(Number.isFinite(rise), `rise i=${i} ${JSON.stringify(plan)}`).toBe(true);
            expect(typeof visible).toBe('boolean');
          }
        }
      }
    }
  });

  it('handles a cake with one decoration, and with none', () => {
    expect(pieceStart(0, 1, P)).toBe(0);
    expect(assemblyPose(0, 1, 0, P).visible).toBe(true);
    expect(assemblyPose(0, 1, P.total, P).rise).toBe(0);
    // No pieces: nothing to ask about, and nothing that throws.
    expect(pieceStart(0, 0, P)).toBe(0);
    expect(Number.isFinite(assemblyPose(0, 0, 1, P).rise)).toBe(true);
  });

  it('defaults to the graceful shot', () => {
    expect(P.spread).toBe(0);
    expect(P.total).toBeGreaterThan(0);
  });
});
