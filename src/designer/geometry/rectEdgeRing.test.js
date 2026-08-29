import { describe, it, expect } from 'vitest';
import { rectEdgeRing, tierShape } from './surface.js';

// ── Shells round a sheet cake's edge, and what happens at the four corners ───────────────────────
//
// Each edge used to centre its shells with a half-pitch margin at both ends, which spaces a straight
// run correctly and crowds every corner: two shells half a pitch either side of a right angle are
// hypot(p/2, p/2) = 0.71p apart, not p. The turn eats the chord.
//
// That read as "piping turning a corner" for as long as sheet borders were narrow shells. A WIDE one
// is unforgiving. The numbers below are the real Scroll Shell Swirl, measured from its GLB at the
// size it was reported at: 0.688 across, laid at a 0.558 step. Along a run that is a 19% overlap, as
// authored. At the corner it was 40% — and 40% of two shells sitting at 45° to each other is not a
// tight corner, it is one lump.
const SCROLL = { width: 0.688, step: 0.558, off: 0.214 };

const sheet  = tierShape({ shape: 'rect', width: 2.16, depth: 1.56 });
const square = tierShape({ shape: 'rect', width: 2.16, depth: 2.16 });

// Gaps between consecutive shells, split by whether the pair straddles a corner (their facings differ).
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

describe('rectEdgeRing — a corner is spaced like a straight run', () => {
  it('does not crowd the wide scroll at a corner', () => {
    const { run, corner } = gaps(sheet, SCROLL);
    // The whole point: the tightest corner gap is no tighter than the tightest run gap.
    expect(Math.min(...corner)).toBeGreaterThanOrEqual(Math.min(...run) * 0.98);
    // And in absolute terms, nowhere near the 0.416 it used to be.
    expect(Math.min(...corner)).toBeGreaterThan(0.55);
  });

  it('holds the overlap within a few points of the authored one, everywhere on the ring', () => {
    // `spacing` is an authored control; a corner that silently doubles the overlap makes it a lie.
    const { run, corner } = gaps(sheet, SCROLL);
    const overlap = g => 1 - g / SCROLL.width;
    const all = [...run, ...corner].map(overlap);
    expect(Math.max(...all) - Math.min(...all)).toBeLessThan(0.05);
  });

  it('is uniform on a square, where every edge is the same length', () => {
    const { run, corner } = gaps(square, SCROLL);
    const all = [...run, ...corner];
    expect(Math.max(...all) / Math.min(...all)).toBeLessThan(1.02);
  });

  it('barely moves a NARROW shell — the borders that already looked right', () => {
    // A rim/board shell is small next to its step, so the corner correction is a small share of the
    // edge and the pitch must stay essentially the authored one.
    const step = 0.16;
    const { run, corner } = gaps(sheet, { step, off: 0.06 });
    for (const g of [...run, ...corner]) expect(Math.abs(g / step - 1)).toBeLessThan(0.06);
  });

  it('keeps the shell count EVEN, so an A/B pattern closes at the seam', () => {
    // Opposite edges get the same count and there are four corners, so the total is even by
    // symmetry — which is why alternating patterns close on a sheet without the round path's
    // explicit round-up-to-a-whole-cycle. Swept, because one example proves nothing here.
    for (let w = 1.4; w <= 3.2; w += 0.05) {
      for (const r of [1, 0.72, 0.55]) {
        const shp = tierShape({ shape: 'rect', width: +w.toFixed(2), depth: +(w * r).toFixed(2) });
        for (const cfg of [SCROLL, { step: 0.16, off: 0.06 }, { step: 0.16, off: -0.06 }]) {
          expect(gaps(shp, cfg).n % 2).toBe(0);
        }
      }
    }
  });

  it('never places a shell outside its own edge, whatever the corner radius', () => {
    // The margin is derived from the pitch, so a corner radius larger than the pitch could push the
    // end shell past the end of the edge if it were not clamped.
    const chunky = tierShape({ shape: 'rect', width: 1.6, depth: 1.2, cornerR: 0.5 });
    for (const p of rectEdgeRing(chunky, 0.3, 0.12, 0)) {
      expect(Math.hypot(p.pos[0], p.pos[2])).toBeLessThan(Math.hypot(1.6, 1.2));
      expect(Number.isFinite(p.pos[0]) && Number.isFinite(p.pos[2])).toBe(true);
    }
  });

  it('still puts exactly one shell on a side too short to hold two', () => {
    const sliver = tierShape({ shape: 'rect', width: 2.4, depth: 0.5 });
    const pos = rectEdgeRing(sliver, 0.02, 0.4, 0);
    const right = pos.filter(p => p.pos[0] > 0.5 && Math.abs(p.rotY) < 0.2);
    expect(right.length).toBeGreaterThanOrEqual(1);
    // A single shell on an edge sits in the middle of it, not against one end.
    if (right.length === 1) expect(Math.abs(right[0].pos[2])).toBeLessThan(0.01);
  });
});
