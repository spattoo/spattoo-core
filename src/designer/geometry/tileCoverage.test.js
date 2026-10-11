import { describe, it, expect } from 'vitest';
import { silhouette, tilesWithoutGaps, maxTileStep } from './tileCoverage.js';

/* Sandeep, after three guessed spacings each left a visible band of bare cake: "i think you are
 * not measuring it. if you cannot measure, you cannot fix it. guess work does not work."
 *
 * ⚠️ SO THESE TESTS USE SHAPES WHOSE ANSWER IS KNOWN INDEPENDENTLY. A measurement is only worth
 * having if it has been checked against something that can be worked out by hand — otherwise it is
 * a more elaborate guess. A square tiles at 1.0 of its width by definition. A disc on a staggered
 * lattice cannot exceed its own diameter. A star must come out TIGHTER than a disc of the same
 * extent, because most of its box is empty. */

/** A filled polygon in the XZ plane, as a triangle-fan position array. */
function fanGeo(points) {
  const out = [];
  for (let i = 1; i + 1 < points.length; i++) {
    out.push(points[0][0], 0, points[0][1]);
    out.push(points[i][0], 0, points[i][1]);
    out.push(points[i + 1][0], 0, points[i + 1][1]);
  }
  return out;
}
const disc = (r, n = 64) =>
  fanGeo(Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }));
const square = r => fanGeo([[-r, -r], [r, -r], [r, r], [-r, r]]);
/** A `points`-pointed star: tips at `r`, valleys at `r * inner`. */
const star = (r, points, inner) =>
  fanGeo(Array.from({ length: points * 2 }, (_, i) => {
    const a = (i / (points * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * inner : r;
    return [Math.cos(a) * rr, Math.sin(a) * rr];
  }));

describe('silhouette', () => {
  it('fills a square almost completely, and a disc to about π/4 of it', () => {
    const sq = silhouette(square(1));
    const filled = m => m.mask.reduce((a, b) => a + b, 0) / m.mask.length;
    expect(filled(sq)).toBeGreaterThan(0.97);
    const d = filled(silhouette(disc(1)));
    expect(d).toBeGreaterThan(Math.PI / 4 - 0.05);   // 0.785 — the area ratio of a disc to its box
    expect(d).toBeLessThan(Math.PI / 4 + 0.05);
  });

  /* ⚠️ A STAR'S TIPS ARE FEW VERTICES AND A LOT OF SILHOUETTE — which is exactly why counting
     vertices got this wrong and rasterising faces does not. */
  it('measures a star by its area, not by where its vertices are', () => {
    const s = silhouette(star(1, 8, 0.35));
    const filled = s.mask.reduce((a, b) => a + b, 0) / s.mask.length;
    expect(filled).toBeGreaterThan(0.2);
    expect(filled).toBeLessThan(0.5);               // far emptier than the disc's 0.785
  });
});

describe('tilesWithoutGaps', () => {
  it('a square tiles edge to edge and fails the moment it is pulled apart', () => {
    const sq = silhouette(square(1));
    const w = sq.w * sq.cell;
    expect(tilesWithoutGaps(sq, w * 0.95, w * 0.95, { stagger: false })).toBe(true);
    expect(tilesWithoutGaps(sq, w * 1.25, w * 1.25, { stagger: false })).toBe(false);
  });

  it('is monotone — a lattice that gaps does not stop gapping when widened', () => {
    const d = silhouette(disc(1));
    const w = d.w * d.cell;
    let sawGap = false;
    for (const f of [0.4, 0.55, 0.7, 0.85, 1.0, 1.15, 1.3]) {
      const ok = tilesWithoutGaps(d, w * f, w * f);
      if (!ok) sawGap = true;
      if (sawGap) expect(ok).toBe(false);           // never recovers
    }
    expect(sawGap).toBe(true);
  });
});

describe('maxTileStep', () => {
  it('lets a square tile at its own width', () => {
    const r = maxTileStep(silhouette(square(1)), { stagger: false });
    expect(r.ratioX).toBeGreaterThan(0.9);
    expect(r.ratioX).toBeLessThanOrEqual(1.05);
  });

  /* The honest check on the whole exercise: a shape with holes in its outline must be packed
     TIGHTER than a solid one of the same extent. Every proxy that was tried got this backwards or
     could not see it at all. */
  it('packs a star tighter than a disc of the same width', () => {
    const d = maxTileStep(silhouette(disc(1)));
    const s = maxTileStep(silhouette(star(1, 8, 0.35)));
    expect(s.ratioX).toBeLessThan(d.ratioX);
  });

  it('packs a spikier star tighter still', () => {
    const blunt = maxTileStep(silhouette(star(1, 8, 0.7)));
    const sharp = maxTileStep(silhouette(star(1, 8, 0.25)));
    expect(sharp.ratioX).toBeLessThan(blunt.ratioX);
  });

  it('is scale-free — the ratio does not move when the piece does', () => {
    const small = maxTileStep(silhouette(star(0.2, 8, 0.4)));
    const big   = maxTileStep(silhouette(star(5,   8, 0.4)));
    expect(small.ratioX).toBeCloseTo(big.ratioX, 1);
  });

  it('says so rather than lying when a shape cannot tile at all', () => {
    // Four small discs far apart in one "piece" — no lattice of it is ever gapless.
    const scattered = [
      ...disc(0.05).map((v, i) => (i % 3 === 0 ? v - 1 : i % 3 === 2 ? v - 1 : v)),
      ...disc(0.05).map((v, i) => (i % 3 === 0 ? v + 1 : i % 3 === 2 ? v + 1 : v)),
    ];
    const r = maxTileStep(silhouette(scattered));
    expect(r.gapAtFloor).toBe(true);
  });
});
