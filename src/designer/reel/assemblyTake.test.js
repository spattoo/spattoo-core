import { describe, it, expect } from 'vitest';
import {
  assemblyPose, assemblyTotal, assemblyDone, pieceStart, pieceFlight,
  ASSEMBLY_DEFAULTS, MAX_SPREAD, MAX_RISE, MAX_SWING,
} from './assemblyTake.js';

/* ⚠️ `scatter: 0` IS DELIBERATE IN THE BASELINE PLAN. Everything below this line is about the
   mechanics every piece shares — timing, the curve, the landing — and those are only observable
   when the pieces are NOT each given their own height and bearing. Scatter has its own block at the
   bottom, which is where the per-piece variety is asserted. A test that wants both answers at once
   gets neither. */
const P = { ...ASSEMBLY_DEFAULTS, scatter: 0 };
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

  /* ⚠️ THE CURVE HAS TO SPEND THE WHOLE TAKE, and this test replaces one that demanded the
     opposite. It used to assert the drop was FRONT-LOADED — "falls fast and lands gently", an
     ease-out — which is a fine instinct and made `total` meaningless: on an 11s take the piece was
     half way down at 2.3s and 90% down at 5.9s, so the last five seconds were invisible motion.
     Sandeep set 11 seconds and got *"it finished faster … it did not really slow it down."*

     So the property is now about PACING, not about which end is faster: no quarter of the take may
     be dead, and no single moment may carry the shot. An ease-out fails the first clause, a linear
     ramp passes everything here, and a curve that teleports fails the second. */
  it('uses the whole take, with no dead stretch and no lurch', () => {
    for (const total of [2, 5, 11, 15]) {
      const plan = { ...P, total };
      const f = pieceFlight(plan, 5);
      const at = (k) => assemblyPose(0, 5, f * k, plan).rise / plan.rise;
      for (const [a, b] of [[0, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 1]]) {
        const moved = at(a) - at(b);
        expect(moved, `${total}s: the quarter from ${a} to ${b} must not be dead`).toBeGreaterThan(0.04);
        expect(moved, `${total}s: the quarter from ${a} to ${b} must not carry the whole shot`).toBeLessThan(0.6);
      }
      // Half the distance at half the time, near enough that the length is legible.
      expect(at(0.5), `${total}s midpoint`).toBeGreaterThan(0.35);
      expect(at(0.5), `${total}s midpoint`).toBeLessThan(0.65);
    }
  });

  /* ⚠️ LONGER REALLY IS SLOWER. The complaint behind the curve change was that it was not, so the
     claim is asserted directly rather than left to the shape of the easing. */
  it('actually slows down when the take is made longer', () => {
    const near = (total) => {
      const plan = { ...P, total };
      for (let t = 0; t <= total; t += 0.05) if (assemblyPose(0, 5, t, plan).rise / plan.rise <= 0.1) return t;
      return total;
    };
    expect(near(11)).toBeGreaterThan(near(5) * 1.8);
    expect(near(5)).toBeGreaterThan(near(2) * 1.8);
  });

  /* ── Coming in from further, and around ─────────────────────────────────────────────────────── */
  it('starts high enough to be off the cake', () => {
    // "the elements are coming from very near" — the old default was 0.55 of the cake's reach.
    expect(P.rise).toBeGreaterThan(1);
    expect(MAX_RISE).toBeGreaterThanOrEqual(4);
  });

  it('sweeps around the cake and arrives square on its seat', () => {
    const plan = { ...P, swing: 0.5, total: 6 };
    const f = pieceFlight(plan, 5);
    const sw = (t) => assemblyPose(0, 5, t, plan).swing;
    expect(sw(0)).toBeCloseTo(Math.PI, 6);          // half a turn out, in radians
    expect(Math.abs(sw(f / 2))).toBeLessThan(Math.abs(sw(0)));
    // ⚠️ EXACTLY ZERO ON LANDING. A take that ends a degree off is a take that ends on the wrong cake.
    expect(sw(f)).toBe(0);
    expect(sw(999)).toBe(0);
  });

  /* ⚠️ HEIGHT AND ANGLE UNWIND TOGETHER, or a piece finishes its descent and then slides sideways
     into place. Asserted as a ratio so either curve can change as long as they stay locked. */
  it('flies one spiral rather than a drop plus a turn', () => {
    const plan = { ...P, swing: 0.75, rise: 2, total: 8 };
    const f = pieceFlight(plan, 5);
    for (const k of [0.2, 0.4, 0.6, 0.8]) {
      const { rise, swing } = assemblyPose(0, 5, f * k, plan);
      expect(swing / (plan.swing * Math.PI * 2)).toBeCloseTo(rise / plan.rise, 9);
    }
  });

  it('keeps swing inside its ceiling and survives rubbish', () => {
    expect(assemblyPose(0, 5, 0, { ...P, swing: 99 }).swing).toBeCloseTo(MAX_SWING * Math.PI * 2, 9);
    expect(assemblyPose(0, 5, 0, { ...P, swing: -99 }).swing).toBeCloseTo(-MAX_SWING * Math.PI * 2, 9);
    for (const bad of [{ swing: NaN }, { swing: 'x' }, {}]) {
      expect(Number.isFinite(assemblyPose(0, 5, 1, { ...P, ...bad }).swing)).toBe(true);
    }
  });

  it('is straight down when the swing is nothing', () => {
    const plan = { ...P, swing: 0 };
    for (const t of [0, 1, 2.5, 5]) expect(assemblyPose(0, 5, t, plan).swing).toBe(0);
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
    expect(ASSEMBLY_DEFAULTS.spread).toBe(0);
    expect(ASSEMBLY_DEFAULTS.total).toBeGreaterThan(0);
  });

  /* ── Each piece arrives its own way ────────────────────────────────────────────────────────────
   *
   * "many elements starting from same point. can it be random? and why all have to come from top?"
   * With one height and one swing for every piece the decorations move as a rigid block — the eye
   * reads one object floating above the cake rather than many pieces coming together.
   */
  describe('scatter', () => {
    const S = { ...ASSEMBLY_DEFAULTS, total: 6 };

    it('gives every piece a different height, sweep and bearing', () => {
      const at0 = [...Array(6).keys()].map(i => assemblyPose(i, 6, 0, S));
      for (const field of ['rise', 'swing', 'offX', 'offZ']) {
        const vals = at0.map(p => p[field].toFixed(4));
        expect(new Set(vals).size, `every piece should have its own ${field}`).toBeGreaterThan(4);
      }
    });

    /* ⚠️ NOT ALL FROM OVERHEAD. A piece with a low start and a long bearing crosses the board on
       its way in, which is the half of the answer that `rise` alone cannot give. */
    it('starts some pieces out across the board, not above their seats', () => {
      const away = [...Array(12).keys()]
        .map(i => assemblyPose(i, 12, 0, S))
        .filter(p => Math.hypot(p.offX, p.offZ) > 0.3);
      expect(away.length, 'several pieces should begin well off their seats').toBeGreaterThan(3);
    });

    it('sweeps some pieces in one way round and some the other', () => {
      const signs = new Set([...Array(10).keys()].map(i => Math.sign(assemblyPose(i, 10, 0, S).swing)));
      expect(signs.has(1) && signs.has(-1), 'both directions should occur').toBe(true);
    });

    /* ⚠️ THE SAME CAKE FILMS THE SAME WAY EVERY TIME. The variety is a hash of the index, never
       Math.random — a shot you cannot repeat is not a shot, and a baker re-recording after a tweak
       must get the same choreography back. */
    it('is random per piece but identical every run', () => {
      for (const i of [0, 3, 17]) {
        const a = assemblyPose(i, 20, 1.5, S);
        const b = assemblyPose(i, 20, 1.5, S);
        expect(a).toEqual(b);
      }
    });

    /* ⚠️ AND IT STILL LANDS EXACTLY. Variety that leaves a piece an inch from its seat would make
       the take end on something other than the design. */
    it('brings every scattered piece exactly home', () => {
      for (let i = 0; i < 12; i++) {
        const p = assemblyPose(i, 12, S.total, S);
        expect([p.rise, p.swing, p.offX, p.offZ]).toEqual([0, 0, 0, 0]);
      }
    });

    it('is the identity at 0, so a plan can ask for no variety', () => {
      const flat = { ...S, scatter: 0 };
      const rises = [...Array(5).keys()].map(i => assemblyPose(i, 5, 0, flat).rise);
      expect(new Set(rises).size).toBe(1);
      for (let i = 0; i < 5; i++) {
        const p = assemblyPose(i, 5, 0, flat);
        expect(p.offX).toBe(0);
        expect(p.offZ).toBe(0);
      }
    });

    it('never produces NaN, whatever the plan says', () => {
      for (const bad of [{ scatter: NaN }, { scatter: 'x' }, { scatter: 99 }, { scatter: -4 }]) {
        for (let i = 0; i < 4; i++) {
          const p = assemblyPose(i, 4, 1, { ...S, ...bad });
          for (const f of ['rise', 'swing', 'offX', 'offZ']) {
            expect(Number.isFinite(p[f]), `${f} with ${JSON.stringify(bad)}`).toBe(true);
          }
        }
      }
    });
  });
});
