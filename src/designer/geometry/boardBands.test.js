import { describe, it, expect } from 'vitest';
import { shellBand, wallYoBounds, stackedYoBounds, clampYo } from './boardBands.js';

// A rosette-ish shell on a typical tier: reaches 0.12r above its anchor and 0.12r below.
const R = 0.9, H = 2.2, TOP = 0.12, BOT = -0.12;
const bandAt = (yo) => shellBand(yo, R, TOP, BOT);

describe('shellBand', () => {
  it('brackets the anchor by the shell reach, scaled by the tier radius', () => {
    expect(bandAt(1)).toEqual([1 - 0.9 * 0.12, 1 + 0.9 * 0.12]);
  });
});

describe('wallYoBounds — what a hand-placed piece may do', () => {
  it('lets the shell sit with its bottom exactly on the tier base', () => {
    const { yoMin } = wallYoBounds({ tierHeight: H, yo: 1, band: bandAt(1) });
    const [lo] = shellBand(yoMin, R, TOP, BOT);
    expect(lo).toBeCloseTo(0, 6);
  });
  it('lets the shell sit with its top exactly on the rim', () => {
    const { yoMax } = wallYoBounds({ tierHeight: H, yo: 1, band: bandAt(1) });
    const [, hi] = shellBand(yoMax, R, TOP, BOT);
    expect(hi).toBeCloseTo(H, 6);
  });
  it('does not depend on where the piece currently is', () => {
    const low  = wallYoBounds({ tierHeight: H, yo: 0.2, band: bandAt(0.2) });
    const high = wallYoBounds({ tierHeight: H, yo: 1.9, band: bandAt(1.9) });
    expect(low.yoMin).toBeCloseTo(high.yoMin, 6);
    expect(low.yoMax).toBeCloseTo(high.yoMax, 6);
  });
});

describe('stackedYoBounds — what a whole RING may do', () => {
  it('rests on a ring below it', () => {
    const neighbour = bandAt(0.5);                       // a ring lower down
    const { yoMin } = stackedYoBounds({ tierHeight: H, yo: 1.4, band: bandAt(1.4), neighbourBands: [neighbour] });
    const [lo] = shellBand(yoMin, R, TOP, BOT);
    expect(lo).toBeCloseTo(neighbour[1], 6);             // our bottom meets its top
  });
  it('stops under a ring above it', () => {
    const neighbour = bandAt(1.8);
    const { yoMax } = stackedYoBounds({ tierHeight: H, yo: 0.6, band: bandAt(0.6), neighbourBands: [neighbour] });
    const [, hi] = shellBand(yoMax, R, TOP, BOT);
    expect(hi).toBeCloseTo(neighbour[0], 6);
  });
  it('ignores a ring that overlaps it rather than sitting clear', () => {
    const { yoMin, yoMax } = stackedYoBounds({ tierHeight: H, yo: 1.0, band: bandAt(1.0), neighbourBands: [bandAt(1.02)] });
    const plain = wallYoBounds({ tierHeight: H, yo: 1.0, band: bandAt(1.0) });
    expect(yoMin).toBeCloseTo(plain.yoMin, 6);
    expect(yoMax).toBeCloseTo(plain.yoMax, 6);
  });
});

describe('the reported bug: a piece pinned by a layer it never touches', () => {
  // A white rosette at 331° and a purple layer elsewhere on the cake. Reported 2026-09-10:
  // the white one moved up freely and would not go below the purple one's top.
  const purple = bandAt(0.9);
  const white  = 1.3;

  it('the RING rule would pin it well above the tier base — the old behaviour', () => {
    const { yoMin } = stackedYoBounds({ tierHeight: H, yo: white, band: bandAt(white), neighbourBands: [purple] });
    expect(yoMin).toBeGreaterThan(0.9);                  // stuck near the purple layer
  });

  it('a hand-placed piece is free to the tier base, because angle makes collision impossible', () => {
    const { yoMin } = wallYoBounds({ tierHeight: H, yo: white, band: bandAt(white) });
    expect(yoMin).toBeCloseTo(R * 0.12, 6);              // only its own shell holds it up
    const [lo] = shellBand(yoMin, R, TOP, BOT);
    expect(lo).toBeCloseTo(0, 6);
  });

  it('and it still cannot leave the wall at either end', () => {
    const b = wallYoBounds({ tierHeight: H, yo: white, band: bandAt(white) });
    expect(clampYo(-99, b)).toBeCloseTo(b.yoMin, 6);
    expect(clampYo(+99, b)).toBeCloseTo(b.yoMax, 6);
  });
});

describe('clampYo', () => {
  it('keeps the piece on the cake when the band inverts (tall shell, short tier)', () => {
    const b = { yoMin: 0.5, yoMax: 0.2 };
    expect(clampYo(0.35, b)).toBe(0.5);
  });
});
