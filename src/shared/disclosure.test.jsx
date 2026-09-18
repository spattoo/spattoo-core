import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── A question you can open ─────────────────────────────────────────────────────────────────────
 *
 * Sandeep, on a three-line explanation printed above a balance: "instead of showing few lines of
 * text as description on how the credits are used, lets have a link ... a show and hide kind of
 * mechanism is more helpful."
 *
 * The two readers want opposite things. Somebody who signed up this morning cannot read "240 credits
 * to spend" without knowing what a credit buys; somebody on their fortieth order wants the number and
 * the packs, and prose between them is furniture to look past every time.
 */
const src  = readFileSync(new URL('./Disclosure.jsx', import.meta.url), 'utf8');
const buy  = readFileSync(new URL('../billing/BuyCreditsPanel.jsx', import.meta.url), 'utf8');
const msg  = readFileSync(new URL('../settings/CustomerUpdatesSection.jsx', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../../CLAUDE.md', import.meta.url), 'utf8');

describe('the control', () => {
  // Closed by default: an explanation that starts open is a paragraph with extra clicks.
  it('starts closed', () => {
    expect(src).toMatch(/defaultOpen = false/);
    expect(src).toMatch(/useState\(defaultOpen\)/);
  });

  /* A real button, announced properly — rule 7. `aria-controls` so the answer is reachable from the
     question, not merely near it. */
  it('is a button a screen reader can follow', () => {
    expect(src).toMatch(/<button\s*\n?\s*type="button"/);
    expect(src).toMatch(/aria-expanded=\{open\}/);
    expect(src).toMatch(/aria-controls=\{id\}/);
    expect(src).toMatch(/id=\{id\}/);
  });

  /* ⚠️ THE SHARED CHEVRON, ROTATED — not a second glyph. Same mark, same meaning (rule 14), and it
     animates between the two states for free. */
  it('reuses the one chevron rather than drawing another', () => {
    expect(src).toMatch(/import \{ ChevronRightIcon \} from '\.\/icons\.jsx'/);
    expect(src).toMatch(/rotate\(\$\{open \? -90 : 90\}deg\)/);
  });
});

describe('where it is used', () => {
  it('folds the smart-tool explanation', () => {
    expect(buy).toMatch(/<Disclosure label="How are these credits used\?">/);
  });

  it('folds the message-credit explanation', () => {
    expect(msg).toMatch(/<Disclosure label="How are these credits used\?"/);
  });

  /* ⚠️ THE FREE-EMAIL PROMISE DOES NOT FOLD. The note at the top of CustomerUpdatesSection is
     explicit that this sentence is the FEATURE, not a disclaimer — a baker who never recharges
     loses nothing, which is what makes this an upgrade rather than a toll. Behind a link it would
     be a promise nobody reads, and the fairness argument the screen rests on would go with it. */
  it('leaves the promise out in the open and folds only the detail', () => {
    const promise = msg.indexOf('Email updates are always free');
    const fold    = msg.indexOf('<Disclosure');
    expect(promise).toBeGreaterThan(-1);
    expect(promise).toBeLessThan(fold);
    expect(msg).not.toMatch(/<Disclosure[\s\S]{0,200}Email updates are always free/);
  });

  it('is listed with the other shared components', () => {
    expect(rules).toMatch(/\| `Disclosure\.jsx` \| \*\*The\*\* "question you can open"/);
  });
});
