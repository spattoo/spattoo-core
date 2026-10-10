import { describe, it, expect } from 'vitest';
import { coatShade, coatLidShare, COAT_SHADE_MODES, OMBRE_LID_SHARE } from './coatShade.js';
import { rosetteSeats } from './rosetteCoat.js';

/* Sandeep, with three reference cakes: "double color patterns. we should achieve this." */

const R = 1.2, H = 1.45, BASE = 0.1;
const seatsOf = (o = {}) =>
  rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0, pieceW: 0.3, pieceH: 0.3, ...o });

describe('coatShade — ombré', () => {
  it('runs 0 at the middle of the lid to 1 at the board', () => {
    const seats = seatsOf();
    const t = coatShade(seats, { baseY: BASE, tierHeight: H });
    const mid = seats.map((s, i) => ({ s, t: t[i] }))
      .filter(x => x.s.kind === 'top')
      .sort((a, b) => Math.hypot(a.s.p[0], a.s.p[2]) - Math.hypot(b.s.p[0], b.s.p[2]))[0];
    expect(mid.t).toBeLessThan(0.05);
    const lowest = seats.map((s, i) => ({ s, t: t[i] }))
      .filter(x => x.s.kind === 'side')
      .sort((a, b) => a.s.p[1] - b.s.p[1])[0];
    expect(lowest.t).toBeGreaterThan(0.9);
    expect(Math.min(...t)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...t)).toBeLessThanOrEqual(1);
  });

  /* ⚠️ THE WHOLE POINT. On the reference the colour crosses the top edge without a step. Shading
     each surface 0→1 on its own would restart the gradient twice and draw two bright rings exactly
     where the shoulder row exists to hide a seam. */
  it('is continuous across the lid, the shoulder and the wall', () => {
    const seats = seatsOf();
    const t = coatShade(seats, { baseY: BASE, tierHeight: H });
    const by = k => seats.map((s, i) => ({ s, t: t[i] })).filter(x => x.s.kind === k);
    const lidRim = Math.max(...by('top').map(x => x.t));
    const shoulder = by('rim')[0].t;
    const wallTop = Math.min(...by('side').map(x => x.t));
    expect(shoulder).toBeCloseTo(OMBRE_LID_SHARE, 6);
    expect(Math.abs(lidRim - shoulder)).toBeLessThan(0.02);   // lid hands over where the shoulder starts
    expect(Math.abs(wallTop - shoulder)).toBeLessThan(0.12);  // and the wall carries on from there
  });

  it('is monotone down the wall — no band comes back lighter', () => {
    const seats = seatsOf();
    const t = coatShade(seats, { baseY: BASE, tierHeight: H });
    const wall = seats.map((s, i) => ({ y: s.p[1], t: t[i], k: s.kind }))
      .filter(x => x.k === 'side').sort((a, b) => b.y - a.y);
    for (let i = 1; i < wall.length; i++) expect(wall[i].t).toBeGreaterThanOrEqual(wall[i - 1].t - 1e-9);
  });

  it('inverts end to end', () => {
    const seats = seatsOf();
    const a = coatShade(seats, { baseY: BASE, tierHeight: H });
    const b = coatShade(seats, { baseY: BASE, tierHeight: H, invert: true });
    a.forEach((v, i) => expect(b[i]).toBeCloseTo(1 - v, 9));
  });

  /* Bands land on the MIDDLE of each step, so the palest and deepest are full width. Rounding to
     the edges leaves two half-width bands at the ends, which reads as a mistake. */
  it('quantises into bands of equal width', () => {
    const seats = seatsOf();
    const t = coatShade(seats, { baseY: BASE, tierHeight: H, bands: 4 });
    const levels = [...new Set(t.map(v => +v.toFixed(6)))].sort((a, b) => a - b);
    expect(levels).toEqual([0.125, 0.375, 0.625, 0.875]);
  });

  it('measures the lid reach when it is not given', () => {
    const small = coatShade(seatsOf({ tierRadius: 0.5 }), { baseY: BASE, tierHeight: H });
    expect(Math.max(...small)).toBeLessThanOrEqual(1);
    expect(Math.min(...small)).toBeGreaterThanOrEqual(0);
  });
});

