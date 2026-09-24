import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./CakeDesigner.jsx', import.meta.url), 'utf8');

/* One slice of the file: the function that builds a decoration's card. Everything below is a claim
   about what is INSIDE it, so a colour swatch somewhere else on the screen (the gradient stop
   placeholder, the piping card's own) cannot make an assertion pass or fail by accident. */
const toolbar = src.slice(src.indexOf('function buildToolbar('),
                          src.indexOf('function renderWritingEditor('));

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
  /* ⚠️ AND EXACTLY ONCE. The fix above added a SECOND swatch beside the one the control row already
     rendered, and the same fondant heart came back with two buttons opening the same wheel —
     Sandeep: *"fondant heart element card has two color pickers."* Both were correct on their own
     and neither knew about the other, which is why this is pinned by COUNT and not by shape: any
     future "the card has no colour control" fix has to extend the one that exists. */
  it('is defined exactly once on a decoration card', () => {
    const swatches = toolbar.match(/conic-gradient\(red,yellow,lime,aqua,blue,magenta,red\)/g) ?? [];
    expect(swatches).toHaveLength(1);
    expect(toolbar).toMatch(/const colourControl = \(/);
  });

  it('is gated on the element flag, never on the card type', () => {
    const gate = toolbar.slice(toolbar.indexOf('const hasColourControl ='),
                               toolbar.indexOf('if (hasColourControl) colourCtls'));
    expect(gate).toMatch(/allowed_actions\?\.color === true/);
    expect(gate).not.toMatch(/single_per_slot|isMultiSlotEl/);
    // A decorEl card carries no `allowedActions` of its own, so reading the placed instance's
    // snapshot is what left that path with no answer in the first place.
    expect(gate).toMatch(/el\.type === 'sticker' \|\| el\.type === 'decorEl'/);
  });

  it('yields to part groups, which are the better colour control where they exist', () => {
    // A segmented GLB's colours ARE its groups; two controls over one mesh would fight.
    expect(toolbar).toMatch(/!editGroups\.length/);
  });

  /* ⚠️ AND IT YIELDS TO A CALENDAR, for the same reason with a different cause. A calendar draws
   * from its own recipe (ink / accent / paper) and never reads `sticker.color`, so the generic wheel
   * beside its three named swatches would be a control that visibly does nothing — the failure the
   * striped-tier note in CakeDesigner records. Pinned so the exclusion cannot be dropped by accident. */
  it('yields to a calendar, which has three named colours instead of one', () => {
    expect(toolbar).toMatch(/!editGroups\.length && !inst\?\.calendar/);
  });

  it('recolours ONE sticker, not every instance of that element', () => {
    // A decorEl card stands for the element, so it re-selects as one and `handleColorChange` writes
    // every instance. A sticker keeps its own selection — re-selecting there would repaint every
    // copy on the cake when the baker is looking at one.
    expect(toolbar).toMatch(/if \(el\.type === 'decorEl'\) setSelectedEl\(\{ type: 'decorEl'/);
  });

  /* ⚠️ AND THE SHEET HAS TO OPEN. `caps` is what every colour gate outside the card reads, and its
   * final branch resolves `allowedActionsBySlug[selectedEl.type]` — keyed by element-type SLUG, so
   * "decorEl" landed on null and the swatch on a single-per-slot hero lit up and opened nothing.
   * A null is a legal answer there, so only driving the card could find it. */
  it('a decorEl selection has capabilities, so its wheel can open', () => {
    const caps = src.slice(src.indexOf('const caps = selectedEl'), src.indexOf('const [pipingTarget'));
    expect(caps).toMatch(/selectedEl\.type === 'decorEl' \?/);
    expect(caps).toMatch(/elementById\.get\(selectedEl\.elementId\)\?\.allowed_actions/);
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
