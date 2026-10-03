import { describe, it, expect } from 'vitest';
import { translateStroke, distanceToStroke, strokePoints, isUprightNormal } from './strokeMove.js';

// ── Sliding a placed stroke ──────────────────────────────────────────────────────────────────────
// Two things have to hold or the feature is worse than not having it: the SHAPE survives the move
// (otherwise you have not moved your line, you have got a different one), and the stroke stays ON
// the cake — which on a curved wall is not the same as adding a vector to every point.

const R = 1.2;
const wallStroke = (n, a0, a1, y = 0.9) => Array.from({ length: n }, (_, i) => {
  const a = a0 + (a1 - a0) * (i / (n - 1));
  return [Math.cos(a) * R, y, Math.sin(a) * R];
});

// Distances between consecutive points — the stroke's shape, independent of where it sits.
const gaps = pts => pts.slice(1).map((p, i) =>
  Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]));

describe('translateStroke', () => {
  it('returns the points untouched when there is nothing to do', () => {
    const pts = [[0, 1, 0]];
    expect(translateStroke(pts, null, [1, 1, 1])).toBe(pts);
    expect(translateStroke([], [0, 0, 0], [1, 1, 1])).toEqual([]);
  });

  describe('on the cake top', () => {
    const flat = [[-0.5, 1, 0.2], [0, 1, 0.2], [0.5, 1, 0.2]];

    it('moves every point by the drag', () => {
      const out = translateStroke(flat, [0, 1, 0], [0.3, 1, -0.1], { normal: [0, 1, 0] });
      expect(out[0]).toEqual([-0.2, 1, 0.1]);
      expect(out[2]).toEqual([0.8, 1, 0.1]);
    });

    it('keeps the shape exactly', () => {
      const out = translateStroke(flat, [0, 1, 0], [0.3, 1, -0.1], { normal: [0, 1, 0] });
      expect(gaps(out)).toEqual(gaps(flat));
    });

    it('ignores the pointer\'s height, so the stroke does not drift off a level surface', () => {
      // A raycast against a shaded mesh wobbles in Y by a hair. Taking it would sink the stroke.
      const out = translateStroke(flat, [0, 1, 0], [0.3, 1.06, -0.1], { normal: [0, 1, 0] });
      for (const p of out) expect(p[1]).toBe(1);
    });

    it('does not mutate the stroke it was given', () => {
      const before = JSON.parse(JSON.stringify(flat));
      translateStroke(flat, [0, 1, 0], [0.3, 1, -0.1], { normal: [0, 1, 0] });
      expect(flat).toEqual(before);
    });
  });

  describe('on the wall', () => {
    const opts = { normal: [1, 0, 0], axis: [0, 0] };

    it('keeps every point ON the wall, however far round it is dragged', () => {
      // The whole reason this is not a world-space translation. Adding the same vector to every
      // point walks the middle of the run off the cylinder.
      const drawn = wallStroke(20, -0.4, 0.4);
      const from = [Math.cos(0) * R, 0.9, Math.sin(0) * R];
      const to   = [Math.cos(1.9) * R, 0.9, Math.sin(1.9) * R];
      const out = translateStroke(drawn, from, to, opts);
      for (const p of out) expect(Math.hypot(p[0], p[2])).toBeCloseTo(R, 3);
    });

    it('keeps the shape — same arc, moved round', () => {
      const drawn = wallStroke(20, -0.4, 0.4);
      const from = [Math.cos(0) * R, 0.9, Math.sin(0) * R];
      const to   = [Math.cos(1.1) * R, 0.9, Math.sin(1.1) * R];
      const out = translateStroke(drawn, from, to, opts);
      const a = gaps(drawn), b = gaps(out);
      for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i], 3);
    });

    it('rises up the wall with the drag', () => {
      const drawn = wallStroke(10, -0.2, 0.2, 0.5);
      const from = [R, 0.5, 0];
      const out = translateStroke(drawn, from, [R, 0.85, 0], opts);
      for (const p of out) expect(p[1]).toBeCloseTo(0.85, 3);
    });

    it('takes the SHORT way round rather than spinning a full turn', () => {
      // Dragging just past the back of the cake flips atan2 by 2π. Untreated, the stroke would whip
      // all the way round the other way.
      const drawn = wallStroke(10, 3.0, 3.1);
      const from = [Math.cos(3.10) * R, 0.9, Math.sin(3.10) * R];
      const to   = [Math.cos(-3.10) * R, 0.9, Math.sin(-3.10) * R];   // ~0.08 rad away, across ±π
      const out = translateStroke(drawn, from, to, opts);
      const moved = Math.abs(Math.atan2(out[0][2], out[0][0]) - Math.atan2(drawn[0][2], drawn[0][0]));
      const short = Math.min(moved, Math.PI * 2 - moved);
      expect(short).toBeLessThan(0.3);
    });

    it('survives a point sitting exactly on the axis', () => {
      const drawn = [[0, 0.9, 0], [R, 0.9, 0]];
      const out = translateStroke(drawn, [R, 0.9, 0], [0, 0.9, R], { normal: [1, 0, 0], axis: [0, 0] });
      expect(out.every(p => p.every(Number.isFinite))).toBe(true);
    });
  });
});