describe('coatShade — scatter and single', () => {
  it('spreads pieces across the palette', () => {
    const seats = seatsOf();
    const idx = coatShade(seats, { mode: 'scatter', palette: 3 });
    expect(new Set(idx)).toEqual(new Set([0, 1, 2]));
    expect(idx.every(i => Number.isInteger(i) && i >= 0 && i < 3)).toBe(true);
    // roughly even — a palette where one colour never shows is not a palette
    for (const c of [0, 1, 2]) {
      expect(idx.filter(i => i === c).length).toBeGreaterThan(seats.length / 10);
    }
  });

  it('is deterministic for a seed and different for another', () => {
    const seats = seatsOf();
    const a = coatShade(seats, { mode: 'scatter', seed: 4 });
    const b = coatShade(seats, { mode: 'scatter', seed: 4 });
    const c = coatShade(seats, { mode: 'scatter', seed: 9 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('single gives one value, and an empty coat gives nothing', () => {
    expect(new Set(coatShade(seatsOf(), { mode: 'single' }))).toEqual(new Set([0]));
    expect(coatShade([], { mode: 'ombre' })).toEqual([]);
    expect(coatShade(null, { mode: 'ombre' })).toEqual([]);
  });

  it('returns one value per seat in seat order, every mode', () => {
    const seats = seatsOf();
    for (const mode of COAT_SHADE_MODES) {
      expect(coatShade(seats, { mode, baseY: BASE, tierHeight: H })).toHaveLength(seats.length);
    }
  });
});

/* Sandeep: "when i apply 2 colors, there is no control to set how much area should each color
 * should take." A linear run hands every stop an equal band; a real ombré is usually a narrow pale
 * crown over a deep body, which no choice of COLOURS can express. */
describe('coatShade — balance', () => {
  const seats = () => rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                     pieceW: 0.3, pieceH: 0.3 });

  it('is the identity at 0.5', () => {
    const s = seats();
    const a = coatShade(s, { baseY: BASE, tierHeight: H });
    const b = coatShade(s, { baseY: BASE, tierHeight: H, balance: 0.5 });
    a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 12));
  });

  it('moves the handover: a lower balance gives the first colour less cake', () => {
    const s = seats();
    const past = bal => coatShade(s, { baseY: BASE, tierHeight: H, balance: bal })
      .filter(t => t > 0.5).length;
    expect(past(0.25)).toBeGreaterThan(past(0.5));
    expect(past(0.75)).toBeLessThan(past(0.5));
  });

  it('stays in range whatever the balance', () => {
    const s = seats();
    for (const bal of [0.02, 0.2, 0.5, 0.8, 0.98]) {
      const t = coatShade(s, { baseY: BASE, tierHeight: H, balance: bal });
      expect(Math.min(...t)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...t)).toBeLessThanOrEqual(1);
    }
  });

  /* ⚠️ THE TEST THE FIRST SHAPE WOULD HAVE FAILED, and the reason it was replaced. Sandeep, with
   * the dial on its stop: *"range for balance need to be increased. i actually wanted second color
   * till half of the cake."* The original remap moved the midpoint and then stretched the remainder
   * so the run still ended exactly at the board — so the last colour only ever reached the bottom
   * ROW, and no range on the dial could have changed that. The ramp runs out of cake instead. */
  it('can finish early — a balance in range hands the bottom half of the wall to the last colour', () => {
    const s = seats();
    const solidFraction = bal => {
      const t = coatShade(s, { baseY: BASE, tierHeight: H, balance: bal });
      const wall = s.map((x, i) => ({ t: t[i], k: x.kind })).filter(x => x.k === 'side');
      return wall.filter(x => x.t >= 1 - 1e-9).length / wall.length;
    };
    expect(solidFraction(0.5)).toBeLessThan(0.05);        // the identity: the board row, and barely that

    const [lo, hi] = [0.2, 0.8];   // the Balance dial's travel, in CakeDesigner's GradientControls
    const reaching = [];
    for (let b = lo; b <= hi + 1e-9; b = +(b + 0.01).toFixed(2)) reaching.push([b, solidFraction(b)]);
    const half = reaching.find(([, f]) => f >= 0.5);
    expect(half, 'no balance the dial can reach covers half the wall').toBeTruthy();
    expect(half[0]).toBeGreaterThanOrEqual(lo);
    expect(half[0]).toBeLessThanOrEqual(hi);

    // And it is a dial, not a switch: lower balance never gives the last colour LESS wall.
    for (let i = 1; i < reaching.length; i++) {
      expect(reaching[i][1]).toBeLessThanOrEqual(reaching[i - 1][1] + 1e-9);
    }
  });

  it('is still monotone down the wall', () => {
    const s = seats();
    const t = coatShade(s, { baseY: BASE, tierHeight: H, balance: 0.3 });
    const wall = s.map((x, i) => ({ y: x.p[1], t: t[i], k: x.kind }))
      .filter(x => x.k === 'side').sort((a, b) => b.y - a.y);
    for (let i = 1; i < wall.length; i++) expect(wall[i].t).toBeGreaterThanOrEqual(wall[i - 1].t - 1e-9);
  });
});

