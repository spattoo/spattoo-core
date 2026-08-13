// SEC-CORE-4 / SEC-16 — the two link-sanitising helpers guard href sinks fed by
// baker-authored data, so their contracts are pinned here.
import { describe, it, expect } from 'vitest';
import { normalizeIgHandle, safeHref } from './storefrontKit.js';

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
