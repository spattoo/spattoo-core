import { describe, it, expect } from 'vitest';
import { buildPanelGeometry, panelsFrom, PANEL_THICKNESS } from './garnishPanel.js';

/* A cut panel is a REGION extruded into a slab, not a path swept into a rope. What these protect is
 * the part that makes it read as chocolate rather than as a toy: that it is thin, that its edges are
 * square, and that a punched circle is a hole rather than a notch.
 */

const square = (s = 100, o = 0) =>
  [[o, o], [o + s, o], [o + s, o + s], [o, o + s], [o, o]];
const circle = (cx, cy, r) =>
  Array.from({ length: 25 }, (_, i) => {
    const t = (i / 24) * Math.PI * 2;
    return [cx + Math.cos(t) * r, cy + Math.sin(t) * r];
  });

describe('cutting a panel', () => {
  it('extrudes an outline into a slab', () => {
    const out = buildPanelGeometry([square()], { scale: 0.01 });
    expect(out.geometry.getAttribute('position').count).toBeGreaterThan(20);
    expect(out.size.w).toBeCloseTo(1, 5);
  });

  /* ⚠️ A PANEL IS THIN. Real tempered chocolate is spread to a couple of millimetres; thick enough to
   * read as a slab is thick enough to snap rather than bend. */
  it('is a couple of millimetres, not a block', () => {
    const out = buildPanelGeometry([square()], { scale: 0.01 });
    expect(out.size.d).toBeCloseTo(PANEL_THICKNESS, 6);
    expect(out.size.d).toBeLessThan(out.size.w / 20);
  });

  /* ⚠️ A PUNCHED CIRCLE IS A HOLE. This is the whole look of the reference cakes, and it is why the
   * region work came first: a cycle inside a cycle is exactly what a hole is. */
  it('punches a hole rather than drawing a circle on top', () => {
    const solid  = buildPanelGeometry([square()], { scale: 0.01 });
    const holed  = buildPanelGeometry([square(), circle(50, 50, 20)], { scale: 0.01 });
    // A hole adds its own wall, so the triangle count goes UP while the footprint stays the same.
    expect(holed.geometry.getAttribute('position').count)
      .toBeGreaterThan(solid.geometry.getAttribute('position').count);
    expect(holed.size.w).toBeCloseTo(solid.size.w, 5);
  });

  /* ⚠️ A RING THAT MERELY OVERLAPS IS NOT A HOLE. Punching it would cut a notch out of the panel's
   * edge, which is not what somebody who drew two overlapping shapes asked for. */
  it('ignores a ring that only overlaps the outline', () => {
    const overlapping = buildPanelGeometry([square(), circle(100, 100, 40)], { scale: 0.01 });
    const solid       = buildPanelGeometry([square()], { scale: 0.01 });
    expect(overlapping.geometry.getAttribute('position').count)
      .toBe(solid.geometry.getAttribute('position').count);
  });

  it('rests on y = 0 and is centred on x, like the piped piece', () => {
    const { geometry } = buildPanelGeometry([square()], { scale: 0.01 });
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    expect(Math.abs(bb.min.y)).toBeLessThan(1e-6);
    expect(Math.abs(bb.min.x + bb.max.x)).toBeLessThan(1e-6);
  });

  it('returns nothing rather than throwing on nothing', () => {
    expect(buildPanelGeometry(null)).toBeNull();
    expect(buildPanelGeometry([])).toBeNull();
    expect(buildPanelGeometry([[[0, 0], [1, 1]]])).toBeNull();
  });
});

describe('sorting rings into panels', () => {
  it('gives each outline the holes that sit inside it', () => {
    const panels = panelsFrom([square(100), circle(50, 50, 20), square(60, 400)]);
    expect(panels).toHaveLength(2);
    const big = panels.find(p => Math.abs(p.outline[2][0] - 100) < 1e-6);
    expect(big.holes).toHaveLength(1);
  });

  it('does not hand one panel another panel as a hole', () => {
    const panels = panelsFrom([square(100), square(100, 300)]);
    expect(panels).toHaveLength(2);
    expect(panels.every(p => p.holes.length === 0)).toBe(true);
  });
});