describe('distanceToStroke', () => {
  const pts = [[0, 1, 0], [1, 1, 0]];

  it('is the distance to the NEAREST point, so the closest stroke wins a press', () => {
    expect(distanceToStroke(pts, [1.1, 1, 0])).toBeCloseTo(0.1, 6);
    expect(distanceToStroke(pts, [0, 1, 0])).toBe(0);
  });

  it('is Infinity for an empty stroke, so it can never win', () => {
    expect(distanceToStroke([], [0, 0, 0])).toBe(Infinity);
    expect(distanceToStroke(null, [0, 0, 0])).toBe(Infinity);
  });
});

describe('strokePoints', () => {
  it('reads a drawn line from its points', () => {
    expect(strokePoints({ points: [[0, 1, 0], [0.1, 1, 0]] })).toEqual([[0, 1, 0], [0.1, 1, 0]]);
  });

  /* ⚠️ THE WHOLE REASON THIS EXISTS. A stamped piece stores its position in `point` and carries an
     EMPTY `points`, and `st.points ?? [st.point]` takes the empty array — which made every stamped
     piece unselectable and unslidable in Edit mode. */
  it('reads a stamped piece from its point, even though points is an empty array', () => {
    expect(strokePoints({ point: [0.3, 1.7, 0.1], points: [] })).toEqual([[0.3, 1.7, 0.1]]);
  });

  it('answers null when a stroke has no position at all', () => {
    expect(strokePoints({ points: [] })).toBeNull();
    expect(strokePoints({})).toBeNull();
    expect(strokePoints(null)).toBeNull();
  });

  it('a stamped piece is within grab reach of a press on it', () => {
    const stamp = { point: [0.3, 1.694, 0.1], points: [], thickness: 0.144 };
    const press = [0.3, 1.906, 0.17];   // the seat sits on top of the piece, not inside it
    expect(distanceToStroke(strokePoints(stamp), press)).toBeLessThan(Math.max(0.12, 0.144 * 3));
  });
});

describe('isUprightNormal', () => {
  /* ⚠️ THIS IS WHICH AUTHORED ROTATION A HAND-PIPED PIECE GETS. An element carries one attitude for
     a rim and another for a wall; the pen reads this to pick. Rose Swirl is the worked case —
     top_rotation [0,0,0], bottom_rotation [-89,-174,-180] — and taking the rim's on a wall laid
     every swirl face-down, which reads as the pen using a different nozzle. */
  it('a cake top and a board are upright', () => {
    expect(isUprightNormal([0, 1, 0])).toBe(true);
    expect(isUprightNormal([0.03, 0.999, 0])).toBe(true);
  });

  it('a tier wall is not', () => {
    expect(isUprightNormal([1, 0, 0])).toBe(false);
    expect(isUprightNormal([0.7, 0.14, 0.7])).toBe(false);
  });

  /* A missing normal answers false here, and the pen never asks it one: CreamPen passes
     `nrm ?? [0,1,0]`, the same default the stroke itself stores when the start of a drag missed the
     cake. One default, read by both, rather than this function guessing on their behalf. */
  it('answers false for a normal it was not given', () => {
    expect(isUprightNormal(null)).toBe(false);
    expect(isUprightNormal([])).toBe(false);
    expect(isUprightNormal([0, 1, 0])).toBe(true);   // ...which is what the pen substitutes
  });
});
