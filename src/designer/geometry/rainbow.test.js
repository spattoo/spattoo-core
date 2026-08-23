import { describe, it, expect } from 'vitest';
import {
  RAINBOW_DEFAULTS, rainbowBands, rainbowGuide, bandRadius, bandPath, legFootY, bandGeometry, archCenterX, rainbowBoardReach,
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
  // Asserted against the rope's UNDERSIDE, not its centreline. A path point is the middle of the
  // tube, so a foot placed exactly on the surface buries half a rope in it — which is what the first
  // version did, and it read as the rainbow being pushed into the icing.
  it('a leg to the board RESTS on it, however tall the cake', () => {
    for (const topY of [0.6, 1.0, 2.4]) {
      const { bands, thickness } = rainbowBands({ footLeft: 'board', footRight: 'board' }, { ...CAKE, topY });
      const underside = Math.min(...bands[0].path.map(p => p.y)) - thickness / 2;
      expect(underside).toBeCloseTo(CAKE.boardY, 6);
    }
  });

  it('a leg to the top rests on the cake instead', () => {
    const { bands, thickness } = rainbowBands({ footLeft: 'top', footRight: 'top', spring: 1.3 }, CAKE);
    const underside = Math.min(...bands[0].path.map(p => p.y)) - thickness / 2;
    expect(underside).toBeCloseTo(CAKE.topY, 6);
  });

  it('nothing dips BELOW the surface it stands on', () => {
    for (const feet of [['board', 'board'], ['top', 'top'], ['top', 'board']]) {
      const { bands, thickness } = rainbowBands({ footLeft: feet[0], footRight: feet[1] }, CAKE);
      const lowest = Math.min(...bands.flatMap(b => b.path.map(p => p.y))) - thickness / 2;
      expect(lowest, `${feet.join('/')} sinks into the board`).toBeGreaterThanOrEqual(CAKE.boardY - 1e-6);
    }
  });

  it('with no legs it is a bare arch — nothing hangs below the springing point', () => {
    // Asserted against the springing point the model REPORTS, not against the cake top. It used to
    // say topY, because the arch was pinned there — which is what made it straddle the cake like a
    // cage instead of standing behind it.
    const { bands, archY } = rainbowBands({ footLeft: 'none', footRight: 'none' }, CAKE);
    expect(legFootY('none', CAKE)).toBe(null);
    expect(Math.min(...bands[0].path.map(p => p.y))).toBeCloseTo(archY, 6);
  });

  // ── The shape everybody actually means ──────────────────────────────────────────────────────
  // Springs off the cake top on one side, arcs over, sweeps down past the edge to the board on the
  // other. A single leg setting could only ever be symmetric, so this was unreachable — the arch
  // either straddled the cake or perched on it, and neither is the reference.
  it('lands one foot on the cake and the other on the board', () => {
    const { bands, thickness } = rainbowBands({ footLeft: 'top', footRight: 'board' }, CAKE);
    const left  = bands[0].path[0];
    const right = bands[0].path[bands[0].path.length - 1];
    expect(left.y  - thickness / 2).toBeCloseTo(CAKE.topY, 6);
    expect(right.y - thickness / 2).toBeCloseTo(CAKE.boardY, 6);
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
  });

  it('and the other way round, without the shape changing', () => {
    const a = rainbowBands({ footLeft: 'top', footRight: 'board' }, CAKE).bands[0].path;
    const b = rainbowBands({ footLeft: 'board', footRight: 'top' }, CAKE).bands[0].path;
    expect(a[0].y).toBeCloseTo(b[b.length - 1].y, 6);
    expect(a[a.length - 1].y).toBeCloseTo(b[0].y, 6);
  });

  it('one leg only — the other side simply ends where the arc does', () => {
    const { bands, thickness } = rainbowBands({ footLeft: 'none', footRight: 'board', spring: 1 }, CAKE);
    const path = bands[0].path;
    expect(path[path.length - 1].y - thickness / 2).toBeCloseTo(CAKE.boardY, 6);
    expect(path[0].y).toBeGreaterThan(CAKE.boardY);
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
    const pts = bandPath({ radius: 2, archY: 1, footLeftY: 0, footRightY: 0 });
    const foot = pts[0], firstArc = pts[1];
    expect(foot.x).toBeCloseTo(firstArc.x, 6);   // straight up, no kink sideways
    expect(foot.y).toBeLessThan(firstArc.y);
  });

  it('spans the full half-circle, left to right', () => {
    const pts = bandPath({ radius: 2, archY: 1, footLeftY: null, footRightY: null });
    expect(pts[0].x).toBeCloseTo(-2, 6);
    expect(pts[pts.length - 1].x).toBeCloseTo(2, 6);
    expect(Math.max(...pts.map(p => p.y))).toBeCloseTo(3, 6);   // archY + radius
  });

  it('is flat in Z — a rainbow is a plane, not a spiral', () => {
    const pts = bandPath({ radius: 2, archY: 1, footLeftY: 0, footRightY: 0, standoff: 1.4 });
    expect(pts.every(p => p.z === pts[0].z)).toBe(true);
  });
});

