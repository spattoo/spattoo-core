import { describe, it, expect } from 'vitest';
import { wireFor, wireLift, wireStandoff, elementWire, ELEMENT_WIRE_DEFAULTS, WIRE_BEND, WIRE_LENGTH, WIRE_SWEEP, WIRE_WAVES, WIRE_TWIST, WIRE_ANGLE } from './elementWire.js';

const box = { h: 0.1, cy: 0 };
const on = (extra = {}) => wireFor(box, { on: true, ...extra }, null);

describe('a wire is offered by the row, not assumed', () => {
  it('is not offered unless allowed_actions says so', () => {
    expect(elementWire({ wire: { bend: 0.3 } }, {}).offered).toBe(false);
    expect(elementWire({ wire: { bend: 0.3 } }, { wire: true }).offered).toBe(true);
  });

  it('draws nothing for an instance that has not switched it on', () => {
    expect(wireFor(box, { on: false }, null)).toBe(null);
    expect(wireFor(box, null, null)).toBe(null);
  });

  it('draws nothing without a measured box — a wire is sized from the piece it carries', () => {
    expect(wireFor(null, { on: true }, null)).toBe(null);
    expect(wireFor({ h: 0 }, { on: true }, null)).toBe(null);
  });
});

/* ⚠️ THE REGRESSION THIS FILE EXISTS FOR. The first version leaned the wire's BASE away from the
   element, which put the root outside the cake — at length 9 it hung visibly in mid-air beside it.
   The element is drawn at the point the baker placed, so the base must stay under it. */
describe('the base sits directly below the tip', () => {
  it('has no lateral offset at either end, at any bend or sweep', () => {
    for (const sweep of [0, 35, 180, 300]) {
      for (const bend of [0, 0.2, WIRE_BEND.max]) {
        const w = on({ sweep, bend });
        const first = w.points[0];
        const last = w.points[w.points.length - 1];
        expect(Math.hypot(first.x, first.z)).toBeCloseTo(0, 6);
        expect(Math.hypot(last.x, last.z)).toBeCloseTo(0, 6);
      }
    }
  });

  it('runs downward — the last point is the tip, the first goes into the cake', () => {
    const w = on();
    expect(w.points[0].y).toBeLessThan(w.points[w.points.length - 1].y);
    expect(w.baseY).toBeCloseTo(w.points[0].y, 6);
  });
});

describe('the bow is what makes it read as wire', () => {
  /* ⚠️ `waves: 1` IS PINNED, because the apex is only at the middle for a SINGLE bend. The default
     is an S, whose middle is a zero crossing — a test written against the default would assert the
     shape of whatever the default happens to be rather than the property it means to check. */
  it('bulges furthest at the middle of a single bend, and nowhere at the ends', () => {
    const w = on({ bend: 0.3, waves: 1, twist: 0 });
    const out = w.points.map(p => Math.hypot(p.x, p.z));
    const mid = Math.floor(out.length / 2);
    expect(out[mid]).toBeGreaterThan(0);
    expect(Math.max(...out)).toBeCloseTo(out[mid], 3);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[out.length - 1]).toBeCloseTo(0, 6);
  });

  it('meets the icing and the piece without a kink at any number of bends', () => {
    for (let waves = WIRE_WAVES.min; waves <= WIRE_WAVES.max; waves++) {
      const out = on({ bend: 0.4, waves }).points.map(p => Math.hypot(p.x, p.z));
      expect(out[0]).toBeCloseTo(0, 6);
      expect(out[out.length - 1]).toBeCloseTo(0, 6);
    }
  });

  /* ⚠️ AN S IS NOT TWICE THE EXCURSION OF A C. Without dividing the bow by the count, raising
     `waves` would fling the piece sideways and read as a different control having been moved. */
  it('keeps the same reach however many bends it has', () => {
    const reach = w => Math.max(...w.points.map(p => Math.hypot(p.x, p.z)));
    const one = reach(on({ bend: 0.4, waves: 1, twist: 0 }));
    for (const waves of [2, 3, 4]) {
      expect(reach(on({ bend: 0.4, waves, twist: 0 }))).toBeCloseTo(one / waves, 3);
    }
  });

  it('crosses the axis once per extra bend — a C never does, an S does once', () => {
    /* ⚠️ SIGN FLIPS BETWEEN NEIGHBOURS, WITH A DEAD ZONE, and the naive version was wrong. Comparing
       samples two apart (`xs[i-1] * xs[i+1] < 0`) counts an exact crossing TWICE, because `sin(pi)`
       is 1.2e-16 rather than 0 and that tiny value straddles on both sides. A dead zone treats it as
       the zero it is meant to be. */
    const crossings = waves => {
      const xs = on({ bend: 0.4, waves, twist: 0, sweep: 0 }).points.map(p => p.x);
      let n = 0, prev = 0;
      for (const x of xs) {
        const sign = Math.abs(x) < 1e-9 ? 0 : Math.sign(x);
        if (sign && prev && sign !== prev) n++;
        if (sign) prev = sign;
      }
      return n;
    };
    expect(crossings(1)).toBe(0);
    expect(crossings(2)).toBe(1);
    expect(crossings(3)).toBe(2);
  });

  /* The bow's plane turns as the wire climbs, which is what a planar squiggle cannot fake. */
  it('twist rotates the bow along the wire, and zero twist keeps it in one plane', () => {
    const flat = on({ bend: 0.4, waves: 1, twist: 0, sweep: 0 });
    for (const p of flat.points) expect(Math.abs(p.z)).toBeCloseTo(0, 6);

    const turned = on({ bend: 0.4, waves: 1, twist: WIRE_TWIST.max, sweep: 0 });
    expect(Math.max(...turned.points.map(p => Math.abs(p.z)))).toBeGreaterThan(0);
  });

  it('is straight at bend 0 — the control case, and it should look wrong', () => {
    const w = on({ bend: 0 });
    for (const p of w.points) expect(Math.hypot(p.x, p.z)).toBeCloseTo(0, 6);
  });

  it('bows further as bend grows', () => {
    const reach = b => Math.max(...on({ bend: b }).points.map(p => Math.hypot(p.x, p.z)));
    expect(reach(0.1)).toBeLessThan(reach(0.3));
    expect(reach(0.3)).toBeLessThan(reach(0.5));
  });

  it('sweep turns the bow without changing its size', () => {
    const a = on({ sweep: 0, bend: 0.3, waves: 1, twist: 0 });
    const b = on({ sweep: 90, bend: 0.3, waves: 1, twist: 0 });
    const reach = w => Math.max(...w.points.map(p => Math.hypot(p.x, p.z)));
    expect(reach(a)).toBeCloseTo(reach(b), 6);
    const mid = Math.floor(a.points.length / 2);
    expect(a.points[mid].x).toBeCloseTo(reach(a), 6);
    expect(b.points[mid].z).toBeCloseTo(reach(b), 6);
  });
});

