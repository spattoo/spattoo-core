import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadImage } from './framePhoto.js';

// The A4 print sheet exports to PDF, so its photos must load CORS-clean — and a crossOrigin load of a
// RAW R2 url is the one that gets blocked, because a plain <img> of the same asset elsewhere in the app
// caches an ACAO-less copy that Chrome then hands to this load. The guarantee lives in the LOADER, not
// at the call sites: PhotoSheet passed raw urls and its photos silently stopped loading. Pin it here so
// the loader can never quietly go back to trusting its callers. See designer/utils/assetUrl.js.
class FakeImage {
  set src(v) { this._src = v; }
  get src() { return this._src; }
}

afterEach(() => { vi.unstubAllGlobals(); });

const srcRequestedFor = (url) => {
  const made = [];
  vi.stubGlobal('Image', class extends FakeImage {
    constructor() { super(); made.push(this); }
  });
  loadImage(url);
  return made[0];
};

describe('framePhoto.loadImage — qualifies the url itself', () => {
  it('requests the CORS-qualified url even when handed a raw one', () => {
    expect(srcRequestedFor('https://cdn.example/photo.webp').src).toBe('https://cdn.example/photo.webp?cors=1');
  });

  it('sets crossOrigin so the export canvas is never tainted', () => {
    expect(srcRequestedFor('https://cdn.example/photo.webp').crossOrigin).toBe('anonymous');
  });

  it('does not double-qualify an already-qualified url', () => {
    expect(srcRequestedFor('https://cdn.example/photo.webp?cors=1').src).toBe('https://cdn.example/photo.webp?cors=1');
  });

  it('leaves a blob: url alone — a freshly uploaded photo is same-origin', () => {
    expect(srcRequestedFor('blob:http://localhost:5173/abc').src).toBe('blob:http://localhost:5173/abc');
  });
});
