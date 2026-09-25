import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── The two screens a baker curates from ────────────────────────────────────────────────────────
 *
 * `SpattooTemplatesPanel` is the library they stock from; `TemplatesPanel` is their own work. Both
 * write the catalogue, and both carry decisions that a later edit would quietly undo — so these pin
 * the decisions, not the markup.
 *
 * Source assertions rather than a render, following customerUpdates.test.jsx: these are docked pages
 * with network calls in an effect, and what is worth protecting here is a CONTRACT with the API and
 * a deliberate break from the settings convention. Neither survives a rewrite by accident, and
 * neither is visible to renderToStaticMarkup.
 */
const spattoo = readFileSync(new URL('./SpattooTemplatesPanel.jsx', import.meta.url), 'utf8');
const mine    = readFileSync(new URL('./TemplatesPanel.jsx', import.meta.url), 'utf8');

describe('the catalogue PUT carries the WHOLE set', () => {
  /* ⚠️ THE BUG THIS PREVENTS IS SILENT AND EXPENSIVE. `PUT /api/baker/catalogue` replaces the
     catalogue rather than taking a delta. Each screen shows half of it — Spattoo's library here,
     the baker's own designs there — so a screen that sent only what it DISPLAYS would empty the
     other half the first time anybody used it. A baker would tidy their own templates and find
     their shop had lost every Spattoo cake, with nothing on screen to explain it.

     Both panels therefore hold every offered id from the fetch and filter only the DISPLAY. */
  it('the Spattoo grid sends the full offered set, not the tiles it shows', () => {
    expect(spattoo).toMatch(/updateBakerCatalogue\(\[\.\.\.next\]\)/);
    // `next` is derived from `offered`, which is seeded from the WHOLE response.
    expect(spattoo).toMatch(/setOffered\(new Set\(arr\.filter\(t => t\.offered\)\.map\(t => t\.id\)\)\)/);
    // and the filtering is on display only
    expect(spattoo).toMatch(/\(rows \?\? \[\]\)\.filter\(t => t\.source !== 'mine'\)/);
  });

  it('My templates sends the full offered set too, including Spattoo ids it never displays', () => {
    expect(mine).toMatch(/updateBakerCatalogue\(\[\.\.\.next\]\)/);
    expect(mine).toMatch(/setOffered\(new Set\(all\.filter\(t => t\.offered\)\.map\(t => t\.id\)\)\)/);
  });
});

describe('neither screen holds unsaved work', () => {
  /* ⚠️ NOT A STYLE CHOICE. `leaveOpenPanels()` in CakeDesigner closes docked pages on ANY rail
     click, and that file warns that a panel holding something a baker typed would have to guard
     that path. A catalogue assembled from hundreds of tiles is a long session, so a draft here is
     thirty taps lost by pressing New Cake. Saving on each tap is what makes the rail click free.

     Every other settings panel is draft-until-Save; these two are the deliberate exceptions. */
  it('the Spattoo grid has no Save button', () => {
    expect(spattoo).not.toMatch(/Save Templates|Save Catalogue|handleSave/);
  });

  it('My templates lost its Save button when the Spattoo section left', () => {
    expect(mine).not.toMatch(/Save Templates|handleSave/);
  });

  it('both save on the tap itself', () => {
    expect(spattoo).toMatch(/async function toggle\(/);
    expect(mine).toMatch(/async function toggleCatalogue\(/);
  });
});

describe('an optimistic tap is reverted when the call fails', () => {
  /* The tile changes on the tap — a grid that waits for a round trip reads as a dead control — so
     the screen can briefly claim something the server has not accepted. Restoring the previous set
     is what keeps that honest; without it a failed save leaves a cake looking offered when it is
     not, which is the state a customer would then fail to order from. */
  it('the grid restores the previous set on error', () => {
    expect(spattoo).toMatch(/const before = offered;/);
    expect(spattoo).toMatch(/setOffered\(before\);/);
  });

  it('My templates restores the previous set on error', () => {
    expect(mine).toMatch(/const before = offered;/);
    expect(mine).toMatch(/setOffered\(before\);/);
  });
});

describe('an older baker app degrades rather than breaking', () => {
  /* Core is vendored, so a released host predates these routes. `fetchBakerCatalogue` and
     `updateBakerCatalogue` may simply not exist on the injected client — the same situation
     `fetchMyTemplates` was already guarded for. */
  it('the grid renders empty rather than calling a method that is not there', () => {
    expect(spattoo).toMatch(/if \(!apiClient\.fetchBakerCatalogue\) \{ setRows\(\[\]\); return; \}/);
    expect(spattoo).toMatch(/if \(!apiClient\.updateBakerCatalogue\) return;/);
  });

  /* ⚠️ A SWITCH THAT CANNOT SAVE IS NOT DRAWN. Rendering it against an older host would give a
     baker a control that silently does nothing, which is worse than no control — the same failure
     the templates route's own comment describes for an older Settings panel. */
  it('My templates hides the catalogue toggle when the host cannot save it', () => {
    expect(mine).toMatch(/\{apiClient\.updateBakerCatalogue && \(\s*<Toggle/);
  });
});

describe('deleting is still confirmed, and still immediate', () => {
  /* The one action here that cannot be undone by tapping again. It was immediate before this
     rework and stays immediate: a deletion must not sit in a draft a baker may close believing it
     done — which is the same reasoning that now applies to the whole screen. */
  it('Remove goes through the shared ConfirmPanel', () => {
    expect(mine).toMatch(/<ConfirmPanel/);
    expect(mine).toMatch(/deleteBakerTemplate/);
  });
});

describe('the Spattoo library is not shown as rows', () => {
  /* 22 globals carry 16 distinct names — `Football` five times — so a row labelled by name cannot
     tell two cakes apart. The browse flyout settled this: the picture identifies the cake. Same
     component, so the two surfaces cannot drift. */
  it('the grid uses the shared TemplateGrid', () => {
    expect(spattoo).toMatch(/import TemplateGrid from '\.\.\/designer\/shared\/TemplateGrid\.jsx'/);
    expect(spattoo).toMatch(/<TemplateGrid/);
  });

  it('and passes the chosen set so the tiles show what is stocked', () => {
    expect(spattoo).toMatch(/selectedIds=\{offered\}/);
  });
});
