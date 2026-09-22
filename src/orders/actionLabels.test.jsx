import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── A phone caption may be shorter. It may not say something else. ──────────────────────────────
 *
 * The cake panel's actions are one definition rendered two ways: `variant='row'` on desktop, where
 * the full `label` fits under the preview, and `variant='stack'` in the phone's side strip, where a
 * `short` caption sits under the icon.
 *
 * ⚠️ THE BUG THIS PINS. "Print & cut-outs" was shortened to "Cut-outs", and that is not an
 * abbreviation — the sheet offers every decoration TWICE, once as a print for edible paper and once
 * as an outline to cut fondant around, and the phone was naming only the second. Reported exactly
 * that way: "it gives an impression that it's only about cutouts".
 *
 * "Edit in 3D" → "3D Edit" and "X-Ray report" → "X-Ray" are the legitimate kind: every word that
 * survives is a word from the name, and nothing the button does has gone missing.
 *
 * Source assertions rather than rendered ones: `short` is JSX here (a caption that wraps), and what
 * matters is which WORDS the phone shows, which is exactly what the source says.
 */
const src = readFileSync(new URL('./OrdersPanel.jsx', import.meta.url), 'utf8');

describe('the phone side-strip captions', () => {
  /* Both halves, on two lines. The strip is as wide as its widest caption either way — "cut-outs"
     was already that — so the full name costs it nothing and there was no trade to make. */
  it('names the print AND the cut-out, because the sheet gives you both', () => {
    const caption = /short=\{<>([\s\S]*?)<\/>\}/.exec(src)?.[1];
    expect(caption).toBeTruthy();
    expect(caption).toMatch(/Print/);
    expect(caption).toMatch(/cut-outs/);
    expect(caption).toMatch(/<br \/>/);          // two lines, not a wider column
  });

  it('never shortens it back to one half of what it does', () => {
    expect(src).not.toMatch(/short="Cut-outs"/);
    expect(src).not.toMatch(/short="Prints?"/);
  });

  /* Desktop is untouched: the row variant has always rendered `label`, and that is where the name
     is stated in full without needing a line break. */
  it('keeps the full name as the label, for desktop and for a screen reader', () => {
    expect(src).toMatch(/label="Print & cut-outs"/);
  });

  /* ⚠️ A caption may only TRUNCATE the name's own words — "Cutting file" → "Cut file", "Edit in 3D"
     → "3D Edit". Inventing a word that is not in the label at all is always wrong, and that much is
     mechanical, so it is checked here for every caption.
     What is NOT mechanical is which words may be dropped: "report" and "Details" carry nothing,
     while "Print" was half of what the button does. No rule distinguishes those — that is the
     judgement, and it is pinned case by case above, for the one case that got it wrong. */
  it.each([
    ['X-Ray report', 'X-Ray'],
    ['Edit in 3D',   '3D Edit'],
    ['Edit Details', 'Edit'],
    ['Cutting file', 'Cut file'],
    ['View in 3D',   'View 3D'],
  ])('%s shortens to "%s" without inventing a word', (label, short) => {
    const words = label.toLowerCase().split(/[\s&]+/);
    for (const w of short.toLowerCase().split(/[\s&]+/)) {
      expect(words.some(full => full.startsWith(w))).toBe(true);
    }
  });
});

// ── How X-Ray is LEFT ───────────────────────────────────────────────────────────────────────────
//
// panelTopBar.jsx states the rule for every docked surface: "mobile keeps the arrow; desktop gets a
// ✕ at the far right". Every panel — Orders, Customers, Settings, Dashboard, Billing — follows it.
// X-Ray did not: it showed ✕ on a phone, so a baker who had stepped INTO it from order details was
// offered a dismiss where every other screen in the same journey offered a way back.
//
// Asserted as source because the alternative is mounting the whole report with an order, a design,
// a client and a portal to prove which of two icons rendered.
describe('X-Ray leaves the way every other surface does', () => {
  const src = readFileSync(new URL('./xray/XrayReport.jsx', import.meta.url), 'utf8');

  it('uses the shared narrow hook, not its own breakpoint', () => {
    // check:narrow enforces one definition of "is this a phone"; this pins the number too, because
    // a sheet opened from OrdersPanel must switch at the same width OrdersPanel does.
    expect(src).toMatch(/useNarrow\(768\)/);
  });

  it('shows a back arrow on a phone and a dismiss on desktop', () => {
    expect(src).toMatch(/\{isMobile && <PanelBackArrow/);
    expect(src).toMatch(/\{!isMobile && <PanelDismiss/);
  });

  it('keeps the actions right-aligned now the header has no title', () => {
    // ⚠️ The header is `space-between`, and a LONE child under space-between sits at flex-start —
    // so removing the title silently left-aligned the whole action bar on desktop.
    expect(src).toMatch(/actions: \{[^}]*marginLeft: 'auto'/);
  });
});
