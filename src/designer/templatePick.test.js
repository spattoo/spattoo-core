import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/* ── Starting a cake from a template, and SAYING SO while it happens ─────────────────────────────
 *
 * Sandeep, after using it: "when i click on a template from library- its taking a second to load on
 * the canvas- but there is no indication of loading."
 *
 * That second is a round trip, and it is structural rather than slow code: the list row deliberately
 * carries no `design` (spattoo-api `lib/templateList.js` stopped selecting it, so browsing does not
 * ship N designs for the ONE somebody opens), so picking fetches by id. Unmarked, the tile is
 * indistinguishable from a dead control — rule 7 — and a second tap starts a second fetch.
 *
 * Source assertions: this is a 14k-line component that imports three.js, and what is worth pinning
 * is a `finally` and a prop threaded to two callers. Neither survives a rewrite by accident and
 * neither is visible to a static render.
 */
const designer = readFileSync(new URL('./CakeDesigner.jsx', import.meta.url), 'utf8');
const grid     = readFileSync(new URL('./shared/TemplateGrid.jsx', import.meta.url), 'utf8');
const library  = readFileSync(new URL('../settings/LibraryPanel.jsx', import.meta.url), 'utf8');

describe('the wait is visible on the tile that was tapped', () => {
  it('the pick is marked busy before the await', () => {
    expect(designer).toMatch(/setPickingId\(t\.id\);/);
  });

  /* ⚠️ THE `finally` IS THE WHOLE POINT OF THE SHAPE, AND THE EASIEST THING TO LOSE.
     `fetchTemplate` is `.catch(() => null)`, so a failed fetch falls through to
     `if (!templateDesign) return` — an early return. Without `finally`, that one path leaves a
     spinner running for ever on the exact occasion nothing is going to happen: the difference
     between "that didn't load" and "the app is stuck". */
  it('and cleared on every exit path, including the silent one', () => {
    expect(designer).toMatch(/\} finally \{\s*\n\s*setPickingId\(null\);/);
  });

  it('the early return it protects is still there', () => {
    expect(designer).toMatch(/if \(!templateDesign\) return;/);
  });

  /* Both template surfaces wait on the same round trip, so both are told about it. Tracking it
     twice is how two screens start disagreeing about whether anything is happening. */
  it('both grids are told which tile is loading', () => {
    expect(designer).toMatch(/busyId=\{pickingId\}/);        // the Catalogue flyout
    expect(designer).toMatch(/pickingId=\{pickingId\}/);     // handed to the Library page
    expect(library).toMatch(/busyId=\{pickingId\}/);         // and passed straight through
  });
});

