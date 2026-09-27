import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── Library: the one shelf a baker curates their catalogue from ─────────────────────────────────
 *
 * `LibraryPanel` shows EVERYTHING that exists for this baker — Spattoo's published cakes and their
 * own saved designs — and tapping a tile puts it in the catalogue or takes it out. Sandeep settled
 * the shape of it:
 *
 *   "Library covers spattoo templates, and catalogue should be the chosen templates… baker can never
 *    delete spattoo templates - he can only move them to catalogue or from catalogue move back to
 *    library… only baker designs can be removed from library, while both can be added to catalogue.
 *    that keeps catalogue clean with only the selected templates."
 *
 * There was a second page here for a day — `TemplatesPanel.jsx`, "My templates" — and it is gone:
 * one shelf, one chosen subset. These tests moved with it rather than being deleted, because the
 * decisions they pin are the ones that outlived the screen.
 *
 * Source assertions rather than a render, following customerUpdates.test.jsx: this is a docked page
 * with network calls in an effect, and what is worth protecting is a CONTRACT with the API plus a
 * deliberate break from the settings convention. Neither survives a rewrite by accident, and neither
 * is visible to renderToStaticMarkup.
 */
const library = readFileSync(new URL('./LibraryPanel.jsx', import.meta.url), 'utf8');

