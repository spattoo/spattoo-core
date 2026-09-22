import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./CakeDesigner.jsx', import.meta.url), 'utf8');

// ── A property of the ELEMENT must not depend on a UI grouping decision ─────────────────────────
//
// Reported on a fondant heart: `allowed_actions.color` ticked in admin, no way to change the colour
// in the designer. The flag was set and honoured — just not on that path.
//
// Everything placed is a sticker (design.stickers[]). `single_per_slot` decides only which CARD the
// toolbar builds: one card for the whole element (decorEl) or one per placement (sticker). The
// colour swatch had been attached to the decorEl card, so whether an element could be recoloured
// depended on a grouping decision that has nothing to do with colour.
//
// Measured against the catalogue when this was found: 59 elements marked colour-changeable with no
// part groups — 5 single_per_slot, which had the swatch, and 54 plain stickers, which had nothing.
describe('whole-element colour is offered wherever the element allows it', () => {
  it('the swatch lives in the shared sticker|decorEl block, not a decorEl-only branch', () => {
    const shared = src.indexOf("if (el.type === 'sticker' || el.type === 'decorEl') {");
    const decorOnly = src.indexOf("if (el.type === 'decorEl') {", shared);
    const gate = src.indexOf('allowed_actions?.color === true');
    expect(shared).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(shared);
    // Before the decorEl-only branch begins ⇒ still inside the shared one.
    expect(gate).toBeLessThan(decorOnly);
  });

  it('is gated on the element flag, never on the card type', () => {
    const gate = src.slice(src.indexOf('if (!editGroups.length && elementById'), src.indexOf('groups.push({ key: \'colour\''));
    expect(gate).toMatch(/allowed_actions\?\.color === true/);
    expect(gate).not.toMatch(/single_per_slot|isMultiSlotEl/);
  });

  it('yields to part groups, which are the better colour control where they exist', () => {
    // A segmented GLB's colours ARE its groups; two controls over one mesh would fight.
    expect(src).toMatch(/if \(!editGroups\.length && elementById/);
  });

  it('recolours ONE sticker, not every instance of that element', () => {
    // Re-selecting as decorEl would repaint every copy on the cake — right for a multi-slot card,
    // wrong for one sticker among several.
    expect(src).toMatch(/if \(el\.type !== 'sticker'\) setSelectedEl\(\{ type: 'decorEl'/);
  });

  it('the wheel opens on the sticker\'s own colour, not a hardcoded default', () => {
    // ⚠️ `getCurrentColor` is the function; `wheelColorOf` appears only in a COMMENT describing it.
    // Slicing on the commented name found nothing and the assertion passed against an empty string.
    const fn = src.slice(src.indexOf('function getCurrentColor'), src.indexOf('function handleColorChange'));
    expect(fn.length).toBeGreaterThan(200);   // the slice actually found the function
    expect(fn).toMatch(/selectedEl\.type === 'sticker'/);
    const stickerBranch = fn.slice(fn.indexOf("selectedEl.type === 'sticker'"));
    expect(stickerBranch).toMatch(/st\?\.color \?\? '#ffffff'/);
  });
});
