import { describe, it, expect } from 'vitest';
import { textCentrelines, CREAM_FONTS } from './creamText.js';

// ── Chocolate lettering reuses cream's letterforms ───────────────────────────────────────────────
//
// ⚠️ BOTH ARE A NOZZLE FOLLOWING A LINE, which is why these faces are single-line CENTRELINE fonts:
// a piped letter is a path the hand travels, not an outline it fills. A second layout for chocolate
// would have copied the glyph walk, the line stacking, the tracking and the arc — and the two would
// have drifted the first time either was touched.
describe('letterforms as centreline polylines', () => {
  it('gives one or more strokes per word', () => {
    const s = textCentrelines({ text: 'Ava' });
    expect(s.length).toBeGreaterThan(2);
    expect(s[0][0]).toHaveLength(2);          // flat [x, y], not a Vector3
  });

  /* ⚠️ SEPARATE STROKES, NOT ONE PATH FOR THE WHOLE WORD. That is true to how it is piped — the
     nozzle lifts between letters — and it is what lets a bad "g" be fixed without redrawing
     "Birthday". It is also what makes the X-ray build guide correct for nothing: the strokes ARE the
     order to write them in. */
  it('keeps letters as separate strokes', () => {
    expect(textCentrelines({ text: 'III' }).length)
      .toBeGreaterThan(textCentrelines({ text: 'I' }).length);
  });

  it('fits inside the box it is given', () => {
    const s = textCentrelines({ text: 'Happy Birthday', fitW: 300, fitH: 80 });
    const xs = s.flat().map(p => p[0]), ys = s.flat().map(p => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(300.01);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(80.01);
  });

  /* ⚠️ CENTRED ON THE ADVANCE WIDTH, NOT THE INK. A line is centred on where the PEN ends, which is
     a little past where the last glyph's ink stops — real typesetting behaviour, and what cream
     writing has always done. Tightening it here would shift every message already on a cake, so the
     test asserts what the function actually promises: near enough to centre that the caller can
     place it, not pixel-exact on the ink. */
  it('centres near the origin, so the caller places it', () => {
    const s = textCentrelines({ text: 'Ava', fitW: 200, fitH: 60 });
    const xs = s.flat().map(p => p[0]);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    expect(Math.abs(mid)).toBeLessThan(200 * 0.05);
  });

  it('has nothing to say about an empty string', () => {
    expect(textCentrelines({ text: '' })).toEqual([]);
    expect(textCentrelines({ text: '   ' }).length).toBe(0);
  });

  it('offers the same faces the cream pen writes with', () => {
    expect(CREAM_FONTS.length).toBeGreaterThan(0);
  });
});
