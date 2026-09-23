import { describe, it, expect } from 'vitest';
import { elementStick, stickFor, stickLift, ELEMENT_STICK_DEFAULTS } from './elementStick.js';

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
