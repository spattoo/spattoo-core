import { describe, it, expect } from 'vitest';
import { SPIRAL_DEFAULTS, spiralField, makeSwirlField } from './topSpiral.js';
import { buildTopSurface, buildTopCavity } from './topCavity.js';

const ROUND = { kind: 'round', radius: 1.1 };
const H = 1.0;

/* Every y in a geometry, and the extremes of them. */
function ys(geo) {
  const p = geo.attributes.position.array;
  const out = [];
  for (let i = 1; i < p.length; i += 3) out.push(p[i]);
  return out;
}

describe('the spiral field', () => {
  it('never lifts the surface — a knife takes cream away', () => {
    const f = spiralField({}, 1, H);
    for (let r = 0; r <= 1; r += 0.02)
      for (let a = 0; a < 6.28; a += 0.3)
        expect(f(r * Math.cos(a), r * Math.sin(a))).toBeLessThanOrEqual(1e-9);
  });

  it('cuts to the full depth somewhere, so the groove is actually there', () => {
    const depth = 0.02;
    const f = spiralField({ depth, wander: 0 }, 1, H);
    let deepest = 0;
    for (let r = 0; r <= 1; r += 0.005) deepest = Math.min(deepest, f(r, 0));
    /* The fade near the rim means the deepest point is inland, but it must reach essentially all
       the way down somewhere or `depth` is not the depth. */
    expect(deepest).toBeLessThan(-depth * H * 0.9);
  });

  it('goes flat at the outer edge, so the groove never notches the rim', () => {
    const f = spiralField({ depth: 0.02, wander: 0 }, 1, H);
    for (let a = 0; a < 6.28; a += 0.2)
      expect(Math.abs(f(Math.cos(a), Math.sin(a)))).toBeLessThan(1e-9);
  });

  it('crosses `turns` grooves between the middle and the edge', () => {
    for (const turns of [3, 4, 7]) {
      const f = spiralField({ turns, depth: 0.02, wander: 0, fade: 0.001 }, 1, H);
      /* Count sign changes in the slope along one radius: one minimum per turn. */
      let prev = null, dips = 0;
      let last = f(0.0005, 0);
      for (let r = 0.001; r <= 1; r += 0.0005) {
        const v = f(r, 0);
        const slope = Math.sign(v - last);
        if (slope !== 0 && prev !== null && slope !== prev) dips++;
        if (slope !== 0) prev = slope;
        last = v;
      }
      /* Peaks and troughs alternate, so turning points ≈ 2 per turn; allow the end conditions. */
      expect(Math.round(dips / 2)).toBeGreaterThanOrEqual(turns - 1);
      expect(Math.round(dips / 2)).toBeLessThanOrEqual(turns + 1);
    }
  });

  /* ⚠️ THE ONE THING IT CANNOT BE. The cavity beside it shipped a machined torus and came back as
     "it looks like a regular uniform elevation"; the same mistake is available here as a set of
     perfect circles. Measured as: at one radius, the depth must differ around the cake. */
  it('is not a set of perfect circles', () => {
    const f = spiralField({ depth: 0.02 }, 1, H);
    const r = 0.5;
    const at = [];
    for (let a = 0; a < 6.28; a += 0.05) at.push(f(r * Math.cos(a), r * Math.sin(a)));
    const spread = Math.max(...at) - Math.min(...at);
    expect(spread).toBeGreaterThan(0.02 * H * 0.15);
  });

  /* ⚠️ THE CONTROL, AND THE FIRST VERSION OF IT WAS WRONG IN A WAY WORTH KEEPING. It asserted that
     with `wander: 0` the depth barely varies around a fixed radius — as if the grooves were rings.
     They are not: one continuous groove climbing outward crosses a whole turn per revolution, so at
     any radius it sweeps its full depth with angle, wander or no wander. That is what makes it a
     spiral rather than a stack of circles. The control that actually isolates the wander is whether
     the RINGS THEMSELVES move — measured as where the groove falls, not how deep it is. */
  it('with wander off, the grooves land at the same radius all the way round — the control', () => {
    const trough = f => {
      /* The radius of the first groove along a given angle. */
      return a => {
        let best = 0, bestV = Infinity;
        for (let r = 0.05; r < 0.8; r += 0.002) {
          const v = f(r * Math.cos(a), r * Math.sin(a));
          if (v < bestV) { bestV = v; best = r; }
        }
        return best;
      };
    };
    const spread = f => {
      const at = [];
      for (let a = 0; a < 6.28; a += 0.2) at.push(trough(f)(a));
      return Math.max(...at) - Math.min(...at);
    };
    const straight = spread(spiralField({ depth: 0.02, wander: 0, fade: 0.001 }, 1, H));
    const wandered = spread(spiralField({ depth: 0.02, fade: 0.001 }, 1, H));
    expect(wandered).toBeGreaterThan(straight);
  });

  it('every default sits strictly inside any range a control would offer', () => {
    expect(SPIRAL_DEFAULTS.turns).toBeGreaterThan(2);
    expect(SPIRAL_DEFAULTS.turns).toBeLessThan(10);
    expect(SPIRAL_DEFAULTS.depth).toBeGreaterThan(0);
    expect(SPIRAL_DEFAULTS.wander).toBeGreaterThan(0);
  });

  it('is the same field the piped lid has always used', async () => {
    const wall = await import('./creamWall.js');
    expect(wall.makeSwirlField).toBe(makeSwirlField);
  });
});

