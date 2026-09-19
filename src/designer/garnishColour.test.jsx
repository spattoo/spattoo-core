import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── A garnish keeps its own colour, and the card can change it ──────────────────────────────────
 *
 * The studio has always had a colour wheel, and it was the only one: a piece arrived on the cake
 * wearing whatever the studio happened to be set to and could never be changed again. Duplicate it
 * and you had two of the same brown with no way to make one white. Reported exactly that way.
 *
 * ⚠️ NOTHING IN THE MODEL NEEDED CHANGING, which is the interesting part. A garnish is already its
 * own object carrying its own `color`; `updateGarnish` already merges by id; `duplicateGarnish`
 * already spreads the original into a FRESH id. Two pieces have been independently colourable the
 * whole time and there was simply no control that said so. These pin the three halves of that —
 * the control, the per-id write, and the copy being a separate object — because a regression in any
 * one of them puts the feature back exactly where it was.
 */
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const designer = read('./CakeDesigner.jsx');
const hook     = read('./hooks/useCakeDesign.js');
const renderer = read('./canvas/Garnishes.jsx');

const card = designer.slice(designer.indexOf('function renderGarnishBody'),
                            designer.indexOf('function renderGarnishBody') + 6000);

describe('the control', () => {
  /* The ONE colour control — the same component the studio hands in. Never a row of swatches and
     never a native picker: INVARIANTS #3 names the letter-blocks card as the cautionary tale, which
     shipped with square swatches and was spotted in a screenshot within the hour. */
  it('is the shared ColorWheel, not a second answer to the same question', () => {
    expect(card).toMatch(/<ColorWheel/);
    expect(card).not.toMatch(/type="color"/);
    expect(card).toMatch(/cakeColors=\{\[\.\.\.new Set\(collectElementColors\(design\)\)\]\}/);
  });

  /* ⚠️ THE TRAP, and the reason a naive one-line version would have looked right and done nothing.
     A garnish drawn as several strokes carries a colour PER PART (`partsOf`, GarnishStudio), and the
     renderer resolves `pc.color ?? g.color` — the part wins. So writing only `g.color` leaves a
     multi-stroke piece exactly as it was: a control that moves and changes nothing. */
  it('writes the parts too, or a multi-stroke piece would ignore it', () => {
    expect(renderer).toMatch(/color: pc\.color \?\? g\.color/);      // the precedence this works around
    expect(card).toMatch(/g\.parts\?\.length \? \{ parts: g\.parts\.map\(pt => \(\{ \.\.\.pt, color: c \}\)\) \}/);
  });

  it('writes against THIS piece, by id', () => {
    expect(card).toMatch(/onChange=\{c => updateGarnish\(g\.id, \{/);
  });
});

describe('each piece is its own', () => {
  /* Merge, never replace — the drag hands back only the keys it moved, so a colour set earlier has
     to survive the next drag. */
  it('updateGarnish patches one garnish and leaves the rest alone', () => {
    expect(hook).toMatch(/garnishes: \(prev\.garnishes \?\? \[\]\)\.map\(g => \(g\.id === id \? \{ \.\.\.g, \.\.\.patch \} : g\)\)/);
  });

  /* ⚠️ A COPY MUST BE A SEPARATE OBJECT WITH A SEPARATE ID, or recolouring one recolours both — the
     exact thing that was asked for. Spreading the original carries its colour across, which is right:
     a duplicate starts as a copy and then diverges. */
  it('duplicateGarnish makes a new object with a new id', () => {
    const fn = /function duplicateGarnish[\s\S]*?\n  \}/.exec(hook)[0];
    expect(fn).toMatch(/\.\.\.original,/);
    expect(fn).toMatch(/id: crypto\.randomUUID\(\)/);
  });
});
