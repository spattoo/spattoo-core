import { describe, it, expect } from 'vitest';
import { wireFor, wireLift, elementWire, ELEMENT_WIRE_DEFAULTS, WIRE_BEND } from './elementWire.js';

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
