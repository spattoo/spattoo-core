import { describe, it, expect } from 'vitest';
import { brushRelief, brushLoad, buildBrushStrokeOnWall, buildBrushStrokeOnFlat, strokeFacesOutward,
         BRUSH_ON_CAKE_DEFAULTS } from './brushStrokeOnCake.js';

const WALL = { R: 1, baseY: 0, wallH: 1 };
const SWEEP = [[0.00, 0.30], [0.06, 0.42], [0.13, 0.50], [0.20, 0.55]];

/* How far the stroke stands off the wall at its highest point — the thing `weight` is supposed to
   move, measured off the built geometry rather than off the parameter that set it. */
function maxLift(geo, R = 1) {
  const pos = geo.attributes.position;
  let hi = 0;
  for (let v = 0; v < pos.count; v++) {
    hi = Math.max(hi, Math.hypot(pos.getX(v), pos.getZ(v)) - R);
  }
  return hi;
}

describe('brushRelief — raised edges, scraped middle', () => {
  /* ⚠️ NOT A DOME. A piping bag makes a hump; a spatula pushes the cream OUT to its edges and leaves
     the middle thinnest. Reading one for the other is what made our first palette-knife petals look
     piped (see palette-knife-petals-are-pressed-not-piped). */
  it('is higher just inside each edge than it is in the middle', () => {
    const mid = brushRelief(0.5);
    expect(brushRelief(0.18)).toBeGreaterThan(mid);
    expect(brushRelief(0.82)).toBeGreaterThan(mid);
  });

  /* ⚠️ AND IT REACHES ZERO AT BOTH EDGES, or the stroke ends in a vertical cliff — a sticker cut out
     and laid on, rather than cream pushed across. */
  it('meets the cake at both edges', () => {
    expect(brushRelief(0)).toBe(0);
    expect(brushRelief(1)).toBe(0);
  });

  it('a scraped middle is still cream — it does not pinch through to nothing', () => {
    expect(brushRelief(0.5)).toBeGreaterThan(0.2);
  });
});

describe('brushLoad — the knife lands full and runs dry', () => {
  it('is blunt at the start and thin at the lift', () => {
    expect(brushLoad(0.1)).toBeGreaterThan(0.9);
    expect(brushLoad(0.99)).toBeLessThan(0.1);
  });
});

describe('a stroke on the wall', () => {
  it('builds, and refuses a gesture too short to be one', () => {
    expect(buildBrushStrokeOnWall({ ...WALL, path: SWEEP })).toBeTruthy();
    expect(buildBrushStrokeOnWall({ ...WALL, path: [[0, 0.5]] })).toBeNull();
    expect(buildBrushStrokeOnWall({ ...WALL, path: [] })).toBeNull();
  });

  /* ⚠️ THE ASK, AS ONE NUMBER. Sandeep: "if its a thick stroke edges have elevation, if its a
     lighter stroke, it just merges with the cake surface without elevation." */
  it('weight is what decides whether it stands proud or merges', () => {
    const heavy = maxLift(buildBrushStrokeOnWall({ ...WALL, path: SWEEP, weight: 1 }));
    const light = maxLift(buildBrushStrokeOnWall({ ...WALL, path: SWEEP, weight: 0 }));
    expect(heavy).toBeGreaterThan(BRUSH_ON_CAKE_DEFAULTS.lift * 0.5);
    expect(light).toBeLessThan(BRUSH_ON_CAKE_DEFAULTS.lift * 0.15);
    expect(light).toBeGreaterThan(0);          // still off the wall, or it z-fights
  });

  it('every size of cake gets the same stroke, in proportion', () => {
    const small = maxLift(buildBrushStrokeOnWall({ R: 0.5, baseY: 0, wallH: 0.5, path: SWEEP, weight: 1 }), 0.5);
    const big   = maxLift(buildBrushStrokeOnWall({ R: 2,   baseY: 0, wallH: 2,   path: SWEEP, weight: 1 }), 2);
    expect(big / small).toBeCloseTo(4, 1);
  });

  it('sits ON the wall — every vertex is at or just outside the tier', () => {
    const geo = buildBrushStrokeOnWall({ ...WALL, path: SWEEP, weight: 1 });
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const r = Math.hypot(pos.getX(v), pos.getZ(v));
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThan(1 + BRUSH_ON_CAKE_DEFAULTS.lift * 1.2);
    }
  });

  it('is deterministic — the same stroke comes back after a reload', () => {
    const a = buildBrushStrokeOnWall({ ...WALL, path: SWEEP, seed: 4 });
    const b = buildBrushStrokeOnWall({ ...WALL, path: SWEEP, seed: 4 });
    expect([...a.attributes.position.array]).toEqual([...b.attributes.position.array]);
    const c = buildBrushStrokeOnWall({ ...WALL, path: SWEEP, seed: 9 });
    expect([...c.attributes.position.array]).not.toEqual([...a.attributes.position.array]);
  });

  /* The torn tip is the random bit he asked for: "randomness in the edge spikes where we leave the
     stroke". Two seeds must disagree at the END far more than at the start. */
  it('the lift-off end is where the randomness lives', () => {
    const ends = s => {
      const g = buildBrushStrokeOnWall({ ...WALL, path: SWEEP, seed: s, weight: 1 });
      const pos = g.attributes.position, last = [];
      for (let v = pos.count - 11; v < pos.count; v++) last.push(pos.getY(v));
      return last;
    };
    const a = ends(3), b = ends(8);
    expect(a.some((y, i) => Math.abs(y - b[i]) > 1e-6)).toBe(true);
  });
});

describe('a stroke on a flat surface', () => {
  it('lies on the plane it was given', () => {
    const geo = buildBrushStrokeOnFlat({ R: 1, y: 0.7, path: [[-0.5, 0], [0, 0.1], [0.5, 0.05]], weight: 1 });
    const pos = geo.attributes.position;
    let lo = Infinity, hi = -Infinity;
    for (let v = 0; v < pos.count; v++) { lo = Math.min(lo, pos.getY(v)); hi = Math.max(hi, pos.getY(v)); }
    expect(lo).toBeGreaterThanOrEqual(0.7);
    expect(hi).toBeLessThan(0.7 + BRUSH_ON_CAKE_DEFAULTS.lift * 1.2);
  });
});

/* ⚠️ THE FAULT THAT IS INVISIBLE EVERY OTHER WAY. Wound the wrong way round, a stroke has correct
   vertices, correct measurements, a passing suite — and is not drawn at all, because its faces point
   into the cake and are culled. A full-weight stroke dead in front of the camera rendered as nothing
   and I went looking for a width bug. */
describe('winding', () => {
  it('a stroke on the wall faces the viewer, not the cake', () => {
    expect(strokeFacesOutward(buildBrushStrokeOnWall({ ...WALL, path: SWEEP, weight: 1 }))).toBe(true);
  });
});
