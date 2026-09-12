import { describe, it, expect } from 'vitest';
import { tierShape, pipingPerimeters, perimeter, rectEdgeRing } from './surface.js';
import { perimeterRing } from '../canvas/ringPositions.js';
import { strokeSizing, strokeWallParams, buildStrokeWallOn } from './creamWall.js';
import * as THREE from 'three';

/* ── A modelled wall on a cake that is NOT round ───────────────────────────────
 *
 * Every cream style before this one displaced a cylinder, so every one of them is round-tier only —
 * there is no cylinder to displace on a heart. An instanced stroke needs only a point and the
 * direction that point faces, and `perimeterRing` has produced exactly those for the piping rings on
 * every shape since they shipped. These tests pin the thing that can actually go wrong: the strokes
 * arriving unevenly, piled up at a corner or gapped along a straight run.
 */
const SIZE = { x: 0.442, y: 1.893, z: 0.432 };
const P = strokeWallParams({});
const S = strokeSizing(1.45, SIZE, P);

/* ⚠️ A RECT TAKES `rectEdgeRing`, AN OUTLINE TAKES `perimeterRing` — the branch `ringPositions` has
 * always had. Taking only half of it is what the overshoot test below exists to catch. */
const ringFor = (shp, off) => (shp.kind === 'rect'
  ? rectEdgeRing(shp, off, S.spacing, 0)
  : pipingPerimeters(shp).flatMap(perim => perimeterRing(perim, off, S.spacing, 0)));

const anchorsFor = (tier) =>
  ringFor(tierShape(tier), -S.wz / 2).map(q => ({ x: q.pos[0], z: q.pos[2], out: q.rotY }));

const nearestGaps = (a) => a.map((p, i) => {
  let best = Infinity;
  a.forEach((q, j) => { if (i !== j) best = Math.min(best, Math.hypot(p.x - q.x, p.z - q.z)); });
  return best;
}).sort((x, y) => x - y);

const SHAPES = {
  round: { shape: 'round', radius: 1.2 },
  rect:  { shape: 'rect', width: 2.4, depth: 1.8 },
  heart: { shapeFamily: 'heart', shapeConfig: {}, width: 2.4, depth: 2.4 },
};

describe('modelled wall on a shaped tier', () => {
  it.each(Object.keys(SHAPES))('walks %s and lands enough strokes to cover it', (key) => {
    const a = anchorsFor(SHAPES[key]);
    expect(a.length).toBeGreaterThan(20);
  });

  /* ⚠️ A CORNER IS WHERE A WALK ROUND A SHAPE PILES UP. Spacing is measured along the path, so at a
   * tight convex turn — the rectangle's fillet, the heart's point — consecutive strokes can sit far
   * closer by CHORD than by arc, and a pile-up reads as a dark bunched seam. No anchor may sit closer
   * to another than a stroke can overlap and still be a stroke. */
  it.each(Object.keys(SHAPES))('never piles strokes up on %s', (key) => {
    const gaps = nearestGaps(anchorsFor(SHAPES[key]));
    expect(gaps[0]).toBeGreaterThan(0.45 * S.wx);
  });

  /* ...and the other way: a gap wider than a stroke is bare cake between two of them. */
  it.each(Object.keys(SHAPES))('leaves no bare cake between strokes on %s', (key) => {
    const gaps = nearestGaps(anchorsFor(SHAPES[key]));
    expect(gaps[gaps.length - 1]).toBeLessThan(S.wx);
  });

  it('faces every stroke away from the cake', () => {
    const shp = tierShape(SHAPES.heart);
    for (const a of anchorsFor(SHAPES.heart)) {
      // Stepping outward along the stroke's own facing must leave the footprint, never enter it.
      const r0 = Math.hypot(a.x, a.z);
      const r1 = Math.hypot(a.x + 0.05 * Math.cos(a.out), a.z + 0.05 * Math.sin(a.out));
      expect(r1).toBeGreaterThan(r0 - 0.02);          // outward, allowing for the heart's concave cleft
    }
    expect(shp.kind).toBe('outline');
  });

  /* ⚠️ THE CREAM MUST NOT MAKE THE CAKE BIGGER, and this is the test that would have caught the one
   * real bug in this feature. `roundedRectPerimeter` walks CLOCKWISE; `perimeterRing` documents "CCW
   * winding ⇒ the right-hand perpendicular points out". Walking a rect with the outline's walker
   * therefore returned every normal pointing INTO the cake — the inset silently became an OUTSET and
   * each stroke faced backwards. Measured: the cream stood 23% proud of the cake in x and 31% in z,
   * a whole stroke width on each side, while round and heart were within 1%. Nothing threw, the
   * spacing tests above all passed, and the only visible symptom was a sheet cake that had quietly
   * grown by a third and overhung its own board. */
  it.each(Object.keys(SHAPES))('does not let the cream grow the cake on %s', (key) => {
    const shp = tierShape(SHAPES[key]);
    const geo = buildStrokeWallOn(anchorsFor(SHAPES[key]), 1.45,
      { ...P, strokeGeo: new THREE.BoxGeometry(SIZE.x, SIZE.y, SIZE.z) });
    geo.computeBoundingBox();
    // How far the cake's own footprint reaches on each axis.
    const pts = perimeter(shp);
    let fx = 0, fz = 0;
    for (let i = 0; i <= 400; i++) {
      const q = pts.at((i / 400) * pts.length);
      fx = Math.max(fx, Math.abs(q.x)); fz = Math.max(fz, Math.abs(q.z));
    }
    expect(geo.boundingBox.max.x / fx).toBeLessThan(1.08);
    expect(geo.boundingBox.max.z / fz).toBeLessThan(1.08);
  });

  it('builds one merged geometry for the whole wall, and nothing without a mesh', () => {
    const a = anchorsFor(SHAPES.rect);
    expect(buildStrokeWallOn(a, 1.45, { ...P, strokeGeo: null })).toBeNull();
    expect(buildStrokeWallOn([], 1.45, { ...P, strokeGeo: new THREE.BoxGeometry(1, 1, 1) })).toBeNull();
    const geo = buildStrokeWallOn(a, 1.45, { ...P, strokeGeo: new THREE.BoxGeometry(0.44, 1.89, 0.43) });
    expect(geo.getAttribute('position').count).toBeGreaterThan(a.length * 8);
  });
});
