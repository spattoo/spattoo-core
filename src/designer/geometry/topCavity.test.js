import { describe, it, expect } from 'vitest';
import { buildTopCavity, cavityProfile, CAVITY_DEFAULTS } from './topCavity.js';

const round = { kind: 'round', radius: 1 };
const rect = { kind: 'rect', halfW: 1.4, halfD: 0.9, cornerR: 0.2 };
const cfg = { lip: 0.045, dish: 0.018, crest: 0.3 };

describe('the profile is a scrape, not a chamfer', () => {
  it('starts flush with the tier top', () => {
    expect(cavityProfile(0, cfg)).toBeCloseTo(0, 6);
  });

  /* ⚠️ THE CREST IS WHAT MAKES IT READ AS CREAM PUSHED UP. A single curve from rim to floor is a
     chamfer — an edge cut away. The scrape has a fall on BOTH sides of a ridge. */
  it('rises to the full lip at the crest and falls on both sides of it', () => {
    expect(cavityProfile(cfg.crest, cfg)).toBeCloseTo(cfg.lip, 6);
    expect(cavityProfile(cfg.crest / 2, cfg)).toBeLessThan(cfg.lip);
    expect(cavityProfile(cfg.crest / 2, cfg)).toBeGreaterThan(0);
    expect(cavityProfile((1 + cfg.crest) / 2, cfg)).toBeLessThan(cfg.lip);
  });

  it('settles in the dish, below the tier top', () => {
    expect(cavityProfile(1, cfg)).toBeCloseTo(-cfg.dish, 6);
  });

  it('never leaves the band it was given', () => {
    for (let i = 0; i <= 40; i++) {
      const y = cavityProfile(i / 40, cfg);
      expect(y).toBeLessThanOrEqual(cfg.lip + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-cfg.dish - 1e-9);
    }
  });

  it('clamps rather than extrapolating past either end', () => {
    expect(cavityProfile(-3, cfg)).toBeCloseTo(cavityProfile(0, cfg), 6);
    expect(cavityProfile(9, cfg)).toBeCloseTo(cavityProfile(1, cfg), 6);
  });
});

/* One path, every shape — the reason this is built on `perimeter()` rather than on the tier's own
   five geometry builders. */
describe('it follows whatever footprint the tier has', () => {
  for (const [name, shape] of [['round', round], ['rect', rect]]) {
    it(`builds on a ${name} tier`, () => {
      const g = buildTopCavity(shape, 1);
      expect(g).toBeTruthy();
      expect(g.attributes.position.count).toBeGreaterThan(100);
      expect(g.index.count % 3).toBe(0);
    });
  }

  it('draws nothing without a height — there is nothing to measure against', () => {
    expect(buildTopCavity(round, 0)).toBe(null);
  });
});

describe('every dimension is a fraction of the tier', () => {
  const extent = g => {
    const p = g.attributes.position.array;
    let lo = Infinity, hi = -Infinity;
    for (let i = 1; i < p.length; i += 3) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); }
    return { lo, hi };
  };

  /* INVARIANTS #8 — a world number here is right on one cake and wrong on the next. */
  it('doubles its relief when the tier doubles in height', () => {
    const a = extent(buildTopCavity(round, 1));
    const b = extent(buildTopCavity(round, 2));
    expect(b.hi).toBeCloseTo(a.hi * 2, 5);
    expect(b.lo).toBeCloseTo(a.lo * 2, 5);
  });

  it('puts the ridge above the tier top and the floor below it', () => {
    const { lo, hi } = extent(buildTopCavity(round, 1));
    expect(hi).toBeCloseTo(CAVITY_DEFAULTS.lip, 5);
    expect(lo).toBeCloseTo(-CAVITY_DEFAULTS.dish, 5);
  });

  /* ⚠️ THE LIP IS A BAND, NOT A LINE, and a fat one — both photographs show a scraped ridge rather
     than a piped bead. Its width is measured against the shape's own half-span, so a small round
     and a wide sheet get the same proportion of themselves. */
  /* ⚠️ 1e-6, NOT 1e-9. The outer ring sits exactly ON the radius, and positions are stored as
     Float32 — the round trip lands a few parts in 1e8 over, which is noise rather than an overhang.
     A tolerance tighter than the buffer's own precision tests the storage, not the geometry. */
  it('keeps the lip inside the footprint', () => {
    const p = buildTopCavity(round, 1).attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      expect(Math.hypot(p[i], p[i + 2])).toBeLessThanOrEqual(round.radius + 1e-6);
    }
  });
});
