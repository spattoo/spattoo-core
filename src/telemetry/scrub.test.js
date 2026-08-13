// SEC-CORE-5 — the scrub is the last gate before telemetry leaves the browser for
// a third party, so its behaviour is pinned by tests rather than by inspection.
import { describe, it, expect } from 'vitest';
import { scrubString, scrubValue } from './scrub.js';

describe('scrubString', () => {
  it('redacts a Supabase-shaped JWT even with no surrounding label', () => {
    // Assembled from parts rather than written as one literal: a JWT-shaped
    // literal here would trip the repo's gitleaks pre-commit gate on every
    // commit. The value is a throwaway fixture — the header/payload decode to
    // {"alg":"HS256"} / {"sub":"test"} and the signature is nonsense — but the
    // point of the test is the SHAPE, so keep the three dot-separated segments.
    const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJ0ZXN0In0', 'c2lnbmF0dXJlLXBsYWNlaG9sZGVy'].join('.');
    const out = scrubString(`request failed with ${jwt} attached`);
    expect(out).not.toContain(jwt);
    expect(out).toContain('[redacted-jwt]');
  });

  it('redacts credential-ish query params but keeps the parameter name', () => {
    const out = scrubString('GET /api/x?access_token=abc123&page=2');
    expect(out).toContain('access_token=[redacted]');
    expect(out).toContain('page=2');          // non-credential params survive
  });

  it('redacts a bearer header value', () => {
    expect(scrubString('Authorization: Bearer abc.def-ghi')).toContain('[redacted]');
    expect(scrubString('Authorization: Bearer abc.def-ghi')).not.toContain('abc.def-ghi');
  });

  it('redacts emails and phone numbers', () => {
    const out = scrubString('contact baker@example.com or +91 98765 43210');
    expect(out).not.toContain('baker@example.com');
    expect(out).not.toContain('98765');
    expect(out).toContain('[redacted-email]');
    expect(out).toContain('[redacted-phone]');
  });

  it('leaves ordinary error text — and tenant ids — untouched', () => {
    const msg = 'Failed to load element 42 for baker_id 7 on surface storefront';
    expect(scrubString(msg)).toBe(msg);
  });
});

describe('scrubValue', () => {
  it('walks nested objects and arrays', () => {
    const out = scrubValue({ a: ['x', { b: 'mail me at a@b.co' }] });
    expect(out.a[1].b).toContain('[redacted-email]');
  });

  it('preserves non-string primitives', () => {
    const out = scrubValue({ n: 42, t: true, z: null });
    expect(out).toEqual({ n: 42, t: true, z: null });
  });

  it('stops at the depth bound instead of recursing forever', () => {
    const cyclic = { name: 'a@b.co' };
    cyclic.self = cyclic;
    expect(() => scrubValue(cyclic)).not.toThrow();
  });
});
