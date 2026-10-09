import { describe, it, expect } from 'vitest';
import { coatShade, COAT_SHADE_MODES, OMBRE_LID_SHARE } from './coatShade.js';
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
