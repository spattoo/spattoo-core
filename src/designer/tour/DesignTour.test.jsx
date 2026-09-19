import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

describe('the customer sees the moves they actually make', () => {
  const src = readFileSync(new URL('./DesignTour.jsx', import.meta.url), 'utf8');

  /* ⚠️ "Use your photo" read as a photo OF THEM — Sandeep, 2026-09-19: "why should they use their
     own photo" — and bundled two unrelated ideas: a picture printed ON the cake, and a reference
     cake to copy. A customer never saw it either: `uploads` is not in MOBILE_PRIMARY, so on a phone
     it sits behind More, the anchor does not exist and the step is skipped. A phone is the
     customer's case, not the exception. */
  it('does not offer a customer the uploads step', () => {
    // The customer branch is the array before the `: [` that starts the baker's.
    const customer = src.slice(src.indexOf("mode === 'customer'"), src.indexOf('  : ['));
    expect(customer).not.toMatch(/uploads/);
    expect(src).not.toMatch(/Use your photo/);   // and the confusing title is gone in both modes
  });

  // Shape, decorate, ask — in the order somebody actually does them.
  it('walks shape → decorations → price', () => {
    const at = (t) => src.indexOf(t);
    expect(at('Start with the cake')).toBeGreaterThan(-1);
    expect(at('Start with the cake')).toBeLessThan(at("title: 'Add decorations'"));
    expect(at("title: 'Add decorations'")).toBeLessThan(at('Then ask for a price'));
  });

  /* Shape rides on the canvas step rather than getting its own: both live on a tapped tier, and a
     shape step could not be anchored — the cake is a WebGL canvas with no addressable parts. */
  it('tells them where the shape lives', () => {
    expect(src).toMatch(/Tap a tier to set its shape, size and colour/);
  });

  /* ⚠️ A step change nobody sees is a step change that did not happen. Every customer who ran v1
     keeps their cookie and would never meet the new steps. */
  it('bumps the seen key when the steps change', () => {
    expect(src).toMatch(/spattoo\.tour\.customer\.v2/);
  });
});
