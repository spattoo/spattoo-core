import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { Z, Takeover } from './Panel.jsx';

/* ── A full-screen surface must escape the page it was opened from ───────────────────────────────
 *
 * ⚠️ THE BUG THESE PIN, which was reported three times as three different screens before anyone saw
 * it was one thing. A z-index only competes inside its own stacking context. `dockedPage`
 * (shared/rail.js) is position:fixed with z-index 300, which MAKES one — so anything rendered inside
 * Orders, Settings, Customers, Billing, Flavours, Templates or the dashboard has its rank resolved
 * against that 300, while the rail lifts to RAIL_OVER_PAGE_Z (315) as a SIBLING of it and wins.
 *
 *   X-Ray, the print studio    Z.studio, 4000   → rail over the title and the column beside it
 *   Print & cut-outs           the same studio, reached from an order instead
 *   every Panel in the app     Z.panel, 1000    → rail lit and clickable over a modal scrim
 *
 * The numbers said 4000 beat 315, which is why it went unnoticed for so long: nothing was
 * misconfigured, the comparison simply never happened at the document level. Raising a number cannot
 * fix it, and `check:takeover` is the gate that stops the next one being written.
 *
 * These are SOURCE assertions rather than rendered ones on purpose — `Takeover` portals to
 * document.body, and renderToStaticMarkup has no document, so a render test would assert the SSR
 * fallback and prove nothing about the thing that broke.
 */
const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

describe('full-screen takeovers', () => {
  /* ── The escape belongs to the SHELL, not to each screen ───────────────────────────────────────
   * It used to be per-screen, and that is precisely how two of them shipped without it: a screen
   * spread `chrome.overlay` and then had to separately remember to wrap itself. Now the surface and
   * the portal are one component, and a screen cannot take one without the other. */
  it('Panel portals, so every dialog in the app leaves the page it opens from', () => {
    const s = src('./Panel.jsx');
    expect(s).toMatch(/<Takeover>[\s\S]*style=\{overlayStyle\(/);
    expect(s).toMatch(/<\/Takeover>/);
  });

  it('StudioOverlay portals, so a Chef\'s Desk tool cannot use the surface without it', () => {
    const s = src('../chefsdesk/studioChrome.jsx');
    expect(s).toMatch(/export function StudioOverlay/);
    expect(s).toMatch(/<Takeover>[\s\S]*chrome\.overlay/);
  });

  /* ⚠️ `chrome.overlay` spread into a bare div is the exact shape that shipped broken twice. It is
     not an error the eye catches — the screen looks right until a rail is beside it. */
  it('no Chef\'s Desk screen spreads the studio surface itself', () => {
    for (const f of ['../chefsdesk/a4/A4Sheet.jsx', '../chefsdesk/SheetLibrary.jsx']) {
      expect(src(f)).toMatch(/<StudioOverlay/);
      expect(src(f)).not.toMatch(/style=\{s\.overlay\}/);
    }
  });

  /* X-Ray keeps its own surface — it is a scrolling document, not the two-pane Chef's Desk tool —
     so it is the one screen that still names the scale and wraps itself. A bare number is how the
     relationship gets lost; studioChrome's own header records the last time. */
  it('X-Ray wraps itself, and names the shared scale rather than repeating its number', () => {
    const s = src('../orders/xray/XrayReport.jsx');
    expect(s).toMatch(/<Takeover>/);
    expect(s).toMatch(/zIndex: Z\.studio/);
    expect(s).not.toMatch(/zIndex: 4000/);
  });

  /* ⚠️ THE SECOND REPORT — "Print & cut-outs" in order details. The sheet itself is A4Sheet, fixed
     above; what is left is the shell around it, which sat at a bare 60 inside OrdersPanel's docked
     page and painted its loading and error states there. A dialog, so Z.panel. */
  it('the cut-out sheet\'s shell leaves the docked page too', () => {
    const s = src('../orders/OrdersPanel.jsx');
    expect(s).toMatch(/<Takeover>/);
    expect(s).toMatch(/background: 'rgba\(20,18,22,0\.55\)', zIndex: Z\.panel/);
    expect(s).not.toMatch(/zIndex: 60\b/);
  });

  /* The storefront preview: a full-screen destination opened from a button inside SettingsPanel. */
  it('the storefront preview leaves Store Settings', () => {
    const s = src('../storefront/ThemePreview.jsx');
    expect(s).toMatch(/<Takeover>/);
    expect(s).toMatch(/import \{[^}]*Takeover[^}]*\} from '\.\.\/shared\/Panel\.jsx'/);
  });

  // The relationships the whole thing rests on, at the document level where they finally hold.
  it('the scale outranks every docked page and the lifted rail', () => {
    const rail = src('./rail.js');
    const dockedZ  = Number(/DOCKED_PAGE_Z\s*=\s*(\d+)/.exec(rail)[1]);
    const stackedZ = Number(/DOCKED_PAGE_STACKED_Z\s*=\s*(\d+)/.exec(rail)[1]);
    const railZ    = Number(/RAIL_OVER_PAGE_Z\s*=\s*(\d+)/.exec(rail)[1]);
    expect(Z.panel).toBeGreaterThan(railZ);           // a dialog dims the rail
    expect(Z.studio).toBeGreaterThan(railZ);          // a destination covers it
    expect(Z.studio).toBeGreaterThan(stackedZ);
    expect(Z.studio).toBeGreaterThan(dockedZ);
    expect(Z.overStudio).toBeGreaterThan(Z.studio);   // and a picker opened from inside one
  });

  // SSR safety: the portal must not throw where there is no document (every component here is
  // rendered through renderToStaticMarkup in tests — see INVARIANTS #9).
  it('renders its children rather than throwing when there is no document', () => {
    const doc = globalThis.document;
    delete globalThis.document;
    try {
      expect(renderToStaticMarkup(<Takeover><i>x</i></Takeover>)).toBe('<i>x</i>');
    } finally { if (doc !== undefined) globalThis.document = doc; }
  });
});
