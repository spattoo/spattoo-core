import { describe, it, expect } from 'vitest';
import { corsUrl, assetUrl } from './assetUrl.js';

// The qualifier separates cache keys so a CORS fetch and a non-CORS fetch of the same asset can never
// share a browser cache entry (R2 omits `Vary: Origin` on the no-Origin response, so Chrome would
// otherwise hand the ACAO-less copy to three.js and the texture load fails — intermittently, which is
// the worst kind). These pin the edges that would silently break a texture load.
describe('corsUrl — one qualifier for every remote asset load', () => {
  it('appends ?cors=1 to a bare URL', () => {
    expect(corsUrl('https://cdn.example/a.webp')).toBe('https://cdn.example/a.webp?cors=1');
  });

  it('appends with & when the URL already has a query', () => {
    expect(corsUrl('https://cdn.example/a.webp?v=2')).toBe('https://cdn.example/a.webp?v=2&cors=1');
  });

  it('is idempotent — never double-appends (URLs round-trip through render)', () => {
    const once = corsUrl('https://cdn.example/a.webp');
    expect(corsUrl(once)).toBe(once);
    expect(corsUrl('https://cdn.example/a.webp?cors=seat')).toBe('https://cdn.example/a.webp?cors=seat');
  });

  it('leaves data: and blob: URLs untouched — same-origin by construction', () => {
    expect(corsUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(corsUrl('blob:http://localhost:5173/abc-123')).toBe('blob:http://localhost:5173/abc-123');
  });

  it('passes through nullish/non-string without throwing (a sticker may have no photo)', () => {
    expect(corsUrl(null)).toBe(null);
    expect(corsUrl(undefined)).toBe(undefined);
    expect(corsUrl('')).toBe('');
  });

  it('keeps the .glb/.gltf extension test working — the query comes AFTER the extension', () => {
    // StickerFace decides isGlb from the RAW url, but be safe: the regex allows a trailing query.
    expect(/\.(glb|gltf)(\?|$)/i.test(corsUrl('https://cdn.example/m.glb'))).toBe(true);
  });
});

// `bakers` mixes shapes: logo_url is absolute, logo_transparent_key is a bare R2 key, because the
// backend resolves keys only for the profile it serves and the designer reads the table directly.
// The caller does `assetUrl(key, base) ?? row.logo_url`, so returning null — never a half-built
// string — is what keeps the fallback correct.
describe('assetUrl — R2 key to absolute URL', () => {
  it('joins a bare key onto the assets base', () => {
    expect(assetUrl('logos/abc.png', 'https://cdn.example')).toBe('https://cdn.example/logos/abc.png');
  });

  it('returns an already-absolute URL untouched — safe on either column shape', () => {
    expect(assetUrl('https://cdn.example/logos/abc.png', 'https://other.example'))
      .toBe('https://cdn.example/logos/abc.png');
  });

  it('never doubles the slash, whichever side carries it', () => {
    expect(assetUrl('logos/a.png', 'https://cdn.example/')).toBe('https://cdn.example/logos/a.png');
    expect(assetUrl('/logos/a.png', 'https://cdn.example')).toBe('https://cdn.example/logos/a.png');
    expect(assetUrl('/logos/a.png', 'https://cdn.example/')).toBe('https://cdn.example/logos/a.png');
  });

  it('returns null for a bare key with no base — local dev must fall back, not 404', () => {
    expect(assetUrl('logos/a.png', undefined)).toBe(null);
    expect(assetUrl('logos/a.png', '')).toBe(null);
  });

  it('returns null for nothing at all — most bakers have no transparent logo', () => {
    expect(assetUrl(null, 'https://cdn.example')).toBe(null);
    expect(assetUrl(undefined, 'https://cdn.example')).toBe(null);
    expect(assetUrl('', 'https://cdn.example')).toBe(null);
  });
});
