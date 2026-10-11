import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { writingText } from './surface.js';

/* ── CAPITAL LETTERS has to be applied by whoever draws the letters ──────────────────────────────
 *
 * The toggle is a design field and the textarea shows it as CSS `text-transform` only, so the stored
 * text stays exactly as typed. Every consumer therefore has to apply it — and when one forgets, the
 * field says BABY and the cake says Baby, which is what happened on acrylic (reported 2026-10-07)
 * while piped cream had been doing it correctly all along.
 *
 * ⚠️ THE SOURCE ASSERTIONS ARE THE POINT, not the two lines of logic above them. `writingText` is
 * trivial and will never break; what broke was a renderer not calling it. These pin the callers.
 */
describe('writingText', () => {
  it('uppercases only when the toggle is on', () => {
    expect(writingText({ text: 'baby', uppercase: true })).toBe('BABY');
    expect(writingText({ text: 'baby', uppercase: false })).toBe('baby');
    expect(writingText({ text: 'baby' })).toBe('baby');
  });

  /* An absent message is '' rather than undefined so a caller's own `.trim()` guard still reads
     naturally — several of them do exactly that before deciding whether to render at all. */
  it('is a string for a message that has no text yet', () => {
    expect(writingText(null)).toBe('');
    expect(writingText({})).toBe('');
    expect(writingText({ uppercase: true })).toBe('');
  });
});

describe('everything that draws or prints a message asks that one function', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  /* ⚠️ BOTH RENDERERS, because this is exactly where they drifted. Cream had its own inline copy
     (`writing.uppercase ? …toUpperCase() : …`) and acrylic had nothing. INVARIANTS #15 — one
     function decides — applies between two renderers, not only between a preview and a render. */
  it('both materials derive the text through writingText', () => {
    for (const f of ['../canvas/CreamWriting.jsx', '../canvas/AcrylicWriting.jsx']) {
      const src = read(f);
      expect(src).toMatch(/writingText\(writing\)/);
      // and nobody keeps a private copy of the rule
      expect(src).not.toMatch(/uppercase\s*\?\s*writing\.text\.toUpperCase\(\)/);
    }
  });

  /* ⚠️ AND THE WORKSHEET, which matters more than the render: the baker pipes what the sheet says.
     `harvest.js` printed `w.text` raw, so an x-ray for a BABY cake read Message — "baby". */
  it('the x-ray worksheet prints the letters that will be piped', () => {
    const src = read('../../orders/xray/harvest.js');
    expect(src).toMatch(/Message — "\$\{writingText\(w\)\}"/);
  });
});
