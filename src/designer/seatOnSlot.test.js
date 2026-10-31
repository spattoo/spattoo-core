import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { seatOnSlot } from './placement.js';
import { ZONES, BOTTOM_H } from './constants.js';
import { tierShape } from './geometry/surface.js';

/* ── Where a piece lands when a slot is ticked ───────────────────────────────────────────────────
 *
 * This function spent its life as a closure inside `CakeDesigner.jsx`, 13,400 lines in, with one
 * caller and no test. It is the answer to "a baker ticked BOARD — where does the thing go", and the
 * drag that moves the piece afterwards honours the same seat, so a second implementation of it
 * would disagree with the hand that moves it (INVARIANTS #10 law 1).
 *
 * It is tested now because a second caller is coming — a composed design seats pieces on slots the
 * same way — and because the extraction itself could have moved a seat silently. Three of the cases
 * below are the ones that would not have errored.
 */

const ROUND = { shape: 'round', radius: 1, height: 1.45 };

const ctx = (over = {}) => ({
  pc: {},
  tierHeights: [1.45, 1.1],
  shapeAt: () => tierShape(ROUND),
  baseShape: tierShape(ROUND),
  board: { kind: 'round', radius: 1.6, width: 3.2, depth: 3.2 },
  ...over,
});

describe('seatOnSlot', () => {
  it('seats the top surface at the centre', () => {
    const { pos } = seatOnSlot({ zone: ZONES.TOP_SURFACE, tierIndex: 0 }, ctx());
    expect(pos).toEqual({ x: 0, z: 0 });
  });

  /* ⚠️ THE BRANCH THAT DID NOT EXIST ONCE. A board slot used to fall through to the side case and
     got `{ theta, y }` — a decoration meant to stand on the drum, hung on the wall. It is a point
     in FRONT of the cake, which is where a board piece is visible and most likely wanted. */
  it('seats the board in front of the cake, on the drum, not on the wall', () => {
    const { pos } = seatOnSlot({ zone: ZONES.BOARD, tierIndex: 0 }, ctx());
    expect(pos.theta, 'a board seat is cartesian, never a wall angle').toBeUndefined();
    expect(pos.x, 'dead ahead — the clamp has no outward direction from the centre, so it goes +z')
      .toBeCloseTo(0, 6);
    /* ⚠️ EXACTLY THE TIER'S REACH, NOT BEYOND IT, and that is the clamp's contract rather than a
       boundary slip: `boardRingClamp` adds the decoration's own half-width as `margin` so a piece
       CLEARS the cake, and this caller passes none. So the seat sits on the cake's front outline —
       the inner edge of the board ring — and the piece's own size carries it clear from there. */
    expect(pos.z).toBeCloseTo(1, 6);
    expect(pos.z, 'on the ring, never past the drum').toBeLessThanOrEqual(1.6);
  });

  it('falls back to the centre when there is no board', () => {
    const { pos } = seatOnSlot({ zone: ZONES.BOARD, tierIndex: 0 }, ctx({ board: null }));
    expect(pos).toEqual({ x: 0, z: 0 });
  });

  /* The side seat climbs with the stack: tier 1 sits a whole tier height above tier 0. Off-by-one
     here puts a second-tier decoration inside the first. */
  it('stacks the side seat by the heights below it', () => {
    const a = seatOnSlot({ zone: ZONES.SIDE, tierIndex: 0 }, ctx()).pos;
    const b = seatOnSlot({ zone: ZONES.SIDE, tierIndex: 1 }, ctx()).pos;
    expect(a.y).toBeCloseTo(0.1 + 1.45 * 0.45, 6);
    expect(b.y).toBeCloseTo(0.1 + 1.45 + 1.1 * 0.45, 6);
    expect(b.y).toBeGreaterThan(a.y);
  });

  it('falls back to BOTTOM_H for a height it was not given', () => {
    const { pos } = seatOnSlot({ zone: ZONES.SIDE, tierIndex: 1 }, ctx({ tierHeights: [] }));
    expect(pos.y).toBeCloseTo(0.1 + BOTTOM_H + BOTTOM_H * 0.45, 6);
  });

  /* ⚠️ A FLAT SURFACE IS STOOD ON, NEVER HUGGED — `flatPose`. A board hug seats a model's MIDDLE at
     the surface, which sank a football halfway into the drum. The picker asks `zonePoses` for the
     poses the SEAT will honour precisely so it cannot offer a tile this coerces away. */
  it('coerces a board hug to standing', () => {
    const { mode } = seatOnSlot({ zone: ZONES.BOARD, tierIndex: 0, mode: 'hug' }, ctx());
    expect(mode).toBe('stand');
  });

  it("takes the tile's pose over the zone default", () => {
    const pc = { top_surface: { modes: ['hug', 'stand'], mode: 'hug' } };
    expect(seatOnSlot({ zone: ZONES.TOP_SURFACE, tierIndex: 0, mode: 'stand' }, ctx({ pc })).mode)
      .toBe('stand');
  });

  /* An `insert` modifier re-bakes the lean, fan and depth through the same helper the add path
     uses, composed ON TOP of the zone's seat — so the seat point survives and the angles arrive. */
  it('composes an insert modifier over the seat rather than replacing it', () => {
    const pc = { top_surface: { insert: { depth: 0.3 } } };
    const { pos } = seatOnSlot({ zone: ZONES.TOP_SURFACE, tierIndex: 0 }, ctx({ pc }));
    expect(pos.x, 'the seat is kept').toBe(0);
    expect(pos.z, 'the seat is kept').toBe(0);
    expect(pos).toHaveProperty('insertDepth');
    expect(pos).toHaveProperty('tiltAngle');
  });
});

/* ── The extraction itself ───────────────────────────────────────────────────────────────────────
 *
 * ⚠️ `shapeAt` AND `baseShape` ARE TWO ACCESSORS, AND COLLAPSING THEM IS SILENT. The rim branch
 * asked `tierShapeAt`, which overrides a tier's radius with `tierRadius`; the board branch asked
 * `tierShape` on the raw tier, which does not. I collapsed them to one while extracting this and
 * caught it only by re-reading the original — nothing would have errored, every board seat would
 * simply have moved on any tier whose stored radius differs from its computed one.
 */
describe('the seat has one implementation', () => {
  const designer = readFileSync(new URL('./CakeDesigner.jsx', import.meta.url), 'utf8');

  it('the board clamp is handed the RAW bottom tier, not the radius-overridden one', () => {
    const { pos: wide } = seatOnSlot({ zone: ZONES.BOARD, tierIndex: 0 },
      ctx({ baseShape: tierShape({ shape: 'round', radius: 2.4 }) }));
    const { pos: narrow } = seatOnSlot({ zone: ZONES.BOARD, tierIndex: 0 },
      ctx({ baseShape: tierShape({ shape: 'round', radius: 0.6 }) }));
    expect(wide.z, 'the base outline reaches the clamp, so it must be the right one')
      .not.toBeCloseTo(narrow.z, 3);
    expect(designer).toMatch(/baseShape: tierShape\(design\.tiers\[0\] \?\? \{\}\)/);
  });

  it('CakeDesigner delegates rather than carrying its own copy', () => {
    expect(designer).toMatch(/seatOnSlot as seatPieceOnSlot/);
    expect(designer).toMatch(/const seatOnSlot = slot => seatPieceOnSlot\(slot, seatCtx\)/);
    expect(designer, 'the inline implementation is gone, not merely unused')
      .not.toMatch(/const seatOnSlot = slot => \{/);
  });
});
