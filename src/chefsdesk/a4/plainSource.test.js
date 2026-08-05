import { describe, it, expect, vi, afterEach } from 'vitest';
import { plainSource } from './plainSource.js';

// The second kind of source the studio draws, and the one the whole standalone tool exists for: a
// baker's own image, printed as it is. Everything here is about it arriving at the RIGHT SHAPE —
// `aspect` is what decides the proportions an item is born at, and a wrong one squashes a print
// before the baker has touched anything.

// A stand-in for the loaded <img>. loadImage resolves with one of these, so `naturalWidth/Height`
// are the only fields the source reads.
function stubLoader(natural) {
  vi.stubGlobal('Image', class {
    constructor() {
      this.naturalWidth = natural.w;
      this.naturalHeight = natural.h;
      // loadImage assigns src last; resolve on the next tick so the await has something to wait for.
      queueMicrotask(() => this.onload?.());
    }
    set src(v) { this._src = v; }
    get src() { return this._src; }
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

const upload = { id: 7, name: 'Banner', url: 'https://cdn.example/banner.png' };

describe('plainSource — a baker’s own image', () => {
  it('reports the image’s natural aspect, so a wide banner is born wide', async () => {
    stubLoader({ w: 1200, h: 600 });
    expect((await plainSource(upload)).aspect).toBeCloseTo(2);
  });

  it('reports a portrait image as taller than it is wide', async () => {
    stubLoader({ w: 600, h: 1200 });
    expect((await plainSource(upload)).aspect).toBeCloseTo(0.5);
  });

  it('reports a square image as square', async () => {
    stubLoader({ w: 800, h: 800 });
    expect((await plainSource(upload)).aspect).toBeCloseTo(1);
  });

  // A browser that reports nothing must not produce aspect 0 or NaN: both lay the item out at a size
  // CSS resolves to something arbitrary, and the baker would print whatever that happened to be.
  it('falls back to square rather than dividing by zero', async () => {
    stubLoader({ w: 0, h: 0 });
    const src = await plainSource(upload);
    expect(src.aspect).toBe(1);
    expect(Number.isFinite(src.aspect)).toBe(true);
  });

  it('carries the upload’s id and name through, as strings the sheet can key on', async () => {
    stubLoader({ w: 100, h: 100 });
    const src = await plainSource(upload);
    expect(src.id).toBe('7');            // string: placements compare ids, and 7 !== '7'
    expect(src.name).toBe('Banner');
  });

  it('names an untitled upload rather than showing a blank thumbnail title', async () => {
    stubLoader({ w: 100, h: 100 });
    expect((await plainSource({ id: 1, url: 'https://x/1.png' })).name).toBe('Image');
  });

  // There is no mask and no transform, so the upload url IS the preview — rendering it to a canvas
  // first would spend memory to produce identical pixels.
  it('previews straight from the upload url', async () => {
    stubLoader({ w: 100, h: 100 });
    expect((await plainSource(upload)).preview).toBe(upload.url);
  });

  describe('draw — the export path', () => {
    it('paints the image at the size it is given, not at its own', async () => {
      stubLoader({ w: 1200, h: 600 });
      const src = await plainSource(upload);
      const calls = [];
      const ctx = { fillRect: () => {}, drawImage: (...a) => calls.push(a), set fillStyle(_) {} };

      src.draw(ctx, 100, 200, 400, 200);

      const [, x, y, w, h] = calls[0];
      expect([x, y, w, h]).toEqual([100, 200, 400, 200]);
    });

    // A RECTANGLE, because an unframed print is one. Drawing a shape the image does not have would
    // be a line to cut along that ruins it.
    it('draws a rectangular cut guide, proud of the image on every side', async () => {
      stubLoader({ w: 100, h: 100 });
      const src = await plainSource(upload);
      const rects = [];
      const ctx = { fillRect: (...a) => rects.push(a), drawImage: () => {}, set fillStyle(_) {} };

      src.draw(ctx, 100, 100, 400, 200);

      const [gx, gy, gw, gh] = rects[0];
      const pad = Math.round(400 * 0.012);
      expect([gx, gy]).toEqual([100 - pad, 100 - pad]);
      expect([gw, gh]).toEqual([400 + 2 * pad, 200 + 2 * pad]);
    });

    it('puts the guide down before the image, so it reads as a border and not a box over it', async () => {
      stubLoader({ w: 100, h: 100 });
      const src = await plainSource(upload);
      const order = [];
      const ctx = {
        fillRect: () => order.push('guide'),
        drawImage: () => order.push('image'),
        set fillStyle(_) {},
      };

      src.draw(ctx, 0, 0, 100, 100);

      expect(order).toEqual(['guide', 'image']);
    });
  });
});
