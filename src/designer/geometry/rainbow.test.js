import { describe, it, expect } from 'vitest';
import {
  RAINBOW_DEFAULTS, rainbowBands, rainbowGuide, bandRadius, bandPath, legFootY, bandGeometry,
} from './rainbow.js';

// ── What is worth asserting about a rainbow ─────────────────────────────────────────────────────
// Not that it looks like one — no test can say that, which is what the studio is for. What a test
// CAN pin is the set of properties whose failure is invisible in a still picture and expensive on a
// real cake: that it fits ANY cake (the reason it is not a GLB), that the bands never grow into each
// other, and that the baker's guide is proportional rather than a promise about a size we have not
// seen.

const CAKE = { radius: 1.2, topY: 1.0, boardY: 0.1 };

describe('it fits the cake it is given', () => {
  // The whole reason this is generated instead of modelled. A GLB authored for a single tier is
  // wrong on a stack, and there is no scale factor that fixes it — the legs stretch while the arch
  // must not.
  it('legs reach the board, however tall the cake', () => {
    for (const topY of [0.6, 1.0, 2.4]) {
      const { bands, footY } = rainbowBands({ legs: 'board' }, { ...CAKE, topY });
      expect(footY).toBe(CAKE.boardY);
      const lowest = Math.min(...bands[0].path.map(p => p.y));
      expect(lowest).toBeCloseTo(CAKE.boardY, 6);
    }
  });

  it('sitting ON the cake stops at the top instead', () => {
    const { footY, bands } = rainbowBands({ legs: 'top' }, CAKE);
    expect(footY).toBe(CAKE.topY);
    expect(Math.min(...bands[0].path.map(p => p.y))).toBeCloseTo(CAKE.topY, 6);
  });

  it('with no legs it is a bare arch — nothing hangs below the springing point', () => {
    const { bands } = rainbowBands({ legs: 'none' }, CAKE);
    expect(legFootY('none', CAKE)).toBe(null);
    expect(Math.min(...bands[0].path.map(p => p.y))).toBeCloseTo(CAKE.topY, 6);
  });

  it('every size is a RATIO of the cake, so a wider cake gets a wider rainbow', () => {
    const small = rainbowBands({}, { ...CAKE, radius: 1 });
    const big   = rainbowBands({}, { ...CAKE, radius: 2 });
    expect(big.thickness).toBeCloseTo(small.thickness * 2, 6);
    expect(big.bands[0].radius).toBeCloseTo(small.bands[0].radius * 2, 6);
  });
});

describe('the bands', () => {
  it('never overlap — each sits a full rope plus the gap outside the last', () => {
    const { bands, thickness, gap } = rainbowBands({}, CAKE);
    for (let i = 1; i < bands.length; i++) {
      const clearance = bands[i].radius - bands[i - 1].radius - thickness;
      expect(clearance, `band ${i} grows into ${i - 1}`).toBeCloseTo(gap, 6);
    }
  });

  it('leaves the hole the author asked for', () => {
    const { bands, thickness } = rainbowBands({ innerRadius: 0.5 }, CAKE);
    // The INNER face of the first rope, not its centreline, is what bounds the hole.
    expect(bands[0].radius - thickness / 2).toBeCloseTo(0.5 * CAKE.radius, 6);
  });

  it('wraps the palette rather than running out of colours', () => {
    const { bands } = rainbowBands({ bands: 8 }, CAKE);
    expect(bands).toHaveLength(8);
    expect(bands.every(b => !!b.color)).toBe(true);
    expect(bands[6].color).toBe(RAINBOW_DEFAULTS.colors[0]);
  });

  it('bandRadius counts outwards from the hole', () => {
    const opts = { innerRadius: 1, thickness: 0.2, gap: 0.05 };
    expect(bandRadius(0, opts)).toBeCloseTo(1.1, 6);
    expect(bandRadius(1, opts)).toBeCloseTo(1.35, 6);
  });
});

describe('the path', () => {
  // The join is the thing most likely to look wrong and least likely to fail a test by accident:
  // a semicircle's end tangent is already vertical, so the leg continues it. If the arc were ever
  // built from a different sweep, this is where the crease would appear.
  it('meets the leg tangentially — the arch ends where the leg stands', () => {
    const pts = bandPath({ radius: 2, archY: 1, footY: 0 });
    const foot = pts[0], firstArc = pts[1];
    expect(foot.x).toBeCloseTo(firstArc.x, 6);   // straight up, no kink sideways
    expect(foot.y).toBeLessThan(firstArc.y);
  });

  it('spans the full half-circle, left to right', () => {
    const pts = bandPath({ radius: 2, archY: 1, footY: null });
    expect(pts[0].x).toBeCloseTo(-2, 6);
    expect(pts[pts.length - 1].x).toBeCloseTo(2, 6);
    expect(Math.max(...pts.map(p => p.y))).toBeCloseTo(3, 6);   // archY + radius
  });

  it('is flat in Z — a rainbow is a plane, not a spiral', () => {
    expect(bandPath({ radius: 2, archY: 1, footY: 0 }).every(p => p.z === 0)).toBe(true);
  });
});

describe('the baker\'s guide', () => {
  // The point of the whole exercise. We cannot say "roll a 42 cm rope": the baker bakes the cake
  // they bake, and a millimetre is a promise about a cake we have never seen.
  it('is proportional, so it survives a cake of a different size', () => {
    const small = rainbowGuide({}, { ...CAKE, radius: 1 });
    const big   = rainbowGuide({}, { ...CAKE, radius: 2, topY: 2, boardY: 0.2 });
    for (let i = 0; i < small.length; i++) {
      expect(big[i].thicknessOfCakeWidth).toBeCloseTo(small[i].thicknessOfCakeWidth, 6);
    }
  });

  it('says nothing in millimetres unless a real size is given', () => {
    expect(rainbowGuide({}, CAKE).every(b => b.lengthMm === null)).toBe(true);
  });

  it('derives millimetres last, when an order does pin one', () => {
    const [outerless] = rainbowGuide({ bands: 1 }, CAKE, 100);
    expect(outerless.lengthMm).toBeGreaterThan(0);
    expect(Number.isInteger(outerless.lengthMm)).toBe(true);
  });

  it('an outer band is longer than an inner one — the ropes are not all cut the same', () => {
    const g = rainbowGuide({}, CAKE);
    expect(g[g.length - 1].lengthOfCakeWidth).toBeGreaterThan(g[0].lengthOfCakeWidth);
  });
});

describe('the mesh', () => {
  it('builds a tube per band', () => {
    const { bands } = rainbowBands({}, CAKE);
    const geo = bandGeometry(bands[0]);
    expect(geo.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('flatten squashes the rope in Z without touching its span', () => {
    const { bands } = rainbowBands({}, CAKE);
    const round = bandGeometry(bands[0], { flatten: 0 });
    const flat  = bandGeometry(bands[0], { flatten: 0.8 });
    round.computeBoundingBox(); flat.computeBoundingBox();
    const zOf = g => g.boundingBox.max.z - g.boundingBox.min.z;
    const xOf = g => g.boundingBox.max.x - g.boundingBox.min.x;
    expect(zOf(flat)).toBeLessThan(zOf(round));
    expect(xOf(flat)).toBeCloseTo(xOf(round), 6);
  });
});
