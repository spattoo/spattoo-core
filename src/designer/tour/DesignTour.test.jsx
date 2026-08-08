import { describe, it, expect } from 'vitest';
import { cookieDomain } from './DesignTour.jsx';

// ── The cookie has to survive going live ─────────────────────────────────────────────────────────
// The customer's "seen" flag is a cookie on the PARENT domain, so that one viewing covers every
// baker's subdomain rather than being repeated per storefront. Which parent is DERIVED from the
// hostname we are actually served from — never configured — precisely so that nothing has to be
// remembered on the day spattoo.dev becomes spattoo.com.
//
// That claim is worth a test because its failure mode is invisible: a cookie pinned to the wrong
// domain is not an error, it simply never matches, and the tour repeats forever with nothing in the
// console to say why. Nobody would connect that to a deploy weeks earlier.

describe('cookieDomain follows whatever host we are served from', () => {
  it.each([
    ['roses.spattoo.dev', '; domain=.spattoo.dev'],
    ['app.spattoo.dev',   '; domain=.spattoo.dev'],
    ['roses.spattoo.com', '; domain=.spattoo.com'],
    ['app.spattoo.com',   '; domain=.spattoo.com'],
    ['www.spattoo.com',   '; domain=.spattoo.com'],
    ['spattoo.com',       '; domain=.spattoo.com'],
  ])('%s → %s', (host, want) => {
    expect(cookieDomain(host)).toBe(want);
  });

  // The whole point: dev and prod differ by nothing but the hostname, so the SAME build is correct
  // in both. If these two ever produce the same string, the derivation has stopped deriving.
  it('gives dev and prod different parents, from the same code', () => {
    expect(cookieDomain('roses.spattoo.dev')).not.toBe(cookieDomain('roses.spattoo.com'));
  });
});

describe('cookieDomain declines to set a Domain it cannot have', () => {
  // A single label cannot be a cookie domain, and an IP must be host-only. Returning '' leaves the
  // cookie host-scoped, which is correct — and it is what keeps local dev working, where a Domain
  // attribute would make the cookie vanish and the tour repeat on every reload.
  it.each(['localhost', 'roses.localhost', '127.0.0.1'])('%s → host-only', (host) => {
    expect(cookieDomain(host)).toBe('');
  });

  // A public suffix is the one case this function gets WRONG and cannot detect: `.vercel.app` is a
  // real derivation and a browser will silently refuse it. That is handled at the call site, which
  // checks the cookie stuck and re-sets it host-only — this test records that the gap is known and
  // deliberate rather than an oversight in the derivation.
  it('still derives a public suffix — the caller handles the refusal', () => {
    expect(cookieDomain('spattoo-app-dev.vercel.app')).toBe('; domain=.vercel.app');
  });
});
