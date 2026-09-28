import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── The chooser answers a different question once a door has been used ──────────────────────────
 *
 * Sandeep: "even after selecting the cake design, it says now, ill pickup the flavour first… the
 * buttons should say something like 'Pick up the flavour now' and the selected button (design
 * button) in this case should be more highlighted. tick mark is hardly seen."
 *
 * Source-pinned: these are copy and style decisions with reasons attached, and every one of them is
 * the kind of thing a later edit would "simplify" back to a single fixed label.
 */
const shell = readFileSync(new URL('./FacetShell.jsx', import.meta.url), 'utf8');

describe('the entry doors report what has been answered', () => {
  /* "First" is a claim about ORDER, and it stops being true the moment the other door has been
     used — a customer who has just designed a cake being offered "I'll pick the flavour first" is
     being asked a question they already answered. */
  it('each door carries a done and a next label, not one fixed string', () => {
    expect(shell).toMatch(/done: 'The design'/);
    expect(shell).toMatch(/next: "Now I'll pick the flavour"/);
  });

  /* ⚠️ FIRST PERSON, because the panel asks and the customer answers — CustomerStorefront: "inside
     it the customer speaks". An imperative ("Pick the flavour now") is the shop instructing them,
     which is a different relationship and the wrong one for this screen. */
  it('keeps the customer speaking', () => {
    expect(shell).not.toMatch(/label: "Pick (the|up) /);
    expect(shell).toMatch(/next: "Now I'll do the design"/);
  });

  /* ⚠️ ANSWERED IS NOT PREFERRED. The note above `entry` — "Both doors keep IDENTICAL weight.
     Neither is preferred" — is about a chooser where NEITHER has been used, and it still holds: the
     untouched door keeps exactly the weight it always had, so nothing pushes anyone toward the door
     they have not opened. Marking the answered one reports state; it does not recommend a path. */
  it('marks the answered door without promoting the other', () => {
    expect(shell).toMatch(/entryDone: \(primary\) =>/);
    expect(shell).toMatch(/filled \? s\.entryDone\(primary\) : s\.entry\(primary\)/);
  });

  /* ⚠️ THE MARKER WAS NEVER A CONTRAST PROBLEM, AND THE FIRST COMMENT I WROTE HERE SAID IT WAS.
     Measured: the old bare ✓ was rgb(44,68,51) on the door's 6% wash rgb(243,242,237) — 9.45:1,
     strong contrast. What the measurement showed instead was SIZE and DISTANCE: `entry` is
     `justify-content: space-between`, so a 14px glyph sat 348px from its own label on a 496px door.
     The disc is the fix for that (24px, filled, white on rgb(44,68,51) — measured 10.60:1), not for
     a faintness that did not exist. */
  it('the marker is a filled disc, not a stray character at the margin', () => {
    expect(shell).toMatch(/tickDisc: \(primary\) =>/);
    expect(shell).toMatch(/borderRadius: '50%'/);
  });

  /* The label depends on BOTH doors: `isFilled` for this one, and whether either has been answered
     for the other. A helper rather than inline ternaries, so the rule is stated once. */
  it('the label rule lives in one place', () => {
    expect(shell).toMatch(/export function entryLabelFor\(entry, draft, anyFilled\)/);
    expect(shell).toMatch(/const anyFilled = ENTRIES\.some\(x => isFilled\(draft, x\.facet\)\)/);
  });
});