/* INVARIANTS #8 — nothing here may be a world constant, or it is wrong the moment a piece resizes. */
describe('everything scales with the element', () => {
  it('doubles its run and its radius when the element doubles', () => {
    const small = wireFor({ h: 0.1, cy: 0 }, { on: true }, null);
    const big = wireFor({ h: 0.2, cy: 0 }, { on: true }, null);
    expect(big.len).toBeCloseTo(small.len * 2, 6);
    expect(big.radius).toBeCloseTo(small.radius * 2, 6);
  });
});

describe('how far the element rides above the icing', () => {
  it('is whatever did not go in', () => {
    const w = on({ bury: 0.25 });
    expect(wireLift(w)).toBeCloseTo(w.len * 0.75, 6);
  });

  it('is zero when the whole wire is buried — the piece sits on the icing', () => {
    expect(wireLift(on({ bury: 1 }))).toBeCloseTo(0, 6);
  });

  it('is zero with no wire, so a caller can add it unconditionally', () => {
    expect(wireLift(null)).toBe(0);
  });
});

describe('a row authors the starting values, an instance overrides them', () => {
  it('prefers the instance over the row', () => {
    const w = wireFor(box, { on: true, bend: 0.4, waves: 1, twist: 0 }, { ...ELEMENT_WIRE_DEFAULTS, bend: 0.1 });
    const reach = Math.max(...w.points.map(p => Math.hypot(p.x, p.z)));
    expect(reach).toBeCloseTo(w.len * 0.4, 6);
  });

  it('clamps a nonsense value rather than drawing a spring', () => {
    const w = on({ bend: 99, waves: 1, twist: 0 });
    expect(Math.max(...w.points.map(p => Math.hypot(p.x, p.z)))).toBeCloseTo(w.len * WIRE_BEND.max, 6);
  });
});

/* ⚠️ THE TEST FOR A BUG THAT HAD ALREADY SHIPPED ONCE. `length` borrowed the pick's 0.25–6 range
   while its own tuned default was 6, so every control built from that range could only make a wire
   SHORTER — a default with no headroom above it is a control doing half what it appears to. It was
   found by reading, not by a test, which is the wrong way round for arithmetic this mechanical. */
