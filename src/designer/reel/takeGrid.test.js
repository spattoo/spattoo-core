import { describe, it, expect } from 'vitest';
import {
  gridPositions, gridLineCount, wallPositions, floorOpacity, wallOpacity,
  GRID, WALL, GRID_COLOR, STRENGTH_DEFAULT, STRENGTH_MIN, WALL_RELATIVE,
} from './takeGrid.js';

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

  /* ⚠️ VISIBLE BY DEFAULT, which the first value was not. Measured on a delivered 2732x1542 video,
     a line above the cake differed from its ground by 25 of 255 — about a tenth. "grid lines are
     hardly visible." The strength is the baker's now; this is only where the slider starts. */
  it('starts strong enough to be seen', () => {
    expect(STRENGTH_DEFAULT).toBe(GRID.opacity);
    expect(STRENGTH_DEFAULT).toBeGreaterThan(0.45);
    expect(STRENGTH_DEFAULT).toBeLessThanOrEqual(1);
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

describe('the backdrop behind the cake', () => {
  it('stands on the ground and rises, with verticals and horizontals', () => {
    const v = wallPositions();
    let verticals = 0, horizontals = 0;
    for (let i = 0; i < v.length; i += 6) {
      const [ax, ay, az, bx, by, bz] = v.slice(i, i + 6);
      expect(az).toBe(0);
      expect(bz).toBe(0);                      // it is a flat plane; the caller turns it
      if (ax === bx) { verticals++; expect(ay).toBe(0); expect(by).toBeCloseTo(WALL.height, 9); }
      else { horizontals++; expect(ay).toBe(by); }
      expect(Math.min(ay, by)).toBeGreaterThanOrEqual(0);   // never below the floor
    }
    // ⚠️ The verticals are the ones that were asked for, so there must actually be some.
    expect(verticals).toBeGreaterThan(4);
    expect(horizontals).toBeGreaterThan(2);
  });

  it('is centred left-to-right, so turning it keeps the cake in the middle', () => {
    const v = wallPositions();
    const xs = new Set();
    for (let i = 0; i < v.length; i += 6) if (v[i] === v[i + 3]) xs.add(v[i]);
    for (const x of xs) expect(xs.has(-x), `mirror of x=${x}`).toBe(true);
    expect(xs.has(0)).toBe(true);
  });

  /* ⚠️ WIDER THAN THE FLOOR IT STANDS ON, or its two ends show as vertical edges hanging in the
     middle of the shot instead of leaving the frame. */
  it('is wider than the floor grid and meets it at the edge', () => {
    expect(WALL.width).toBeGreaterThan(GRID.extent);
    expect(WALL.distance).toBe(GRID.extent / 2);
  });

  /* ⚠️ THE BACKDROP STAYS FAINTER AT EVERY SETTING, not just at the default. One knob drives both
     so the depth cue cannot be lost by a baker turning one of two sliders up. */
  it('keeps the backdrop fainter than the floor at every strength', () => {
    expect(WALL.opacity).toBeLessThan(GRID.opacity);
    for (const s of [STRENGTH_MIN, 0.2, 0.5, 0.75, 1]) {
      expect(wallOpacity(s), `strength ${s}`).toBeLessThan(floorOpacity(s));
      expect(wallOpacity(s)).toBeCloseTo(floorOpacity(s) * WALL_RELATIVE, 9);
    }
  });

  it('clamps the strength and never goes invisible or over', () => {
    expect(floorOpacity(0)).toBe(STRENGTH_MIN);
    expect(floorOpacity(-5)).toBe(STRENGTH_MIN);
    expect(floorOpacity(9)).toBe(1);
    expect(floorOpacity(0.4)).toBeCloseTo(0.4, 9);
    // ⚠️ Rubbish falls back to the default rather than to 0 — an invisible grid looks like a bug,
    // and the chips are what turn it off.
    for (const bad of [NaN, undefined, 'x', null]) {
      if (bad === undefined) { expect(floorOpacity()).toBe(STRENGTH_DEFAULT); continue; }
      expect(Number.isFinite(floorOpacity(bad))).toBe(true);
      expect(floorOpacity(bad)).toBeGreaterThanOrEqual(STRENGTH_MIN);
    }
  });

  it('rises monotonically with the slider', () => {
    let prev = -1;
    for (let v = 0; v <= 1.0001; v += 0.05) {
      const o = floorOpacity(v);
      expect(o).toBeGreaterThanOrEqual(prev);
      prev = o;
    }
  });

  it('survives rubbish rather than emitting NaN into a buffer', () => {
    for (const bad of [{ width: NaN, height: NaN, step: NaN }, { width: -3, height: 0, step: 0 }, {}]) {
      expect(wallPositions(bad).every(Number.isFinite), JSON.stringify(bad)).toBe(true);
    }
  });
});
