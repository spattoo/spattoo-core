import { describe, it, expect } from 'vitest';
import { recolorImageData, recolorRegions, extractRegions, rgbToHsl } from './imageRecolor.js';

// Build a 1×N RGBA buffer from [r,g,b] triples (alpha 255).
const buf = (...pixels) => {
  const d = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; });
  return d;
};
const hueOf = (d, i) => rgbToHsl(d[i], d[i + 1], d[i + 2])[0];

describe('recolorImageData — blue_gt_green region (wing fill only)', () => {
  const region = { method: 'blue_gt_green', guard: 12 };

  it('recolours blue-dominant (lavender) pixels to the target hue', () => {
    const d = buf([200, 180, 230]);          // lavender: blue > green
    recolorImageData(d, 1, 1, '#22aa44', region);   // target green (hue ~140)
    expect(hueOf(d, 0)).toBeGreaterThan(90);
    expect(hueOf(d, 0)).toBeLessThan(180);
  });

  it('leaves gold edges (green > blue) untouched', () => {
    const gold = [212, 175, 55];
    const d = buf(gold);
    recolorImageData(d, 1, 1, '#22aa44', region);
    expect([d[0], d[1], d[2]]).toEqual(gold);
  });

  it('leaves near-white highlights (blue ≈ green) untouched', () => {
    const white = [248, 248, 250];           // blue exceeds green by only 2 < guard
    const d = buf(white);
    recolorImageData(d, 1, 1, '#22aa44', region);
    expect([d[0], d[1], d[2]]).toEqual(white);
  });

  it('preserves brightness order — a darker wing pixel stays darker after recolour', () => {
    const d = buf([170, 150, 205], [210, 195, 240]);   // both blue-dominant, 2nd is lighter
    recolorImageData(d, 2, 1, '#3333cc', region);
    expect(rgbToHsl(d[0], d[1], d[2])[2]).toBeLessThan(rgbToHsl(d[4], d[5], d[6])[2]);
  });

  it('opaque method recolours every non-transparent pixel (gold included), skips transparent', () => {
    const d = new Uint8ClampedArray([212, 175, 55, 255,  0, 0, 0, 0]);  // gold (opaque) + transparent
    recolorImageData(d, 2, 1, '#2244cc', { method: 'opaque' });
    expect(hueOf(d, 0)).toBeGreaterThan(180);              // gold recoloured toward blue
    expect(hueOf(d, 0)).toBeLessThan(260);
    expect([d[4], d[5], d[6], d[7]]).toEqual([0, 0, 0, 0]); // transparent pixel untouched
  });

  it('saturated method recolours vivid fill of ANY hue, leaves black & white lines', () => {
    // vivid green fill + black vein + white pixel
    const d = new Uint8ClampedArray([40, 200, 80, 255,  12, 12, 12, 255,  250, 250, 250, 255]);
    recolorImageData(d, 3, 1, '#cc2266', { method: 'saturated' });   // target pink
    expect(hueOf(d, 0)).toBeGreaterThan(300);                 // green fill → pink hue
    expect([d[4], d[5], d[6]]).toEqual([12, 12, 12]);         // black vein untouched
    expect([d[8], d[9], d[10]]).toEqual([250, 250, 250]);     // white untouched
  });

  it('is a no-op when no region descriptor is given', () => {
    const px = [200, 180, 230];
    const d = buf(px);
    recolorImageData(d, 1, 1, '#22aa44', null);
    expect([d[0], d[1], d[2]]).toEqual(px);
  });
});

describe('hue_regions — multi-region extract + recolour', () => {
  // A buffer that is `frac` orange (hue ~26), some yellow (hue ~50), rest transparent.
  const twoTone = (n = 4000) => {
    const d = new Uint8ClampedArray(n * 4);
    let i = 0;
    const set = (r, g, b) => { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; };
    for (; i < n * 0.75; i++) set(245, 130, 45);   // orange body
    for (; i < n * 0.90; i++) set(245, 210, 40);   // yellow belly
    for (; i < n; i++) { d[i * 4 + 3] = 0; }        // transparent
    return d;
  };

  it('extracts two regions (orange + yellow), sorted by share', () => {
    const regions = extractRegions(twoTone(), 100, 40);
    expect(regions.length).toBe(2);
    expect(regions[0].share).toBeGreaterThan(regions[1].share);         // orange first
    expect(regions[0].hue).toBeGreaterThan(15); expect(regions[0].hue).toBeLessThan(40);  // ~orange
    expect(regions[1].hue).toBeGreaterThan(40); expect(regions[1].hue).toBeLessThan(65);  // ~yellow
  });

  it('recolours each region independently (orange→blue keeps yellow yellow)', () => {
    const d = twoTone();
    const regions = extractRegions(d, 100, 40);
    recolorRegions(d, 100, 40, regions.map(r => r.hue), ['#2244cc', null]);   // orange→blue, yellow untouched
    expect(hueOf(d, 0)).toBeGreaterThan(180);                 // orange pixel → blue-ish
    const yi = Math.floor(4000 * 0.80) * 4;                   // a yellow pixel
    expect(hueOf(d, yi)).toBeGreaterThan(40); expect(hueOf(d, yi)).toBeLessThan(65);  // still yellow
  });

  it('single-colour image yields ONE region (no over-split)', () => {
    const n = 2000, d = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) { d[i * 4] = 45; d[i * 4 + 1] = 180; d[i * 4 + 2] = 200; d[i * 4 + 3] = 255; }  // teal
    expect(extractRegions(d, 50, 40).length).toBe(1);
  });
});
