import { createRoot } from 'react-dom/client';
import SettingsPanel from '../src/settings/SettingsPanel.jsx';
import LibraryPanel from '../src/settings/LibraryPanel.jsx';
import { STUBS, EMPTY } from './settingsStubs.js';

// The real settings panel against a stubbed API. It sits behind auth in the app, so it was the one
// baker-facing screen with no way to look at it — which is how a section heading, a field label and
// a grouping all got changed without anybody seeing the result.
//
// Seeded with values that make the CONDITIONAL parts render: home delivery on (so the radius field
// appears) and a non-zero lead time (so the "earliest a customer can pick" line has something to
// say). Defaults would show the panel at its emptiest, which is the least useful thing to preview.

// The panel mounts its siblings (privacy, billing, flavours), so the client it needs is ~35 methods
// deep. Stubbed via a Proxy rather than by hand: anything not named below answers with an empty
// shape instead of throwing, so adding a method to the real client never breaks this harness.
// Explicit stubs are only for the fields this screen actually renders.
// (STUBS lives in settingsStubs.js, shared with rail.html?settings.)

const apiClient = new Proxy(STUBS, {
  get: (t, k) => t[k] ?? EMPTY,
});

/* ⚠️ LIBRARY IS REACHED FROM THE RAIL, NOT FROM INSIDE THIS PANEL, so mounting SettingsPanel alone
 * could never show it — and Settings holds nothing template-shaped at all any more. One query param
 * mounts the page directly, against the same stubs.
 *
 *   /settings.html                   Store Settings
 *   /settings.html?panel=library     Library — Spattoo's cakes and the baker's own, in one grid
 *
 * ⚠️ Library is the one that most needs DRIVING rather than reading: it saves on every tap (no Save
 * button), Delete is drawn only on the baker's own tiles, and a grid's behaviour — the tiles, the
 * selected outline, the reveal as you scroll — is invisible to a static render. The Catalogue is the
 * rail's Templates flyout, so it lives in rail.html, not here. See plans/baker-catalogue.md.
 *
 * `?panel=templates` and `?panel=spattoo` were the two screens this replaced; both are gone.
 */
const panel = new URLSearchParams(location.search).get('panel');

createRoot(document.getElementById('root')).render(
  panel === 'library'
    ? <LibraryPanel open apiClient={apiClient} onClose={() => {}} />
    : <SettingsPanel open apiClient={apiClient} onClose={() => {}} />,
);
