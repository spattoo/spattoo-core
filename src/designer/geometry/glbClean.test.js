import { describe, it, expect } from 'vitest';
import { cleanTriangles, SLIVER_ASPECT, MIN_AREA } from './glbClean.js';

/* Build a flat grid of `n`x`n` quads over a 1x1 patch: 2n^2 small, well-shaped triangles. */
function grid(n, { y = 0, scale = 1 } = {}) {
  const positions = [];
  const index = [];
  const at = (i, j) => i * (n + 1) + j;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) positions.push((i / n) * scale, y, (j / n) * scale);
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      index.push(at(i, j), at(i + 1, j), at(i, j + 1));
      index.push(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }
  return { positions, index };
}

/* Append a vertex, return its index. */
function push(positions, x, y, z) {
  positions.push(x, y, z);
  return positions.length / 3 - 1;
}

const triCount = r => r.keep.length / 3;

describe('cleanTriangles', () => {
  it('keeps every triangle of a clean mesh', () => {
    const { positions, index } = grid(8);
    const r = cleanTriangles(positions, index);
    expect(triCount(r)).toBe(index.length / 3);
    expect(r.dropped).toEqual({ tiny: 0, sliver: 0 });
  });

  it('drops a degenerate triangle whose three points are collinear', () => {
    const { positions, index } = grid(4);
    const a = push(positions, 5, 0, 0);
    const b = push(positions, 5.0000001, 0, 0);
    const c = push(positions, 5.0000002, 0, 0);
    const r = cleanTriangles(positions, [...index, a, b, c]);
    expect(triCount(r)).toBe(index.length / 3);
    expect(r.dropped.tiny).toBe(1);
  });

  it('drops a needle that spans the model', () => {
    // The shard the old area rule was reaching for: huge, but caught on SHAPE, not on size.
    const { positions, index } = grid(4);
    const a = push(positions, 0, 0, 0);
    const b = push(positions, 100, 0, 0);
    const c = push(positions, 100, 0, 0.1);
    const r = cleanTriangles(positions, [...index, a, b, c]);
    expect(triCount(r)).toBe(index.length / 3);
    expect(r.dropped.sliver).toBe(1);
  });

  // ⚠️ This is the case that was broken, and it is the shape of every mesh our optimizer emits.
  // Decimation spends few big triangles on a flat panel and many small ones around detail, so a
  // ratio of "biggest over mean" in the hundreds is a sign the optimizer WORKED. The old rule read
  // that as noise and deleted the panel: on the makeup palette, 55 triangles carrying 45.3% of the
  // model's surface — the lid — leaving an open box on the cake.
  it('keeps the big flat panel of a decimated mesh', () => {
    const { positions, index } = grid(40, { y: 0, scale: 1 });   // 3200 small detail triangles
    // One lid: two triangles spanning a 10x10 panel above the detail.
    const p0 = push(positions, -5, 2, -5);
    const p1 = push(positions,  5, 2, -5);
    const p2 = push(positions,  5, 2,  5);
    const p3 = push(positions, -5, 2,  5);
    const all = [...index, p0, p1, p2, p0, p2, p3];

    const areas = [];
    for (let t = 0; t < all.length; t += 3) {
      const px = (i, o) => positions[i * 3 + o];
      const [a, b, c] = [all[t], all[t + 1], all[t + 2]];
      const e1 = [px(b,0)-px(a,0), px(b,1)-px(a,1), px(b,2)-px(a,2)];
      const e2 = [px(c,0)-px(a,0), px(c,1)-px(a,1), px(c,2)-px(a,2)];
      const cr = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]];
      areas.push(Math.hypot(...cr) * 0.5);
    }
    const mean = areas.reduce((s, a) => s + a, 0) / areas.length;
    // The panel is far past the old 50x-mean cap, and it is the thing you look at.
    expect(Math.max(...areas) / mean).toBeGreaterThan(50);

    const r = cleanTriangles(positions, all);
    expect(triCount(r)).toBe(all.length / 3);
    expect(r.dropped).toEqual({ tiny: 0, sliver: 0 });
  });

  it('judges a sliver by aspect, not by size', () => {
    // Same shape, two sizes. Both go as slivers: thinness is what makes a shard, and the rule is
    // scale-free, unlike the mesh-relative area rule it replaced. (Shrink far enough and MIN_AREA
    // claims it first — that is the precision floor doing its own job, not the aspect rule.)
    const wide  = [0,0,0,  1,0,0,  1,0,1/(SLIVER_ASPECT * 2)];
    const small = wide.map(v => v * 1e-1);
    expect(cleanTriangles(wide,  [0,1,2]).dropped).toEqual({ tiny: 0, sliver: 1 });
    expect(cleanTriangles(small, [0,1,2]).dropped).toEqual({ tiny: 0, sliver: 1 });
  });

  it('is an absolute floor, so a whole model scaled down survives', () => {
    // A mesh-relative threshold is the mistake the area rule made: shrink the model and every
    // triangle becomes "small". MIN_AREA is about float precision, so a millimetre-scale export
    // of the same shape keeps all of it.
    const { positions, index } = grid(8, { scale: 0.01 });
    const r = cleanTriangles(positions, index);
    expect(triCount(r)).toBe(index.length / 3);
    const smallest = (0.01 / 8) ** 2 / 2;
    expect(smallest).toBeGreaterThan(MIN_AREA);
  });

  it('reports what went and why, so a bad asset can be told from a bad rule', () => {
    const positions = [];
    const index = [];
    // one good, one needle, one collinear
    index.push(push(positions,0,0,0), push(positions,1,0,0), push(positions,0,0,1));
    index.push(push(positions,0,0,0), push(positions,10,0,0), push(positions,10,0,0.01));
    index.push(push(positions,0,0,0), push(positions,1e-5,0,0), push(positions,2e-5,0,0));
    const r = cleanTriangles(positions, index);
    expect(triCount(r)).toBe(1);
    expect(r.dropped).toEqual({ tiny: 1, sliver: 1 });
  });
});
