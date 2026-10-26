import { describe, it, expect } from 'vitest';
import {
  lensDistanceFactor, clampLens, CINEMATIC_FOV, EDITOR_FOV, LENS_RANGE,
} from './cinematicLens.js';

describe('the lens a take is filmed on', () => {
  /* ⚠️ THE ARITHMETIC IN THE HEADER IS CHECKED, not just asserted in prose. Framing is governed by
     the half-angle, so distance scales with tan(from/2) / tan(fov/2) — 1.54× at the default pair. */
  it('says how far back a longer lens has to sit', () => {
    expect(lensDistanceFactor(EDITOR_FOV, EDITOR_FOV)).toBeCloseTo(1, 9);
    expect(lensDistanceFactor(CINEMATIC_FOV)).toBeCloseTo(1.54, 2);
    expect(lensDistanceFactor(24)).toBeCloseTo(1.81, 2);
    // Longer lens, further back — monotonic, or the panel's slider would behave unpredictably.
    for (let f = LENS_RANGE.min; f < LENS_RANGE.max; f += 2) {
      expect(lensDistanceFactor(f)).toBeGreaterThan(lensDistanceFactor(f + 2));
    }
  });

  it('films longer than the designer works', () => {
    expect(CINEMATIC_FOV).toBeLessThan(EDITOR_FOV);
    expect(CINEMATIC_FOV).toBeGreaterThanOrEqual(LENS_RANGE.min);
    expect(EDITOR_FOV).toBeLessThanOrEqual(LENS_RANGE.max);
  });

  /* ⚠️ A LENS OUTSIDE THE RANGE WOULD INVERT OR DEGENERATE THE PROJECTION — a 0° fov is a divide by
     zero in the distance maths and a black frame on screen, with nothing to say why. */
  it('refuses a lens that would break the projection', () => {
    for (const bad of [0, -5, NaN, null, undefined, 400]) {
      const v = clampLens(bad);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(LENS_RANGE.min);
      expect(v).toBeLessThanOrEqual(LENS_RANGE.max);
    }
    expect(clampLens(30)).toBe(30);
  });
});
