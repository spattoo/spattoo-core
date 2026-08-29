import { describe, it, expect } from 'vitest';
import { rectEdgeRing, tierShape } from './surface.js';

// ── Shells round a sheet cake's edge, and what happens at the four corners ───────────────────────
//
// Two faults lived here, and only the second one was visible.
//
// 1. Every corner got exactly ONE shell on its bisector, asking only that a fillet exist and never
//    that it be big enough. A shell is laid TANGENTIALLY, across its facing, so one sitting on a
//    fillet shorter than itself overhangs both ends — and the overhang is over the air beside the
//    cake, not over the cake. On a sheet the fillet is only ever as big as the ring's own outset,
//    so this was four shells floating clear of the corners.
//
// 2. Each edge centred its shells with a half-pitch margin at both ends, which is right where the
//    junction is smooth and wrong at a hard right angle: the turn eats the chord, leaving neighbours
//    hypot(p/2, p/2) = 0.71p apart rather than p.
//
// The numbers are the real Scroll Shell Swirl measured from its GLB at the size it was reported at:
// 0.688 across, laid at a 0.558 step, its half-depth 0.214 as the outset. Both faults needed a wide
// shell to show — a narrow rim border absorbs either as "piping turning a corner".
const SCROLL = { width: 0.688, step: 0.558, off: 0.214 };
const NARROW = { width: 0.197, step: 0.160, off: 0.060 };

const sheet  = tierShape({ shape: 'rect', width: 2.16, depth: 1.56 });
const square = tierShape({ shape: 'rect', width: 2.16, depth: 2.16 });

// How far past the wall a shell's own width carries it. A shell is drawn across its facing, so its
// two width-ends are the points that can leave the cake.
function overhang(shape, { width, step, off }) {
  let worst = -Infinity;
  for (const p of rectEdgeRing(shape, off, step, 0)) {
    const tx = -Math.sin(p.rotY), tz = Math.cos(p.rotY);
    for (const s of [-1, 1]) {
      const x = p.pos[0] + s * (width / 2) * tx, z = p.pos[2] + s * (width / 2) * tz;
      worst = Math.max(worst, Math.abs(x) - shape.halfW - off, Math.abs(z) - shape.halfD - off);
    }
  }
  return worst;
}

// Gaps between consecutive shells, split by whether the pair straddles a corner.
function gaps(shape, { step, off }) {
  const pos = rectEdgeRing(shape, off, step, 0);
  const run = [], corner = [];
  for (let i = 0; i < pos.length; i++) {
    const a = pos[i], b = pos[(i + 1) % pos.length];
    const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]);
    const turn = Math.abs(((b.rotY - a.rotY + Math.PI) % (2 * Math.PI)) - Math.PI);
    (turn > 0.2 ? corner : run).push(d);
  }
  return { run, corner, n: pos.length };
}

describe('rectEdgeRing — nothing hangs off the corners', () => {
  it('keeps the wide scroll on the cake', () => {
    // The reported bug, as a measurement: four shells used to reach 0.181 clear of the wall.
    expect(overhang(sheet, SCROLL)).toBeLessThan(0.02);
    expect(overhang(square, SCROLL)).toBeLessThan(0.02);
  });

  it('will not put a shell on a fillet too short to hold one', () => {
    // A sheet's fillet is just the ring's outset: arc = (π/2)·0.214 = 0.336, against a 0.688 shell.
    // Nothing faces a bisector, so nothing can overhang one.
    const diag = rectEdgeRing(sheet, SCROLL.off, SCROLL.step, 0)
      .filter(p => Math.abs(Math.abs(p.rotY % (Math.PI / 2)) - Math.PI / 4) < 0.01);
    expect(diag).toHaveLength(0);
  });

  it('DOES fill a fillet big enough to carry shells', () => {
    // The rule is about size, not about refusing corners. A genuinely rounded cake still gets its
    // corner piped — and with several shells flowing round it, not one straddling it.
    const rounded = tierShape({ shape: 'rect', width: 2.4, depth: 1.8, cornerR: 0.6 });
    const diag = rectEdgeRing(rounded, NARROW.off, NARROW.step, 0)
      .filter(p => Math.abs(Math.abs(p.rotY % (Math.PI / 2)) - Math.PI / 4) < 0.3);
    expect(diag.length).toBeGreaterThan(4);
    expect(overhang(rounded, NARROW)).toBeLessThan(0.05);
  });

  it('sweeps clean across every cake size', () => {
    for (let w = 1.4; w <= 3.2; w += 0.05) {
      for (const r of [1, 0.72, 0.55]) {
        const shp = tierShape({ shape: 'rect', width: +w.toFixed(2), depth: +(w * r).toFixed(2) });
        expect(overhang(shp, SCROLL)).toBeLessThan(0.06);
        expect(overhang(shp, NARROW)).toBeLessThan(0.02);
      }
    }
  });
});

