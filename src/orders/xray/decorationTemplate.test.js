import { describe, it, expect } from 'vitest';
import { decorationWidthMm, tierInchFor } from './decorationTemplate.js';
// Laying a true size onto A4 is now shared with the chocolate template — same page, same ruler.
import { templateLayout } from './templateSheet.js';

// The baker CUTS FONDANT to this number. A confident wrong size is worse than no template at all,
// so every path that cannot produce a real measurement must produce null instead of a default.
describe('decorationWidthMm', () => {
  it('turns a tier ratio and a real tin size into millimetres', () => {
    // a third of a 6" tier = 2" = 50.8mm
    expect(decorationWidthMm(0.333, 6)).toBeCloseTo(50.8, 0);
  });

  it('returns null when the model would not judge a size', () => {
    // The common case: a piped border has no single width.
    expect(decorationWidthMm(null, 6)).toBeNull();
    expect(decorationWidthMm(undefined, 6)).toBeNull();
  });

  it('returns null when the tin plan has no real size', () => {
    // No order weight -> tinInch is null -> nothing to scale against.
    expect(decorationWidthMm(0.4, null)).toBeNull();
  });

  it('rejects a ratio outside 0-1 rather than clamping it', () => {
    // Clamping would silently turn a model error into a plausible measurement.
    expect(decorationWidthMm(1.4, 6)).toBeNull();
    expect(decorationWidthMm(0, 6)).toBeNull();
    expect(decorationWidthMm(-0.3, 6)).toBeNull();
  });
});

describe('tierInchFor', () => {
  const plan = { tiers: [{ tinInch: 8 }, { tinInch: 6 }] };

  it('reads the tier the decoration sits on', () => {
    expect(tierInchFor(plan, 1)).toBe(6);
  });

  it('falls back to the base tier for an out-of-range index', () => {
    expect(tierInchFor(plan, 9)).toBe(8);
  });

  it('survives a missing plan', () => {
    expect(tierInchFor(null, 0)).toBeNull();
    expect(tierInchFor({ tiers: [] }, 0)).toBeNull();
  });
});

describe('templateLayout', () => {
  it('lays a normal decoration out at true size', () => {
    const l = templateLayout(80, 1);
    expect(l.tooLarge).toBe(false);
    expect(l.widthMm).toBe(80);
    expect(l.heightMm).toBe(80);
  });

  it('flags a decoration too wide for the page instead of shrinking it silently', () => {
    // A4 printable width is 180mm. Shrinking without saying so hands the baker a template that lies.
    expect(templateLayout(200, 1).tooLarge).toBe(true);
  });

  it('flags one too TALL for the page as well', () => {
    // Narrow but long — the height is what fails, and it must be caught the same way.
    expect(templateLayout(60, 0.2).tooLarge).toBe(true);
  });

  it('returns null when there is no size to lay out', () => {
    expect(templateLayout(null, 1)).toBeNull();
    expect(templateLayout(80, 0)).toBeNull();
  });
});
