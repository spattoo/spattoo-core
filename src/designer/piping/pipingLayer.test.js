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

/* ── The two branches answer the SAME QUESTIONS ──────────────────────────────────────────────────
 *
 * `pipingPlacementFromConfig` is one function with two returns — rim and board — each reading its
 * own `top_*` / `bottom_*` keys. Twenty-odd fields, written out twice, and nothing checked that the
 * two lists matched.
 *
 * ⚠️ THEY DID NOT. The board branch returned everything except `finish`, so `bottom_ring_finish`
 * was resolved and then thrown away: a rosette authored `ring_finish: "element"` kept its GLB's own
 * materials on the rim and fell back to the recoloured cream path on the board. One element, one
 * hex, two colours on the same cake, and no error anywhere. `...drip` was missing too.
 *
 * Comparing KEY SETS rather than values is the point. The values legitimately differ per zone —
 * that is what the zones are for — but a field present on one side and absent on the other is
 * always a bug, and it is the only shape this fault can take.
 */
describe('rim and board return the same fields', () => {
  const FULL = {
    top_ring_finish: 'element', bottom_ring_finish: 'element',
    top_rotation: [1, 2, 3], bottom_rotation: [4, 5, 6],
    top_flip: false, bottom_flip: true,
    top_radial_offset: -0.06, bottom_radial_offset: 0.2,
    top_y_offset: -0.02, bottom_y_offset: 0.09,
    top_spacing: 1, bottom_spacing: 1,
    top_arrangement: 'ring', bottom_arrangement: 'ring',
  };

  /* ⚠️ FOUR FIELDS ARE DELIBERATELY NAMED PER ZONE, and they are listed rather than the comparison
     being loosened. The renderer reads `flipTop`/`rotation` on a rim and `flipBottom`/
     `bottomRotation` on a board, and piping-borders.md already records the hazard that creates:
     "reading `.rotation` off the bottom gives undefined, which a `??` fallback then quietly
     replaces with the rim figure". Naming them keeps the test able to catch a FORGOTTEN field —
     which is the fault that actually happened — while permitting the split that is on purpose. */
  /* ⚠️ `sideRotation` IS A FIFTH, AND IT IS BOTTOM-ONLY RATHER THAN RENAMED. The four above are the
     same concept under two names; this one has no rim counterpart at all, because there is no wall
     above the rim for a pen to draw on. It is listed here — not excluded by loosening the filter —
     for the reason this block already gives: the test must stay able to catch a field someone
     FORGOT, and every exception that is spelled out keeps that power while an exception that is
     inferred throws it away. */
  const PER_ZONE_NAMES = ['flipTop', 'flipBottom', 'rotation', 'bottomRotation', 'sideRotation'];

  /* ⚠️ A DRIP IS A RIM FEATURE. The board states `drip: false` and carries no drip SETTINGS,
     because it has none to carry — so its sub-fields are a real asymmetry rather than an omission.
     `drip` itself is compared: both zones must say whether they have one, and the board's silence
     on that was part of the bug this suite exists for. */
  const isDripSetting = k => k.startsWith('drip') && k !== 'drip';

  it('neither branch carries a field the other lacks', () => {
    const keys = isTop => Object.keys(pipingPlacementFromConfig(FULL, isTop))
      .filter(k => !PER_ZONE_NAMES.includes(k) && !isDripSetting(k)).sort();
    const rim = keys(true), board = keys(false);
    const onlyRim = rim.filter(k => !board.includes(k));
    const onlyBoard = board.filter(k => !rim.includes(k));
    expect({ onlyRim, onlyBoard }).toEqual({ onlyRim: [], onlyBoard: [] });
  });

  it('both zones DO state a flip and a rotation, under their own names', () => {
    const rim = pipingPlacementFromConfig(FULL, true);
    const board = pipingPlacementFromConfig(FULL, false);
    expect(rim.flipTop).toBe(false);
    expect(board.flipBottom).toBe(true);
    expect(rim.rotation).toEqual([1, 2, 3]);
    expect(board.bottomRotation).toEqual([4, 5, 6]);
  });

  /* ⚠️ THE ONE THAT ACTUALLY BIT. Named separately so a failure says what broke rather than
     printing a key diff somebody has to interpret. */
  it('the board honours bottom_ring_finish', () => {
    expect(pipingPlacementFromConfig(FULL, false).finish).toBe('element');
    expect(pipingPlacementFromConfig(FULL, true).finish).toBe('element');
  });

  it('falls back to cream on both zones when nothing is authored', () => {
    expect(pipingPlacementFromConfig({}, false).finish).toBe('cream');
    expect(pipingPlacementFromConfig({}, true).finish).toBe('cream');
  });

  it('a shared ring_finish reaches both zones', () => {
    const pc = { ring_finish: 'element' };
    expect(pipingPlacementFromConfig(pc, true).finish).toBe('element');
    expect(pipingPlacementFromConfig(pc, false).finish).toBe('element');
  });
});

/* ── The wall gets its own attitude ──────────────────────────────────────────────────────────────
 *
 * A piping RING has two zones, rim and board, and a side border is a board ring lifted up the wall
 * — both face outward off the wall, so one rotation serves both honestly. The PEN is a third case:
 * on a wall it aligns the piece's up-axis to the surface normal, a different frame from the ring's.
 * `stampRotationSide` read the BOARD's figure, so a rosette authored [0,0,0] for its board border
 * came out back-on when hand-piped. Sandeep: *"it should be 90 degrees different from board"*.
 */
describe('side_rotation', () => {
  it('is published for the bottom surface', () => {
    const p = pipingPlacementFromConfig({ side_rotation: [90, 0, 0], bottom_rotation: [0, 0, 0] }, false);
    expect(p.sideRotation).toEqual([90, 0, 0]);
    expect(p.bottomRotation).toEqual([0, 0, 0]);   // the board is untouched by it
  });

  it('is absent when not authored, so the read site can fall back to the board', () => {
    const p = pipingPlacementFromConfig({ bottom_rotation: [-89, -174, -180] }, false);
    expect(p.sideRotation).toBeNull();
    expect(p.bottomRotation).toEqual([-89, -174, -180]);
  });

  it('is a BOTTOM-surface key — the rim branch does not carry it', () => {
    const p = pipingPlacementFromConfig({ side_rotation: [90, 0, 0] }, true);
    expect(p.sideRotation).toBeUndefined();
  });
});
