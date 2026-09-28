// SEC-CORE-4 / SEC-16 — the two link-sanitising helpers guard href sinks fed by
// baker-authored data, so their contracts are pinned here.
import { describe, it, expect } from 'vitest';
import { normalizeIgHandle, safeHref, onColor, contrast, relLum, lum } from './storefrontKit.js';

/* ── The ink that goes on a baker's colour ───────────────────────────────────────────────────────
 *
 * ⚠️ THE FIRST COLOUR COVERAGE IN THIS FILE, and the storefront's legibility rides entirely on it.
 * `onColor` was a LIGHTNESS FLIP (`lum > 0.6`) rather than a contrast test, and `lum` is a raw
 * weighted byte average with no gamma — so it misjudged mid-tones and shipped an unreadable ink on
 * four of eighteen plausible brand colours.
 *
 * Sandeep: "dont measure it against the green color on this screen. its a storefront color choosen
 * by baker. other baker might choose another color." So these assert a RULE across a spread, never
 * one shop's palette.
 */
describe('onColor', () => {
  /* The property that makes this safe to change under live storefronts: it can only ever equal or
     beat what it replaced, so no baker's shop gets worse. */
  it('never picks the lower-contrast ink, for any brand colour', () => {
    const brands = ['#9FA28B', '#9b5f72', '#E8C547', '#2C4433', '#1a1a1a', '#7FB3D5', '#C0392B',
                    '#F5E6C8', '#8E7CC3', '#3D9970', '#FF851B', '#B0B0B0', '#6B5B4C', '#D9A5B3',
                    '#4A90D9', '#5B3A29', '#EAEBE5', '#ffffff', '#000000'];
    for (const b of brands) {
      const ink = onColor(b);
      const other = ink === '#ffffff' ? '#241a1d' : '#ffffff';
      expect(contrast(ink, b), `${b} picked the weaker ink`).toBeGreaterThanOrEqual(contrast(other, b));
    }
  });

  /* The four that shipped below AA under the old lightness flip — a perfectly ordinary purple,
     green, orange and blue. Each is pinned so a future "simplification" back to a threshold fails
     here rather than on somebody's storefront. */
  it.each([['#8E7CC3', 3.61], ['#3D9970', 3.51], ['#FF851B', 2.44], ['#4A90D9', 3.34]])(
    'rescues %s, which the lightness rule shipped at %s:1',
    (brand, was) => {
      expect(contrast('#ffffff', brand)).toBeCloseTo(was, 1);   // what the old rule chose
      expect(contrast(onColor(brand), brand)).toBeGreaterThanOrEqual(4.5);
    });

  /* `darken`/`lighten` return `rgb(...)` strings and three callers feed those straight in
     (bandStrong, heroTop, pal.cta), so this must not be hex-only. */
  it('accepts rgb() input, not just hex', () => {
    expect(onColor('rgb(159, 162, 139)')).toBe(onColor('#9FA28B'));
  });

  /* ⚠️ `lum` IS DELIBERATELY UNCHANGED. `doorInk` thresholds on it at 0.6 to decide whether a
     border would vanish; fixing its gamma underneath that would move every door outline on every
     storefront. It stays a "roughly light?" test, and `relLum` is the one contrast is defined on. */
  it('keeps lum as the legacy lightness test, separate from relLum', () => {
    expect(lum('#FF851B')).toBeGreaterThan(0.55);      // raw byte average — reads as "light"
    expect(relLum('#FF851B')).toBeLessThan(0.45);      // gamma-correct — it is not
  });
});

describe('normalizeIgHandle', () => {
  it('keeps a valid handle unchanged', () => {
    expect(normalizeIgHandle('sweet.bakes_01')).toBe('sweet.bakes_01');
  });

  it('strips a leading @ (any number of them)', () => {
    expect(normalizeIgHandle('@@sweetbakes')).toBe('sweetbakes');
  });

  it('accepts a pasted profile URL and keeps only the handle', () => {
    expect(normalizeIgHandle('https://instagram.com/sweetbakes')).toBe('sweetbakes');
    expect(normalizeIgHandle('instagram.com/sweetbakes/')).toBe('sweetbakes');
  });

  it('removes path/query/fragment characters that would retarget the link', () => {
    // The sink is `https://instagram.com/${ig}` — a slash or ? here would silently
    // point the link somewhere other than the intended profile.
    // A query/fragment is DISCARDED, never promoted to the handle.
    expect(normalizeIgHandle('sweetbakes?next=evil')).toBe('sweetbakes');
    expect(normalizeIgHandle('sweet#bakes')).toBe('sweet');
    expect(normalizeIgHandle('sweet bakes')).toBe('sweetbakes');
    // A pasted URL still resolves to its last path segment.
    expect(normalizeIgHandle('https://instagram.com/sweetbakes?hl=en')).toBe('sweetbakes');
  });

  it('returns null when nothing usable remains, so the caller omits the link', () => {
    expect(normalizeIgHandle('')).toBeNull();
    expect(normalizeIgHandle('   ')).toBeNull();
    expect(normalizeIgHandle('@')).toBeNull();
    expect(normalizeIgHandle('///')).toBeNull();
    expect(normalizeIgHandle(null)).toBeNull();
    expect(normalizeIgHandle(undefined)).toBeNull();
    expect(normalizeIgHandle(123)).toBeNull();
  });

  it('caps at Instagram\'s 30-character limit', () => {
    expect(normalizeIgHandle('a'.repeat(50))).toHaveLength(30);
  });
});

describe('safeHref', () => {
  it('allows http(s)', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com');
    expect(safeHref('http://example.com')).toBe('http://example.com');
  });

  it('rejects dangerous schemes at an href sink', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>')).toBeNull();
    expect(safeHref('vbscript:x')).toBeNull();
  });

  it('rejects relative and malformed URLs', () => {
    expect(safeHref('/relative')).toBeNull();
    expect(safeHref('not a url')).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});
