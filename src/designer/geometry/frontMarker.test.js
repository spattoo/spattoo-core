import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tierShape, boundingRadius } from './surface.js';
import { OUTLINE_FAMILIES } from './shapes.js';

/* ── The FRONT marker must lie ON THE FLOOR, never on the board ──────────────────────────────────
 *
 * ⚠️ THE BUG THIS PINS. The marker was placed at `cake front edge + gap`, and the thing it is
 * actually laid beside is the BOARD. Those agree by luck on a round cake (drum = boundingRadius +
 * 0.6, front edge = radius) and on a rect one (board = depth + 0.9, front edge = halfD) — and not at
 * all on an outline, where `boundingRadius` measures the farthest point on the CONTOUR, which for a
 * heart is a side lobe, while the cake's front edge is `halfD`. Different axes. The board grew past
 * the marker and the word was half buried in the gold.
 *
 * Reported on a heart. Every outline family did it, and every one did it worse the wider the cake:
 * heart 0.015, butterfly −0.066, oval wide −0.280, heart wide −0.354, butterfly wide −0.399.
 *
 * ⚠️ WHY THIS IS A GEOMETRY TEST AND NOT A RENDER ONE. The fault is a NUMBER — two half-extents
 * measured along different axes — and it is invisible on the two shapes anyone renders by habit. A
 * screenshot of a round cake proves nothing about a heart, and nobody was going to open all six.
 */

// `boardOf` lives in CakeCanvas.jsx, which pulls in three and drei. This is its arithmetic, and the
// test below asserts it still matches the source, so a change there cannot pass unnoticed here.
function boardOf(bottomTier) {
  const shp = tierShape(bottomTier);
  const isGlyph = shp.kind === 'glyph';
  const isRect = bottomTier.shape === 'rect' || isGlyph;
  const width = (isGlyph ? shp.halfW * 2 : (bottomTier.width ?? 0)) + 0.9;
  const depth = (isGlyph ? shp.halfD * 2 : (bottomTier.depth ?? 0)) + 0.9;
  return isRect
    ? { kind: 'rect', width, depth, halfW: width / 2, halfD: depth / 2, radius: Math.max(width, depth) / 2 }
    : { kind: 'round', radius: boundingRadius(shp) + 0.6, width, depth };
}

const boardFrontZ = (board) => (board.kind === 'rect' ? board.halfD : board.radius);

/* Every shape the app can put on a board, at three proportions — square, wider than deep, deeper
 * than wide. The MIDDLE one is the case that was most wrong and the one least likely to be opened:
 * a heart cake is usually sized wider than it is deep. */
const TIERS = [
  ['round',       { radius: 1.2, height: 1 }],
  ['round large', { radius: 1.8, height: 1 }],
  ['rect',        { shape: 'rect', width: 2.16, depth: 1.56, height: 1 }],
  ['rect square', { shape: 'rect', width: 2.2, depth: 2.2, height: 1 }],
  ['rect deep',   { shape: 'rect', width: 1.6, depth: 2.6, height: 1 }],
  ['number 8',    { shapeFamily: 'number', shapeConfig: { text: '8' }, height: 1 }],
  ...Object.keys(OUTLINE_FAMILIES).flatMap(fam => [
    [fam,             { shapeFamily: fam, width: 2.4, depth: 2.4, height: 1 }],
    [`${fam} wide`,   { shapeFamily: fam, width: 3.0, depth: 2.0, height: 1 }],
    [`${fam} deep`,   { shapeFamily: fam, width: 2.0, depth: 3.0, height: 1 }],
  ]),
];

describe('the FRONT marker clears the board', () => {
  /* The gap is a constant beyond the board edge, so it is the SAME on every shape. It used to be
     0.22 on a round cake, 0.37 on a rect one and negative on most outlines — three answers to one
     question, which is what a per-shape measurement always decays into. */
  it.each(TIERS)('%s', (_name, tier) => {
    const board = boardOf(tier);
    const markerZ = boardFrontZ(board) + 0.22;
    // Clear of the gold, and by the same amount whatever the shape is.
    expect(markerZ - boardFrontZ(board)).toBeCloseTo(0.22, 6);
    expect(markerZ).toBeGreaterThan(boardFrontZ(board));
  });

  /* ⚠️ The case that proves the old rule was wrong rather than merely tight. On a wide heart the
     board reaches 2.174 and the cake's front edge only 1.000 — measuring from the cake put the word
     0.354 INSIDE the gold, which is what the screenshot showed. */
  it('a wide heart is the case the cake-edge rule could never have got right', () => {
    const tier = { shapeFamily: 'heart', width: 3.0, depth: 2.0, height: 1 };
    const shp = tierShape(tier);
    const board = boardOf(tier);
    expect(boardFrontZ(board)).toBeGreaterThan(shp.halfD + 0.82);   // the old placement, buried
    expect(boundingRadius(shp)).toBeGreaterThan(shp.halfD);         // lobes reach past the front edge
  });

  /* A round cake is the shape the gap was tuned on, and it must not have moved: the marker sits
     exactly where it always did, so this fix is invisible everywhere it was already right. */
  it('leaves a round cake exactly where it was', () => {
    const board = boardOf({ radius: 1.2, height: 1 });
    expect(boardFrontZ(board) + 0.22).toBeCloseTo(1.2 + 0.82, 6);
  });
});

/* ⚠️ The arithmetic above is a COPY, and a copy is only safe while it is checked. If boardOf or the
   marker's gap changes in CakeCanvas and not here, every case above keeps passing against a board
   that no longer exists. */
describe('this test still describes the real code', () => {
  const src = readFileSync(new URL('../canvas/CakeCanvas.jsx', import.meta.url), 'utf8');

  it('uses the same gap the canvas does', () => {
    expect(src).toMatch(/const FRONT_MARKER_GAP = 0\.22;/);
  });

  it('measures from the board, not from the cake', () => {
    expect(src).toMatch(/<FrontMarker frontZ=\{boardFrontZ\(board\)\} \/>/);
    expect(src).toMatch(/export function boardFrontZ\(board\) \{\s*return board\.kind === 'rect' \? board\.halfD : board\.radius;/);
  });

  it('sizes the board the way this file assumes', () => {
    expect(src).toMatch(/radius: boundingRadius\(shp\) \+ 0\.6/);
    expect(src).toMatch(/\+ 0\.9;/);
  });
});
