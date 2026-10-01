import { describe, it, expect } from 'vitest';
import { buildTopCavity, cavityProfile, CAVITY_DEFAULTS, AROUND, ACROSS } from './topCavity.js';

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

  /* ⚠️ THE FLOOR IS ABOVE THE TIER TOP, NOT BELOW IT, and this test used to say the opposite. Below
     the top is inside the cake, behind its own opaque cap — which is why the dish never rendered.
     `dish` is now the cream left lying in the middle: low against the ridge, but still cream ON the
     cake. Nothing in this profile may be negative. */
  it('settles on the cream in the middle, under the ridge but above the cake', () => {
    expect(cavityProfile(1, cfg)).toBeCloseTo(cfg.dish, 6);
    expect(cavityProfile(1, cfg)).toBeLessThan(cfg.lip);
  });

  /* ⚠️ ZERO AT THE VERY RIM — the join Sandeep circled. The cream on the top is the same cream as on
     the side and comes up over the edge continuously, so the ridge's outer flank has to land on the
     tier's own rim exactly. Any offset here and the surface is a disc floating over the cake with
     the cap showing under it as a shelf: *"edge elevation, is not till the edge of the cake."* */
  it('starts flush with the tier rim, so there is no shelf round the cake', () => {
    expect(cavityProfile(0, cfg)).toBeCloseTo(0, 9);
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

  /* ⚠️ A RANGE, NOT A HEIGHT, and the exact-height version of this test was right until the ridge
     started wandering. The lip is nominal now, not actual: the wander carries it above and below,
     which is the point. Asserting `hi === lip` would pin the very uniformity the wobble exists to
     destroy — a test that passes only while the feature is broken. */
  /* ⚠️ THIS TEST USED TO ASSERT THE BUG. It read `lo ≈ -dish` — the floor sitting BELOW the tier's
     top — and passed happily for as long as the floor was invisible, because below the top is inside
     the cake, behind its own opaque cap. Swept in the harness, a dish of 0.0001 and one of 0.30 were
     the same picture. The surface is lifted to rest ON the cake now, so the floor is the datum and
     nothing may go under it. */
  it('puts the ridge above the tier top and rests the floor ON it', () => {
    const { lo, hi } = extent(buildTopCavity(round, 1));
    const swing = 1 + CAVITY_DEFAULTS.wobble;
    expect(lo).toBeCloseTo(0, 5);
    /* The rim's outer edge sits a dish's depth up, so the crest clears that as well as zero. */
    expect(hi).toBeGreaterThan(CAVITY_DEFAULTS.dish);
    expect(hi).toBeLessThanOrEqual(CAVITY_DEFAULTS.dish + CAVITY_DEFAULTS.lip * swing + 1e-6);
  });

  /* ⚠️ ONE RING, AROUND, NOT EVERY VERTEX ABOVE A THRESHOLD. Two things move `y`: the profile's
     rise across the lip, and the circumferential wander. Filtering by height mixes them, so a
     uniform lip "failed" a uniformity test — the spread measured was the profile doing its job.
     A single ring holds the profile constant and leaves only the wander. */
  it('is uniform only when asked to be', () => {
    const ringHeights = (g, j) => {
      const p = g.attributes.position.array;
      const out = [];
      for (let i = 0; i < AROUND; i++) out.push(p[(j * AROUND + i) * 3 + 1]);
      return out;
    };
    const spread = ys => Math.max(...ys) - Math.min(...ys);
    const crestRing = Math.round(CAVITY_DEFAULTS.crest * ACROSS);

    /* ⚠️ THE MACHINED TORUS IS THE THING TO GUARD AGAINST, so it gets a test of its own. Swept one
       profile round a contour, the ridge is the same height everywhere — which is what shipped and
       what Sandeep saw: *"it looks like a regular uniform elevation."* */
    expect(spread(ringHeights(buildTopCavity(round, 1, { wobble: 0 }), crestRing))).toBeCloseTo(0, 6);

    const scraped = ringHeights(buildTopCavity(round, 1, { wobble: 0.35 }), crestRing);
    expect(spread(scraped)).toBeGreaterThan(CAVITY_DEFAULTS.lip * 0.1);
  });

  /* ⚠️ HEIGHT AND WIDTH MUST NOT MOVE TOGETHER. One noise ring driving both makes the ridge tallest
     exactly where it is widest — a regularity of its own, and a more obvious one than the uniform
     lip it replaced. */
  it('wanders in width independently of height', () => {
    const g = buildTopCavity(round, 1);
    const p = g.attributes.position.array;
    /* The innermost ring is the one pushed furthest in; its radius varies iff the width wanders. */
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const y = p[i + 1];
      if (y > 1e-6) continue;                            // only the floor ring, now the datum
      const r = Math.hypot(p[i], p[i + 2]);
      if (r < 1e-6) continue;                            // skip the centre vertex
      lo = Math.min(lo, r); hi = Math.max(hi, r);
    }
    expect(hi - lo).toBeGreaterThan(0);
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