/* Sandeep: "we should give an option to cover only the side. or cover only top. as well." */
describe('coatShade — scope', () => {
  const seats = () => rosetteSeats({ tierRadius: R, tierHeight: H, baseY: BASE, jitter: 0,
                                     pieceW: 0.3, pieceH: 0.3 });
  const span = (list, kind, opts) => {
    const t = coatShade(list, { baseY: BASE, tierHeight: H, ...opts });
    const mine = list.map((s, i) => t[i]).filter((_, i) => list[i].kind === kind);
    return [Math.min(...mine), Math.max(...mine)];
  };

  it('hands the lid its usual third of the run when the whole cake is covered', () => {
    expect(coatLidShare('all')).toBe(OMBRE_LID_SHARE);
    expect(coatLidShare(undefined)).toBe(OMBRE_LID_SHARE);   // a coat saved before scopes existed
    const [lo, hi] = span(seats(), 'side', { lidShare: coatLidShare('all') });
    expect(lo).toBeGreaterThan(OMBRE_LID_SHARE - 0.01);      // the wall picks up where the lid left off
    expect(hi).toBeLessThanOrEqual(1);
  });

  /* ⚠️ THE ONE THAT MATTERS. Leave the lid's share in place on a sides-only coat and the wall
     starts a third of the way through the palette: the first colour never appears on the cake at
     all, and a two-colour ombré arrives looking like one slightly wrong colour. */
  it('gives the wall the WHOLE palette when only the sides are covered', () => {
    expect(coatLidShare('side')).toBe(0);
    const [lo, hi] = span(seats(), 'side', { lidShare: coatLidShare('side') });
    expect(lo).toBeLessThan(0.2);          // the top of the wall is the first colour now
    expect(hi).toBeGreaterThan(0.8);       // and the board is still the last
  });

  it('gives the lid the whole palette when only the top is covered', () => {
    expect(coatLidShare('top')).toBe(1);
    const [lo, hi] = span(seats(), 'top', { lidShare: coatLidShare('top') });
    expect(lo).toBeLessThan(0.1);          // the middle of the lid
    expect(hi).toBeGreaterThan(0.9);       // out at the rim
  });

  it('still takes a balance on a partial coat', () => {
    const s = seats();
    const solid = (sc, bal) => {
      const t = coatShade(s, { baseY: BASE, tierHeight: H, lidShare: coatLidShare(sc), balance: bal });
      const wall = s.map((x, i) => t[i]).filter((_, i) => s[i].kind === 'side');
      return wall.filter(v => v >= 1 - 1e-9).length / wall.length;
    };
    expect(solid('side', 0.3)).toBeGreaterThan(solid('side', 0.5));
  });
});
