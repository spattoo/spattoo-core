import { describe, it, expect, vi, afterEach } from 'vitest';
import { captureThumbnailBlob, contentCrop } from './thumbnail.js';

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

  it('falls back to the full frame when the pixels cannot be read back', async () => {
    // This stub's 2D context has no getImageData, so the crop probe bails and the capture behaves
    // exactly as it did before cropping existed. A thumbnail is never worth failing a save over.
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

// The camera frames a scene, not a picture: ~72% of a raw capture is empty, and in the template
// picker that becomes a grid of near-blank cards. These pin the geometry that crops it back.
describe('contentCrop — frame the cake, not the scene', () => {
  it('pads the bounds and grows to 3:2 around the cake', () => {
    const r = contentCrop({ x: 350, y: 300, w: 100, h: 200 }, 800, 800);
    expect(r.w / r.h).toBeCloseTo(1.5, 2);
    // the cake, plus its margin, is inside the rect
    expect(r.x).toBeLessThanOrEqual(350);
    expect(r.y).toBeLessThanOrEqual(300);
    expect(r.x + r.w).toBeGreaterThanOrEqual(450);
    expect(r.y + r.h).toBeGreaterThanOrEqual(500);
  });

  it('is far smaller than the frame for a typical cake — that IS the fix', () => {
    const full = 800 * 800;
    const r = contentCrop({ x: 300, y: 260, w: 200, h: 280 }, 800, 800);
    expect((r.w * r.h) / full).toBeLessThan(0.35);
  });

  it('centres on the cake, not on the canvas — an off-centre cake stays framed', () => {
    const r = contentCrop({ x: 60, y: 500, w: 120, h: 120 }, 800, 800);
    expect(r.x + r.w / 2).toBeCloseTo(120, 0);
    expect(r.y + r.h / 2).toBeCloseTo(560, 0);
  });

  it('slides back inside the frame rather than reading outside it', () => {
    const r = contentCrop({ x: 0, y: 0, w: 80, h: 80 }, 800, 800);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.x + r.w).toBeLessThanOrEqual(800);
    expect(r.y + r.h).toBeLessThanOrEqual(800);
  });

  it('never clips the cake — a very tall cake widens the rect instead of cutting it', () => {
    const bounds = { x: 380, y: 0, w: 40, h: 800 };      // taller than 3:2 can accommodate
    const r = contentCrop(bounds, 800, 800);
    expect(r.y).toBe(0);
    expect(r.h).toBe(800);                                // full height kept
    expect(r.x).toBeLessThanOrEqual(bounds.x);
    expect(r.x + r.w).toBeGreaterThanOrEqual(bounds.x + bounds.w);
  });

  it('never returns a rect larger than the canvas', () => {
    const r = contentCrop({ x: 0, y: 0, w: 800, h: 800 }, 800, 800);
    expect(r).toEqual({ x: 0, y: 0, w: 800, h: 800 });
  });

  it('returns null when there is nothing to frame, so the caller keeps the whole frame', () => {
    expect(contentCrop(null, 800, 800)).toBe(null);
    expect(contentCrop({ x: 0, y: 0, w: 10, h: 10 }, 0, 0)).toBe(null);
  });
});

describe('captureThumbnailBlob — crops to the cake when pixels are readable', () => {
  // A stub whose context CAN read back pixels: a 40x40 opaque square at (100,100) in a 400x400 frame.
  const readableCanvas = () => {
    const W = 400, H = 400;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 100; y < 140; y++) for (let x = 100; x < 140; x++) data[(y * W + x) * 4 + 3] = 255;
    const flatCanvas = { width: 0, height: 0, calls: [],
      getContext: () => ({
        set fillStyle(v) { flatCanvas.calls.push(['fillStyle', v]); },
        fillRect: (...a) => flatCanvas.calls.push(['fillRect', ...a]),
        drawImage: (...a) => flatCanvas.calls.push(['drawImage', ...a.slice(1)]),
        getImageData: () => ({ data }),
      }),
      toBlob: (cb, type) => cb({ type }) };
    vi.stubGlobal('document', { createElement: () => flatCanvas });
    return { source: { width: W, height: H, toBlob: (cb, t) => cb({ type: t, from: 'source' }) }, flatCanvas };
  };

  it('encodes a canvas sized to the crop, not the full frame', async () => {
    const { source, flatCanvas } = readableCanvas();
    await captureThumbnailBlob(source);
    expect(flatCanvas.width).toBeLessThan(400);
    expect(flatCanvas.width / flatCanvas.height).toBeCloseTo(1.5, 1);
  });

  it('draws the cropped region, offset to the cake', async () => {
    const { source, flatCanvas } = readableCanvas();
    await captureThumbnailBlob(source);
    // Two drawImage calls happen: the probe's plain composite (used to read pixels back), then the
    // cropped one. Only the latter carries source-rect arguments.
    const draw = flatCanvas.calls.filter(c => c[0] === 'drawImage' && c.length > 5).pop();
    expect(draw).toBeDefined();
    const [, sx, sy, sw, sh] = draw;
    expect(sx).toBeGreaterThan(0);                       // not reading from the origin
    expect(sx).toBeLessThanOrEqual(100);                 // but the cake is inside
    expect(sx + sw).toBeGreaterThanOrEqual(140);
    expect(sy + sh).toBeGreaterThanOrEqual(140);
  });

  it('crop: false keeps the whole frame', async () => {
    const { source, flatCanvas } = readableCanvas();
    await captureThumbnailBlob(source, { crop: false });
    expect([flatCanvas.width, flatCanvas.height]).toEqual([400, 400]);
  });
});