describe('every default leaves room to move in both directions', () => {
  const ranges = { length: WIRE_LENGTH, bend: WIRE_BEND, sweep: WIRE_SWEEP, waves: WIRE_WAVES, twist: WIRE_TWIST, angle: WIRE_ANGLE };
  for (const [key, range] of Object.entries(ranges)) {
    it(`${key} sits strictly inside its own range`, () => {
      const v = ELEMENT_WIRE_DEFAULTS[key];
      expect(v).toBeGreaterThan(range.min);
      expect(v).toBeLessThan(range.max);
    });
  }

  it('bury is a fraction, and half of one', () => {
    expect(ELEMENT_WIRE_DEFAULTS.bury).toBeGreaterThan(0);
    expect(ELEMENT_WIRE_DEFAULTS.bury).toBeLessThan(1);
  });
});

/* ⚠️ TWO DATUM BUGS, NEITHER OF WHICH THE TESTS ABOVE COULD SEE, because they all used a box
   centred on the origin with no fold — the one shape where `-h/2` happens to be right. */
describe('the wire hangs from the element\'s real bottom', () => {
  it('honours an off-centre box, which is most real artwork', () => {
    /* Opaque content sitting high in its canvas: the box's middle is above the group origin. */
    const w = wireFor({ h: 0.1, cy: 0.06 }, { on: true, bend: 0 }, null);
    const tip = w.points[w.points.length - 1];
    expect(tip.y).toBeCloseTo(0.06 - 0.05 + 0.1 * 0.04, 6);
  });

  it('starts at the spine when the piece is folded, not at the flat wingtip', () => {
    /* A standing butterfly hinges its wings up, so the renderer reports a bottom HIGHER than the
       flat extent. A wire ignoring it would begin in the air below the body. */
    const flat = wireFor({ h: 0.1, cy: 0, bottom: -0.05 }, { on: true, bend: 0 }, null);
    const folded = wireFor({ h: 0.1, cy: 0, bottom: -0.02 }, { on: true, bend: 0 }, null);
    const tipOf = x => x.points[x.points.length - 1].y;
    expect(tipOf(folded)).toBeGreaterThan(tipOf(flat));
    expect(tipOf(folded)).toBeCloseTo(-0.02 + 0.1 * 0.04, 6);
  });

  it('falls back to the centred arithmetic when no bottom is reported', () => {
    const a = wireFor({ h: 0.1, cy: 0 }, { on: true, bend: 0 }, null);
    const b = wireFor({ h: 0.1, cy: 0, bottom: -0.05 }, { on: true, bend: 0 }, null);
    const tipOf = x => x.points[x.points.length - 1].y;
    expect(tipOf(a)).toBeCloseTo(tipOf(b), 6);
  });

  it('still runs the full length below whatever that bottom is', () => {
    const w = wireFor({ h: 0.1, cy: 0, bottom: -0.02 }, { on: true, bend: 0, length: 4 }, null);
    const tip = w.points[w.points.length - 1].y;
    expect(tip - w.points[0].y).toBeCloseTo(w.len, 6);
    expect(w.len).toBeCloseTo(0.4, 6);
  });
});

/* ⚠️ THREE POSES, THREE DIRECTIONS, ONE CURVE. The shape is identical in all of them — same bow,
   same kinks, same twist — and only the frame differs. A second copy of the curve per pose is how
   they drift apart, so the axis is data and these check the data. */
