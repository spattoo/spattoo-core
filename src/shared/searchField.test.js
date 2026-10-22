/* ── The search box, and the copies that must not come back ─────────────────────────────────────
 *
 * Decorations and Templates each had their own hand-rolled `<input>` — same border, radius, font
 * and padding, written out twice — and neither could be emptied except by holding backspace. The
 * search deliberately survives the panel closing, so a stale query is what greets you on reopening:
 * *"pls have a clear icon next to the textbox so user can easily clear than using backspace."*
 *
 * These assertions are about the SHAPE of the thing, in the style this codebase already tests UI
 * (source-reading — the vitest environment is `node`, there is no DOM). The behaviour itself was
 * driven in the app at 375px: the button is absent on an empty box, appears on typing, clears the
 * value, returns focus to the field, restores the category list, and Escape clears without closing
 * the panel.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const field    = readFileSync(new URL('./SearchField.jsx', import.meta.url), 'utf8');
const designer = readFileSync(new URL('../designer/CakeDesigner.jsx', import.meta.url), 'utf8');

describe('SearchField', () => {
  it('clears with a real <button>, not a div with an onClick', () => {
    // rule 7: a clickable gets keyboard focus, Enter and Space, and announces itself
    expect(field).toMatch(/<button[^>]*\n?[^>]*aria-label="Clear search"/s);
    expect(field).not.toMatch(/<div[^>]*onClick[^>]*>\s*✕/);
  });

  it('offers nothing to press when there is nothing to clear', () => {
    // a permanent ✕ over an empty box is a control that does nothing — worse than no control
    expect(field).toMatch(/\{has && \(/);
  });

  it('puts the cursor back in the box after clearing', () => {
    expect(field).toMatch(/onChange\(''\);[\s\S]{0,260}ref\.current\?\.focus\(\)/);
  });

  it('leaves room for the button so a long query cannot run under it', () => {
    expect(field).toMatch(/padding: has \?/);
  });
});

describe('the designer searches', () => {
  it('both go through the shared field', () => {
    expect(designer).toMatch(/<SearchField[\s\S]{0,200}Search decorations…/);
    expect(designer).toMatch(/<SearchField[\s\S]{0,200}Search templates…/);
  });

  /* ⚠️ THE GUARD THAT MATTERS. Two copies existed before anyone noticed; this fails the moment a
     third is written by hand instead of reaching for the shared one (root CLAUDE.md rule 1). */
  it('leaves no hand-rolled search input behind', () => {
    const bare = designer.match(/<input[^>]*placeholder="Search[^"]*"/g) ?? [];
    expect(bare, `hand-rolled search input(s): ${bare.join(' | ')}`).toHaveLength(0);
  });
});
