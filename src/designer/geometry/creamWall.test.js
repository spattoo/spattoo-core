import { describe, it, expect } from 'vitest';
import {
  strokeSection, NOZZLES, makeRopeField, makeSpiralField, buildStyledTop, makeWallReliefSampler, pipedParams,
} from './creamWall.js';

const TAU = Math.PI * 2;
const STAR  = pipedParams({ nozzle: 'star' });
const ROUND = pipedParams({ nozzle: 'round', ropes: 44, points: 1 });

describe('the nozzle is the shape, not a detail on it', () => {
  it('both tips sit at zero in the grooves at either end of a stroke', () => {
    for (const n of ['round', 'star']) {
      expect(strokeSection(0, n, STAR)).toBeCloseTo(0, 10);
      expect(strokeSection(1, n, STAR)).toBeCloseTo(0, 10);
    }
  });

  it('neither ever goes negative — the wall only grows outward, so the cap cannot overhang it', () => {
    for (const n of ['round', 'star']) {
      for (let i = 0; i <= 400; i++) expect(strokeSection(i / 400, n, STAR)).toBeGreaterThanOrEqual(0);
    }
  });

  it('a round tip is ONE tube per stroke; a star tip is `points` fins', () => {
    const peaks = (n, opts) => {
      let c = 0;
      for (let i = 1; i < 800; i++) {
        const a = strokeSection((i - 1) / 800, n, opts), b = strokeSection(i / 800, n, opts), d = strokeSection((i + 1) / 800, n, opts);
        if (b > a && b > d) c++;
      }
      return c;
    };
    expect(peaks('round', STAR)).toBe(1);
    expect(peaks('star', STAR)).toBe(STAR.points);
    expect(peaks('star', { ...STAR, points: 6 })).toBe(6);
  });

  it('⚠️ the star MULTIPLIES the body — its grooves cut down toward the wall, not shallow ripples', () => {
    // Between two fins, in the middle of the stroke where the body is at its fullest.
    const valley = (groove) => strokeSection(1 / STAR.points, 'star', { ...STAR, groove });
    expect(valley(0)).toBeCloseTo(strokeSection(1 / STAR.points, 'round', STAR), 10);  // 0 ⇒ a plain tube
    expect(valley(1)).toBeCloseTo(0, 10);                                              // 1 ⇒ separate fins
    expect(valley(0.65)).toBeLessThan(0.45 * valley(0));
  });

  it('an unknown tip falls back rather than rendering a flat cake', () => {
    expect(strokeSection(0.5, 'no-such-tip', STAR)).toBeCloseTo(strokeSection(0.5, 'star', STAR), 10);
    expect(Object.keys(NOZZLES).sort()).toEqual(['round', 'star']);
  });
});

describe('makeRopeField — separate strokes around the wall', () => {
  it('wraps: the ±π seam is continuous, so the last stroke meets the first', () => {
    const f = makeRopeField(STAR);
    expect(Math.abs(f(1 - 1e-6) - f(0 + 1e-6))).toBeLessThan(1e-3);
    expect(f(2.25)).toBeCloseTo(f(0.25), 12);
  });

  it('gives neighbouring strokes different widths — identical ones read as machined', () => {
    // With vary 0 every groove lands on k/ropes. With vary, the strokes have moved off that grid —
    // which is the whole point, so at least one of those positions must now be mid-stroke.
    const even = makeRopeField({ ...STAR, vary: 0, wobble: 0 });
    const hand = makeRopeField({ ...STAR, wobble: 0 });
    const at = (f) => Array.from({ length: STAR.ropes }, (_, k) => f(k / STAR.ropes, 0));
    expect(Math.max(...at(even))).toBeLessThan(1e-9);
    expect(Math.max(...at(hand))).toBeGreaterThan(0.3);
  });

  it('flattens with vary 0 — the knob is what makes the hand show', () => {
    const f = makeRopeField({ ...STAR, vary: 0, wobble: 0 });
    expect(f(0.5 / STAR.ropes)).toBeCloseTo(f(0.5 / STAR.ropes + 1 / STAR.ropes), 10);
  });

  it('wanders PER STROKE up the wall — a shared lean is wood grain, not a hand', () => {
    const f = makeRopeField(STAR);
    // Each groove's position at the bottom vs. two-thirds up. They must move, and by different
    // amounts: one number applied to all of them is the bug this replaced.
    const grooveNear = (k, v) => {
      let best = k / STAR.ropes, lowest = Infinity;
      for (let i = -60; i <= 60; i++) {
        const x = k / STAR.ropes + i / STAR.ropes / 60, y = f(x, v);
        if (y < lowest) { lowest = y; best = x; }
      }
      return best;
    };
    const shifts = [];
    for (let k = 1; k < STAR.ropes; k++) shifts.push(grooveNear(k, 0.66) - grooveNear(k, 0));
    expect(Math.max(...shifts.map(Math.abs))).toBeGreaterThan(1e-4);
    expect(Math.max(...shifts) - Math.min(...shifts)).toBeGreaterThan(1e-4);
  });

  it('pins the ±π seam however hard it wanders — a wandering seam splits the wall', () => {
    const f = makeRopeField({ ...STAR, wobble: 1.5 });
    for (const v of [0, 0.3, 0.7, 1]) expect(Math.abs(f(1 - 1e-9, v) - f(0, v))).toBeLessThan(1e-6);
  });
});

