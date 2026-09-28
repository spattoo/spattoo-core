import { describe, it, expect } from 'vitest';
import { elementStick, stickFor, stickLift, ELEMENT_STICK_DEFAULTS, STICK_SCALE } from './elementStick.js';

const BOX = { w: 0.4, h: 0.3, d: 0.1, cy: 0, cz: 0 };

describe('elementStick — what the row offers', () => {
  it('offers nothing until the capability is ticked, whatever the numbers say', () => {
    expect(elementStick({ stick: { bury: 0.8 } }, { resize: true }).offered).toBe(false);
    expect(elementStick({ stick: { bury: 0.8 } }, { stick: true }).offered).toBe(true);
  });

  it('takes the authored starting depth', () => {
    expect(elementStick({ stick: { bury: 0.75 } }, { stick: true }).bury).toBe(0.75);
  });

  it('falls back to half in, half out', () => {
    expect(elementStick({}, { stick: true }).bury).toBe(ELEMENT_STICK_DEFAULTS.bury);
    expect(elementStick(null, null).bury).toBe(ELEMENT_STICK_DEFAULTS.bury);
  });

  it('clamps a depth that cannot exist', () => {
    expect(elementStick({ stick: { bury: 4 } }, { stick: true }).bury).toBe(1);
    expect(elementStick({ stick: { bury: -1 } }, { stick: true }).bury).toBe(0);
  });
});

describe('stickFor — what gets drawn', () => {
  it('draws nothing when the instance has no stick', () => {
    expect(stickFor(BOX, null, { bury: 0.5 })).toBe(null);
    expect(stickFor(BOX, { on: false }, { bury: 0.5 })).toBe(null);
  });

  it('draws nothing before the element has been measured', () => {
    expect(stickFor(null, { on: true }, null)).toBe(null);
  });

  it('is proportional to the element it carries, not a world constant', () => {
    const small = stickFor({ ...BOX, h: 0.3 }, { on: true, bury: 0.5 }, null);
    const big   = stickFor({ ...BOX, h: 0.6 }, { on: true, bury: 0.5 }, null);
    expect(big.len).toBeCloseTo(small.len * 2, 6);
  });

  it("lets the instance's depth beat the row's starting one", () => {
    const s = stickFor(BOX, { on: true, bury: 0.9 }, { bury: 0.2 });
    expect(s.buried / s.len).toBeCloseTo(0.9, 6);
  });

  it("uses the row's depth when the instance has not been moved", () => {
    const s = stickFor(BOX, { on: true }, { bury: 0.2 });
    expect(s.buried / s.len).toBeCloseTo(0.2, 6);
  });
});

/* ── The rod reaches the icing. Always. ──────────────────────────────────────────────────────────
 *
 * ⚠️ THIS IS THE ONE THAT WAS MISSING, and it is the shape of test the bug demanded. `stickFor` and
 * `stickLift` were each correct; what was wrong was the FRAME the renderer read them in. It drew the
 * rod a bare `len` below the group origin, which is the element's CENTRE, while `topperStick`
 * measures from the box's BOTTOM — so every pick hung half the element's height too high and the
 * heart floated over the cake at any depth under about 0.63. Sandeep: *"stick is floating."*
 *
 * A unit test of either function alone could not see it, because neither was wrong. So this one
 * replicates the renderer's own arithmetic — seat the element, add the lift, place the rod at
 * `baseY` — and asserts the property that actually matters: the end that goes in is never above the
 * surface. It is a PROPERTY, swept over every depth, length and size, not a golden number: the
 * failure was a whole family of cases, not one.
 */
