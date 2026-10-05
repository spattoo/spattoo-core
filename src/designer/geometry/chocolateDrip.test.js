import { describe, it, expect } from 'vitest';
import { dripColorAt, paintDripColors, buildDripFlood } from './chocolateDrip.js';

/* ── Two chocolates in one pour ──────────────────────────────────────────────────────────────────
 * The boundary is the feature. These pin the things that make it read as liquid rather than as a pie
 * chart, none of which need a scene — which matters, because the one thing a render can't tell you
 * is whether the top and the side agree about where the split is.
 */
describe('dripColorAt — where one chocolate ends', () => {
  const R = 1, opts = { n: 2, seed: 1, R };
  const at = (turn, rad = R) => dripColorAt(Math.sin(turn * Math.PI * 2) * rad,
                                            Math.cos(turn * Math.PI * 2) * rad, opts);

  it('one colour is one colour — a single chocolate is never blended', () => {
    expect(dripColorAt(0.4, 0.3, { ...opts, n: 1 })).toEqual({ i: 0, j: 0, t: 0 });
  });

  it('two chocolates each own about half the cake', () => {
    let a = 0, b = 0;
    for (let k = 0; k < 720; k++) (at(k / 720).i === 0 ? a++ : b++);
    expect(Math.abs(a - b) / 720).toBeLessThan(0.12);
  });

  /* ⚠️ THE PIE-CHART TEST, AND THE FIRST VERSION OF IT WAS USELESS. It asked only that the boundary
     sit at a slightly different angle at two radii — which an ANGULAR split satisfies the moment you
     wobble the angle at all, so it passed on the model it was written to reject and I found the
     fault by rendering instead. These two separate the shapes properly.

     A split by angle puts the boundary on a RADIUS: its angle is the same at every distance from the
     middle, give or take the wobble, which was bounded by 0.055 turns by construction. A seam that
     CROSSES the cake sweeps through a large angle as you walk out from the centre. */
  it('the seam crosses the cake — it does not radiate from the middle', () => {
    const edgeOf = rad => {
      for (let k = 0; k < 4000; k++) {
        if (at(k / 4000, rad).i !== at((k + 1) / 4000, rad).i) return k / 4000;
      }
      return null;
    };
    const turns = [0.15, 0.25, 0.45, 0.65, 0.85, 0.98].map(edgeOf).filter(t => t !== null);
    expect(turns.length).toBeGreaterThan(3);
    expect(Math.max(...turns) - Math.min(...turns)).toBeGreaterThan(0.25);
  });

  /* ⚠️ AND THE SHARPEST STATEMENT OF IT: in a pie chart every colour meets at the centre, so a tiny
     disc around the middle contains both. A poured seam crosses the top and leaves the middle to one
     of them. */
  it('the middle of the cake is one chocolate, not a meeting point', () => {
    let a = 0, b = 0;
    for (let k = 0; k < 360; k++) (at(k / 360, 0.03).i === 0 ? a++ : b++);
    expect(Math.min(a, b)).toBe(0);
  });

  /* ⚠️ A DRIP IS THE COLOUR OF THE FLOOD ABOVE IT, which is the only reason the top and the side
     read as one pour. Drips hang just PROUD of the rim, so they ask this question past r = R. */
  it('the split reaches the rim where the drips hang from', () => {
    const turnOf = rad => {
      for (let k = 0; k < 4000; k++) {
        if (at(k / 4000, rad).i !== at((k + 1) / 4000, rad).i) return k / 4000;
      }
      return null;
    };
    expect(Math.abs(turnOf(R * 0.995) - turnOf(R * 1.04))).toBeLessThan(0.004);
  });

  it('the seam is short — two ganaches meet, they do not airbrush', () => {
    let blended = 0;
    for (let k = 0; k < 2000; k++) if (at(k / 2000).t > 0) blended++;
    const share = blended / 2000;
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(0.12);
  });

  it('is deterministic, and a different seed is a different pour', () => {
    expect(dripColorAt(0.3, 0.7, opts)).toEqual(dripColorAt(0.3, 0.7, opts));
    let differs = false;
    for (let k = 0; k < 200 && !differs; k++) {
      const x = Math.sin(k) * 0.9, z = Math.cos(k) * 0.9;
      if (JSON.stringify(dripColorAt(x, z, opts)) !== JSON.stringify(dripColorAt(x, z, { ...opts, seed: 9 }))) differs = true;
    }
    expect(differs).toBe(true);
  });
});

describe('buildDripFlood', () => {
  /* ⚠️ WHY THIS EXISTS: three's cylinder cap is a fan — one vertex at the centre, one ring at the
     edge — so a boundary painted across it can only ever be a straight line. Rings let it bend. */
  it('has rings between the centre and the rim, not just a fan', () => {
    const geo = buildDripFlood({ R: 1, h: 0.03, rings: 6, segs: 8 });
    const pos = geo.attributes.position;
    const radii = new Set();
    for (let v = 0; v < pos.count; v++) radii.add(+Math.hypot(pos.getX(v), pos.getZ(v)).toFixed(3));
    expect(radii.size).toBeGreaterThan(4);
  });

  it('paints every vertex for two chocolates, and leaves one chocolate alone', () => {
    const two = paintDripColors(buildDripFlood({ R: 1, rings: 4, segs: 8 }), ['#ff0000', '#0000ff'], { R: 1 });
    expect(two.attributes.color.count).toBe(two.attributes.position.count);
    const one = paintDripColors(buildDripFlood({ R: 1, rings: 4, segs: 8 }), ['#ff0000'], { R: 1 });
    expect(one.attributes.color).toBeUndefined();
  });
});
