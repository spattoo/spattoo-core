import { describe, it, expect, vi, afterEach } from 'vitest';
import { imageSource, framesIn, frameMaskOf } from './imageSource.js';

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

// The FRAMED path renders through a canvas (renderFramedPhoto clips the photo to the mask), and the
// test environment is `node`. Only enough of one to let that run — what these tests assert is the
// SHAPE a framed source reports, not the pixels, which are framePhoto.js's business and already
// exercised by the order sheet.
function stubCanvas() {
  const ctx2d = new Proxy({}, { get: () => () => {} });
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ctx2d,
      toDataURL: () => 'data:image/png;base64,stub',
    }),
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

const upload = { id: 7, name: 'Banner', url: 'https://cdn.example/banner.png' };

describe('imageSource — a baker’s own image', () => {
  it('reports the image’s natural aspect, so a wide banner is born wide', async () => {
    stubLoader({ w: 1200, h: 600 });
    expect((await imageSource(upload)).aspect).toBeCloseTo(2);
  });

  it('reports a portrait image as taller than it is wide', async () => {
    stubLoader({ w: 600, h: 1200 });
    expect((await imageSource(upload)).aspect).toBeCloseTo(0.5);
  });

  it('reports a square image as square', async () => {
    stubLoader({ w: 800, h: 800 });
    expect((await imageSource(upload)).aspect).toBeCloseTo(1);
  });

  // A browser that reports nothing must not produce aspect 0 or NaN: both lay the item out at a size
  // CSS resolves to something arbitrary, and the baker would print whatever that happened to be.
  it('falls back to square rather than dividing by zero', async () => {
    stubLoader({ w: 0, h: 0 });
    const src = await imageSource(upload);
    expect(src.aspect).toBe(1);
    expect(Number.isFinite(src.aspect)).toBe(true);
  });

  it('carries the upload’s id and name through, as strings the sheet can key on', async () => {
    stubLoader({ w: 100, h: 100 });
    const src = await imageSource(upload);
    expect(src.id).toBe('7');            // string: placements compare ids, and 7 !== '7'
    expect(src.name).toBe('Banner');
  });

  it('names an untitled upload rather than showing a blank thumbnail title', async () => {
    stubLoader({ w: 100, h: 100 });
    expect((await imageSource({ id: 1, url: 'https://x/1.png' })).name).toBe('Image');
  });

  // There is no mask and no transform, so the upload url IS the preview — rendering it to a canvas
  // first would spend memory to produce identical pixels.
  it('previews straight from the upload url', async () => {
    stubLoader({ w: 100, h: 100 });
    expect((await imageSource(upload)).preview).toBe(upload.url);
  });

  describe('draw — the export path', () => {
    it('paints the image at the size it is given, not at its own', async () => {
      stubLoader({ w: 1200, h: 600 });
      const src = await imageSource(upload);
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
      const src = await imageSource(upload);
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
      const src = await imageSource(upload);
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

// ── Frames ────────────────────────────────────────────────────────────────────────────────────────
// A photo frame is any element carrying placement_config.photo.mask — CONFIG, never element type or
// slug (INVARIANTS #1/#6). That is what lets a frame added in admin reach the print studio with no
// deploy, and what stops the studio growing its own private list of shapes that drifts from the
// catalogue the cake is actually decorated from.

const frame = (id, mask) => ({ id, name: `Frame ${id}`, placement_config: { photo: { mask } } });

describe('frameMaskOf / framesIn — a frame is config, not a type', () => {
  it('reads the mask off a frame element', () => {
    expect(frameMaskOf(frame('f1', 'https://x/heart.png'))).toBe('https://x/heart.png');
  });

  it('is null for an element that is not a frame', () => {
    expect(frameMaskOf({ id: 'e1', placement_config: { r: 2 } })).toBe(null);
    expect(frameMaskOf({ id: 'e2' })).toBe(null);
    expect(frameMaskOf(undefined)).toBe(null);
  });

  it('picks only the frames out of a mixed catalogue', () => {
    const rows = [
      frame('f1', 'https://x/heart.png'),
      { id: 'e1', name: 'A rose', placement_config: { r: 2 } },
      frame('f2', 'https://x/round.png'),
      { id: 'e2', name: 'Piping' },
    ];
    expect(framesIn(rows).map(f => f.id)).toEqual(['f1', 'f2']);
  });

  it('survives an empty or missing catalogue — the studio still prints unframed', () => {
    expect(framesIn([])).toEqual([]);
    expect(framesIn()).toEqual([]);
  });
});

describe('imageSource with a frame', () => {
  const heart = frame('f1', 'https://x/heart.png');

  // THE assertion for framing. A frame's mask is square and renderFramedPhoto cover-fits into it, so
  // the ITEM is square whatever the photo's own shape — the photo's proportions live in the
  // transform. Reporting the photo's aspect here would stretch the mask itself, and the print would
  // be a heart that is not heart-shaped.
  it('is square even when the photo is not', async () => {
    stubCanvas(); stubLoader({ w: 1200, h: 600 });
    expect((await imageSource(upload, { frame: heart })).aspect).toBe(1);
  });

  it('is square for a portrait photo too', async () => {
    stubCanvas(); stubLoader({ w: 600, h: 1800 });
    expect((await imageSource(upload, { frame: heart })).aspect).toBe(1);
  });

  it('goes back to the photo’s own shape when the frame is removed', async () => {
    stubCanvas(); stubLoader({ w: 1200, h: 600 });
    expect((await imageSource(upload, { frame: null })).aspect).toBeCloseTo(2);
  });

  it('remembers which frame it wears, and the mask that cut it', async () => {
    stubCanvas(); stubLoader({ w: 100, h: 100 });
    const src = await imageSource(upload, { frame: heart });
    expect(src.frameId).toBe('f1');
    expect(src.maskUrl).toBe('https://x/heart.png');
  });

  it('reports no frame and no mask when unframed', async () => {
    stubCanvas(); stubLoader({ w: 100, h: 100 });
    const src = await imageSource(upload);
    expect(src.frameId).toBe(null);
    expect(src.maskUrl).toBe(null);
  });

  // The transform is what a baker adjusts to choose which part of the photo the shape shows. It must
  // survive onto the source, because that is what gets saved with the sheet.
  it('carries the transform it was composed at', async () => {
    stubCanvas(); stubLoader({ w: 100, h: 100 });
    const t = { x: 0.1, y: -0.2, zoom: 1.8, rot: 15 };
    expect((await imageSource(upload, { frame: heart, transform: t })).transform).toEqual(t);
  });

  it('defaults to an untouched transform rather than undefined', async () => {
    stubCanvas(); stubLoader({ w: 100, h: 100 });
    expect((await imageSource(upload)).transform).toEqual({ x: 0, y: 0, zoom: 1, rot: 0 });
  });
});
