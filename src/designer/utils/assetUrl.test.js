/* The 3D predicate. It decides a badge on a 64px tile, and the whole reason that badge exists is
   that a model and a print look alike at that size — so a wrong answer here is invisible. */
import { describe, it, expect } from 'vitest';
import { isGlbUrl, elementIs3D } from './assetUrl.js';

describe('isGlbUrl — a fact about the file', () => {
  it('knows the two model extensions', () => {
    expect(isGlbUrl('elements/files/3D/a.glb')).toBe(true);
    expect(isGlbUrl('elements/files/3D/a.gltf')).toBe(true);
  });

  it('is not fooled by a query string', () => {
    // Every asset in this app is loaded through corsUrl(), which appends `?cors=1`. A `$`-anchored
    // test without the `\?` branch would call every loaded model flat.
    expect(isGlbUrl('elements/files/3D/a.glb?cors=1')).toBe(true);
    expect(isGlbUrl('elements/files/3D/a.gltf?v=2&cors=1')).toBe(true);
  });

  it('calls a picture a picture', () => {
    for (const u of ['elements/files/2D/a.png', 'a.webp', 'a.jpg', 'a.svg']) {
      expect(isGlbUrl(u)).toBe(false);
    }
  });

  it('is not fooled by the letters appearing elsewhere', () => {
    // A folder or a name containing "glb" is not an extension.
    expect(isGlbUrl('elements/glb/a.png')).toBe(false);
    expect(isGlbUrl('a.glb.png')).toBe(false);
  });

  it('answers false for nothing at all, rather than throwing', () => {
    // A procedural element has no image_url, and the tile renders it just the same.
    expect(isGlbUrl(null)).toBe(false);
    expect(isGlbUrl(undefined)).toBe(false);
    expect(isGlbUrl('')).toBe(false);
  });

  it('is case-insensitive, because an upload keeps the name it arrived with', () => {
    expect(isGlbUrl('A.GLB')).toBe(true);
  });
});

describe('elementIs3D — the same question asked of a row', () => {
  it('reads image_url, not the thumbnail', () => {
    // A model's THUMBNAIL is a .webp render of it. Testing the thumbnail would mark every model flat.
    expect(elementIs3D({ image_url: 'x/a.glb', thumbnail_url: 'y/a.webp' })).toBe(true);
    expect(elementIs3D({ image_url: 'x/a.png', thumbnail_url: 'y/a.webp' })).toBe(false);
  });

  it('survives a row with no asset, which is every procedural element', () => {
    expect(elementIs3D({ image_url: null })).toBe(false);
    expect(elementIs3D({})).toBe(false);
    expect(elementIs3D(null)).toBe(false);
  });
});
