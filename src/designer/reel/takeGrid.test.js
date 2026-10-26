import { describe, it, expect } from 'vitest';
import { gridPositions, gridLineCount, GRID, GRID_COLOR } from './takeGrid.js';

describe('the grid floor a take is filmed on', () => {
  it('draws every line across the full extent, both ways', () => {
    const v = gridPositions();
    expect(v.length).toBe(gridLineCount() * 6);
    const half = GRID.extent / 2;
    for (let i = 0; i < v.length; i += 6) {
      const [ax, ay, az, bx, by, bz] = v.slice(i, i + 6);
      expect(ay).toBe(0);
      expect(by).toBe(0);
      // One end to the other: a line runs the whole width or the whole depth, never a stub.
      const spansX = Math.abs(ax - bx) === GRID.extent && az === bz;
      const spansZ = Math.abs(az - bz) === GRID.extent && ax === bx;
      expect(spansX || spansZ, `segment ${i / 6} should span the grid`).toBe(true);
      for (const c of [ax, az, bx, bz]) expect(Math.abs(c)).toBeLessThanOrEqual(half + 1e-9);
    }
  });

  /* ⚠️ SQUARE AND CENTRED, because this scene ORBITS. The marketing grid runs away from a fixed
     camera and needs no back edge; drive the designer's camera round a grid like that and you film
     the edge of the floor. */
  it('is centred on the cake and symmetric about both axes', () => {
    const v = gridPositions();
    const xs = new Set(); const zs = new Set();
    for (let i = 0; i < v.length; i += 6) {
      if (v[i + 2] === v[i + 5]) zs.add(v[i + 2]); else xs.add(v[i]);
    }
    for (const z of zs) expect(zs.has(-z), `mirror of z=${z}`).toBe(true);
    for (const x of xs) expect(xs.has(-x), `mirror of x=${x}`).toBe(true);
    // And there is a line through the middle, which is what makes it read as centred.
    expect(zs.has(0)).toBe(true);
    expect(xs.has(0)).toBe(true);
  });

  it('sits above the floor, not in it', () => {
    // The shadow catcher writes depth at y=0; a grid level with it would z-fight.
    expect(GRID.y).toBeGreaterThan(0);
    expect(GRID.y).toBeLessThan(0.02);
  });

  /* ⚠️ QUIET. It is a floor, not a subject. */
  it('is faint enough to be scenery', () => {
    expect(GRID.opacity).toBeGreaterThan(0);
    expect(GRID.opacity).toBeLessThan(0.5);
  });

  it('keeps the marketing site\'s own line colour', () => {
    // The two scenes should read as the same product; this is the number carried over.
    expect(GRID_COLOR).toBe('#6b8f7e');
  });

  it('survives rubbish rather than emitting NaN into a buffer', () => {
    for (const bad of [{ extent: NaN, step: NaN }, { extent: -5, step: 0 }, {}]) {
      const v = gridPositions(bad);
      expect(v.every(Number.isFinite), JSON.stringify(bad)).toBe(true);
    }
  });

  it('gets denser as the step shrinks, and agrees with its own count', () => {
    const coarse = gridPositions({ extent: 20, step: 4 });
    const fine = gridPositions({ extent: 20, step: 1 });
    expect(fine.length).toBeGreaterThan(coarse.length);
    expect(coarse.length).toBe(gridLineCount({ extent: 20, step: 4 }) * 6);
    expect(fine.length).toBe(gridLineCount({ extent: 20, step: 1 }) * 6);
  });
});
