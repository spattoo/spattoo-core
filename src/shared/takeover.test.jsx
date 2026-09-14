import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { Z, Takeover } from './Panel.jsx';

/* ── A takeover must escape the page it was opened from ──────────────────────────────────────────
 *
 * ⚠️ THE BUG THIS PINS. A z-index only competes inside its own stacking context. `dockedPage`
 * (shared/rail.js) is position:fixed with z-index 300, which MAKES one — so X-Ray, rendered from
 * inside OrdersPanel, had its Z.studio resolved inside that 300 and lost to the rail's 315
 * (RAIL_OVER_PAGE_Z). The rail painted over the report, covering its title and the column beside it.
 *
 * The numbers said 4000 beat 315, which is why it went unnoticed: nothing was misconfigured, the
 * comparison simply never happened at the document level. Raising the number cannot fix it.
 *
 * These are SOURCE assertions rather than rendered ones on purpose — `Takeover` portals to
 * document.body, and renderToStaticMarkup has no document, so a render test would assert the SSR
 * fallback and prove nothing about the thing that broke.
 */
const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

describe('full-screen takeovers', () => {
  const SCREENS = [
    ['X-Ray report',        '../orders/xray/XrayReport.jsx'],
    ['Print studio sheet',  '../chefsdesk/a4/A4Sheet.jsx'],
    ['Print studio library','../chefsdesk/SheetLibrary.jsx'],
  ];

  it.each(SCREENS)('%s is wrapped in <Takeover>, so it portals out of any page it opens from',
    (_name, file) => {
      const s = src(file);
      expect(s).toMatch(/<Takeover>/);
      expect(s).toMatch(/<\/Takeover>/);
      expect(s).toMatch(/import \{[^}]*Takeover[^}]*\} from/);
    });

  /* A bare number is how the relationship gets lost. studioChrome's own header records the last
     time: "a bare 4000 here is what left the uploads picker opening underneath it". */
  it('X-Ray names the shared scale rather than repeating its number', () => {
    const s = src('../orders/xray/XrayReport.jsx');
    expect(s).toMatch(/zIndex: Z\.studio/);
    expect(s).not.toMatch(/zIndex: 4000/);
  });

  // The relationship the whole thing rests on: a takeover outranks every docked page and the rail.
  it('the scale still puts a studio above a docked page and the lifted rail', async () => {
    const rail = src('./rail.js');
    const dockedZ = Number(/DOCKED_PAGE_Z\s*=\s*(\d+)/.exec(rail)[1]);
    const stackedZ = Number(/DOCKED_PAGE_STACKED_Z\s*=\s*(\d+)/.exec(rail)[1]);
    const railZ = Number(/RAIL_OVER_PAGE_Z\s*=\s*(\d+)/.exec(rail)[1]);
    expect(Z.studio).toBeGreaterThan(railZ);
    expect(Z.studio).toBeGreaterThan(stackedZ);
    expect(Z.studio).toBeGreaterThan(dockedZ);
    expect(Z.overStudio).toBeGreaterThan(Z.studio);
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
