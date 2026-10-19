/* ── Picking a word up ───────────────────────────────────────────────────────────────────────────
 *
 * Sandeep, with a word sitting on a panel: *"there is no way to select the font size"* and *"even
 * at offset 0, it shows offset"*. Both are the same fault seen from two sides. Hit-testing ran on
 * the GLYPH geometry, which is honest and nearly unusable — the gaps between letters, the counter
 * of an "a", the space either side of an "l" all fall through to whatever is behind, normally the
 * card the word is sitting on. So:
 *   - the grips that resize a piece appear only once it is selected, and a word that cannot be
 *     selected reliably cannot be resized at all — "no way to set the font size";
 *   - and the panel BEHIND kept winning the click, so the inspector said "Panel · Offset none"
 *     while the offset plainly on screen belonged to the word — "offset 0 still shows offset".
 *
 * Driven in the studio afterwards, on a 15x7 grid of clicks over the composition: a solid block of
 * the word's own box selects the text and everything outside it selects the panel, with no misses.
 * Dragging a corner grip then took the word from 159x62 to 301x120 px.
 *
 * The environment here is `node` with no DOM, so the shape of the thing is asserted by reading the
 * source — the same way this codebase tests the rest of its UI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./TopperComposer.jsx', import.meta.url), 'utf8');

describe('a word is grabbed by its box', () => {
  it('gives text a box-shaped hit area as well as its letters', () => {
    expect(src).toMatch(/obj\.kind === 'text' && \(\s*<mesh[\s\S]{0,400}<planeGeometry/);
  });

  /* ⚠️ TEXT ONLY, asked of `kind`. A shape's geometry already IS its area — a panel has no gaps to
     fall through — so a box there would gain nothing and would swallow clicks meant for whatever
     is layered in front of it.
     ⚠️ Counted as "planes that CATCH A PRESS", not as planes: this file also draws the grid and the
     corner grips with one, and an assertion that there is exactly one plane in the file was a lazy
     proxy that failed the moment it met the truth. */
  it('does not give shapes one', () => {
    const grabbers = src.match(/<mesh[^>]*\n?[^>]*onPointerDown=\{begin\}[\s\S]{0,200}?<planeGeometry/g) ?? [];
    expect(grabbers.length).toBe(1);
    expect(src).not.toMatch(/obj\.kind === 'shape' && \(\s*<mesh[\s\S]{0,300}<planeGeometry/);
  });

  it('is invisible, and leaves no mark on the captured thumbnail', () => {
    expect(src).toMatch(/<planeGeometry[\s\S]{0,200}transparent opacity=\{0\} depthWrite=\{false\}/);
  });

  /* In front of its own face, or the card the word sits on keeps winning the click — which is the
     whole bug. `faceZ` is this piece's own depth; a card thickness clears it. */
  it('sits in front of the face it belongs to', () => {
    expect(src).toMatch(/position=\{\[box\.cx, box\.cy, faceZ \+ CARD_THICK\]\}/);
  });

  it('still opens the editor on a double-click, from anywhere in the word', () => {
    const block = src.slice(src.indexOf("{obj.kind === 'text' && ("));
    expect(block.slice(0, 500)).toMatch(/onDoubleClick=\{\(e\) => \{ e\.stopPropagation\(\); onEdit\(obj\.id\); \}\}/);
  });

  /* The grips are the ONLY way to resize — the panel has no size slider, deliberately — so the
     thing that makes them reachable is the thing that makes sizing possible at all. */
  it('keeps the grips as the one way to resize', () => {
    expect(src).toMatch(/THERE IS NO SIZE SLIDER/);
    expect(src).toMatch(/showHandles && \[\[-1, -1\], \[1, -1\], \[1, 1\], \[-1, 1\]\]/);
  });
});


/* ── The bin ────────────────────────────────────────────────────────────────────────────────────
 * *"when you click on the delete button it clears the canvas. I only want the selected
 * text/offset etc to be deleted."* It always cleared — a destructive act one tap away from a piece
 * somebody had just selected and was looking at. A bin sitting beside a selected object has two
 * readings, and only one of them is what a person means while a piece wears a selection box.
 *
 * Driven in the studio: with the word selected it removed the word and left the panel standing
 * (letter pixels 4081 -> 0, panel pixels unchanged).
 */
describe('the bin', () => {
  it('removes the selection when there is one, and only then clears', () => {
    expect(src).toMatch(/if \(selectedIds\.length\) \{ selectedIds\.forEach\(remove\);/);
    expect(src).toMatch(/setObjects\(\[\]\); setSelectedIds\(\[\]\);/);
  });

  /* Same glyph, two jobs — so it has to say which one, rather than leaving a baker to find out by
     pressing it (rule 7). */
  it('says which of the two it will do', () => {
    expect(src).toMatch(/title=\{selectedIds\.length \? 'Remove the selected piece' : 'Clear the canvas'\}/);
    expect(src).toMatch(/aria-label=\{selectedIds\.length \? 'Remove the selected piece' : 'Clear the canvas'\}/);
  });
});