describe('the end that goes in never floats above the icing', () => {
  // What CakeCanvas does: py = topY + lift + seatHalf, and the rod sits at py + baseY.
  const rodBottomOverSurface = (box, stick, effScale = 1) => {
    const rod = stickFor(box, stick, null);
    const py = stickLift(rod) * effScale + (box.h / 2) * effScale;   // topY = 0
    return py + rod.baseY * effScale;
  };

  it('touches at zero depth and sinks in from there', () => {
    for (const bury of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const over = rodBottomOverSurface(BOX, { on: true, bury });
      expect(over).toBeLessThanOrEqual(1e-9);
      // And it goes in by exactly the depth asked for — not less, which is the floating case.
      expect(over).toBeCloseTo(-stickFor(BOX, { on: true, bury }, null).buried, 9);
    }
  });

  it('holds at any length, size and instance scale', () => {
    for (const h of [0.08, 0.3, 1.4]) {
      for (const length of [STICK_SCALE.min, 1, 2.2, STICK_SCALE.max]) {
        for (const effScale of [0.4, 1, 2.5]) {
          const over = rodBottomOverSurface({ ...BOX, h }, { on: true, bury: 0.2, length }, effScale);
          expect(over).toBeLessThanOrEqual(1e-9);
        }
      }
    }
  });

  it('is measured from the element, so an off-centre box does not shift it', () => {
    // A bent model reports a box whose centre is not the origin; the conversion must use it.
    const off = stickFor({ ...BOX, cy: 0.07 }, { on: true, bury: 0.5 }, null);
    const mid = stickFor({ ...BOX, cy: 0 },    { on: true, bury: 0.5 }, null);
    expect(off.baseY).toBeCloseTo(mid.baseY, 9);
  });
});

/* ── How long and how thick, which a row authors and a baker moves ──────────────────────────────
 * Sandeep: *"stick length should be dynamic. and also add a control for the stick thickness. its
 * too thin now."* Both are MULTIPLIERS on what `topperStick` derives from the element's own box —
 * a world length here would be INVARIANTS #8 and wrong on the next cake size. */
describe('the rod a row authors', () => {
  it('reads length and thickness off the row, with a default that suits an element', () => {
    const r = elementStick({ stick: { length: 3, thickness: 1.5 } }, { stick: true });
    expect(r.length).toBe(3);
    expect(r.thickness).toBe(1.5);
    const bare = elementStick({}, { stick: true });
    expect(bare.length).toBe(ELEMENT_STICK_DEFAULTS.length);
    expect(bare.thickness).toBe(ELEMENT_STICK_DEFAULTS.thickness);
    // A card topper's own proportions are 1×; an element needs more of both, which is the point.
    expect(ELEMENT_STICK_DEFAULTS.length).toBeGreaterThan(1);
    expect(ELEMENT_STICK_DEFAULTS.thickness).toBeGreaterThan(1);
  });

  it('clamps what cannot be built, at both ends', () => {
    expect(elementStick({ stick: { length: 999 } }, { stick: true }).length).toBe(STICK_SCALE.max);
    expect(elementStick({ stick: { thickness: 0 } }, { stick: true }).thickness).toBe(STICK_SCALE.min);
    expect(elementStick({ stick: { length: 'long' } }, { stick: true }).length).toBe(ELEMENT_STICK_DEFAULTS.length);
  });

  it('lets the instance beat the row, like the depth does', () => {
    const a = stickFor(BOX, { on: true, bury: 0.5, length: 1 },   { length: 4 });
    const b = stickFor(BOX, { on: true, bury: 0.5 },              { length: 4 });
    expect(b.len).toBeCloseTo(a.len * 4, 6);
  });

  it('scales the rod, not the element it carries', () => {
    const thin = stickFor(BOX, { on: true, bury: 0.5, thickness: 1 }, null);
    const fat  = stickFor(BOX, { on: true, bury: 0.5, thickness: 3 }, null);
    expect(fat.radius).toBeCloseTo(thin.radius * 3, 9);
    expect(fat.len).toBeCloseTo(thin.len, 9);      // thickness must not change how high it rides
  });
});

describe('stickLift — how high it rides', () => {
  it('lifts by the part of the stick that did NOT go in', () => {
    const s = stickFor(BOX, { on: true, bury: 0.25 }, null);
    expect(stickLift(s)).toBeCloseTo(s.len * 0.75, 6);
  });

  it('sits the element on the icing when the whole stick is buried', () => {
    const s = stickFor(BOX, { on: true, bury: 1 }, null);
    expect(stickLift(s)).toBeCloseTo(0, 6);
  });

  it('is zero without a stick, so a caller can add it unconditionally', () => {
    expect(stickLift(null)).toBe(0);
  });
});
