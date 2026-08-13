import { describe, it, expect } from 'vitest';
import { printExposure, REFERENCE_LIGHT, SHADING } from './shared/printExposure.js';

// What the renderer actually puts on screen, given the material terms and the light hitting the decal:
//   screen = diffuse × albedo × light  +  selfLit × albedo
const screen = (pf, light, albedo = 1) => {
  const { diffuse, selfLit } = printExposure(pf);
  return diffuse * albedo * light + selfLit * albedo;
};

describe('print exposure — a print reads as its artwork', () => {
  // THE invariant. This is the bug that cost three days as "dull" and came back as "over-bright":
  // a decal had no defined exposure, so it rendered at ~1.4× its own artwork and pale colours clipped.
  it('renders a print at exactly 1× its artwork under the reference light', () => {
    expect(screen(null, REFERENCE_LIGHT)).toBeCloseTo(1, 5);
    expect(screen({}, REFERENCE_LIGHT)).toBeCloseTo(1, 5);
  });

  it('never exceeds the artwork, so nothing can clip to white', () => {
    // Even a decal facing the key light dead-on gets no more than the reference light.
    for (const light of [0, 0.25, 0.5, 0.8, REFERENCE_LIGHT]) {
      expect(screen(null, light, 1)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('still takes some of the cake\'s shading — a print is not a flat sticker', () => {
    const lit = screen(null, REFERENCE_LIGHT);
    const shaded = screen(null, REFERENCE_LIGHT * 0.4);   // the cake's dark side
    expect(shaded).toBeLessThan(lit);
    expect(shaded).toBeGreaterThan(0.5);                  // ...but it must not go black
  });

  it('bounds the swing a decal\'s ORIENTATION can cause to `shading`', () => {
    // The whole class of bug was orientation deciding brightness. In full darkness the print still
    // shows its self-lit share, and the total span is exactly SHADING.
    expect(screen(null, 0)).toBeCloseTo(1 - SHADING, 5);
    expect(screen(null, REFERENCE_LIGHT) - screen(null, 0)).toBeCloseTo(SHADING, 5);
  });

  it('gain scales the whole print, not half of it', () => {
    expect(screen({ gain: 0.5 }, REFERENCE_LIGHT)).toBeCloseTo(0.5, 5);
    expect(screen({ gain: 1.2 }, REFERENCE_LIGHT)).toBeCloseTo(1.2, 5);
    // ...at ANY light, not just the reference — otherwise it would only dim one of the two terms.
    expect(screen({ gain: 0.5 }, 0.3)).toBeCloseTo(screen(null, 0.3) * 0.5, 5);
  });

  it('shading: 0 makes the print fully self-lit (immune to where it sits)', () => {
    expect(screen({ shading: 0 }, 0)).toBeCloseTo(1, 5);
    expect(screen({ shading: 0 }, REFERENCE_LIGHT)).toBeCloseTo(1, 5);
  });

  it('IGNORES the legacy `emissive` key rather than reintroducing the 1.4× overshoot', () => {
    // 7 elements in the library carry {emissive: 0.22, saturation: 1.12} — the old model's defaults,
    // stamped into their config. Honouring `emissive` would blow those elements out all over again.
    expect(screen({ emissive: 0.22 }, REFERENCE_LIGHT)).toBeCloseTo(1, 5);
    expect(screen({ emissive: 5 }, REFERENCE_LIGHT)).toBeCloseTo(1, 5);
  });

  it('defaults saturation to neutral — the 1.12 boost was a correction, not a choice', () => {
    expect(printExposure(null).saturation).toBe(1);
    expect(printExposure({ saturation: 1.2 }).saturation).toBe(1.2);
  });

  it('clamps hostile config instead of producing a black or negative print', () => {
    expect(printExposure({ shading: 5 }).selfLit).toBe(0);
    expect(printExposure({ shading: -1 }).diffuse).toBe(0);
    expect(printExposure({ gain: -3 }).selfLit).toBe(0);
  });
});
