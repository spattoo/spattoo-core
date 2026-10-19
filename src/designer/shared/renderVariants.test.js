import { describe, it, expect, beforeEach } from 'vitest';
import { registerRenderVariants, renderVariantUrl, __resetRenderVariants } from './renderVariants.js';

const MASTER = 'https://cdn.spattoo.test/elements/files/2D/9f1c.png';
const SMALL  = 'https://cdn.spattoo.test/elements/files/2D/9f1c-512.webp';

describe('which copy of a decoration the cake is drawn from', () => {
  beforeEach(__resetRenderVariants);

  it('an unregistered url comes back untouched — the master is the fallback, not an error', () => {
    expect(renderVariantUrl(MASTER)).toBe(MASTER);
  });

  it('a registered element resolves to its small copy', () => {
    registerRenderVariants([{ image_url: MASTER, render_key: SMALL }]);
    expect(renderVariantUrl(MASTER)).toBe(SMALL);
  });

  /* ⚠️ THE ASSET BASE HAS MOVED BEFORE (r2.dev → spattoocdn.com), and a saved design carries
     whatever url it was given on the day it was saved. Keying on the full url would quietly stop
     matching for every cake saved before the move — no error, just four times the memory again. */
  it('matches a design saved against a different asset base', () => {
    registerRenderVariants([{ image_url: MASTER, render_key: SMALL }]);
    expect(renderVariantUrl('https://old-bucket.r2.dev/elements/files/2D/9f1c.png')).toBe(SMALL);
  });

  it('matches a url already carrying the cors query the texture loader adds', () => {
    registerRenderVariants([{ image_url: MASTER, render_key: SMALL }]);
    expect(renderVariantUrl(`${MASTER}?cors=1`)).toBe(SMALL);
  });

  /* A row with no small copy must not be recorded as one. The column is null for most of the
     catalogue and for everything that will never have one — a GLB, an SVG, a calendar. */
  it('a row with no render_key leaves the master alone', () => {
    registerRenderVariants([{ image_url: MASTER, render_key: null }]);
    expect(renderVariantUrl(MASTER)).toBe(MASTER);
  });

  /* An upload or a generated image belongs to one instance, its bytes are already in memory, and
     there is no catalogue row to register — so these are never looked up. */
  it('leaves data: and blob: urls alone', () => {
    const d = 'data:image/png;base64,AAAA';
    const b = 'blob:https://app.spattoo.test/4a2f';
    expect(renderVariantUrl(d)).toBe(d);
    expect(renderVariantUrl(b)).toBe(b);
  });

  it('survives being handed nothing', () => {
    expect(renderVariantUrl(null)).toBe(null);
    expect(renderVariantUrl(undefined)).toBe(undefined);
    expect(() => registerRenderVariants(null)).not.toThrow();
    expect(() => registerRenderVariants([null, {}, { render_key: SMALL }])).not.toThrow();
  });

  it('a later catalogue page adds to what is known rather than replacing it', () => {
    registerRenderVariants([{ image_url: MASTER, render_key: SMALL }]);
    registerRenderVariants([{ image_url: 'https://cdn.spattoo.test/elements/files/2D/beef.webp',
                              render_key: 'https://cdn.spattoo.test/elements/files/2D/beef-512.webp' }]);
    expect(renderVariantUrl(MASTER)).toBe(SMALL);
    expect(renderVariantUrl('https://cdn.spattoo.test/elements/files/2D/beef.webp'))
      .toBe('https://cdn.spattoo.test/elements/files/2D/beef-512.webp');
  });
});
