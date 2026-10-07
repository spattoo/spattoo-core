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

/* ── The collar is a rim, not a bump ──────────────────────────────────────────────────────────────
 *
 * Sandeep, against the photograph: *"there is a small ring below the balloon in the reference image
 * - i dont see it in our case."* Zoomed, it is a short flat-ended cylinder lying across the bottom
 * of each balloon, wider than the stick. A hemisphere — which is what was there — reads as a bump
 * and disappears at the size a balloon is actually seen at.
 *
 * What makes it read is the STRAIGHT WALL: two corners catching the light rather than one curve.
 * These pin that, because "round it off a bit" is exactly the tidy-up that would undo it.
 */
describe('the collar', () => {
  const at = (p, y) => p.filter(v => Math.abs(v.y - y) < 1e-6).map(v => v.x);

  it('stands on a flat base rather than closing to a point', () => {
    const p = balloonProfile({ height: 1, knot: 0.1, collar: 0.06 });
    expect(at(p, 0).length).toBeGreaterThanOrEqual(2);     // axis AND rim at y = 0: a flat disc
    expect(Math.max(...at(p, 0))).toBeCloseTo(0.1, 6);
  });

  /* ⚠️ A STRAIGHT WALL, so the rim has corners. Two samples at the same radius and different
     heights is what that means geometrically. */
  it('runs straight up before stepping back in', () => {
    const p = balloonProfile({ height: 1, knot: 0.1, collar: 0.06 });
    const onRim = p.filter(v => Math.abs(v.x - 0.1) < 1e-6);
    expect(onRim.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...onRim.map(v => v.y))).toBeCloseTo(0.06, 6);
  });

  it('is wider than the waist, or it is not a rim at all', () => {
    const p = balloonProfile({ height: 1, knot: 0.1, collar: 0.06, neck: 0.17 });
    const waist = Math.min(...p.filter(v => v.y > 0.07 && v.y < 0.3).map(v => v.x));
    expect(0.1).toBeGreaterThan(waist);
  });

  it('disappears cleanly at 0, which is the shape this started as', () => {
    const p = balloonProfile({ height: 1, collar: 0 });
    for (const v of p) expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
    expect(p.filter(v => Math.abs(v.y) < 1e-6).length).toBeGreaterThanOrEqual(2);
  });
});

import { movableContract } from './movableContract.js';
import { BALLOON_PLACEMENT_DEFAULTS, balloonPlacement, balloonHandleAt, balloonDragTo } from './balloon.js';

const CAKE = { radius: 1.2, topY: 1.5, boardY: 0.1 };

/* ⚠️ REGISTERED, AND THE GATE CHECKS THE REGISTRATION RATHER THAN THE BEHAVIOUR. `check:movable`
 * reads PROCEDURAL_TOOLS and fails the build if a movable tool has none — and the suite below is
 * what makes the registration worth having. Laws 2, 3 and 5 are what it can ask; 1 and 4 are claims
 * about the renderer and are mine to keep. */
movableContract('balloon', {
  positionKeys: ['theta', 'standoff'],
  cases: [{
    label: 'on the cake top, on its pick',
    params: { ...BALLOON_PLACEMENT_DEFAULTS },
    cake: CAKE,
    freedoms: [
      /* ⚠️ NO 1 IN THE ROUND TARGETS. On a circle u = 0 and u = 1 are the SAME PLACE, so offering
         both asks the drag to reach one spot twice — and the contract rightly reported seven
         targets collapsing to six, and a round trip that answered 0 for 1. The geometry was
         correct and the test was asking a nonsense question. */
      { label: 'round the cake', drag: (p, c, t) => balloonDragTo(p, c, t, 0.42),
        targets: [0, 0.125, 0.25, 0.5, 0.75, 0.9] },
      { label: 'out to the rim', drag: (p, c, t) => balloonDragTo(p, c, 0.3, t),
        targets: [0, 0.25, 0.5, 0.75, 1] },
    ],
  }],
  // The balloon's own base, which is the point a drag is supposed to move and nothing else.
  pointsOf: (p, c) => {
    const { position } = balloonPlacement(p, c);
    return [{ x: position[0], y: position[1], z: position[2] }];
  },
  /* Law 5: the handle and the drag are exact inverses — asked, not assumed. The suite CALLS this,
     so it is a function that asserts; supplying the two functions as an object (which reads like
     configuration) throws "roundTrip is not a function" and the law silently never runs. */
  roundTrip: (moved, cake, target, f) => {
    const back = balloonHandleAt(moved, cake);
    expect(f.label === 'out to the rim' ? back.v : back.u).toBeCloseTo(target, 6);
  },
});

describe('where it sits', () => {
  it('rides above the lid, never inside it', () => {
    const { position, footY } = balloonPlacement({}, CAKE);
    expect(position[1]).toBeGreaterThan(CAKE.topY);
    expect(footY).toBe(CAKE.topY);
  });

  it('puts standoff 0 in the middle and 1 at the rim', () => {
    const mid = balloonPlacement({ standoff: 0, theta: 0.7 }, CAKE).position;
    expect(Math.hypot(mid[0], mid[2])).toBeCloseTo(0, 6);
    const rim = balloonPlacement({ standoff: 1, theta: 0.7 }, CAKE).position;
    expect(Math.hypot(rim[0], rim[2])).toBeCloseTo(CAKE.radius, 5);
  });

  /* ⚠️ A DRAG MOVES IT AND NOTHING ELSE (law 3). `tilt` and `scale` are LOOK — a drag that nudged
     the lean would be a decoration that reshapes itself when you move it. */
  it('writes only position keys when dragged', () => {
    const patch = balloonDragTo({ ...BALLOON_PLACEMENT_DEFAULTS }, CAKE, 0.3, 0.8);
    expect(Object.keys(patch).sort()).toEqual(['standoff', 'theta']);
  });
});
