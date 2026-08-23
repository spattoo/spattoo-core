import { describe, it, expect } from 'vitest';
import {
  RAINBOW_DEFAULTS, rainbowBands, rainbowGuide, bandRadius, bandPath, legFootY, bandGeometry, archCenterX, rainbowBoardReach, requiredStandoff, fitOnTopScale, wrapToWall,
  rainbowFootReach,
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
    // Not "left is left of centre": the arch is shifted sideways so its resting foot lands on the
    // cake, so an inner band's resting end can sit right of the middle and still be on the cake.
    // What matters is that one end rests ON it and the other comes down OUTSIDE it.
    expect(Math.abs(left.x)).toBeLessThanOrEqual(CAKE.radius);
    expect(Math.abs(right.x)).toBeGreaterThan(CAKE.radius);
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
  it('is FLAT, at whatever depth it stands', () => {
    // This used to assert the default was set BACK. It is not any more: a rainbow of the reference
    // proportions clears the cake by being wider than it, and standing it back put it at the front
    // of the board with a gap down the side. What is still true is that it is one plane.
    const { bands, standoff } = rainbowBands({ standoff: 0.7 }, CAKE);
    expect(standoff).toBeGreaterThan(0);
    expect(bands.every(b => b.path.every(p => p.z === standoff))).toBe(true);
  });

  it('sets back in proportion, so a wider cake is cleared by the same margin', () => {
    // The WHOLE cake doubles, not just its radius. The reported standoff is now the CLEARED one —
    // pushed back if anything would otherwise be inside the cake — and that depends on the cake's
    // height as much as its width, so scaling one alone is not a scaled cake.
    const a = rainbowBands({}, { radius: 1, topY: 1.0, boardY: 0.1 }).standoff;
    const b = rainbowBands({}, { radius: 2, topY: 2.0, boardY: 0.2 }).standoff;
    expect(b).toBeCloseTo(a * 2, 6);
  });

  it('reports the standoff it ACTUALLY used, not the one it was asked for', () => {
    // A rainbow told to stand closer than it can without cutting through the cake stands where it
    // must. What somebody typed cannot make a decoration pass through the icing.
    const asked = 0.1;
    const { standoff } = rainbowBands({ standoff: asked, footLeft: 'board', footRight: 'board' }, CAKE);
    expect(standoff).toBeGreaterThan(asked * CAKE.radius);
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
  const ON_CAKE = { offsetX: null, footLeft: 'top', footRight: 'board' };

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

  // These two describe the DERIVATION (offsetX: null), which is no longer the default — deriving is
  // what made a size control move the rainbow. It is still worth having for authoring a new shape,
  // so it is still worth testing; it just has to be asked for.
  it('mirrors when the resting foot is the other one', () => {
    const a = rainbowBands({ offsetX: null, footLeft: 'top', footRight: 'board' }, CAKE).centerX;
    const b = rainbowBands({ offsetX: null, footLeft: 'board', footRight: 'top' }, CAKE).centerX;
    expect(b).toBeCloseTo(-a, 6);
  });

  it('does not lean at all when both feet land the same way', () => {
    expect(rainbowBands({ offsetX: null, footLeft: 'board', footRight: 'board' }, CAKE).centerX).toBe(0);
    expect(rainbowBands({ offsetX: null, footLeft: 'top', footRight: 'top' }, CAKE).centerX).toBe(0);
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

// ── Nothing may be INSIDE the cake ──────────────────────────────────────────────────────────────
// The one that kept getting away. Two earlier versions passed every test they had and were visibly
// pushed into the icing, because the tests only ever asked where the FEET were. A rope is a solid
// with a width: its centreline can be clear of the cake while half its body is inside it.
//
// The cake is a cylinder — radius `radius`, from boardY up to topY. A point is inside it when it is
// below the top AND within the footprint. Swept over the whole band, with the rope's own width, at
// every inner radius somebody might drag to.
describe('it never goes into the cake', () => {
  const insideCake = (pt, thickness) =>
    (pt.y - thickness / 2) < CAKE.topY - 1e-6 &&
    Math.hypot(pt.x, pt.z) < CAKE.radius - 1e-6 &&
    (pt.y + thickness / 2) > CAKE.boardY + 1e-6;

  for (const innerRadius of [0.15, 0.3, 0.55, 0.9, 1.2]) {
    it(`stays out of it at inner radius ${innerRadius}`, () => {
      for (const feet of [['top', 'board'], ['board', 'board'], ['top', 'top'], ['board', 'top']]) {
        const params = { innerRadius, footLeft: feet[0], footRight: feet[1] };
        const { bands, thickness } = rainbowBands(params, CAKE);
        for (const b of bands) {
          for (const pt of b.path) {
            expect(insideCake(pt, thickness),
              `${feet.join('/')} band ${b.index} is inside the cake at (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}, ${pt.z.toFixed(2)})`)
              .toBe(false);
          }
        }
      }
    });
  }

  it('stays out of it however low the arch is asked to spring', () => {
    for (const spring of [0, 0.3, 0.6, 1]) {
      const { bands, thickness } = rainbowBands({ spring, innerRadius: 0.25 }, CAKE);
      for (const b of bands) for (const pt of b.path) {
        expect(insideCake(pt, thickness), `spring ${spring} put band ${b.index} in the cake`).toBe(false);
      }
    }
  });

  it('a rainbow standing well BEHIND the cake may still spring low — it is not over it', () => {
    // The backdrop look. Clearing the cake is about the footprint, not about height, so this must
    // not be "lift everything above the cake" — that would flatten reference 1.
    const { archY } = rainbowBands({ spring: 0.5, standoff: 2, footLeft: 'board', footRight: 'board' }, CAKE);
    expect(archY).toBeLessThan(CAKE.topY);
  });
});

// ── The default has to LOOK like the reference ──────────────────────────────────────────────────
// Every earlier version was reachable by dragging sliders and wrong when it opened, which is the
// only state most people will ever see. The defaults are read off the reference photos: a tight hole
// under fat ropes, sitting on the cake's centre line, legs coming down beside it near enough to
// touch. These assertions are what "looks right" decomposes into.
describe('the default rainbow', () => {
  it('sits on the cake\'s centre line, not behind it', () => {
    // It was 0.9 back, which put it at the FRONT of the board with a gap down the side. Standing
    // back was compensating for an arch too shallow to clear the cake any other way.
    expect(RAINBOW_DEFAULTS.standoff).toBe(0);
    expect(rainbowBands({}, CAKE).standoff).toBe(0);   // and nothing pushes it back
  });

  it('brings its descending legs down beside the cake, nearly touching', () => {
    const { bands, thickness, centerX } = rainbowBands({}, CAKE);
    const face = centerX + bands[0].radius - thickness / 2;   // inner face of the innermost leg
    expect(face).toBeGreaterThan(CAKE.radius);                // outside — it does not cut in
    expect(face - CAKE.radius).toBeLessThan(thickness);       // and within a rope's width of it
  });

  it('has a tight hole under fat ropes — that is what makes it clear the cake', () => {
    // The stack must be wider than the hole, or the arch is a shallow hoop that can only miss the
    // cake by standing behind it.
    const stack = RAINBOW_DEFAULTS.bands * (RAINBOW_DEFAULTS.thickness + RAINBOW_DEFAULTS.gap);
    expect(stack).toBeGreaterThan(RAINBOW_DEFAULTS.innerRadius);
  });

  it('rests its top foot inboard on the cake, not out at the rim', () => {
    const { bands, centerX } = rainbowBands({}, CAKE);
    const rest = Math.abs(centerX - bands[bands.length - 1].radius);
    expect(rest).toBeLessThan(CAKE.radius * 0.6);
  });

  it('stands taller than the cake, so the arch reads above it', () => {
    const { bands, archY } = rainbowBands({}, CAKE);
    expect(archY + bands[bands.length - 1].radius).toBeGreaterThan(CAKE.topY * 1.5);
  });
});

// ── Changing a SIZE must not move it ────────────────────────────────────────────────────────────
// Sandeep: dragging the inner radius walked the rainbow across the cake. It did — position was
// derived from the outer radius, so a smaller hole meant a smaller outer radius meant a different
// centre. Where it stands is the author's decision; a size control has no business changing it.
describe('position is not a function of size', () => {
  it('stays put across the whole inner-radius range', () => {
    const at = ir => rainbowBands({ innerRadius: ir }, CAKE).centerX;
    const base = at(0.30);
    for (const ir of [0.15, 0.20, 0.45, 0.60, 0.9]) {
      expect(at(ir), `inner radius ${ir} moved it`).toBeCloseTo(base, 9);
    }
  });

  it('stays put when the ropes get fatter or the bands multiply', () => {
    const base = rainbowBands({}, CAKE).centerX;
    expect(rainbowBands({ thickness: 0.2 }, CAKE).centerX).toBeCloseTo(base, 9);
    expect(rainbowBands({ bands: 9 }, CAKE).centerX).toBeCloseTo(base, 9);
    expect(rainbowBands({ gap: 0.05 }, CAKE).centerX).toBeCloseTo(base, 9);
  });

  it('and moves only when asked', () => {
    expect(rainbowBands({ offsetX: 0 }, CAKE).centerX).toBe(0);
    expect(rainbowBands({ offsetX: 1 }, CAKE).centerX).toBeCloseTo(CAKE.radius, 9);
  });

  it('can still DERIVE a position, for authoring a new shape', () => {
    // offsetX null asks "put the resting foot here and tell me where that lands the arch" — useful
    // once, when tuning a shape. Not the default, because it is the behaviour that moved things.
    const a = rainbowBands({ offsetX: null, innerRadius: 0.3 }, CAKE).centerX;
    const b = rainbowBands({ offsetX: null, innerRadius: 0.6 }, CAKE).centerX;
    expect(b).toBeGreaterThan(a);
  });
});

// ── An arch standing ON the cake fits ON the cake ───────────────────────────────────────────────
// Both feet on the top is not a rainbow leaning against the cake — it is one standing on it, and a
// foot over the edge is resting on nothing. It hung off the side, because the position and
// proportions were the ones tuned for the leaning version and nothing said the standing one differs.
describe('standing on the cake', () => {
  const ON_TOP = { footLeft: 'top', footRight: 'top' };

  it('keeps every foot within the cake', () => {
    for (const offsetX of [0, 0.4, 0.71, 1.2]) {
      const { bands } = rainbowBands({ ...ON_TOP, offsetX }, CAKE);
      for (const b of bands) {
        for (const end of [b.path[0], b.path[b.path.length - 1]]) {
          expect(Math.hypot(end.x, end.z), `offset ${offsetX}: band ${b.index} hangs off the edge`)
            .toBeLessThanOrEqual(CAKE.radius + 1e-6);
        }
      }
    }
  });

  it('shrinks to fit rather than moving — the position is still the author\'s', () => {
    const asked = 0.71;
    const { centerX, bands } = rainbowBands({ ...ON_TOP, offsetX: asked }, CAKE);
    expect(centerX).toBeCloseTo(asked * CAKE.radius, 9);          // stayed put
    const wide = rainbowBands({ footLeft: 'top', footRight: 'board', offsetX: asked }, CAKE);
    expect(bands[bands.length - 1].radius).toBeLessThan(wide.bands[wide.bands.length - 1].radius);
  });

  it('keeps its proportions while it shrinks', () => {
    const big = rainbowBands({ ...ON_TOP, offsetX: 0 }, CAKE);
    const squeezed = rainbowBands({ ...ON_TOP, offsetX: 0.9 }, CAKE);
    const ratio = b => b.bands[b.bands.length - 1].radius / b.thickness;
    expect(ratio(squeezed)).toBeCloseTo(ratio(big), 6);
  });

  it('still rests its underside on the top after shrinking', () => {
    // The seat is half a rope, and the ropes just got thinner. Working the seat out BEFORE the
    // shrink left the feet hovering above the cake by the difference.
    const { bands, thickness } = rainbowBands({ ...ON_TOP, offsetX: 0.9 }, CAKE);
    expect(Math.min(...bands[0].path.map(p => p.y)) - thickness / 2).toBeCloseTo(CAKE.topY, 6);
  });

  it('leaves a rainbow that already fits completely alone', () => {
    expect(fitOnTopScale({ centerX: 0, standoff: 0, outerRadius: 0.5, cakeRadius: 1.2 })).toBe(1);
  });

  it('does not shrink one that is LEANING — that one is not standing on the cake', () => {
    // The fit only applies to an arch STANDING on the top. A leaning one has a leg on the board, so
    // it is allowed to be wider than the cake — that is how it clears it. Asserted as "the sizes
    // came through untouched", not "the radius exceeds the cake": the radius does not have to, only
    // the FOOT does, and I had written the wrong one.
    const lean = rainbowBands({ footLeft: 'top', footRight: 'board' }, CAKE);
    expect(lean.thickness).toBeCloseTo(RAINBOW_DEFAULTS.thickness * CAKE.radius, 9);
    const foot = lean.bands[0].path[lean.bands[0].path.length - 1];
    expect(Math.hypot(foot.x, foot.z)).toBeGreaterThan(CAKE.radius);
  });
});

// ── Size changes the size and nothing else ──────────────────────────────────────────────────────
// A standing arch is fitted onto the cake, so it can come out small — and the only control for that
// was innerRadius, which changes the PROPORTION. A tighter hole under the same ropes is a different
// rainbow, not a bigger one, so making it bigger needed a control of its own.
describe('scale', () => {
  const LEAN = { footLeft: 'top', footRight: 'board' };

  it('makes it bigger without changing its shape', () => {
    const one = rainbowBands({ ...LEAN, scale: 1 }, CAKE);
    const two = rainbowBands({ ...LEAN, scale: 2 }, CAKE);
    expect(two.thickness).toBeCloseTo(one.thickness * 2, 9);
    for (let i = 0; i < one.bands.length; i++) {
      expect(two.bands[i].radius).toBeCloseTo(one.bands[i].radius * 2, 9);
    }
  });

  it('does not move it, like every other size control here', () => {
    const at = scale => rainbowBands({ ...LEAN, scale }, CAKE).centerX;
    expect(at(2)).toBeCloseTo(at(0.5), 9);
  });

  it('is not the same as changing the inner radius', () => {
    // Both make the outer band smaller; only one keeps the rope-to-hole ratio, and that ratio is
    // what decides whether the thing still reads as a rainbow.
    const ratio = b => b.thickness / b.bands[0].radius;
    expect(ratio(rainbowBands({ ...LEAN, scale: 0.6 }, CAKE)))
      .toBeCloseTo(ratio(rainbowBands({ ...LEAN, scale: 1 }, CAKE)), 6);
    expect(ratio(rainbowBands({ ...LEAN, innerRadius: 0.6 }, CAKE)))
      .not.toBeCloseTo(ratio(rainbowBands({ ...LEAN, innerRadius: 0.3 }, CAKE)), 2);
  });

  it('a STANDING arch stays fitted to the cake however big it is asked to be', () => {
    // Not the control failing: an arch on the cake top is bounded by the cake, and asking for five
    // times the size cannot change what it is standing on.
    const { bands } = rainbowBands({ footLeft: 'top', footRight: 'top', offsetX: 0, scale: 5 }, CAKE);
    for (const b of bands) for (const end of [b.path[0], b.path[b.path.length - 1]]) {
      expect(Math.hypot(end.x, end.z)).toBeLessThanOrEqual(CAKE.radius + 1e-6);
    }
  });
});

// ── It leans either way, for free ───────────────────────────────────────────────────────────────
// Left leg on the board and right foot on the cake, or the other way round. Swapping the feet used
// to leave the arch shifted the wrong way — the falling leg landed at 0.42 on a 1.2 cake, inside it,
// and the clearance rule stepped the whole thing 1.27 backwards to escape. The position is measured
// TOWARD THE FALLING SIDE now, so the mirror costs nothing.
describe('leaning either way', () => {
  const mirror = feet => rainbowBands({ footLeft: feet[0], footRight: feet[1] }, CAKE);

  it('mirrors exactly when the feet are swapped', () => {
    const a = mirror(['top', 'board']).bands[0].path;
    const b = mirror(['board', 'top']).bands[0].path;
    expect(a[0].x).toBeCloseTo(-b[b.length - 1].x, 6);
    expect(a[a.length - 1].x).toBeCloseTo(-b[0].x, 6);
  });

  it('rests on the cake and falls past it, whichever way round', () => {
    for (const feet of [['top', 'board'], ['board', 'top']]) {
      const { bands } = mirror(feet);
      const restIdx = feet[0] === 'top' ? 0 : bands[0].path.length - 1;
      const fallIdx = feet[0] === 'top' ? bands[0].path.length - 1 : 0;
      for (const b of bands) {
        expect(Math.abs(b.path[restIdx].x), `${feet.join('/')}: rest foot off the cake`)
          .toBeLessThanOrEqual(CAKE.radius + 1e-6);
        expect(Math.abs(b.path[fallIdx].x), `${feet.join('/')}: falling leg through the cake`)
          .toBeGreaterThan(CAKE.radius);
      }
    }
  });

  it('is never stepped back in either direction — it clears by being wide', () => {
    for (const feet of [['top', 'board'], ['board', 'top']]) {
      expect(mirror(feet).standoff, `${feet.join('/')} had to step back`).toBe(0);
    }
  });

  it('reads offsetX as a plain position when there is no lean', () => {
    // Both feet alike is not a lean, so the sign stays as written — otherwise a backdrop would flip
    // depending on which foot somebody happened to name first.
    for (const feet of [['board', 'board'], ['top', 'top'], ['none', 'none']]) {
      const { centerX } = rainbowBands({ footLeft: feet[0], footRight: feet[1], offsetX: 0.5 }, CAKE);
      expect(centerX).toBeGreaterThan(0);
    }
  });
});

// ── On the wall, facing front ───────────────────────────────────────────────────────────────────
// The other way a rainbow appears on a cake: laid ON the side, hugging it. Not a flat arch turned
// sideways — against a round cake a flat one touches in the middle and floats at the ends, which is
// the same problem festoon.js bends imported strips to solve.
describe('hugging the side', () => {
  const SIDE = { surface: 'side', footLeft: 'board', footRight: 'board' };

  it('holds every point at the same distance from the axis — that is what hugging is', () => {
    const { bands, cakeRadius, thickness } = rainbowBands(SIDE, CAKE);
    // The CENTRELINE sits half a rope clear of the wall, so the rope's inner face rests on it —
    // the same seat rule the feet follow. It used to be measured to the wall itself, which put
    // half of every rope inside the cake.
    const want = cakeRadius + RAINBOW_DEFAULTS.proud * cakeRadius + thickness / 2;
    for (const b of bands) for (const pt of b.path) {
      expect(Math.hypot(pt.x, pt.z)).toBeCloseTo(want, 6);
    }
  });

  it('sits just proud of the wall, not hovering off it', () => {
    const { bands, cakeRadius, thickness } = rainbowBands(SIDE, CAKE);
    const face = Math.hypot(bands[0].path[0].x, bands[0].path[0].z) - thickness / 2 - cakeRadius;
    expect(face).toBeGreaterThanOrEqual(0);                       // on the wall, not in it
    expect(face).toBeLessThan(RAINBOW_DEFAULTS.thickness * cakeRadius);   // and not hovering
  });

  it('keeps its heights — the wall is vertical, so a foot on the board still is', () => {
    const { bands, thickness } = rainbowBands(SIDE, CAKE);
    const lowest = Math.min(...bands.flatMap(b => b.path.map(p => p.y)));
    expect(lowest - thickness / 2).toBeCloseTo(CAKE.boardY, 6);
  });

  it('keeps each rope the length it was drawn as', () => {
    // Arc length over radius is the whole reason the angle is computed that way: a rope bent round
    // the cake must not become a different amount of fondant to roll.
    const flat = rainbowBands({ ...SIDE, surface: 'top', standoff: 0 }, CAKE);
    const wall = rainbowBands(SIDE, CAKE);
    const len = path => path.reduce((n, p, i) => i ? n + p.distanceTo(path[i - 1]) : 0, 0);
    for (let i = 0; i < flat.bands.length; i++) {
      expect(len(wall.bands[i].path)).toBeCloseTo(len(flat.bands[i].path), 1);
    }
  });

  it('goes where it is put round the cake', () => {
    const front = rainbowBands({ ...SIDE, theta: 0 }, CAKE).bands[0].path[0];
    const back  = rainbowBands({ ...SIDE, theta: Math.PI }, CAKE).bands[0].path[0];
    expect(front.z).toBeGreaterThan(0);      // 0 faces front
    expect(back.z).toBeLessThan(0);
  });

  it('is never stepped back or shrunk — a wall rainbow is ON the wall by construction', () => {
    const { standoff, thickness } = rainbowBands({ ...SIDE, footLeft: 'top', footRight: 'top' }, CAKE);
    expect(standoff).toBe(0);
    expect(thickness).toBeCloseTo(RAINBOW_DEFAULTS.thickness * CAKE.radius, 9);
  });

  it('wrapToWall is the bend on its own, for anything else that needs it', () => {
    const [pt] = wrapToWall([{ x: 0, y: 1 }], { radius: 2, theta0: 0, proud: 0.1 });
    expect(pt.z).toBeCloseTo(2.1, 6);
    expect(pt.x).toBeCloseTo(0, 6);
    expect(pt.y).toBe(1);
  });
});

// ── A wall rainbow is a SMALL half-circle, not an arch bent sideways ────────────────────────────
// Read off the reference photos after the first version got it wrong in three ways at once: it was
// 93% of the cake's width and 177% of the wall's HEIGHT, and it had straight legs. None of the
// references has legs — the arc springs off the board and its ends touch it.
describe('the wall shape', () => {
  const WALL = {
    surface: 'side', footLeft: 'board', footRight: 'board',
    offsetX: 0, spring: 0, scale: 0.6, flatten: 0.55,
  };

  it('has no straight legs — the arc springs off the board', () => {
    const { archY, footLeftY, footRightY } = rainbowBands(WALL, CAKE);
    expect(archY).toBeCloseTo(footLeftY, 6);
    expect(archY).toBeCloseTo(footRightY, 6);
  });

  it('fits comfortably inside the wall rather than towering over it', () => {
    const { bands } = rainbowBands(WALL, CAKE);
    const outer = bands[bands.length - 1];
    const height = Math.max(...outer.path.map(p => p.y)) - CAKE.boardY;
    const wall = CAKE.topY - CAKE.boardY;
    expect(height).toBeLessThan(wall);            // the first version was 1.77× this
    expect(height / wall).toBeGreaterThan(0.3);   // and not a badge either
  });

  it('spans a modest arc of the cake, not most of the way round it', () => {
    const { bands, cakeRadius } = rainbowBands(WALL, CAKE);
    const outer = bands[bands.length - 1];
    const sweepDeg = (outer.radius * 2 / cakeRadius) * 180 / Math.PI;
    expect(sweepDeg).toBeLessThan(90);            // was 107°
    expect(sweepDeg).toBeGreaterThan(35);
  });

  it('ends ON the board, both of them', () => {
    const { bands, thickness } = rainbowBands(WALL, CAKE);
    for (const b of bands) {
      for (const end of [b.path[0], b.path[b.path.length - 1]]) {
        expect(end.y - thickness / 2).toBeCloseTo(CAKE.boardY, 6);
      }
    }
  });
});

// ── A wall rainbow is symmetric ─────────────────────────────────────────────────────────────────
// It leans only because it has two surfaces to reach: the cake top on one side, the board on the
// other. A wall is ONE surface, so an arch pressed onto it has both ends at the same height. Letting
// the feet differ gave one end stopping mid-wall while the other ran to the board — not a thing
// anybody makes, and it took a screenshot to notice.
describe('on the wall, both ends are level', () => {
  const ends = params => {
    const { bands } = rainbowBands({ surface: 'side', scale: 0.6, ...params }, CAKE);
    const p = bands[0].path;
    return [p[0].y, p[p.length - 1].y];
  };

  it('ignores a mismatched second foot rather than obeying it', () => {
    for (const feet of [['board', 'none'], ['none', 'board'], ['board', 'top'], ['top', 'none']]) {
      const [l, r] = ends({ footLeft: feet[0], footRight: feet[1] });
      expect(l, `${feet.join('/')} came out lopsided`).toBeCloseTo(r, 9);
    }
  });

  it('follows the LEFT foot, so which one wins is not a coin toss', () => {
    const onBoard = ends({ footLeft: 'board', footRight: 'none' });
    const floating = ends({ footLeft: 'none', footRight: 'board' });
    expect(onBoard[0]).toBeLessThan(floating[0]);
  });

  it('still leans over the CAKE, where there really are two surfaces', () => {
    const { bands } = rainbowBands({ footLeft: 'top', footRight: 'board' }, CAKE);
    const p = bands[0].path;
    expect(p[0].y).not.toBeCloseTo(p[p.length - 1].y, 2);
  });
});

// ── An arch on the cake rests ON the cake ───────────────────────────────────────────────────────
// `spring` above 1 puts the springing point ABOVE the cake top, and an arch whose feet are on the
// top then grows LEGS to reach it — 0.38 of stilt, floating clear of the thing it was supposed to be
// sitting on. That is a real capability (a hooped arch standing proud), but it is not what "sitting
// on top" means, and it was the default.
describe('sitting on the cake top', () => {
  const onTop = spring => rainbowBands({ footLeft: 'top', footRight: 'top', spring, scale: 0.75, offsetX: 0, standoff: 0 }, CAKE);

  it('has no legs at spring 1 — the arc rests straight on the surface', () => {
    const { archY, footLeftY } = onTop(1);
    expect(archY).toBeCloseTo(footLeftY, 9);
  });

  it('and none below 1 either, because the feet pin it', () => {
    for (const spring of [0, 0.5, 1]) {
      const { archY, footLeftY } = onTop(spring);
      expect(archY, `spring ${spring} lifted it off the cake`).toBeCloseTo(footLeftY, 9);
    }
  });

  it('DOES stand on legs above 1 — kept, because a hooped arch is a real thing to want', () => {
    const { archY, footLeftY } = onTop(1.3);
    expect(archY).toBeGreaterThan(footLeftY + 0.1);
  });

  it('lands its feet inboard of the rim, not balanced on the edge', () => {
    const { bands } = onTop(1);
    const outer = bands[bands.length - 1];
    expect(outer.radius).toBeLessThan(CAKE.radius * 0.85);
  });
});

// ── Flatten presses toward the surface the rope is ON ───────────────────────────────────────────
// It squashes the mesh, and WHICH WAY depends on where the rope is. A flat arch lies in the XY plane
// so world Z is right. A rope bent round the cake lies AT the cake's radius, and the same scale drags
// it toward the world centre — at flatten 0.55 a wall rainbow's mesh went from z 1.16–1.27 to
// 0.52–0.57 on a 1.2 cake and disappeared. It was not missing, it was buried.
describe('flatten on a wall', () => {
  const WALL = { surface: 'side', footLeft: 'board', footRight: 'board', spring: 0, offsetX: 0, scale: 0.6 };
  const meshZ = flatten => {
    const { bands } = rainbowBands({ ...WALL, flatten }, CAKE);
    const g = bandGeometry(bands[0], { flatten, wallRadius: CAKE.radius });
    g.computeBoundingBox();
    return g.boundingBox;
  };

  it('leaves a pressed rope ON the wall, not inside the cake', () => {
    const bb = meshZ(0.55);
    expect(bb.max.z).toBeGreaterThan(CAKE.radius);
    expect(bb.min.z).toBeGreaterThan(CAKE.radius * 0.95);
  });

  it('presses it thinner without pushing it into the cake', () => {
    // Measured RADIALLY, not by the bounding box. On a curved rope the box's min z is the angular
    // END of the arc, not its innermost surface — comparing those says nothing about depth and my
    // first version of this test failed on exactly that confusion.
    const radial = flatten => {
      const { bands } = rainbowBands({ ...WALL, flatten }, CAKE);
      const g = bandGeometry(bands[0], { flatten, wallRadius: CAKE.radius });
      const pos = g.attributes.position;
      let lo = Infinity, hi = 0;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i), pos.getZ(i));
        lo = Math.min(lo, r); hi = Math.max(hi, r);
      }
      return { lo, hi };
    };
    const round = radial(0), flat = radial(0.55);
    expect(flat.hi - flat.lo).toBeLessThan(round.hi - round.lo);   // thinner
    expect(flat.hi).toBeLessThan(round.hi);                        // stands less proud
    // Pressing pulls it toward the wall — that is what pressing IS — so it does end nearer than the
    // round one (1.211 against 1.224 here). What must hold is that it stays OUT of the cake.
    expect(flat.lo).toBeGreaterThanOrEqual(CAKE.radius);
  });

  it('still squashes a FLAT arch against its own plane', () => {
    const { bands } = rainbowBands({ footLeft: 'board', footRight: 'board', standoff: 0 }, CAKE);
    const g = bandGeometry(bands[0], { flatten: 0.6 });   // no wallRadius — the flat path
    const plain = bandGeometry(bands[0], { flatten: 0 });
    g.computeBoundingBox(); plain.computeBoundingBox();
    const depth = b => b.boundingBox.max.z - b.boundingBox.min.z;
    expect(depth(g)).toBeLessThan(depth(plain));
  });

  it('seats the rope ON the wall rather than half inside it', () => {
    const { bands, thickness } = rainbowBands(WALL, CAKE);
    const centre = Math.hypot(bands[0].path[0].x, bands[0].path[0].z);
    expect(centre - thickness / 2).toBeGreaterThanOrEqual(CAKE.radius - 1e-6);
  });
});

// ── Standing on a tier, not on the cake ──────────────────────────────────────
// The geometry takes { radius, topY, boardY } and has never asked whether that is a whole cake or
// one tier of a stack. That is the whole of multi-tier support — IF it is true. These pin it.
describe('a rainbow on an upper tier', () => {
  const TIER1 = { r: 1.2, top: 1.55 };                 // board 0.1 + 1.45
  const tier2 = { radius: 0.92, topY: 2.88, boardY: TIER1.top };

  it('seats its falling foot on the tier below, not on the board', () => {
    const { bands, thickness } = rainbowBands(
      { ...RAINBOW_DEFAULTS, footLeft: 'top', footRight: 'board' }, tier2);
    const lowest = Math.min(...bands.flatMap(b => b.path.map(v => v.y)));
    // A path point is the middle of the tube, so a seated rope's centreline sits half a rope up.
    expect(lowest).toBeCloseTo(TIER1.top + thickness / 2, 5);
  });

  it('keeps out of the tier it stands against', () => {
    const { bands } = rainbowBands(
      { ...RAINBOW_DEFAULTS, footLeft: 'top', footRight: 'board' }, tier2);
    const inside = bands.flatMap(b => b.path).filter(
      v => v.y < tier2.topY - 1e-6 && Math.hypot(v.x, v.z) < tier2.radius - 1e-6);
    expect(inside).toHaveLength(0);
  });

  it('scales to the TIER, so tier 2 gets a smaller rainbow than tier 1', () => {
    const on = c => {
      const { bands } = rainbowBands(RAINBOW_DEFAULTS, c);
      const xs = bands.flatMap(b => b.path).map(v => v.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    const wide = on({ radius: 1.2, topY: 1.55, boardY: 0.1 });
    const narrow = on(tier2);
    // Same ratios, smaller tier: the arch is narrower by the same proportion the tier is.
    expect(narrow / wide).toBeCloseTo(0.92 / 1.2, 2);
  });

  it('would hang half its bands off the tier below, unfitted', () => {
    // What the picture showed and the first measurement missed. Every band's foot seats at the same
    // height, so "the lowest point" is a tie the INNERMOST band wins by being first in the list —
    // and it reported 1.03, the foot nearest the middle, about an arch reaching 1.51.
    const { bands, thickness } = rainbowBands(
      { ...RAINBOW_DEFAULTS, footLeft: 'top', footRight: 'board' }, tier2);
    const lowY = Math.min(...bands.flatMap(b => b.path.map(v => v.y)));
    const feet = bands.map(b => {
      const low = b.path.filter(v => v.y < lowY + thickness * 0.5);
      return Math.max(...low.map(v => Math.hypot(v.x, v.z)));
    });
    expect(feet.filter(f => f > TIER1.r).length).toBeGreaterThanOrEqual(3);
    expect(rainbowFootReach({ ...RAINBOW_DEFAULTS, footLeft: 'top', footRight: 'board' }, tier2))
      .toBeGreaterThan(TIER1.r);
  });

  it('shrinks until the falling foot lands, when told what is underneath', () => {
    const held = { ...tier2, supportRadius: TIER1.r };
    const p = { ...RAINBOW_DEFAULTS, footLeft: 'top', footRight: 'board' };
    // 1e-3 of a 1.2 unit tier, not float-exact: the fit lands the foot ON the rim, so this is an
    // equality dressed as an inequality and the last digits are noise.
    expect(rainbowFootReach(p, held)).toBeLessThanOrEqual(TIER1.r + 1e-3);
    expect(rainbowBands(p, held).supportFit).toBeLessThan(1);
    // The SHAPE is untouched — all six ropes are still there, shrunk together.
    expect(rainbowBands(p, held).bands).toHaveLength(RAINBOW_DEFAULTS.bands);
  });

  it('mirrors, and lands on the other side too', () => {
    const held = { ...tier2, supportRadius: TIER1.r };
    expect(rainbowFootReach({ ...RAINBOW_DEFAULTS, footLeft: 'board', footRight: 'top' }, held))
      .toBeLessThanOrEqual(TIER1.r + 1e-3);
  });

  it('leaves the bottom tier alone, because the board grows instead', () => {
    // No supportRadius means nothing limits it — rainbowBoardReach widens the board to meet the
    // foot. Shrinking here would be solving a problem the board already solves.
    const bottom = { radius: 1.2, topY: 1.55, boardY: 0.1 };
    const p = { ...RAINBOW_DEFAULTS, footLeft: 'top', footRight: 'board' };
    expect(rainbowBands(p, bottom).supportFit).toBe(1);
    expect(rainbowBoardReach(p, bottom)).toBeGreaterThan(rainbowFootReach(p, bottom));
  });

  it('does not shrink an arch that stands on the tier, or one on the wall', () => {
    const held = { ...tier2, supportRadius: TIER1.r };
    // Nothing falls in either case, so the tier below is not load-bearing and not a limit.
    expect(rainbowBands({ ...RAINBOW_DEFAULTS, footLeft: 'top', footRight: 'top', offsetX: 0 }, held)
      .supportFit).toBe(1);
    expect(rainbowBands({ ...RAINBOW_DEFAULTS, surface: 'side', footLeft: 'board', spring: 0.18 }, held)
      .supportFit).toBe(1);
  });

  it('cannot be fixed by dropping bands, which is why it shrinks instead', () => {
    // The obvious lever does not reach. offsetX 0.71 puts the arch centre at 0.65 and the hole adds
    // 0.28 before any rope exists, so a 1.20 surface leaves room for about two bands — going 6 → 3
    // still lands at 1.25, off the edge. Scaling keeps the rainbow a rainbow; dropping ropes makes
    // it a different decoration and STILL does not fit.
    const footOf = bands => rainbowFootReach(
      { ...RAINBOW_DEFAULTS, footLeft: 'top', footRight: 'board', bands }, tier2);
    expect(footOf(3)).toBeGreaterThan(TIER1.r);
  });

  it('reports nothing falling when both feet rest on the tier top', () => {
    const reach = rainbowFootReach(
      { ...RAINBOW_DEFAULTS, footLeft: 'top', footRight: 'top', offsetX: 0 }, tier2);
    expect(reach).toBeLessThan(tier2.radius);
  });
});

// ── The backdrop ────────────────────────────────────────────────────────────
// It is the one arrangement that stands on the far side of the cake, and the only one whose whole
// point is a proportion: an arch rising ABOVE what it stands behind. Both had to be asked for.
describe('behind, both down', () => {
  const BACKDROP = { ...RAINBOW_DEFAULTS, footLeft: 'board', footRight: 'board',
                     spring: 0.55, offsetX: 0, standoff: 0, flatten: 0.15, behind: true };
  const CAKE = { radius: 1.2, topY: 1.55, boardY: 0.1 };

  it('stands on the far side of the cake, not the near one', () => {
    // The camera looks down +z. requiredStandoff only ever returns a magnitude, so without a sign
    // every arrangement stood between the viewer and the cake — including this one.
    const { bands } = rainbowBands(BACKDROP, CAKE);
    for (const b of bands) for (const pt of b.path) expect(pt.z).toBeLessThan(0);
  });

  it('leaves every other arrangement on the near side', () => {
    // Never negative, rather than always positive: a leaning arch on a single tier needs no step-back
    // at all (its legs already clear the cake in x), so it sits flat on z = 0. The sign only appears
    // once something pushes it, and it must push toward the viewer.
    for (const params of [
      { footLeft: 'top', footRight: 'board' },
      { footLeft: 'board', footRight: 'top' },
      { footLeft: 'board', footRight: 'board', spring: 0.55, offsetX: 0 },
    ]) {
      const { bands } = rainbowBands({ ...RAINBOW_DEFAULTS, ...params }, CAKE);
      for (const b of bands) for (const pt of b.path) expect(pt.z).toBeGreaterThanOrEqual(0);
    }
  });

  it('rises above the cake on any tier of any stack', () => {
    // The failure this pins: a fixed `spring` is a fixed fraction of the HEIGHT, but how far the
    // crown reaches above the springing point is the arch's RADIUS — and on an upper tier that is
    // capped by the tier the feet land on. 0.55 cleared a whole cake by 32% and an upper tier by
    // 0.7%: two legs either side of a tier with nothing joining them over the top.
    const tiers = [
      CAKE,
      { radius: 0.92, topY: 2.88, boardY: 1.55, supportRadius: 1.2 },
      { radius: 0.64, topY: 3.98, boardY: 2.88, supportRadius: 0.92 },
    ];
    for (const c of tiers) {
      const { bands } = rainbowBands(BACKDROP, c);
      const crown = Math.max(...bands.flatMap(b => b.path.map(v => v.y)));
      const height = c.topY - c.boardY;
      expect((crown - c.topY) / height).toBeGreaterThan(0.15);
    }
  });

  it('takes spring as a floor, so the slider still raises it', () => {
    const low = rainbowBands(BACKDROP, CAKE);
    const high = rainbowBands({ ...BACKDROP, spring: 1.0 }, CAKE);
    const crownOf = r => Math.max(...r.bands.flatMap(b => b.path.map(v => v.y)));
    expect(crownOf(high)).toBeGreaterThan(crownOf(low));
  });

  it('lifts only where the spring does not already clear the top', () => {
    const crownOf = (c, cake) => Math.max(...rainbowBands(c, cake).bands.flatMap(b => b.path.map(v => v.y)));
    const plain = { ...BACKDROP, behind: false };

    // On a whole cake the arch is big enough that spring 0.55 already clears by 32%, so the floor is
    // not binding and turning it on changes nothing but the side it stands on.
    expect(crownOf(plain, CAKE)).toBeCloseTo(crownOf(BACKDROP, CAKE), 6);

    // On an upper tier it is the only thing holding the crown above the tier.
    const upper = { radius: 0.92, topY: 2.88, boardY: 1.55, supportRadius: 1.2 };
    expect(crownOf(plain, upper)).toBeLessThan(upper.topY + 0.05);
    expect(crownOf(BACKDROP, upper)).toBeGreaterThan(upper.topY + 0.2);
  });
});
