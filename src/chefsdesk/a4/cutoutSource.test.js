import { describe, it, expect, vi } from 'vitest';
import { strokeOutline, cutoutPaths } from './cutoutSource.js';
import { outlineMm } from '../../designer/geometry/traceOutline.js';

// A recording 2D context. The drawing is the product here — a template whose lines are wrong is
// wrong in a way no screenshot review catches — so the test asserts on what was actually issued.
function fakeCtx() {
  const calls = [];
  const rec = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    save: rec('save'), restore: rec('restore'),
    beginPath: rec('beginPath'), closePath: rec('closePath'), stroke: rec('stroke'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    setLineDash: rec('setLineDash'),
    set strokeStyle(v) { calls.push(['strokeStyle', v]); },
    set lineWidth(v)  { calls.push(['lineWidth', v]); },
    set lineJoin(v)   { calls.push(['lineJoin', v]); },
  };
}

function bitmap(rows) {
  const height = rows.length, width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    data[(y * width + x) * 4 + 3] = ch === '#' ? 255 : 0;
  }));
  return { data, width, height };
}

const ringWithHole = outlineMm(bitmap([
  '..........',
  '.########.',
  '.########.',
  '.##....##.',
  '.##....##.',
  '.########.',
  '.########.',
  '..........',
]), 100);

describe('strokeOutline', () => {
  it('draws both the cut line and the hole', () => {
    expect(ringWithHole.cut).toHaveLength(1);
    expect(ringWithHole.mark).toHaveLength(1);

    const ctx = fakeCtx();
    strokeOutline(ctx, ringWithHole, 0, 0, 200, 200);
    expect(ctx.calls.filter(c => c[0] === 'stroke')).toHaveLength(2);
  });

  // The cut line is the one a baker follows with a blade. If a hole's dashes were painted over it
  // where the two meet, the line to follow would be the interrupted one.
  it('draws holes BEFORE cut lines, so the cut line is never overpainted', () => {
    const ctx = fakeCtx();
    strokeOutline(ctx, ringWithHole, 0, 0, 200, 200);
    const colours = ctx.calls.filter(c => c[0] === 'strokeStyle').map(c => c[1]);
    expect(colours).toEqual(['#b9b3bf', '#2C2A26']);   // grey hole first, dark cut second
  });

  it('dashes the holes and leaves the cut line solid', () => {
    const ctx = fakeCtx();
    strokeOutline(ctx, ringWithHole, 0, 0, 200, 200);
    const dashes = ctx.calls.filter(c => c[0] === 'setLineDash').map(c => JSON.stringify(c[1]));
    expect(dashes).toEqual(['[4,3]', '[]']);
  });

  it('never strokes thinner than a hairline, however small the item', () => {
    const ctx = fakeCtx();
    strokeOutline(ctx, ringWithHole, 0, 0, 4, 4);      // a 4 px item
    const widths = ctx.calls.filter(c => c[0] === 'lineWidth').map(c => c[1]);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(0.75);
  });

  it('scales into the box it is given', () => {
    const ctx = fakeCtx();
    strokeOutline(ctx, ringWithHole, 10, 20, 100, 100);
    const pts = ctx.calls.filter(c => c[0] === 'moveTo' || c[0] === 'lineTo');
    const xs = pts.map(c => c[1]), ys = pts.map(c => c[2]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(10);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...xs)).toBeLessThanOrEqual(110.001);
    expect(Math.max(...ys)).toBeLessThanOrEqual(120.001);
  });

  it('survives an outline with no loops rather than dividing by zero', () => {
    const ctx = fakeCtx();
    expect(() => strokeOutline(ctx, { widthMm: 0, heightMm: 0, cut: [], mark: [] }, 0, 0, 50, 50)).not.toThrow();
    expect(ctx.calls.filter(c => c[0] === 'stroke')).toHaveLength(0);
  });
});

describe('cutoutPaths', () => {
  it('gives closed SVG paths for both kinds', () => {
    const p = cutoutPaths(ringWithHole);
    expect(p.cut).toHaveLength(1);
    expect(p.mark).toHaveLength(1);
    expect(p.cut[0]).toMatch(/^M[\d.-]+,[\d.-]+ .*Z$/);
    expect(p.mark[0]).toMatch(/Z$/);
  });
});
