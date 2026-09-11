import { describe, it, expect } from 'vitest';
import {
  strokeSection, makeRopeField, makeSpiralField, buildStyledTop, makeWallReliefSampler,
} from './creamWall.js';

const TAU = Math.PI * 2;
const PIPED = { relief: 0.06, ropes: 44, round: 0.45, vary: 0.28, wobble: 0.45, teeth: 2, teethDepth: 0.18 };

describe('strokeSection — the one star-tip profile', () => {
  it('sits at zero in the grooves at either end of a stroke', () => {
    expect(strokeSection(0, 0.45, 4, 0.18)).toBeCloseTo(0, 10);
    expect(strokeSection(1, 0.45, 4, 0.18)).toBeCloseTo(0, 10);
  });

  it('never goes negative — the wall only ever grows outward, so the flat cap cannot overhang it', () => {
    for (let i = 0; i <= 200; i++) expect(strokeSection(i / 200, 0.45, 4, 0.18)).toBeGreaterThanOrEqual(0);
  });

  it('carries the tip teeth as extra ripples, not as a deeper stroke', () => {
    const bumps = (teethDepth) => {
      let n = 0;
      for (let i = 1; i < 400; i++) {
        const a = strokeSection((i - 1) / 400, 0.45, 4, teethDepth);
        const b = strokeSection(i / 400, 0.45, 4, teethDepth);
        const c = strokeSection((i + 1) / 400, 0.45, 4, teethDepth);
        if (b > a && b > c) n++;
      }
      return n;
    };
    expect(bumps(0)).toBe(1);          // no teeth → one plain rounded stroke
    expect(bumps(0.18)).toBeGreaterThan(1);
  });
});

describe('makeRopeField — separate strokes around the wall', () => {
  it('wraps: the ±π seam is continuous, so the last stroke meets the first', () => {
    const f = makeRopeField(PIPED);
    expect(Math.abs(f(1 - 1e-6) - f(0 + 1e-6))).toBeLessThan(1e-3);
    expect(f(2.25)).toBeCloseTo(f(0.25), 12);
  });

  it('gives neighbouring strokes different widths — identical ones read as machined', () => {
    // With vary 0 every groove lands on k/ropes. With vary, the strokes have moved off that grid —
    // which is the whole point, so at least one of those positions must now be mid-stroke.
    const even = makeRopeField({ ...PIPED, vary: 0, wobble: 0 });
    const hand = makeRopeField({ ...PIPED, wobble: 0 });
    const at = (f) => Array.from({ length: PIPED.ropes }, (_, k) => f(k / PIPED.ropes, 0));
    expect(Math.max(...at(even))).toBeLessThan(1e-9);
    expect(Math.max(...at(hand))).toBeGreaterThan(0.3);
  });

  it('flattens with vary 0 — the knob is what makes the hand show', () => {
    const f = makeRopeField({ ...PIPED, vary: 0, wobble: 0 });
    expect(f(0.5 / 44)).toBeCloseTo(f(0.5 / 44 + 1 / 44), 10);
  });

  it('wanders PER STROKE up the wall — a shared lean is wood grain, not a hand', () => {
    const f = makeRopeField(PIPED);
    // Each groove's position at the bottom vs. two-thirds up. They must move, and by different
    // amounts: one number applied to all of them is the bug this replaced.
    const grooveNear = (k, v) => {
      let best = k / 44, lowest = Infinity;
      for (let i = -60; i <= 60; i++) {
        const x = k / 44 + i / 44 / 60, y = f(x, v);
        if (y < lowest) { lowest = y; best = x; }
      }
      return best;
    };
    const shifts = [];
    for (let k = 1; k < 44; k++) shifts.push(grooveNear(k, 0.66) - grooveNear(k, 0));
    expect(Math.max(...shifts.map(Math.abs))).toBeGreaterThan(1e-4);
    expect(Math.max(...shifts) - Math.min(...shifts)).toBeGreaterThan(1e-4);
  });

  it('pins the ±π seam however hard it wanders — a wandering seam splits the wall', () => {
    const f = makeRopeField({ ...PIPED, wobble: 1.5 });
    for (const v of [0, 0.3, 0.7, 1]) expect(Math.abs(f(1 - 1e-9, v) - f(0, v))).toBeLessThan(1e-6);
  });
});

describe('makeSpiralField — the coil on the top', () => {
  const f = makeSpiralField({ coils: 5, round: 0.45, teeth: 4, teethDepth: 0.18, centre: 0 });

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
    const withPeak = makeSpiralField({ coils: 5, round: 0.45, teeth: 4, teethDepth: 0.18, centre: 0.9 });
    expect(withPeak(0, 0) - f(0, 0)).toBeCloseTo(0.9, 6);       // full mound dead centre
    expect(withPeak(1, 0) - f(1, 0)).toBeLessThan(1e-6);        // gone by the edge of the cake
  });
});

describe('buildStyledTop', () => {
  it('is null for every style that leaves the top flat', () => {
    expect(buildStyledTop('piped', undefined, 1, 1, PIPED)).toBeNull();
    expect(buildStyledTop('wave', null, 1, 1, {})).toBeNull();
  });

  it('reaches the wall it caps — the rim covers the crest at every angle, or daylight shows', () => {
    const geo = buildStyledTop('piped', 'spiral', 1, 1, PIPED);
    const crest = makeWallReliefSampler('piped', 1, PIPED, 1);
    const pos = geo.attributes.position;
    // The skirt is the only ring sitting at y = 0, so those vertices ARE the rim, at their own exact
    // angles. Each must reach the wall not just under itself but across the arc it spans, or the
    // wall bulges through between two of them.
    let checked = 0;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) !== 0) continue;
      const x = pos.getX(i), z = pos.getZ(i);
      const theta = Math.atan2(z, x), r = Math.hypot(x, z);
      const seg = TAU / 528;
      for (let k = -1; k <= 1; k++) {
        expect(r).toBeGreaterThanOrEqual(1 + Math.max(0, crest(theta + k * seg / 2, 1)) - 1e-9);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('hangs a skirt down to the wall top (y = 0) so the two weld shut', () => {
    const pos = buildStyledTop('piped', 'spiral', 1, 1, PIPED).attributes.position;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); min = Math.min(min, y); max = Math.max(max, y); }
    expect(min).toBe(0);                       // never below the cake's top — no sinking into the wall
    expect(max).toBeGreaterThan(0.06);         // the coil stands proud of it
  });

  it('scales with the tier: a bigger cake gets the same cream, not the same millimetres', () => {
    const small = buildStyledTop('piped', 'spiral', 1, 1, PIPED).attributes.position;
    const big   = buildStyledTop('piped', 'spiral', 2, 1, PIPED).attributes.position;
    const top = (p) => { let m = 0; for (let i = 0; i < p.count; i++) m = Math.max(m, p.getY(i)); return m; };
    expect(top(big) / top(small)).toBeCloseTo(2, 6);
  });
});