// ── It stands BEHIND the cake ───────────────────────────────────────────────────────────────────
// The first render straddled the cake: arch overhead, a leg planted either side, the cake sitting
// inside it like a hoop. No real cake does that — the rainbow is a backdrop. Two things were wrong,
// and both were assumptions I had baked in rather than authored.
describe('where it stands', () => {
  it('is set back from the cake, not centred on it', () => {
    const { bands, standoff } = rainbowBands({}, CAKE);
    expect(standoff).toBeGreaterThan(0);
    expect(bands.every(b => b.path.every(p => p.z === standoff))).toBe(true);
  });

  it('sets back in proportion, so a wider cake is cleared by the same margin', () => {
    const a = rainbowBands({}, { ...CAKE, radius: 1 }).standoff;
    const b = rainbowBands({}, { ...CAKE, radius: 2 }).standoff;
    expect(b).toBeCloseTo(a * 2, 6);
  });

  it('can still be centred, for an arch that sits ON the cake', () => {
    expect(rainbowBands({ standoff: 0 }, CAKE).standoff).toBe(0);
  });

  it('springs partway up the cake, not from its top', () => {
    // Both feet on the BOARD. With a foot resting on the cake top the springing point is clamped up
    // to meet it, which is correct and is what this used to be accidentally measuring.
    const { archY } = rainbowBands({ spring: 0.6, footLeft: 'board', footRight: 'board' }, CAKE);
    expect(archY).toBeGreaterThan(CAKE.boardY);
    expect(archY).toBeLessThan(CAKE.topY);
  });

  it('measures the springing point against the CAKE, so a taller one lifts it', () => {
    const short = rainbowBands({ spring: 0.6, footLeft: 'board', footRight: 'board' }, { ...CAKE, topY: 1.0 }).archY;
    const tall  = rainbowBands({ spring: 0.6, footLeft: 'board', footRight: 'board' }, { ...CAKE, topY: 2.8 }).archY;
    expect(tall).toBeGreaterThan(short);
  });

  it('never springs below the HIGHER foot — the short side would have to bend down to reach it', () => {
    const { archY, footLeftY, footRightY } = rainbowBands({ spring: 0, footLeft: 'top', footRight: 'board' }, CAKE);
    expect(archY).toBeGreaterThanOrEqual(Math.max(footLeftY, footRightY));
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

// ── A foot on the cake has to land ON the cake ──────────────────────────────────────────────────
// The first asymmetric render got the SHAPE right and left the resting feet hanging in mid-air: a
// centred arch is wider than the cake, so a foot stopping at cake-top height stops beside it, not on
// it. The arch has to lean toward the board side.
describe('where the resting foot lands', () => {
  const ON_CAKE = { footLeft: 'top', footRight: 'board' };

  it('puts every foot that rests on the cake WITHIN the cake', () => {
    const { bands } = rainbowBands(ON_CAKE, CAKE);
    for (const b of bands) {
      const foot = b.path[0];
      expect(foot.y).toBeGreaterThan(CAKE.topY);   // resting ON it, so above by half a rope
      expect(Math.abs(foot.x), `band ${b.index} rests ${foot.x.toFixed(2)} out, past a ${CAKE.radius} cake`)
        .toBeLessThanOrEqual(CAKE.radius + 1e-6);
    }
  });

  it('and pushes the descending leg clear of the cake, onto the board', () => {
    const { bands } = rainbowBands(ON_CAKE, CAKE);
    for (const b of bands) {
      const foot = b.path[b.path.length - 1];
      expect(foot.y).toBeGreaterThan(CAKE.boardY);
      expect(Math.abs(foot.x), `band ${b.index} comes down THROUGH the cake`).toBeGreaterThan(CAKE.radius);
    }
  });

  it('mirrors when the resting foot is the other one', () => {
    const a = rainbowBands({ footLeft: 'top', footRight: 'board' }, CAKE).centerX;
    const b = rainbowBands({ footLeft: 'board', footRight: 'top' }, CAKE).centerX;
    expect(b).toBeCloseTo(-a, 6);
  });

  it('does not lean at all when both feet land the same way', () => {
    expect(rainbowBands({ footLeft: 'board', footRight: 'board' }, CAKE).centerX).toBe(0);
    expect(rainbowBands({ footLeft: 'top', footRight: 'top' }, CAKE).centerX).toBe(0);
    expect(archCenterX({ footLeftY: 1, footRightY: 1, outerRadius: 2, cakeRadius: 1, topY: 1 })).toBe(0);
  });

  it('an explicit offsetX overrides the derivation, for a look nobody predicted', () => {
    expect(rainbowBands({ ...ON_CAKE, offsetX: 0 }, CAKE).centerX).toBe(0);
  });
});

// ── The board has to be big enough to stand it on ───────────────────────────────────────────────
// A board sized for the cake alone is not a board for a cake with a rainbow leaning off it: the
// descending leg lands outside the tier, and on a standard board it lands outside the board too —
// a decoration resting on nothing. The cake's furniture answers to what is standing on it, the same
// way the arch answers to the cake's height.
describe('rainbowBoardReach', () => {
  it('covers the furthest foot, not just the cake', () => {
    const reach = rainbowBoardReach({ footLeft: 'top', footRight: 'board' }, CAKE);
    expect(reach).toBeGreaterThan(CAKE.radius);
  });

  it('covers every point of every band, including the rope\'s own width', () => {
    const params = { footLeft: 'top', footRight: 'board' };
    const { bands, thickness } = rainbowBands(params, CAKE);
    const far = Math.max(...bands.flatMap(b => b.path.map(p => Math.abs(p.x))));
    expect(rainbowBoardReach(params, CAKE, 0)).toBeGreaterThanOrEqual(far + thickness / 2 - 1e-9);
  });

  it('grows with the cake, like everything else here', () => {
    const small = rainbowBoardReach({}, { ...CAKE, radius: 1 });
    const big   = rainbowBoardReach({}, { ...CAKE, radius: 2 });
    expect(big).toBeGreaterThan(small);
  });

  it('accounts for how far BACK it stands, not only how far out', () => {
    const near = rainbowBoardReach({ standoff: 0 }, CAKE, 0);
    const far  = rainbowBoardReach({ standoff: 3 }, CAKE, 0);
    expect(far).toBeGreaterThan(near);
  });
});
