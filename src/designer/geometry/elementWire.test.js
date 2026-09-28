import { describe, it, expect } from 'vitest';
import { wireFor, wireLift, elementWire, ELEMENT_WIRE_DEFAULTS, WIRE_BEND, WIRE_LENGTH, WIRE_SWEEP } from './elementWire.js';

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
  it('bulges furthest at the middle and nowhere at the ends', () => {
    const w = on({ bend: 0.3 });
    const out = w.points.map(p => Math.hypot(p.x, p.z));
    const mid = Math.floor(out.length / 2);
    expect(out[mid]).toBeGreaterThan(0);
    expect(Math.max(...out)).toBeCloseTo(out[mid], 3);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[out.length - 1]).toBeCloseTo(0, 6);
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
    const a = on({ sweep: 0, bend: 0.3 });
    const b = on({ sweep: 90, bend: 0.3 });
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
    const w = wireFor(box, { on: true, bend: 0.4 }, { ...ELEMENT_WIRE_DEFAULTS, bend: 0.1 });
    const reach = Math.max(...w.points.map(p => Math.hypot(p.x, p.z)));
    expect(reach).toBeCloseTo(w.len * 0.4, 6);
  });

  it('clamps a nonsense value rather than drawing a spring', () => {
    const w = on({ bend: 99 });
    expect(Math.max(...w.points.map(p => Math.hypot(p.x, p.z)))).toBeCloseTo(w.len * WIRE_BEND.max, 6);
  });
});

/* ⚠️ THE TEST FOR A BUG THAT HAD ALREADY SHIPPED ONCE. `length` borrowed the pick's 0.25–6 range
   while its own tuned default was 6, so every control built from that range could only make a wire
   SHORTER — a default with no headroom above it is a control doing half what it appears to. It was
   found by reading, not by a test, which is the wrong way round for arithmetic this mechanical. */
describe('every default leaves room to move in both directions', () => {
  const ranges = { length: WIRE_LENGTH, bend: WIRE_BEND, sweep: WIRE_SWEEP };
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
