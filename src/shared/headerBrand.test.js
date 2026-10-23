import { describe, it, expect } from 'vitest';
import { HEADER_BRAND, DEFAULT_HEADER_BRAND, headerBrandMode, headerBrandParts } from './headerBrand.js';

const withMode = m => ({ storefront_customizations: { header_brand: m } });

describe('headerBrandMode — seeded in code, overlaid from the DB', () => {
  it('defaults to both, which is what an unwritten row and an older client both get', () => {
    expect(headerBrandMode(undefined)).toBe(DEFAULT_HEADER_BRAND);
    expect(headerBrandMode({})).toBe(HEADER_BRAND.BOTH);
    expect(headerBrandMode({ storefront_customizations: {} })).toBe(HEADER_BRAND.BOTH);
  });

  it('reads a stored choice', () => {
    for (const m of Object.values(HEADER_BRAND)) expect(headerBrandMode(withMode(m))).toBe(m);
  });

  it('falls back rather than rendering a mode nothing understands', () => {
    expect(headerBrandMode(withMode('wordmark'))).toBe(DEFAULT_HEADER_BRAND);
    expect(headerBrandMode(withMode(null))).toBe(DEFAULT_HEADER_BRAND);
  });
});

describe('headerBrandParts — what the header actually draws', () => {
  it('shows the mark and the name by default', () => {
    expect(headerBrandParts({}, true)).toEqual({ logo: true, name: true });
  });

  it('honours logo-only and name-only', () => {
    expect(headerBrandParts(withMode(HEADER_BRAND.LOGO), true)).toEqual({ logo: true, name: false });
    expect(headerBrandParts(withMode(HEADER_BRAND.NAME), true)).toEqual({ logo: false, name: true });
  });

  // The header must never be able to render empty: that is a bakery with no identity on screen.
  it('always shows the name when there is no logo, whatever was chosen', () => {
    for (const m of Object.values(HEADER_BRAND)) {
      expect(headerBrandParts(withMode(m), false)).toEqual({ logo: false, name: true });
    }
  });
});
