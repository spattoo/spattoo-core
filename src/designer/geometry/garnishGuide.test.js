import { describe, it, expect } from 'vitest';
import { garnishGuide } from './garnishGuide.js';

const L = (x0, y0, x1, y1) => [[x0, y0], [x1, y1]];
const square = [[10, 10], [90, 10], [90, 90], [10, 90], [10, 10]];

describe('the build guide is derived from the paths', () => {
  it('numbers the strokes in the order they were piped, and says how many lifts', () => {
    const g = garnishGuide({ kind: 'piped', paths: [L(0, 0, 50, 0), L(0, 20, 50, 20), L(0, 40, 50, 40)] });
    expect(g.strokes.map(s => s.n)).toEqual([1, 2, 3]);
    // Three separate paths is three times off the parchment — the instruction, not a statistic.
    expect(g.lifts).toBe(3);
  });

  it('marks where each stroke starts and ends', () => {
    const g = garnishGuide({ kind: 'piped', paths: [L(5, 5, 60, 5)] });
    expect(g.strokes[0].start).toEqual([5, 5]);
    expect(g.strokes[0].end).toEqual([60, 5]);
  });

  it('points the arrow the way the hand was going', () => {
    const right = garnishGuide({ kind: 'piped', paths: [L(0, 0, 100, 0)] }).strokes[0].heading;
    const left  = garnishGuide({ kind: 'piped', paths: [L(100, 0, 0, 0)] }).strokes[0].heading;
    expect(Math.abs(right)).toBeLessThan(0.01);                     // → pointing right
    expect(Math.abs(Math.abs(left) - Math.PI)).toBeLessThan(0.01);  // ← pointing left
  });

  /* ⚠️ A noisy tip must not flip the arrowhead. Taken over the last two points alone, the wobble at
     the end of a hand-drawn line points the arrow back up the stroke it belongs to. */
  it('is not thrown by a wobble at the tip', () => {
    const straight = [[0, 0], [20, 0], [40, 0], [60, 0], [80, 0], [100, 0], [100, 1]];
    const h = garnishGuide({ kind: 'piped', paths: [straight] }).strokes[0].heading;
    expect(Math.abs(h)).toBeLessThan(0.4);     // still pointing right, not back down the line
  });

  /* ⚠️ A shape piped in ONE gesture ends where it began, so the arrowhead and the start dot land on
     the same point and the diagram loses the only mark that says where to begin. */
  it('backs the arrow off a closed stroke so it does not sit on the start dot', () => {
    const tri = [[100, 0], [200, 200], [0, 200], [100, 0]];
    const s0 = garnishGuide({ kind: 'piped', paths: [tri], rope: 6 }).strokes[0];
    expect(s0.closed).toBe(true);
    const apart = Math.hypot(s0.end[0] - s0.start[0], s0.end[1] - s0.start[1]);
    expect(apart).toBeGreaterThan(20);
  });

  it('leaves an open stroke ending exactly where the hand stopped', () => {
    const s0 = garnishGuide({ kind: 'piped', paths: [L(0, 0, 100, 0)], rope: 6 }).strokes[0];
    expect(s0.closed).toBe(false);
    expect(s0.end).toEqual([100, 0]);
  });

  it('tells a CUT piece to spread, set and cut — never to pipe', () => {
    const g = garnishGuide({ kind: 'cut', paths: [square], rings: [square] });
    const words = g.steps.join(' ').toLowerCase();
    expect(words).toContain('spread');
    expect(words).toContain('cut');
    expect(words).not.toContain('pipe');
    expect(g.lifts).toBe(0);                   // a lift is a piping idea; a cut piece has none
  });

  /* ⚠️ Cutting IS a motion — the knife enters somewhere and travels round, and the holes come after.
     Given no start mark, the guide told a baker the shape and not where to begin. */
  it('says where to start cutting and which way to go', () => {
    const g = garnishGuide({ kind: 'cut', paths: [square], rings: [square] });
    expect(g.panels[0].start).toEqual(square[0]);
    expect(Number.isFinite(g.panels[0].heading)).toBe(true);
  });

  it('counts the outline and each hole as steps in the order of work', () => {
    const hole = [[40, 40], [60, 40], [60, 60], [40, 60], [40, 40]];
    const g = garnishGuide({ kind: 'cut', paths: [square], rings: [square, hole] });
    expect(g.order).toBe(2);                   // cut the outline, then punch the one hole
    expect(g.panels[0].holeStarts).toHaveLength(1);
  });

  it('counts the holes a cut panel needs punched', () => {
    const hole = [[40, 40], [60, 40], [60, 60], [40, 60], [40, 40]];
    const g = garnishGuide({ kind: 'cut', paths: [square], rings: [square, hole] });
    expect(g.panels[0].holeCount).toBe(1);
    expect(g.steps.join(' ')).toMatch(/[Pp]unch 1 hole/);
  });

  /* ⚠️ THE PIECE HAS BEEN THROUGH JSON, because a guide is read from a SAVED design. Matched by
     reference this passed in the studio and failed everywhere it is actually used: a two-tone piece
     printed as one colour, and the only case it got right was the one it never sees. */
  it('calls out two chocolates, because the order of work changes', () => {
    const a = L(0, 0, 50, 0), b = L(0, 20, 50, 20);
    const g = garnishGuide(JSON.parse(JSON.stringify({
      kind: 'piped', paths: [a, b], color: '#4A2C1B',
      parts: [{ color: '#4A2C1B', paths: [a] }, { color: '#EFE3CE', paths: [b] }],
    })));
    expect(g.strokes[0].color).toBe('#4A2C1B');
    expect(g.strokes[1].color).toBe('#EFE3CE');
    expect(g.steps.join(' ')).toContain('Two chocolates');
  });

  /* ⚠️ A TEMPLATE PRINTED AT A GUESSED SIZE IS WORSE THAN NONE — a baker cuts to it and the piece
     does not fit the cake. Without a cake to measure against, the size is null rather than assumed. */
  it('refuses to state a size it cannot know', () => {
    const g = garnishGuide({ kind: 'cut', paths: [square], rings: [square] });
    expect(g.widthMm).toBeNull();
  });

  it('gives a true size when the cake is known', () => {
    const g = garnishGuide({ kind: 'cut', paths: [square], rings: [square], plate: 420, scale: 1 },
      { cakeDiameterMm: 180 });
    // 80 plate units of a 420 plate, on a piece sized to 0.75 of the cake's radius.
    expect(g.widthMm).toBeGreaterThan(5);
    expect(g.widthMm).toBeLessThan(40);
    expect(g.heightMm).toBeCloseTo(g.widthMm, 1);      // it is a square
  });

  it('has nothing to say about a piece with no paths', () => {
    expect(garnishGuide({ kind: 'piped', paths: [] })).toBeNull();
    expect(garnishGuide(null)).toBeNull();
  });
});
