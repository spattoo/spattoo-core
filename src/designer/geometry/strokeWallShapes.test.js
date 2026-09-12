import { describe, it, expect } from 'vitest';
import { tierShape, pipingPerimeters } from './surface.js';
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

const anchorsFor = (tier) => {
  const shp = tierShape(tier);
  return pipingPerimeters(shp).flatMap(perim =>
    perimeterRing(perim, -S.wz / 2, S.spacing, 0).map(q => ({ x: q.pos[0], z: q.pos[2], out: q.rotY })));
};

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

  it('builds one merged geometry for the whole wall, and nothing without a mesh', () => {
    const a = anchorsFor(SHAPES.rect);
    expect(buildStrokeWallOn(a, 1.45, { ...P, strokeGeo: null })).toBeNull();
    expect(buildStrokeWallOn([], 1.45, { ...P, strokeGeo: new THREE.BoxGeometry(1, 1, 1) })).toBeNull();
    const geo = buildStrokeWallOn(a, 1.45, { ...P, strokeGeo: new THREE.BoxGeometry(0.44, 1.89, 0.43) });
    expect(geo.getAttribute('position').count).toBeGreaterThan(a.length * 8);
  });
});