describe('makeSpiralField — the coil on the top', () => {
  const f = makeSpiralField({ ...STAR, coils: 5, centre: 0 });

  it('joins itself at the θ = ±π seam', () => {
    for (const rFrac of [0.2, 0.55, 0.9]) {
      expect(f(rFrac, Math.PI - 1e-7)).toBeCloseTo(f(rFrac, -Math.PI + 1e-7), 5);
    }
  });

  it('is a spiral, not rings: one turn moves it exactly one coil inward', () => {
    const rFrac = 0.5, pitch = 1 / 5;
    expect(f(rFrac, 0)).toBeCloseTo(f(rFrac - pitch, TAU), 10);
  });

  it('puts a peak in the middle where the bag lifts off, and nothing at the rim', () => {
    const withPeak = makeSpiralField({ ...STAR, coils: 5, centre: 0.9 });
    expect(withPeak(0, 0) - f(0, 0)).toBeCloseTo(0.9, 6);       // full mound dead centre
    expect(withPeak(1, 0) - f(1, 0)).toBeLessThan(1e-6);        // gone by the edge of the cake
  });
});

describe('buildStyledTop', () => {
  it('is null for every style that leaves the top flat', () => {
    expect(buildStyledTop('piped', undefined, 1, 1, STAR)).toBeNull();
    expect(buildStyledTop('wave', null, 1, 1, {})).toBeNull();
  });

  it('reaches the wall it caps — the rim covers the crest at every angle, or daylight shows', () => {
    const geo = buildStyledTop('piped', 'spiral', 1, 1, STAR);
    const crest = makeWallReliefSampler('piped', 1, STAR, 1);
    const pos = geo.attributes.position;
    // The skirt is the only ring sitting at y = 0, so those vertices ARE the rim, at their own exact
    // angles. Each must reach the wall not just under itself but across the arc it spans, or the
    // wall bulges through between two of them.
    let checked = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) !== 0) continue;
      const x = pos.getX(i), z = pos.getZ(i);
      const theta = Math.atan2(z, x), r = Math.hypot(x, z);
      const seg = TAU / (STAR.ropes * STAR.points * 10);
      for (let k = -1; k <= 1; k++) {
        expect(r).toBeGreaterThanOrEqual(1 + Math.max(0, crest(theta + k * seg / 2, 1)) - 1e-9);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('hangs a skirt down to the wall top (y = 0) so the two weld shut', () => {
    const pos = buildStyledTop('piped', 'spiral', 1, 1, STAR).attributes.position;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); min = Math.min(min, y); max = Math.max(max, y); }
    expect(min).toBe(0);                       // never below the cake's top — no sinking into the wall
    expect(max).toBeGreaterThan(0.06);         // the coil stands proud of it
  });

  it('scales with the tier: a bigger cake gets the same cream, not the same millimetres', () => {
    const small = buildStyledTop('piped', 'spiral', 1, 1, STAR).attributes.position;
    const big   = buildStyledTop('piped', 'spiral', 2, 1, STAR).attributes.position;
    const top = (p) => { let m = 0; for (let i = 0; i < p.count; i++) m = Math.max(m, p.getY(i)); return m; };
    expect(top(big) / top(small)).toBeCloseTo(2, 6);
  });
});

describe('the two nozzle rows', () => {
  it('offer the SAME knobs with different defaults — one schema, two tips', async () => {
    const { styleParamSchema, styleDef } = await import('../creamStyles.js');
    const keys = (k) => styleParamSchema(k).map(p => p.key);
    expect(keys('piped_round')).toEqual(keys('piped'));
    expect(styleDef('piped').nozzle).toBe('star');
    expect(styleDef('piped_round').nozzle).toBe('round');
    // Same algorithm, same lid — only the tip and its numbers differ.
    expect(styleDef('piped_round').wall).toBe(styleDef('piped').wall);
    expect(styleDef('piped_round').top).toBe(styleDef('piped').top);
  });

  it('cover the cake with a comparable number of RIBS, which is what a viewer counts', async () => {
    const { resolveStyleParams } = await import('../creamStyles.js');
    const ribs = (k) => { const p = resolveStyleParams(k); return p.ropes * p.points; };
    expect(Math.abs(ribs('piped') - ribs('piped_round'))).toBeLessThan(0.35 * ribs('piped'));
  });

  it('builds a top for the round tip too, with its rim still covering the wall', () => {
    const geo = buildStyledTop('piped', 'spiral', 1, 1, ROUND);
    const crest = makeWallReliefSampler('piped', 1, ROUND, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) !== 0) continue;
      const theta = Math.atan2(pos.getZ(i), pos.getX(i));
      expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeGreaterThanOrEqual(1 + Math.max(0, crest(theta, 1)) - 1e-9);
    }
  });
});