describe('the wire runs the way the pose needs', () => {
  const runOf = w => {
    const a = w.points[0], b = w.points[w.points.length - 1];
    return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  };

  it('runs straight down on the top surface', () => {
    const r = runOf(wireFor(box, { on: true, bend: 0 }, null, { axis: 'down' }));
    expect(r.y).toBeGreaterThan(0);          // the tip is above the buried end
    expect(Math.abs(r.x)).toBeCloseTo(0, 6);
    expect(Math.abs(r.z)).toBeCloseTo(0, 6);
  });

  /* ⚠️ A WALL WIRE RISES, AND THIS TEST USED TO ASSERT THAT IT DID NOT — `abs(r.y)` close to zero
     pinned the exact fault Sandeep photographed: *"its inserting horizontally. thats not how its
     done."* A stem that leaves the icing level holds the butterfly at the height of its own hole,
     scraping the wall it is meant to stand off. In every reference the wire goes in LOW and the
     piece rides high and clear. Still mostly OUT, though — that is what separates it from `lip`. */
  it('runs out AND up from a wall', () => {
    const r = runOf(wireFor(box, { on: true, bend: 0 }, null, { axis: 'out' }));
    expect(r.z).toBeGreaterThan(0);          // the tip stands proud of the buried end
    expect(r.y).toBeGreaterThan(0);          // and above it
    expect(r.z).toBeGreaterThan(r.y);        // but it is a wall wire, not a rim wire
  });


  /* ⚠️ THE ANGLE IS A CONTROL, NOT A CONSTANT, and it went through both failures to get here: dead
     horizontal first, then hard-coded at 31° — which Sandeep still read as horizontal, because the
     angle only acts on the part of the wire OUTSIDE the cake and at the default burial that is half
     of it. *"can we have control for the angle with which it needs to be inserted."* */
  it('climbs by however many degrees it was asked for', () => {
    for (const angle of [20, 45, 75]) {
      const r = runOf(wireFor(box, { on: true, bend: 0, angle }, null, { axis: 'out' }));
      expect((Math.atan2(r.y, r.z) * 180) / Math.PI).toBeCloseTo(angle, 4);
    }
  });

  it('a steeper angle lifts the piece more and pushes it out less', () => {
    const at = angle => wireFor(box, { on: true, angle, bury: 0.5 }, null, { axis: 'out' });
    expect(wireLift(at(70))).toBeGreaterThan(wireLift(at(30)));
    expect(wireStandoff(at(70))).toBeLessThan(wireStandoff(at(30)));
    /* The wire is the same length whichever way it points — the angle spends it, it does not add. */
    const reach = w => Math.hypot(wireLift(w), wireStandoff(w));
    expect(reach(at(70))).toBeCloseTo(reach(at(30)), 6);
  });

  it('clamps an angle outside the range rather than drawing a flagpole', () => {
    const flat = runOf(wireFor(box, { on: true, bend: 0, angle: 0 }, null, { axis: 'out' }));
    expect((Math.atan2(flat.y, flat.z) * 180) / Math.PI).toBeCloseTo(WIRE_ANGLE.min, 4);
  });

  /* ⚠️ THE RIM LEANS BACK, WHICH THE TOP SURFACE MUST NOT. A verge piece is cantilevered out over
     the lip, so a vertical stem drops past the cake and runs down the outside of the wall — which
     it did, for its whole length. Leaning puts the buried end back in the top surface. */
  it('runs down AND back from the rim', () => {
    const r = runOf(wireFor(box, { on: true, bend: 0 }, null, { axis: 'lip' }));
    expect(r.y).toBeGreaterThan(0);
    expect(r.z).toBeGreaterThan(0);
  });

  it('gives every axis the same run length and the same reach', () => {
    const len = w => Math.hypot(...Object.values(runOf(w)));
    const reach = w => {
      const a = w.points[0], b = w.points[w.points.length - 1];
      return Math.max(...w.points.map(p => {
        const t = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };
        const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
        const dl = Math.hypot(d.x, d.y, d.z);
        const proj = (t.x * d.x + t.y * d.y + t.z * d.z) / (dl * dl);
        return Math.hypot(t.x - d.x * proj, t.y - d.y * proj, t.z - d.z * proj);
      }));
    };
    const made = axis => wireFor(box, { on: true, bend: 0.3, waves: 1, twist: 0 }, null, { axis });
    for (const axis of ['out', 'lip']) {
      expect(len(made(axis))).toBeCloseTo(len(made('down')), 6);
      expect(reach(made(axis))).toBeCloseTo(reach(made('down')), 6);
    }
  });

  /* ⚠️ THE LIFT IS A VECTOR ONCE THE WIRE CAN RUN DIAGONALLY. Whatever did not go in has to
     displace the piece — up on the top, out on a wall, and both on the rim. One scalar was fine
     while every wire was vertical; on `lip` it would float the piece above where its stem ends. */
  it('splits what stayed out between height and standoff, per pose', () => {
    const on = axis => wireFor(box, { on: true, bury: 0.5 }, null, { axis });
    const out = on('down').len * 0.5;

    expect(wireLift(on('down'))).toBeCloseTo(out, 6);
    expect(wireStandoff(on('down'))).toBeCloseTo(0, 6);

    /* ⚠️ A WALL WIRE NOW SPLITS IT TOO, and this used to assert lift ≈ 0 — the same horizontal run
       Sandeep photographed. Leaving the vertical component out of the caller is what draws a stem
       climbing away from a butterfly that stayed where it was, hanging off the middle of its own
       wire. Mostly standoff, because it is a wall; some lift, because it climbs. */
    const wall = on('out');
    expect(wireLift(wall)).toBeGreaterThan(0);
    expect(wireStandoff(wall)).toBeGreaterThan(wireLift(wall));
    expect(Math.hypot(wireLift(wall), wireStandoff(wall))).toBeCloseTo(out, 6);

    const lip = on('lip');
    expect(wireLift(lip)).toBeGreaterThan(0);
    expect(wireStandoff(lip)).toBeGreaterThan(0);
    expect(Math.hypot(wireLift(lip), wireStandoff(lip))).toBeCloseTo(out, 6);
  });
});
