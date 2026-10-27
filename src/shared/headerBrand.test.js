import { describe, it, expect } from 'vitest';
import { HEADER_BRAND, DEFAULT_HEADER_BRAND, headerBrandMode, headerBrandParts,
         brandNameFontSize, BRAND_NAME_MAX, BRAND_NAME_MIN } from './headerBrand.js';

const withMode = m => ({ storefront_customizations: { header_brand: m } });

describe('headerBrandMode — seeded in code, overlaid from the DB', () => {
  // The studio's default is the NAME: the logo's home is the storefront, which is logo-wins by its
  // own design. It also avoids both failures at once — an unreadable badge, and a wordmark logo
  // printing the bakery's name twice.
  it('defaults to the name, which is what an unwritten row and an older client both get', () => {
    expect(headerBrandMode(undefined)).toBe(DEFAULT_HEADER_BRAND);
    expect(headerBrandMode({})).toBe(HEADER_BRAND.NAME);
    expect(headerBrandMode({ storefront_customizations: {} })).toBe(HEADER_BRAND.NAME);
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
  it('shows the name by default, even when a logo exists', () => {
    expect(headerBrandParts({}, true)).toEqual({ logo: false, name: true });
  });

  it('a baker who wants their mark on their own workbench can have it', () => {
    expect(headerBrandParts(withMode(HEADER_BRAND.BOTH), true)).toEqual({ logo: true, name: true });
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

// ── The face the name is set in ────────────────────────────────────────────────────────────────
// It was hardcoded to Pacifico in two places while FONT_THEMES carried a `brandFont` token that all
// three themes set to the same value — so the token existed and the lever behind it did not.
import { BRAND_FONTS, DEFAULT_BRAND_FONT, brandFontCss, brandFontKey, applyFontTheme, FONT_THEMES }
  from '../storefront/storefrontKit.js';

describe('brandFont — the bakery name is the baker\'s type, not ours', () => {
  const withFont = k => ({ storefront_customizations: { brand_font: k } });

  it('defaults to the face every font theme already named, so nothing published changes', () => {
    expect(brandFontKey({})).toBe(DEFAULT_BRAND_FONT);
    expect(brandFontCss({})).toBe(BRAND_FONTS.pacifico.css);
    for (const t of Object.values(FONT_THEMES)) expect(t.brandFont).toBe(BRAND_FONTS.pacifico.css);
  });

  it('returns the chosen face', () => {
    for (const f of Object.values(BRAND_FONTS)) expect(brandFontCss(withFont(f.key))).toBe(f.css);
  });

  it('falls back rather than emitting a family nothing loaded', () => {
    expect(brandFontCss(withFont('comic-sans'))).toBe(BRAND_FONTS.pacifico.css);
    expect(brandFontKey(withFont('comic-sans'))).toBe(DEFAULT_BRAND_FONT);
  });

  // Every face has to be one the host app self-hosts (SEC-WEB-7) — a family nobody loaded renders
  // as a system fallback and reads as a bug rather than a choice.
  it('offers only families the baker app loads', () => {
    const loaded = ['Pacifico', 'Parisienne', 'Shantell Sans', 'Cormorant Garamond', 'Lora', 'Montserrat', 'Quicksand'];
    for (const f of Object.values(BRAND_FONTS)) {
      const family = f.css.match(/^'([^']+)'/)?.[1];
      expect(loaded).toContain(family);
    }
  });

  it('a baker overrides their theme, and no baker leaves every existing call alone', () => {
    expect(applyFontTheme({}, 'montserrat').brandFont).toBe(BRAND_FONTS.pacifico.css);
    expect(applyFontTheme({}, 'montserrat', withFont('lora')).brandFont).toBe(BRAND_FONTS.lora.css);
  });
});

describe('brandNameFontSize', () => {
  it('leaves a normal name at the resting size', () => {
    // "Velvet & Vanilla Bake House" — the longest real bakery name — at a full-width window.
    expect(brandNameFontSize('Velvet & Vanilla Bake House', 1038)).toBe(BRAND_NAME_MAX);
  });

  it('still fits that name at the narrow edge of the desktop layout', () => {
    // 641px window → roughly 391px for the name. 27 × 0.55 × 26 = 386, so it holds at full size.
    expect(brandNameFontSize('Velvet & Vanilla Bake House', 391)).toBe(BRAND_NAME_MAX);
  });

  it('shrinks rather than clips when the room runs out', () => {
    const size = brandNameFontSize('The Extremely Long Bakery Name Of Hyderabad', 391);
    expect(size).toBeLessThan(BRAND_NAME_MAX);
    expect(size).toBeGreaterThanOrEqual(BRAND_NAME_MIN);
  });

  it('never goes below the floor, however absurd the name', () => {
    expect(brandNameFontSize('x'.repeat(400), 300)).toBe(BRAND_NAME_MIN);
  });

  it('answers the resting size for an empty name or an unknown width', () => {
    expect(brandNameFontSize('', 500)).toBe(BRAND_NAME_MAX);
    expect(brandNameFontSize('Anything', NaN)).toBe(BRAND_NAME_MAX);
    expect(brandNameFontSize('Anything', 0)).toBe(BRAND_NAME_MAX);
  });

  it('is monotonic — more room never means smaller type', () => {
    const n = 'A Reasonably Long Bakery Name Here';
    for (let w = 120; w < 1200; w += 37) {
      expect(brandNameFontSize(n, w + 37)).toBeGreaterThanOrEqual(brandNameFontSize(n, w));
    }
  });
});