describe('the top surface carries both, or either, or neither', () => {
  it('draws nothing when neither is chosen', () => {
    expect(buildTopSurface(ROUND, H, {})).toBeNull();
  });

  it('draws the spiral with no rim at all', () => {
    const g = buildTopSurface(ROUND, H, { spiral: { depth: 0.02 } });
    expect(g).not.toBeNull();
    const v = ys(g);
    expect(Math.max(...v) - Math.min(...v)).toBeGreaterThan(0.01);
  });

  it('draws the rim with no spiral', () => {
    const g = buildTopSurface(ROUND, H, { cavity: {} });
    expect(g).not.toBeNull();
    expect(Math.max(...ys(g))).toBeGreaterThan(0);
  });

  /* ⚠️ THE FAILURE THIS WHOLE SURFACE WAS RESHAPED AROUND. The floor used to sit at -dish, below
     y = 0, which is inside the tier and behind its own opaque cap: `dish=0.0001` and `dish=0.30`
     rendered as the same picture for as long as the feature existed. Nothing may go below zero. */
  it('never dips below the cake it sits on', () => {
    for (const opts of [{ cavity: {} }, { spiral: {} }, { cavity: {}, spiral: {} },
                        { cavity: { dish: 0.3 } }, { cavity: {}, spiral: { depth: 0.05 } }]) {
      const g = buildTopSurface(ROUND, H, opts);
      expect(Math.min(...ys(g))).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it('a deeper dish actually changes the surface', () => {
    const shallow = ys(buildTopSurface(ROUND, H, { cavity: { dish: 0.001 } }));
    const deep = ys(buildTopSurface(ROUND, H, { cavity: { dish: 0.20 } }));
    expect(Math.max(...deep) - Math.max(...shallow)).toBeGreaterThan(0.05);
  });

  it('the spiral only adds triangles when it is asked for', () => {
    const plain = buildTopSurface(ROUND, H, { cavity: {} }).attributes.position.count;
    const swirled = buildTopSurface(ROUND, H, { cavity: {}, spiral: {} }).attributes.position.count;
    expect(swirled).toBeGreaterThan(plain * 5);
  });

  const RECT = { kind: 'rect', halfW: 1.25, halfD: 0.85, cornerR: 0.2 };

  it('walks a rectangle as happily as a circle', () => {
    const g = buildTopSurface(RECT, H, { cavity: {}, spiral: {} });
    expect(g).not.toBeNull();
    expect(ys(g).every(Number.isFinite)).toBe(true);
  });

  /* ⚠️ A TURNTABLE CANNOT SPIN A RECTANGLE. The mark is made by the cake going round under a still
     knife, so no sheet cake has one — and forced onto a rectangle it reads as made-up as well as
     being wrong: `rOut` becomes the corner distance, so the rings never reach the long sides and a
     coil sits marooned in the middle. The scraped RIM has no such limit: a scraper walks any edge. */
  it('leaves the spiral off a sheet cake, and keeps the rim on it', () => {
    const rect = buildTopSurface(RECT, H, { cavity: {}, spiral: {} });
    const rectNoSpiral = buildTopSurface(RECT, H, { cavity: {} });
    expect(rect.attributes.position.count).toBe(rectNoSpiral.attributes.position.count);

    const round = buildTopSurface(ROUND, H, { cavity: {}, spiral: {} });
    expect(round.attributes.position.count).toBeGreaterThan(rect.attributes.position.count);
  });

  it('draws nothing for a spiral alone on a sheet cake, rather than a flat sheet', () => {
    expect(buildTopSurface(RECT, H, { spiral: {} })).toBeNull();
  });

  it('buildTopCavity is still the rim on its own', () => {
    const a = ys(buildTopCavity(ROUND, H, {}));
    const b = ys(buildTopSurface(ROUND, H, { cavity: {} }));
    expect(a.length).toBe(b.length);
  });
});
