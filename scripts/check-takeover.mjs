// ── A full-screen overlay must leave the page it was opened from ────────────────────────────────
//
// THE BUG THIS EXISTS TO STOP, reported three times before anyone saw the shape of it:
//
//   "some screens got disturbed"          — X-Ray and the Edible Print Studio, title covered
//   "the prints & cut-outs section"       — the same studio, reached from an order instead
//   a modal you could click straight past — every Panel opened from a docked page
//
// One fault. `dockedPage` (shared/rail.js) is position:fixed with z-index 300, which MAKES a
// stacking context, and the rail lifts to RAIL_OVER_PAGE_Z (315) whenever such a page is open.
// Anything rendered INSIDE that page has its z-index resolved against the 300 — not against the
// document — so the rail, a sibling of the 300, paints over it. The number on the overlay is
// irrelevant: a "4000" studio and a "60" dialog lost in exactly the same way.
//
// ⚠️ WHICH IS WHY THIS GATE DOES NOT LOOK AT NUMBERS. Raising one has never fixed an instance and
// cannot: whatever it is raised to, it is still compared against its parent's 300. The only repair
// is to render at the document level, which is what `Takeover` (shared/Panel.jsx) does.
//
// What counts as full-screen here: `position: 'fixed'` together with `inset: 0` in the same style
// object. That pair is a claim about the SCREEN — cover all of it — and it is the only claim this
// checks, because it is the only one a stacking context can silently break. A fixed element pinned
// to a corner, an anchored popup, a drag ghost: those are positioned RELATIVE to something and are
// none of this gate's business.
//
// Run via `npm run check:takeover` (in `npm run verify`).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = join(ROOT, 'src');

/* `position: 'fixed'` and `inset: 0` in one style object — the two together, in either order,
   allowing the properties between them that every one of these has (background, display, zIndex). */
const FULL_SCREEN = /position:\s*'fixed'[^}]*?\binset:\s*0\b|inset:\s*0[^}]*?position:\s*'fixed'/;

/* Rendering at the document level, however the file spells it. `Takeover` is the shared way and
   what a new screen should reach for; `createPortal(..., document.body)` is the same act written
   out, and OrdersCalendar does it directly because it is portalling ONE popup, not a screen. */
const ESCAPES = [/<Takeover>/, /<StudioOverlay/, /createPortal\s*\(/];

/* ⚠️ THE HOLE THIS CLOSES, which the first version of this gate had. A4Sheet and SheetLibrary never
   wrote `position: 'fixed'` at all — they spread `chrome.overlay`, so the check above simply did not
   see them, and they were two of the three screens that shipped broken. A surface borrowed from
   another file is still a surface. `StudioOverlay` is how it is reached now; naming the style object
   directly is the mistake, wherever it is done. */
const BORROWED = /\bchrome\.overlay\b/;

/* ── Allowed to stay in place, each for a stated reason ──────────────────────────────────────────
 *
 * ⚠️ ADD TO THIS ONLY WITH THE REASON WRITTEN DOWN, and only after opening the screen beside the
 * rail. "It looked fine" is not a reason — every instance of this bug looked fine to whoever wrote
 * it, because the numbers say the opposite of what the browser does.
 */
const ALLOWED = new Map([
  ['src/chefsdesk/studioChrome.jsx',
   'Home of StudioOverlay and of chrome.overlay, the surface it wraps. Defines the pattern.'],

  ['src/shared/Panel.jsx',
   'Home of Takeover, and the overlay it wraps. Reads as an offender because the pattern is DEFINED here.'],

  ['src/storefront/CustomerStorefront.jsx',
   'The customer\'s own storefront: its own tab, its own document, no rail and no docked page anywhere '
   + 'in the tree. Its four overlays (drawer, "how it works", lightbox, dialog) are top-level there. '
   + 'When it is embedded for a preview it is ThemePreview that portals, once, around all of it.'],

  ['src/storefront/facets/FacetShell.jsx',
   'Same: the storefront\'s own sheet shell, customer-side only.'],

  ['src/designer/decorations/UploadsPanel.jsx',
   'A menu scrim at z-index 1, inside the panel it belongs to and meant to stay there — it catches '
   + 'the next click to close a dropdown, and portalling it would put it over the panel itself.'],

  ['src/notifications/NotificationBell.jsx',
   'A click-catcher for a dropdown, not a screen. The tray beside it is position:absolute on the bell '
   + 'button, so the pair must stay together — portalling the backdrop alone would leave the tray '
   + 'anchored to nothing. The bell lives in the app\'s top bar, above the rail, never inside a page.'],

  ['src/designer/CakeDesigner.jsx',
   'The app root. These overlays are siblings of the rail, not descendants of a docked page, so their '
   + 'ranks are already compared at the document level — rail.js records 320 as where they sit.'],
]);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (/\.jsx?$/.test(name) && !/\.test\.jsx?$/.test(name)) files.push(full);
  }
})(SRC);

const offenders = [];
for (const file of files) {
  const rel = relative(ROOT, file);
  if (ALLOWED.has(rel)) continue;

  const src = readFileSync(file, 'utf8');
  // Comments describing the rule are not breaches of it, and this file's own prose quotes both.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

  const borrowed = BORROWED.test(code);
  if (!FULL_SCREEN.test(code) && !borrowed) continue;
  if (!borrowed && ESCAPES.some(re => re.test(code))) continue;

  const lines = code.split('\n');
  const line = borrowed
    ? lines.findIndex(l => BORROWED.test(l))
    : lines.findIndex(l => /position:\s*'fixed'/.test(l) || /inset:\s*0/.test(l));
  offenders.push(`${rel}:${line + 1}${borrowed ? '  (spreads chrome.overlay)' : ''}`);
}

if (offenders.length) {
  console.error('✗ check:takeover — a full-screen overlay that cannot escape the page it opens from:\n');
  for (const o of offenders) console.error(`   ${o}`);
  console.error('\n   Wrap the root in <Takeover> from src/shared/Panel.jsx. It portals to <body>, which is');
  console.error('   the only context where a z-index means what it says: inside a docked page (z 300) the');
  console.error('   rail at 315 paints over anything, at any number. Do NOT raise the z-index instead.');
  console.error('   A Chef\'s Desk tool takes <StudioOverlay> from chefsdesk/studioChrome.jsx instead, which');
  console.error('   carries the surface AND the portal — spreading chrome.overlay into a div takes only half.');
  console.error('   If it genuinely belongs in place — a scrim for a dropdown, a customer-side screen with');
  console.error('   no rail — add it to ALLOWED in this file WITH the reason.');
  process.exit(1);
}

console.log(`✓ check:takeover — every full-screen overlay reaches the document (${files.length} files)`);
