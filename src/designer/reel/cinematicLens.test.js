import { describe, it, expect } from 'vitest';
import {
  lensDistanceFactor, clampLens, CINEMATIC_FOV, EDITOR_FOV, LENS_RANGE,
  lensAt, LENS_GLIDE_S,
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

describe('the move onto the lens, and back off it', () => {
  /* ⚠️ A MOVE, NOT A CUT. The first version assigned `camera.fov` outright at both ends, so the
     shot snapped onto the long lens and snapped off it again. Sandeep: "the cake is zooming in, but
     its very harsh … once all elements are dropped on cake, its going back from the zoom in
     position, that is harsh too." */
  it('leaves at rest and arrives at rest', () => {
    const speed = (t) => Math.abs(lensAt(EDITOR_FOV, CINEMATIC_FOV, t + 0.01)
                                - lensAt(EDITOR_FOV, CINEMATIC_FOV, t));
    const mid = speed(LENS_GLIDE_S / 2);
    // Both ends crawl; the middle carries the move. An ease-OUT would fail the first of these,
    // and leaving at full speed is exactly what reads as harsh.
    expect(speed(0)).toBeLessThan(mid / 10);
    expect(speed(LENS_GLIDE_S - 0.012)).toBeLessThan(mid / 10);
  });

  it('starts where it started and ends where it was sent', () => {
    expect(lensAt(EDITOR_FOV, CINEMATIC_FOV, 0)).toBeCloseTo(EDITOR_FOV, 9);
    expect(lensAt(EDITOR_FOV, CINEMATIC_FOV, LENS_GLIDE_S)).toBeCloseTo(CINEMATIC_FOV, 9);
    // ⚠️ AND HOLDS. A glide that overshoots past its span would drift the lens for the whole take.
    expect(lensAt(EDITOR_FOV, CINEMATIC_FOV, 99)).toBeCloseTo(CINEMATIC_FOV, 9);
    expect(lensAt(EDITOR_FOV, CINEMATIC_FOV, -5)).toBeCloseTo(EDITOR_FOV, 9);
  });

  it('runs the same way back, so the return is a move too', () => {
    expect(lensAt(CINEMATIC_FOV, EDITOR_FOV, 0)).toBeCloseTo(CINEMATIC_FOV, 9);
    expect(lensAt(CINEMATIC_FOV, EDITOR_FOV, LENS_GLIDE_S)).toBeCloseTo(EDITOR_FOV, 9);
  });

  it('is monotonic — a zoom never backs up on itself', () => {
    let prev = lensAt(EDITOR_FOV, CINEMATIC_FOV, 0);
    for (let t = 0; t <= LENS_GLIDE_S; t += 0.02) {
      const v = lensAt(EDITOR_FOV, CINEMATIC_FOV, t);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });

  it('survives rubbish rather than putting NaN in a projection', () => {
    for (const [a, b] of [[NaN, 28], [42, NaN], ['x', 'y'], [undefined, 28]]) {
      expect(Number.isFinite(lensAt(a, b, 0.5))).toBe(true);
    }
  });

  it('is long enough to read as a move', () => {
    expect(LENS_GLIDE_S).toBeGreaterThanOrEqual(0.6);
  });
});
