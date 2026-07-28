import { describe, it, expect, vi, afterEach } from 'vitest';
import { captureThumbnailBlob } from './thumbnail.js';

// The cake scene renders on a transparent canvas, so a raw capture is ~72% RGBA(0,0,0,0) — black held
// invisible by the alpha channel. The order snapshot is embedded in the quote-request email, and a
// webmail proxy that re-encodes without alpha keeps that RGB: the cake arrives on a black slab. These
// pin the flatten so the capture can never go back to shipping alpha the mail path can't carry.
const fakeCanvas = () => {
  const calls = [];
  return {
    width: 800, height: 800,
    calls,
    getContext: () => ({
      set fillStyle(v) { calls.push(['fillStyle', v]); },
      fillRect: (...a) => calls.push(['fillRect', ...a]),
      drawImage: (src, x, y) => calls.push(['drawImage', src, x, y]),
    }),
    toBlob: (cb, type, quality) => { calls.push(['toBlob', type, quality]); cb({ type }); },
  };
};

// The WebGL source canvas the designer hands us — never encoded directly once flattening is on.
const sourceCanvas = () => ({
  width: 800, height: 800, _isSource: true,
  toBlob: (cb, type) => cb({ type, from: 'source' }),
});

let flat;
const stubDocument = () => {
  flat = fakeCanvas();
  vi.stubGlobal('document', { createElement: (tag) => (tag === 'canvas' ? flat : null) });
};

afterEach(() => { vi.unstubAllGlobals(); });

describe('captureThumbnailBlob — flattens onto an opaque background', () => {
  it('fills the background before drawing, so no transparent pixel survives', async () => {
    stubDocument();
    await captureThumbnailBlob(sourceCanvas());
    const ops = flat.calls.map(c => c[0]);
    expect(ops.indexOf('fillRect')).toBeLessThan(ops.indexOf('drawImage'));
    expect(flat.calls).toContainEqual(['fillStyle', '#FFFFFF']);
    expect(flat.calls).toContainEqual(['fillRect', 0, 0, 800, 800]);
  });

  it('encodes the FLATTENED canvas, not the transparent source', async () => {
    stubDocument();
    const blob = await captureThumbnailBlob(sourceCanvas());
    expect(blob.from).toBeUndefined();               // came from the flat canvas
    expect(flat.calls).toContainEqual(['toBlob', 'image/webp', 0.85]);
  });

  it('matches the source dimensions — a snapshot is never rescaled by flattening', async () => {
    stubDocument();
    await captureThumbnailBlob(sourceCanvas());
    expect([flat.width, flat.height]).toEqual([800, 800]);
  });

  it('honours an explicit background colour', async () => {
    stubDocument();
    await captureThumbnailBlob(sourceCanvas(), { background: '#F0EDE8' });
    expect(flat.calls).toContainEqual(['fillStyle', '#F0EDE8']);
  });

  it('background: null opts out — encodes the source canvas with its alpha intact', async () => {
    stubDocument();
    const blob = await captureThumbnailBlob(sourceCanvas(), { background: null });
    expect(blob.from).toBe('source');
    expect(flat.calls).toHaveLength(0);
  });

  it('returns null for a missing canvas — a thumbnail is always non-fatal', async () => {
    stubDocument();
    expect(await captureThumbnailBlob(null)).toBe(null);
  });
});