describe('a pick in flight cannot start a second one', () => {
  /* ⚠️ THE GUARD THAT ACTUALLY FIRES IS THE GRID'S. `startFromTemplate` also checks `pickingId`,
     but it reads it from the render closure — two taps in one tick would both see null. The prop-
     driven check in TemplateGrid is what stops the second tap, and two overlapping loads would
     otherwise race to `loadDesign`, where the loser silently wins the canvas. */
  it('the grid ignores a tap while any pick is loading', () => {
    expect(grid).toMatch(/const blocked = busyId != null;/);
    /* ⚠️ THE HANDLER IS NO LONGER ONE LINE — it grew a PHOTO branch, because a photograph opens
       rather than picks. What has to survive that is the ORDER: `blocked` returns before either
       branch is reached. A photo opening mid-fetch would be harmless in itself, but a guard that
       sits after the branch is a guard the second tap can walk around. */
    expect(grid).toMatch(/onClick=\{\(\) => \{\s*\n\s*if \(blocked\) return;/);
    expect(grid).toMatch(/onPick\?\.\(t\);/);
  });

  it('and says so with the cursor rather than silently swallowing it', () => {
    expect(grid).toMatch(/cursor: blocked \? 'progress'/);
  });
});

describe('the spinner is shared, not a sixth copy', () => {
  /* ⚠️ `CakeSpinner` CANNOT BE USED HERE — `canvas/CakeSpinner.jsx` imports `Html` from
     `@react-three/drei`, which only renders inside a `<Canvas>`. The cake glyph belongs to the
     scene; a panel waiting on a request needs a ring.

     ⚠️ And the ring was already hand-rolled FIVE times (BillingPanel, SettingsPanel, FlavoursPanel,
     LibraryPanel, DashboardPanel). A sixth inside TemplateGrid is exactly what CLAUDE.md rule 1
     describes: nobody copies on purpose, they write a fresh style object because they never looked.
     The five are deliberately left alone — converting them risks a visual diff on five screens and
     does not belong inside a bug fix — but new callers use the shared one. */
  it('TemplateGrid uses the shared DOM spinner', () => {
    expect(grid).toMatch(/import Spinner from '\.\.\/\.\.\/shared\/Spinner\.jsx'/);
    expect(grid).toMatch(/<Spinner /);
  });

  it('and does not hand-roll another spin keyframe', () => {
    expect(grid).not.toMatch(/@keyframes/);
  });

  /* ⚠️ THE IMPORT, NOT THE WORD. The first cut of this asserted the file did not contain the string
     `@react-three` anywhere — and failed, because Spinner.jsx EXPLAINS in a comment that CakeSpinner
     imports drei and therefore cannot be used outside a <Canvas>. A test that reads its subject's
     documentation as a violation punishes writing the reason down. */
  it('the shared one does not drag the 3D canvas into a panel', () => {
    const spinner = readFileSync(new URL('../shared/Spinner.jsx', import.meta.url), 'utf8');
    expect(spinner).not.toMatch(/^\s*import .*@react-three/m);
    expect(spinner).not.toMatch(/from '@react-three/);
  });
});

/* ── A photograph is opened, never picked ────────────────────────────────────────────────────────
 *
 * Sandeep: "on tap- show the picture big with a 'Request quote' button (customer view). when baker
 * taps on it, show it bigger with a button 'create order for a customer'".
 *
 * ⚠️ BEFORE THIS, A PHOTO TILE WAS A DEAD CONTROL. `onPick` runs `startFromTemplate`, which fetches
 * the design by id and returns early on `if (!templateDesign) return` — and a photo has no design by
 * construction (migration 116's CHECK). So the tap did nothing, silently, on both surfaces.
 */
describe('a photograph is opened, never picked', () => {
  const facet = readFileSync(new URL('../storefront/facets/DesignFacet.jsx', import.meta.url), 'utf8');
  const draft = readFileSync(new URL('../storefront/facets/cakeDraft.js', import.meta.url), 'utf8');
  const modal = readFileSync(new URL('../orders/OrderModal.jsx', import.meta.url), 'utf8');

  it('the grid opens a photo rather than picking it', () => {
    expect(grid).toMatch(/if \(t\.type === 'photo'\) \{/);
  });

  /* Without the row the enlarged view has a src, a name and a tier count — none of which say
     whether this is a picture you can order or a design you can open. */
  it('the preview payload carries the row', () => {
    expect(grid).toMatch(/rect, template: t/);
    expect(grid).toMatch(/rect: null, template: t/);
  });

  /* ⚠️ THE ACTION LIVES ONLY IN THE BACKDROP BRANCH. The other branch is the desktop HOVER preview,
     which clears on mouseleave — a button drawn there could never be reached by a pointer travelling
     to it. A tap always produces `rect: null`, which is this branch. */
  it('the baker action sits on the tapped preview, gated like New Order', () => {
    expect(designer).toMatch(/tplPreview\.template\?\.type === 'photo'/);
    expect(designer).toMatch(/Create order for a customer/);
    expect(designer).toMatch(/hasCap\('order:manage'\) && apiClient\?\.createManualOrder/);
  });

  /* The picture is already in R2 — the baker uploaded it into their own catalogue — so the order
     references THAT object instead of storing a second copy of one cake. */
  it('the manual order is seeded with the existing key, not a re-upload', () => {
    expect(designer).toMatch(/initialReferenceKeys=\{manualOrderPhoto \?\? \[\]\}/);
    expect(modal).toMatch(/useState\(initialReferenceKeys\)/);
  });

  it('the customer gets Request quote, and the photo travels as a reference key', () => {
    expect(facet).toMatch(/Request quote/);
    expect(facet).toMatch(/kind: 'photo'/);
    expect(facet).toMatch(/photoKeys: t\.thumbnail_key \? \[t\.thumbnail_key\] : \[\]/);
  });

  /* ⚠️ `[]` IS NOT NULLISH, AND THAT WAS A REAL BUG. `uploadPhotos` returns `[]` when the customer
     uploaded nothing, so `referenceKeys ?? draft.design.photoKeys` never fell through — the fallback
     was unreachable on every path but the photo door. It went unnoticed while `photoKeys` was only
     ever filled BY that upload, and broke the moment a catalogue photo put a key there without
     uploading anything: the key was silently dropped and the baker got an order with no picture. */
  it('an empty upload result falls through to the draft keys', () => {
    expect(draft).toMatch(/referenceKeys\?\.length \? referenceKeys : draft\.design\.photoKeys/);
  });
});

describe('the overlay does not eat the tap it is reporting', () => {
  /* Drawn over the picture, so it must not become the click target — and it sits ON the tile rather
     than over the panel because WHICH cake is loading is the useful half (INVARIANTS #11: the
     control and what it changes, visible together). */
  it('the busy overlay is pointer-transparent', () => {
    const block = grid.slice(grid.indexOf('{busy && ('), grid.indexOf('{overlay?.(t)}'));
    expect(block).toMatch(/pointerEvents: 'none'/);
  });
});