describe('the catalogue PUT carries the WHOLE set', () => {
  /* ⚠️ THE BUG THIS PREVENTS IS SILENT AND EXPENSIVE. `PUT /api/baker/catalogue` REPLACES the
     catalogue rather than taking a delta. While two screens each showed half of it, a screen that
     sent only what it displayed would empty the other half the first time anybody used it.

     One screen shows the whole shelf now, so the halves cannot drift — but the route is still
     replace-set, and `offered` is still seeded from the WHOLE response rather than from the tiles
     on screen. A future filter (by occasion, by source, by a search box) would reintroduce exactly
     the old bug the moment it filtered `offered` instead of the display. */
  it('sends the full offered set, not the tiles it happens to show', () => {
    expect(library).toMatch(/updateBakerCatalogue\(\[\.\.\.next\]\)/);
    expect(library).toMatch(/setOffered\(new Set\(arr\.filter\(t => t\.offered\)\.map\(t => t\.id\)\)\)/);
  });

  /* ⚠️ AND THE SCREEN SHOWS A SUBSET WHILE SENDING THE WHOLE SET — which is exactly the situation
     the warning above describes, now permanent rather than transitional. `shown` is filtered; `next`
     is built from `offered`, which came from the whole response. A refactor that built the PUT from
     `shown` would empty the catalogue completely on the first tap. */
  it('builds the PUT from the whole set even though the grid shows only part of it', () => {
    expect(library).toMatch(/const next = new Set\(before\)\.add\(t\.id\);/);
    expect(library).not.toMatch(/updateBakerCatalogue\(\[\.\.\.shown/);
  });

  /* ⚠️ AND THE SHELF IS NOT FILTERED BY SOURCE ANY MORE. It was `rows.filter(t => t.source !== 'mine')`
     for one day, while the baker's own designs lived on their own page. If that filter comes back,
     a baker's own saved designs exist in the database and appear on no screen at all — unreachable,
     with no way to see, re-offer or delete them. */
  it('shows both sources on the one shelf', () => {
    expect(library).not.toMatch(/filter\(t => t\.source !== 'mine'\)/);
    expect(library).not.toMatch(/filter\(t => t\.source === 'spattoo'\)/);
  });
});

describe('a template is in the Library OR the Catalogue, never both', () => {
  /* ⚠️ SANDEEP'S RULE, AND IT IS THE SHAPE OF BOTH SCREENS: "a template should appear either in
     library or in catalogue at a given time."

     So the shelf holds what has NOT been chosen, adding a cake REMOVES it from this grid, and there
     is no chosen-outline here — every tile is un-chosen by definition, so an outline would draw on
     all of them or none. Before this rule the shelf showed everything with two visual states, which
     is the version these assertions replaced. */
  it('the shelf holds only what is not in the catalogue', () => {
    expect(library).toMatch(/\(rows \?\? \[\]\)\.filter\(t => !offered\.has\(t\.id\)\)/);
  });

  it('draws no chosen-outline, because nothing here is chosen', () => {
    expect(library).not.toMatch(/selectedIds=/);
  });

  /* Adding can only ever ADD from here. Taking one back out is the Catalogue's affordance — the
     other half of one template being in one place at a time. A toggle would silently re-add a cake
     the baker had just removed, from a screen that cannot show it. */
  it('the action adds only — it is not a toggle', () => {
    expect(library).toMatch(/async function addToCatalogue\(/);
    expect(library).not.toMatch(/if \(next\.has\(t\.id\)\) next\.delete/);
  });
});

describe('putting a cake in the catalogue is DELIBERATE', () => {
  /* ⚠️ SANDEEP ASKED FOR THIS AFTER USING IT: "even clicking by mistake will add it to catalogue.
     it should be a deliberate action. add button like 'Move to catalogue' for each template."

     The asymmetry is the whole argument. A stray tap here changes what STRANGERS can order, and the
     only way back is to find the cake in the Catalogue and move it out — that is not an undo. The
     same gesture in the Catalogue flyout merely loads a design onto the canvas and costs nothing, so
     one tap cannot mean both things. */
  it('the tile does not pick — there is no onPick on the Library grid', () => {
    const grid = library.slice(library.indexOf('<TemplateGrid'), library.indexOf('/>', library.indexOf('<TemplateGrid')));
    expect(grid).not.toMatch(/onPick=/);
  });

  it('a named button does it, and says what it will do', () => {
    expect(library).toMatch(/>Move to catalogue</);
    expect(library).toMatch(/aria-label=\{`Move \$\{t\.name\} to catalogue`\}/);
  });

  /* ⚠️ The control must not pick the tile underneath it as well — TemplateGrid's own contract says
     an overlay's control has to stopPropagation, and here there is nothing to pick, so a missing
     guard would be invisible until the day a tap means something again. */
  it('the button does not also act on the tile', () => {
    expect(library).toMatch(/e\.stopPropagation\(\); addToCatalogue\(t\);/);
  });

  /* Rule 7 backwards: a tile that no longer does anything must stop advertising that it does. */
  it('the shared grid drops the pointer cursor when nothing picks', () => {
    const gridSrc = readFileSync(new URL('../designer/shared/TemplateGrid.jsx', import.meta.url), 'utf8');
    expect(gridSrc).toMatch(/cursor: onPick \? 'pointer' : 'default'/);
  });

  /* Neither screen may still tell a baker to tap a cake — the instruction stopped being true. */
  it('no copy still says to tap a cake', () => {
    expect(library).not.toMatch(/Tap a cake/);
  });
});

describe('the screen holds no unsaved work', () => {
  /* ⚠️ NOT A STYLE CHOICE. `leaveOpenPanels()` in CakeDesigner closes docked pages on ANY rail
     click, and that file warns that a panel holding something a baker typed would have to guard
     that path. A catalogue assembled from hundreds of tiles is a long session, so a draft here is
     thirty taps lost by pressing New Cake. Saving on each tap is what makes the rail click free.

     Every other settings panel is draft-until-Save; this one is the deliberate exception. */
  it('has no Save button', () => {
    expect(library).not.toMatch(/Save Templates|Save Catalogue|Save Library|handleSave/);
  });

  it('saves on the tap itself', () => {
    expect(library).toMatch(/async function addToCatalogue\(/);
  });
});

describe('an optimistic tap is reverted when the call fails', () => {
  /* The tile changes on the tap — a grid that waits for a round trip reads as a dead control — so
     the screen can briefly claim something the server has not accepted. Restoring the previous set
     is what keeps that honest; without it a failed save leaves a cake looking offered when it is
     not, which is the state a customer would then fail to order from. */
  it('restores the previous set on error', () => {
    expect(library).toMatch(/const before = offered;/);
    expect(library).toMatch(/setOffered\(before\);/);
  });
});

describe('only the baker’s own designs can be deleted', () => {
  /* ⚠️ SANDEEP DREW THIS LINE EXPLICITLY: "baker can never delete spattoo templates - he can only
     move them to catalogue or from catalogue move back to library."

     It is also the only thing the API would allow: `DELETE /baker/templates/:id` is scoped
     `.eq('baker_id', req.bakerId)`, so on a global it 404s and deletes nothing. A control that
     cannot work is worse than no control — rule 7. Both sources sit in one grid now, so the gate is
     per-tile rather than per-screen, which is precisely the kind of thing an edit undoes quietly. */
  it('draws Delete only on a tile whose source is mine', () => {
    expect(library).toMatch(/t\.source === 'mine'/);
  });

  it('goes through the shared ConfirmPanel — a delete cannot be undone by tapping again', () => {
    expect(library).toMatch(/<ConfirmPanel/);
    expect(library).toMatch(/deleteBakerTemplate\(id\)/);
  });

  /* A deleted design cannot be in a catalogue, so it leaves the offered set too. Without this the
     next tap on any other tile would PUT a dead id back to the server. */
  it('drops the deleted id from the offered set', () => {
    expect(library).toMatch(/setOffered\(prev => \{ const next = new Set\(prev\); next\.delete\(id\); return next; \}\)/);
  });
});

describe('an older baker app degrades rather than breaking', () => {
  /* Core is vendored, so a released host predates these routes. `fetchBakerCatalogue`,
     `updateBakerCatalogue` and `deleteBakerTemplate` may simply not exist on the injected client. */
  it('renders empty rather than calling a fetch that is not there', () => {
    expect(library).toMatch(/if \(!apiClient\.fetchBakerCatalogue\) \{ setRows\(\[\]\); return; \}/);
  });

  it('ignores a tap it could not save', () => {
    expect(library).toMatch(/if \(!apiClient\.updateBakerCatalogue\) return;/);
  });

  /* ⚠️ A CONTROL THAT CANNOT SAVE IS NOT DRAWN — the same reasoning as the per-source gate above,
     for the same button. */
  /* ⚠️ The gate MOVED rather than went: the overlay now draws two controls, so `deleteBakerTemplate`
     is checked beside the per-tile source test instead of wrapping the whole overlay. Both halves
     still have to hold — an older host draws no Delete, and no host draws one on a Spattoo cake. */
  it('draws no Delete at all when the host cannot delete', () => {
    expect(library).toMatch(/apiClient\.deleteBakerTemplate && t\.source === 'mine'/);
  });

  /* The move button has the same problem in the other direction: a host that cannot save a
     catalogue must not offer a button whose only outcome is a failed request. */
  it('draws no Move button when the host cannot save the catalogue', () => {
    expect(library).toMatch(/\{apiClient\.updateBakerCatalogue && \(/);
  });
});

describe('the library is a grid, not a list of rows', () => {
  /* 22 globals carry 16 distinct names — `Football` five times, `love` three — so a row labelled by
     name cannot tell two cakes apart, and a search box over those names would concentrate the
     problem rather than solve it. The browse flyout settled this: the picture identifies the cake.
     Same component as the flyout, so the two surfaces cannot drift. */
  it('uses the shared TemplateGrid', () => {
    expect(library).toMatch(/import TemplateGrid from '\.\.\/designer\/shared\/TemplateGrid\.jsx'/);
    expect(library).toMatch(/<TemplateGrid/);
  });

  /* The count is what now says where everything went, since the tiles no longer carry two states:
     what is left to choose, and how many are in the catalogue instead. */
  it('says how many are left to choose and how many were chosen', () => {
    expect(library).toMatch(/\{available\} to choose from · \{offered\.size\} in your catalogue/);
  });
});
