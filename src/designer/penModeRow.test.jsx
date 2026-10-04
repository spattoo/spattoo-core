import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── Draw or Edit: the mode a baker could not find ───────────────────────────────────────────────
 *
 * Sandeep: "when the user is in piping mode, he does not know edit mode is the one to make him
 * select the existing pieces."
 *
 * The toggle was there and said "Edit" without saying what it edits, and the one sentence that
 * explained it was gated on `penMove` — so it only rendered once you were ALREADY in the mode. A
 * baker piped a few pieces, tapped one to recolour it, and got another stamped on top: in stamp
 * mode a tap is the placement gesture, which is deliberate and gives no hint that selecting exists.
 *
 * It is the mirror of the rule PlateButton states — "a control that appears only once you have
 * already needed it teaches nobody it exists" — with the explanation in the control's place.
 *
 * ⚠️ SOURCE ASSERTIONS. renderPenModeRow is a closure inside CakeDesigner, and the card it draws on
 * is reached through Decorations → a piping element → "I'll pipe it myself", which needs a baker
 * login and a stocked catalogue. dev/pen-mode-row.jsx is the other half: it redraws the row at the
 * card's real 300px so the copy can be read at its true width.
 */
const src = readFileSync(new URL('./CakeDesigner.jsx', import.meta.url), 'utf8');

const row = (() => {
  const from = src.indexOf('function renderPenModeRow()');
  expect(from, 'renderPenModeRow must exist').toBeGreaterThan(-1);
  return src.slice(from, src.indexOf('\n  function renderPenBody()', from));
})();

/* ⚠️ COMMENTS STRIPPED, AND THIS IS THE THIRD TIME TODAY. An assertion that a phrase is ABSENT will
   find it in the note explaining why it was removed — the emoji check and the account screen's
   username check both failed exactly this way first. Any `not.toMatch` about rendered copy reads
   `code`; anything structural can read `row`. Block comments first and non-greedily, then line
   comments, which is the order decorFlyout.test.jsx worked out. */
const code = row
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the hint', () => {
  it('is no longer behind the mode it explains', () => {
    // `{penMove && (` is what hid it. A ternary inside the element is what replaced it.
    expect(code).not.toMatch(/\{penMove && \(/);
    expect(row).toMatch(/\{penMove\s*\n?\s*\?/);
  });

  it('points forward from Draw, and names the control it points at', () => {
    expect(row).toMatch(/To recolour or move what you have piped, switch to Edit\./);
    // The button it names has to be on screen beside it, or the sentence sends them nowhere.
    expect(row).toMatch(/\[\['Draw', false\], \['Edit', true\]\]/);
  });

  it('keeps what Edit already said', () => {
    expect(row).toMatch(/Tap a piped piece to change its colour and size\. Drag one to slide it\./);
  });

  /* ⚠️ THE ROW IS SHARED BY TWO CARDS — the pen, where a tap STAMPS a piece, and writing, where you
     drag letters. My first cut opened the Draw line with "Tap the cake to place a piece", which is
     true of the pen and false of every writing card. It claims only the half they have in common,
     which is also the only half the baker could not find. */
  it('says nothing about HOW you draw, because the two cards differ', () => {
    expect(code).not.toMatch(/Tap the cake to place/);
    const drawLine = code.match(/: '([^']*switch to Edit\.)'/)?.[1] ?? '';
    expect(drawLine).not.toMatch(/\bdraw\b/i);
    expect(drawLine).not.toMatch(/\bplace\b/i);
  });
});
