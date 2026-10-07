import { describe, it, expect } from 'vitest';
import { balloonProfile, buildBalloon, BALLOON_DEFAULTS } from './balloon.js';

/* The silhouette IS the balloon, so the profile is what these read — a lathe cannot be wrong in a
 * way the profile is right about. */
const widest = (p) => p.reduce((m, v) => (v.x > m.x ? v : m), p[0]);

describe('the profile', () => {
  it('starts on the axis at the bottom and closes on the axis at the top', () => {
    const p = balloonProfile({ height: 1 });
    expect(p[0].x).toBeCloseTo(0, 6);
    expect(p[0].y).toBeCloseTo(0, 6);
    expect(p[p.length - 1].x).toBeCloseTo(0, 6);
    expect(p[p.length - 1].y).toBeCloseTo(1, 6);
  });

  it('never goes negative or non-finite, under any setting', () => {
    for (const o of [{}, { belly: 0 }, { belly: 1 }, { neck: 0 }, { neck: 1 }, { crown: 0 },
                     { crown: 1 }, { knot: 0 }, { width: 0.1 }, { width: 2 }]) {
      for (const v of balloonProfile(o)) {
        expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
        expect(v.x).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('rises monotonically, so the lathe cannot fold back on itself', () => {
    const p = balloonProfile({ height: 1 });
    for (let i = 1; i < p.length; i++) expect(p[i].y).toBeGreaterThanOrEqual(p[i - 1].y - 1e-9);
  });

  /* ⚠️ A BALLOON IS WIDEST ABOVE ITS MIDDLE, and that is the whole difference between a balloon and
     an egg standing on its end. `belly` is where, and it has to actually move the widest point —
     a profile that ignored it would still render something plausible. */
  it('puts the widest point where belly says, above the middle by default', () => {
    expect(widest(balloonProfile({ height: 1 })).y).toBeGreaterThan(0.5);
    const low  = widest(balloonProfile({ height: 1, belly: 0.3 })).y;
    const high = widest(balloonProfile({ height: 1, belly: 0.8 })).y;
    expect(high).toBeGreaterThan(low + 0.2);
  });

  /* The waist has to be narrower than the belly or there is no neck, and the knot has to be the
     widest thing below the waist or there is no knot. Both are what the pick reads against. */
  it('pinches to a neck and keeps a knot below it', () => {
    const p = balloonProfile({ height: 1, neck: 0.2 });
    const maxR = widest(p).x;
    const below = p.filter(v => v.y < 0.25 * 1);
    const waist = Math.min(...below.map(v => v.x));
    expect(waist).toBeLessThan(maxR * 0.5);
    expect(Math.max(...below.map(v => v.x))).toBeGreaterThan(waist);
  });

  /* ⚠️ × HEIGHT, NEVER A WORLD SIZE (INVARIANTS #8). One authored balloon has to suit a 2cm one and
     a 6cm one, and the only way to find that it does not is to build both. */
  it('scales entirely with height', () => {
    const a = balloonProfile({ height: 1 });
    const b = balloonProfile({ height: 3 });
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].x).toBeCloseTo(a[i].x * 3, 5);
      expect(b[i].y).toBeCloseTo(a[i].y * 3, 5);
    }
  });
});

describe('the solid', () => {
  it('builds a closed lathe with no NaN', () => {
    const g = buildBalloon();
    const p = g.getAttribute('position');
    expect(p.count).toBeGreaterThan(500);
    for (let i = 0; i < p.count * 3; i++) expect(Number.isFinite(p.array[i])).toBe(true);
  });

  /* ⚠️ IT STANDS ON ITS KNOT, y = 0 AT THE BOTTOM. That is where a pick goes in, and the element
     stick measures from the piece's own bounds — an origin in the middle would bury half the
     balloon. */
  it('sits with its base at the origin', () => {
    const g = buildBalloon({ height: 2 });
    g.computeBoundingBox();
    expect(g.boundingBox.min.y).toBeCloseTo(0, 5);
    expect(g.boundingBox.max.y).toBeCloseTo(2, 5);
  });

  it('is as wide as width says', () => {
    const g = buildBalloon({ height: 1, width: 0.8 });
    g.computeBoundingBox();
    expect(g.boundingBox.max.x * 2).toBeCloseTo(0.8, 1);
  });

  it('carries no world dimension in its defaults', () => {
    expect(BALLOON_DEFAULTS.height).toBe(1);
  });
});
