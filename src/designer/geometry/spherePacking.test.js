import { describe, it, expect } from 'vitest';
import { apollo3, packCluster, clusterRadii, CLUSTER_SECOND_FRAC, CLUSTER_THIRD_FRAC } from './spherePacking.js';

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// A flat top with no reachable rim (huge R) — exercises the pure packing invariants.
const FLAT = { R: 1e6, topY: 0, ax: 0, az: 0 };

describe('apollo3 — tangent to three spheres', () => {
  it('places a unit ball tangent to three unit balls, topmost solution', () => {
    // Three unit balls on the y=0 plane; a fourth unit ball nestles in the pocket above.
    const P1 = [0, 1, 0], P2 = [2, 1, 0], P3 = [1, 1, Math.sqrt(3)];
    const g = apollo3(P1, 1, P2, 1, P3, 1, 1);
    expect(g).not.toBeNull();
    for (const P of [P1, P2, P3]) expect(dist3(g, P)).toBeCloseTo(2, 3);   // tangent (1+1)
    expect(g[1]).toBeGreaterThan(1);   // nestled ABOVE the seed plane (topmost)
  });

  it('returns null for collinear centres', () => {
    expect(apollo3([0, 0, 0], 1, [2, 0, 0], 1, [4, 0, 0], 1, 1)).toBeNull();
  });
});

describe('clusterRadii — size distribution (1 big, few mid, mostly small)', () => {
  const sizes = [1.6, 1.1, 0.8, 0.5];

  it('right length, exactly one largest (the seed) first, smalls in the on-top tail', () => {
    const seq = clusterRadii(20, sizes);
    expect(seq).toHaveLength(20);
    expect(seq.filter(r => r === 1.6)).toHaveLength(1);                 // only ONE biggest
    expect(seq[0]).toBe(1.6);                                           // seed is first
    expect(seq[seq.length - 1]).toBe(0.5);                             // pocket tail is smallest
  });

  it('INTERLEAVES the surface tiers (sizes alternate, not strict big→small)', () => {
    const seq = clusterRadii(20, sizes);
    // somewhere a larger ball follows a smaller one — proves the mix isn't strictly descending
    let mixed = false;
    for (let i = 1; i < seq.length; i++) if (seq[i] > seq[i - 1]) { mixed = true; break; }
    expect(mixed).toBe(true);
  });

  it('balances all four tiers as it grows (2nd/3rd substantial, not swamped by small)', () => {
    const seq = clusterRadii(20, sizes);
    const rest = 19;
    const n2 = Math.round(rest * CLUSTER_SECOND_FRAC), n3 = Math.round(rest * CLUSTER_THIRD_FRAC);
    expect(seq.filter(r => r === 1.1).length).toBe(n2);
    expect(seq.filter(r => r === 0.8).length).toBe(n3);
    expect(seq.filter(r => r === 0.5).length).toBe(rest - n2 - n3);
    // the 2nd+3rd tiers together are at least as many as the smallest (balanced, not small-dominated)
    expect(n2 + n3).toBeGreaterThanOrEqual(rest - n2 - n3);
  });

  it('safe for tiny counts and short tier lists', () => {
    expect(clusterRadii(1, sizes)).toEqual([1.6]);
    expect(clusterRadii(0, sizes)).toEqual([]);
    expect(clusterRadii(5, [1.0])).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('packCluster — the cluster invariants (#3–#5) on a flat top', () => {
  const radii = [1.5, 1.0, 0.6];
  const balls = packCluster({ count: 14, radii, cake: FLAT });

  it('produces the requested number of balls', () => {
    expect(balls).toHaveLength(14);
  });

  it('uses a MIX of sizes (#3)', () => {
    expect(new Set(balls.map(b => b.r)).size).toBeGreaterThan(1);
  });

  it('NO ball penetrates another (#5)', () => {
    for (let i = 0; i < balls.length; i++)
      for (let j = i + 1; j < balls.length; j++) {
        const d = dist3([balls[i].x, balls[i].y, balls[i].z], [balls[j].x, balls[j].y, balls[j].z]);
        expect(d).toBeGreaterThanOrEqual(balls[i].r + balls[j].r - 1e-3);
      }
  });

  it('every ball TOUCHES at least one other (#4/#5)', () => {
    for (let i = 0; i < balls.length; i++) {
      const touches = balls.some((b, j) =>
        j !== i &&
        Math.abs(dist3([balls[i].x, balls[i].y, balls[i].z], [b.x, b.y, b.z]) - (balls[i].r + b.r)) < 1e-2);
      expect(touches).toBe(true);
    }
  });

  it('all balls rest ON or ABOVE the top (no sinking)', () => {
    for (const b of balls) expect(b.y).toBeGreaterThanOrEqual(b.r - 1e-3);
  });

  it('seed is the first/biggest ball at the anchor', () => {
    expect(balls[0]).toMatchObject({ x: 0, z: 0, r: 1.5 });
  });

  it('degenerate inputs are safe', () => {
    expect(packCluster({ count: 0, radii, cake: FLAT })).toEqual([]);
    expect(packCluster({ count: 5, radii: [], cake: FLAT })).toEqual([]);
    expect(packCluster({ count: 1, radii, cake: FLAT })).toHaveLength(1);
    expect(packCluster({ count: 5, radii, cake: null })).toEqual([]);
  });
});

describe('packCluster — supported & draping on a real cake (#5/#6)', () => {
  // Seed near the rim of a small cake; a big cluster must spill over the edge / down the side.
  const cake = { R: 1.2, topY: 1.5, baseY: 0.1, ax: 1.1, az: 0 };
  const balls = packCluster({ count: 20, radii: [0.18, 0.12, 0.08], cake });
  // Cake-surface clearance (mirror of the packer's) + on-cake test.
  const clearance = (b) => {
    const rho = Math.hypot(b.x, b.z);
    if (b.y >= cake.topY) return rho <= cake.R ? b.y - cake.topY : Math.hypot(rho - cake.R, b.y - cake.topY);
    return rho - cake.R;
  };
  const onCake = (b) => clearance(b) <= b.r + 1.5e-2;

  it('no ball is buried inside the cake body', () => {
    for (const b of balls) expect(clearance(b)).toBeGreaterThanOrEqual(b.r - 1.5e-2);
  });

  it('EVERY ball is supported — on the cake OR cradled on >=2 balls below it (no floating, #5)', () => {
    balls.forEach((b, i) => {
      if (onCake(b)) return;
      const below = balls.filter((o, j) => j !== i &&
        Math.abs(dist3([b.x, b.y, b.z], [o.x, o.y, o.z]) - (b.r + o.r)) < 1.5e-2 && o.y < b.y - 0.15 * b.r);
      const cradled = below.some((p, a) => below.some((q, c) => c > a &&
        (p.x - b.x) * (q.x - b.x) + (p.z - b.z) * (q.z - b.z) < 0));   // opposing supports
      expect(onCake(b) || cradled).toBe(true);
    });
  });

  it('MOST balls touch the cake surface; only a minority ride on top (#6)', () => {
    const onSurf = balls.filter(onCake).length;
    expect(onSurf).toBeGreaterThanOrEqual(Math.ceil(balls.length * 0.6));
  });

  it('drapes: at least one ball spills past the rim or below the top', () => {
    expect(balls.some(b => Math.hypot(b.x, b.z) > cake.R || b.y < cake.topY)).toBe(true);
  });
});
