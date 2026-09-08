import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildFlower, flowerStrokes, FLOWER_ORDER, flowerDef,
  resolveFlowerParams, resolveFlowerForm, resolveFlowerCentre,
} from './flower.js';

// The footprint a built flower actually occupies, and the widest point of its centerlines.
function footprint(geo) {
  geo.computeBoundingBox();
  const s = new THREE.Vector3();
  geo.boundingBox.getSize(s);
  return { w: s.x, h: s.y, d: s.z };
}

describe('flower kinds', () => {
  it('every kind builds', () => {
    for (const kind of FLOWER_ORDER) {
      const geo = buildFlower(kind, {});
      expect(geo, kind).toBeTruthy();
      expect(geo.getAttribute('position').count, kind).toBeGreaterThan(100);
    }
  });

  /* ⚠️ THE BUDGET IS THE POINT, not a nicety. A flower is dozens of swept strokes where a piped
   * line is one, and at the pen's full detail a dahlia came to 362,000 vertices — for one
   * decoration a baker might place six of. `FLOWER_LOD` coarsens the slit and caps the segments.
   * If this ever fails, something has stopped passing the LOD through. */
  it('stays inside a sane vertex budget', () => {
    for (const kind of FLOWER_ORDER) {
      const n = buildFlower(kind, {}).getAttribute('position').count;
      expect(n, `${kind} is ${n} vertices`).toBeLessThan(60_000);
    }
  });

  /* ⚠️ The same flower twice must be the same flower. The unevenness that stops a bloom reading as
   * printed is a hash of each petal's index, never Math.random — a flower that reshuffled on every
   * render could not be tuned against its own preview, and a saved element would come back as a
   * different flower than the one that was saved. */
  it('is deterministic', () => {
    const a = buildFlower('dahlia', {}).getAttribute('position').array;
    const b = buildFlower('dahlia', {}).getAttribute('position').array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('"Across" means across', () => {
  /* The control that lied. Ring radii are not the outer edge — `open` tilts the tips outward and
   * the bead adds its own width on top — so a rose asked for 0.85 measured 1.01 while a primrose
   * measured 0.54. Two flowers at the same setting were different sizes, which makes the number
   * useless for the one thing it is for: matching a customer's picture. */
  it('builds close to the width asked for', () => {
    for (const size of [0.4, 0.85, 1.3]) {
      for (const kind of FLOWER_ORDER) {
        const { w, d } = footprint(buildFlower(kind, { size }));
        const widest = Math.max(w, d);
        expect(widest, `${kind} @ ${size} measured ${widest.toFixed(2)}`).toBeLessThanOrEqual(size * 1.04);
        // The floor is looser than the ceiling on purpose: petals are unevenly placed, so with few
        // of them no two sit exactly opposite and the measured span is honestly a little short.
        expect(widest, `${kind} @ ${size} measured ${widest.toFixed(2)}`).toBeGreaterThan(size * 0.75);
      }
    }
  });

  it('scales the footprint without scaling the petal height', () => {
    const low  = footprint(buildFlower('rose', { size: 0.8, rise: 0.10 }));
    const high = footprint(buildFlower('rose', { size: 0.8, rise: 0.30 }));
    expect(high.h).toBeGreaterThan(low.h * 1.5);
    expect(Math.abs(high.w - low.w)).toBeLessThan(0.1);
  });
});

describe('a kind is a starting point, not a menu', () => {
  /* The brief allows presets but not being STUCK in them. Every number is overridable, and so are
   * the two choices that make a flower a different flower rather than the same one resized. If
   * these stopped being honoured, the five kinds would quietly become the whole menu. */
  it('lets the baker override the petal direction and the middle', () => {
    expect(resolveFlowerForm('rose', {})).toBe('rose' && flowerDef('rose').form);
    expect(resolveFlowerForm('rose', { form: 'radial' })).toBe('radial');
    expect(resolveFlowerCentre('daisy', { centre: 'spiral' })).toBe('spiral');
  });

  it('ignores a form or centre it does not know, rather than drawing nothing', () => {
    // These arrive from a saved element's placement_config, which is data we did not write today.
    expect(resolveFlowerForm('rose', { form: 'sideways' })).toBe(flowerDef('rose').form);
    expect(resolveFlowerCentre('rose', { centre: 'banana' })).toBe(flowerDef('rose').centre);
  });

  it('builds a combination no kind ships with', () => {
    const geo = buildFlower('rose', { form: 'radial', centre: 'heap', layers: 2, petals: 9 });
    expect(geo).toBeTruthy();
    expect(geo.getAttribute('position').count).toBeGreaterThan(100);
  });

  it('a wrapped petal and a radial one are genuinely different paths', () => {
    const wrap   = flowerStrokes('rose', { form: 'wrap',   centre: 'none' });
    const radial = flowerStrokes('rose', { form: 'radial', centre: 'none' });
    expect(wrap.length).toBe(radial.length);
    // A wrapped petal holds its radius; a radial one travels in toward the middle.
    const span = (s) => {
      const r = s.points.map(([x, , z]) => Math.hypot(x, z));
      return Math.max(...r) - Math.min(...r);
    };
    expect(span(radial[0])).toBeGreaterThan(span(wrap[0]) * 2);
  });
});

describe('rings', () => {
  it('inner petals are smaller than outer ones', () => {
    // The thing that makes a bloom read as a bloom rather than a ring of identical petals.
    const strokes = flowerStrokes('rose', { layers: 3, centre: 'none' }).filter(s => s.points);
    const height = (s) => Math.max(...s.points.map(([, y]) => y));
    expect(height(strokes[strokes.length - 1])).toBeGreaterThan(height(strokes[0]));
  });

  it('more rings means more petals', () => {
    const one  = flowerStrokes('rose', { layers: 1 }).length;
    const four = flowerStrokes('rose', { layers: 4 }).length;
    expect(four).toBeGreaterThan(one);
  });

  it('a kind\'s defaults do not leak into another kind', () => {
    // `resolveFlowerParams` layers kind defaults over the schema defaults; a rose's 150 degree wrap
    // showing up on a dahlia would give a flower that is neither.
    expect(resolveFlowerParams('rose', {}).span).toBe(flowerDef('rose').defaults.span);
    expect(resolveFlowerParams('dahlia', {}).span).toBe(flowerDef('dahlia').defaults.span);
    expect(resolveFlowerParams('rose', {}).span).not.toBe(resolveFlowerParams('dahlia', {}).span);
  });
});
