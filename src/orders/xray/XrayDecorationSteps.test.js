import { describe, it, expect } from 'vitest';
import { cropStyle } from './XrayDecorationSteps.jsx';

// The close-up is a pure CSS crop of the reference photo — no canvas, no second asset. That makes
// it free, and it makes this arithmetic the only thing standing between the baker and a confident
// picture of the wrong part of the cake.
describe('cropStyle', () => {
  const parse = (st) => ({
    size: st.backgroundSize.split(' ').map(v => +v.replace('%', '')),
    pos:  st.backgroundPosition.split(' ').map(v => +v.replace('%', '')),
  });

  it('zooms so the padded box fills the frame', () => {
    // 0.4 wide, padded by 25% each side -> 0.6 -> 1/0.6 = 166.67%
    const { size } = parse(cropStyle('p.jpg', [0.3, 0.1, 0.4, 0.4]));
    expect(size[0]).toBeCloseTo(166.67, 1);
    expect(size[1]).toBeCloseTo(166.67, 1);
  });

  it('centres a box that already spans the whole axis', () => {
    // Padding pushes it past the edge; the position term would divide by zero.
    const { pos } = parse(cropStyle('p.jpg', [0, 0, 1, 1]));
    expect(pos).toEqual([50, 50]);
  });

  it('puts a top-left decoration at the top-left of the photo', () => {
    // cx/cy clamp to 0, so the crop starts at the origin.
    const { pos } = parse(cropStyle('p.jpg', [0, 0, 0.2, 0.2]));
    expect(pos).toEqual([0, 0]);
  });

  it('puts a bottom-right decoration at the far end', () => {
    // cx = 0.8 - 0.05 = 0.75, cw = 0.25 -> 0.75 / 0.75 = 100%
    const { pos } = parse(cropStyle('p.jpg', [0.8, 0.8, 0.2, 0.2]));
    expect(pos[0]).toBeCloseTo(100, 1);
    expect(pos[1]).toBeCloseTo(100, 1);
  });

  it('never scales below the frame, so no photo edge shows', () => {
    for (const b of [[0, 0, 1, 1], [0.4, 0.4, 0.2, 0.2], [0.9, 0.9, 0.1, 0.1]]) {
      const { size } = parse(cropStyle('p.jpg', b));
      expect(size[0]).toBeGreaterThanOrEqual(100);
      expect(size[1]).toBeGreaterThanOrEqual(100);
    }
  });

  it('keeps the crop inside the image on every axis', () => {
    const { pos } = parse(cropStyle('p.jpg', [0.05, 0.05, 0.3, 0.3]));
    expect(pos[0]).toBeGreaterThanOrEqual(0);
    expect(pos[0]).toBeLessThanOrEqual(100);
    expect(pos[1]).toBeGreaterThanOrEqual(0);
    expect(pos[1]).toBeLessThanOrEqual(100);
  });
});
