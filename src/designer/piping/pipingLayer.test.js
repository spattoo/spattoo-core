import { describe, it, expect } from 'vitest';
import { pipingPlacementFromConfig, pipingAllowedArrangements, pipingDefaultArrangement } from './pipingLayer.js';

/* ── An element is authored PER SURFACE, and the pen draws on both ───────────────────────────────
 *
 * ⚠️ THIS IS THE WIRING THAT SHIPPED A ROSE SWIRL LYING FACE-DOWN. "I'll pipe it myself" passed the
 * RIM rotation for every stroke, reasoning that drawing on the cake is the case the top surface
 * answers — true of the top, false of the wall, and the wall is where a customer pipes a spray down
 * the side. Reported as the pen using a different nozzle from the element chosen, which is exactly
 * what the right shape in the wrong attitude looks like.
 *
 * The config below is the REAL `Rose Swirl` row from dev, read on 2026-10-03, not a shape invented
 * to make a point: a fixture that disagrees with the row proves the wrong thing, confidently.
 */
const ROSE_SWIRL = {
  r: 0.6, rim: 'hug', side: 'hug', top_surface: 'hug', middle_tier: 'hug',
  top_rotation: [0, 0, 0],
  bottom_rotation: [-89, -174, -180],
  top_pattern: 'AB', bottom_pattern: 'AB',
  top_arrangement: 'ring', bottom_arrangement: 'ring',
  hand_piping: true,
};

describe('pipingPlacementFromConfig — the two authored rotations', () => {
  /* ⚠️ THE TWO BRANCHES DO NOT RETURN THE SAME KEY. Top says `rotation`, bottom says
     `bottomRotation`, and reading `.rotation` off the bottom one gives undefined — which is a fix
     that looks right, falls back to the rim figure and changes nothing. This test exists because
     that is what I wrote first. */
  it('the rim rotation and the wall rotation are different, and each is under its own key', () => {
    expect(pipingPlacementFromConfig(ROSE_SWIRL, true).rotation).toEqual([0, 0, 0]);
    expect(pipingPlacementFromConfig(ROSE_SWIRL, false).bottomRotation).toEqual([-89, -174, -180]);
    expect(pipingPlacementFromConfig(ROSE_SWIRL, false).rotation).toBeUndefined();
  });

  /* The failure in one line: taking the top figure for a wall piece is not a near-miss, it is 89
     degrees of it. A test that only checked "a rotation came back" passed throughout. */
  it('they are far enough apart that using the wrong one lays the piece down', () => {
    const top = pipingPlacementFromConfig(ROSE_SWIRL, true).rotation;
    const side = pipingPlacementFromConfig(ROSE_SWIRL, false).bottomRotation;
    expect(Math.abs(side[0] - top[0])).toBeGreaterThan(45);
  });

  it('an element that authors no rotation answers null for both, and the pen falls back', () => {
    expect(pipingPlacementFromConfig({ r: 1 }, true).rotation ?? null).toBeNull();
    expect(pipingPlacementFromConfig({ r: 1 }, false).bottomRotation ?? null).toBeNull();
  });
});

/* ── `single` is retired from the choice, not from the renderer ──────────────────────────────────
 *
 * Four catalogue templates (the Vintage set) carry `arrangement: 'single'`, and one element
 * (Shell Fan) defaults to it. The option is gone from the card; everything already built on it has
 * to keep working, which is the only reason these two facts are pinned separately.
 */
describe('arrangements offered', () => {
  const BOTH   = { top_arrangements_allowed: ['ring', 'single'], bottom_arrangements_allowed: ['ring', 'single'] };
  const SINGLE = { top_arrangements_allowed: ['single'], top_arrangement: 'single' };

  it('never offers single, however the element is authored', () => {
    expect(pipingAllowedArrangements(BOTH, true)).toEqual(['ring']);
    expect(pipingAllowedArrangements(BOTH, false)).toEqual(['ring']);
    expect(pipingAllowedArrangements(SINGLE, true)).toEqual(['ring']);
  });

  /* ⚠️ THE SHELL FAN CASE. It is the one element whose authored default IS single, so without this
     a new ring from it would have placed one piece with no control left to say otherwise. */
  it('an element that defaults to single now starts as a ring', () => {
    expect(pipingDefaultArrangement(SINGLE, true)).toBe('ring');
    expect(pipingDefaultArrangement({ ...BOTH, top_arrangement: 'single' }, true)).toBe('ring');
  });

  it('a card with one choice cannot show a toggle', () => {
    expect(pipingAllowedArrangements(BOTH, true).length).toBe(1);
  });
});
