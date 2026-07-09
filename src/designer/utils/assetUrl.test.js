import { describe, it, expect } from 'vitest';
import { corsUrl } from './assetUrl.js';

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