describe('rectEdgeRing — a corner is spaced like a straight run', () => {
  it('does not crowd the scroll where two faces meet', () => {
    const { run, corner } = gaps(sheet, SCROLL);
    expect(Math.min(...corner)).toBeGreaterThanOrEqual(Math.min(...run) * 0.98);
  });

  it('holds the overlap within a few points of the authored one, everywhere on the ring', () => {
    // `spacing` is an authored control; a corner that silently doubles the overlap makes it a lie.
    const { run, corner } = gaps(sheet, SCROLL);
    const all = [...run, ...corner].map(g => 1 - g / SCROLL.width);
    expect(Math.max(...all) - Math.min(...all)).toBeLessThan(0.05);
  });

  it('is uniform on a square, where every edge is the same length', () => {
    const { run, corner } = gaps(square, SCROLL);
    const all = [...run, ...corner];
    expect(Math.max(...all) / Math.min(...all)).toBeLessThan(1.02);
  });

  it('barely moves a NARROW shell — the borders that already looked right', () => {
    for (const off of [NARROW.off, -NARROW.off]) {
      const { run, corner } = gaps(sheet, { step: NARROW.step, off });
      for (const g of [...run, ...corner]) expect(Math.abs(g / NARROW.step - 1)).toBeLessThan(0.09);
    }
  });
});

describe('rectEdgeRing — invariants', () => {
  it('keeps the shell count EVEN, so an A/B pattern closes at the seam', () => {
    // Opposite edges get the same count and the four corners match, so the total is even by
    // symmetry — which is why alternating patterns close on a sheet without the round path's
    // explicit round-up to a whole cycle. Swept, because one example proves nothing here.
    for (let w = 1.4; w <= 3.2; w += 0.05) {
      for (const r of [1, 0.72, 0.55]) {
        const shp = tierShape({ shape: 'rect', width: +w.toFixed(2), depth: +(w * r).toFixed(2) });
        for (const cfg of [SCROLL, NARROW, { step: 0.16, off: -0.06 }]) {
          expect(gaps(shp, cfg).n % 2).toBe(0);
        }
      }
    }
  });

  it('never emits a NaN, whatever the corner radius', () => {
    // The margin is derived from the pitch, so a fillet wider than the pitch could ask for a
    // negative margin if it were not clamped.
    for (const cornerR of [0, 0.05, 0.3, 0.5, 0.7]) {
      const shp = tierShape({ shape: 'rect', width: 1.6, depth: 1.2, cornerR });
      for (const p of rectEdgeRing(shp, 0.3, 0.12, 0)) {
        expect(Number.isFinite(p.pos[0]) && Number.isFinite(p.pos[2]) && Number.isFinite(p.rotY)).toBe(true);
      }
    }
  });

  it('still puts exactly one shell on a side too short to hold two, centred', () => {
    const sliver = tierShape({ shape: 'rect', width: 2.4, depth: 0.5 });
    const right = rectEdgeRing(sliver, 0.02, 0.4, 0).filter(p => p.pos[0] > 0.5 && Math.abs(p.rotY) < 0.2);
    expect(right.length).toBeGreaterThanOrEqual(1);
    if (right.length === 1) expect(Math.abs(right[0].pos[2])).toBeLessThan(0.01);
  });
});
