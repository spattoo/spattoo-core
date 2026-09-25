import { createRoot } from 'react-dom/client';
import SettingsPanel from '../src/settings/SettingsPanel.jsx';
import TemplatesPanel from '../src/settings/TemplatesPanel.jsx';
import SpattooTemplatesPanel from '../src/settings/SpattooTemplatesPanel.jsx';
import { STUBS, EMPTY } from './settingsStubs.js';

// The real settings panel against a stubbed API. It sits behind auth in the app, so it was the one
// baker-facing screen with no way to look at it — which is how a section heading, a field label and
// a grouping all got changed without anybody seeing the result.
//
// Seeded with values that make the CONDITIONAL parts render: home delivery on (so the radius field
// appears) and a non-zero lead time (so the "earliest a customer can pick" line has something to
// say). Defaults would show the panel at its emptiest, which is the least useful thing to preview.

// The panel mounts its siblings (privacy, billing, flavours, templates), so the client it needs is
// ~35 methods deep. Stubbed via a Proxy rather than by hand: anything not named below answers with
// an empty shape instead of throwing, so adding a method to the real client never breaks this
// harness. Explicit stubs are only for the fields this screen actually renders.
// (STUBS lives in settingsStubs.js, shared with rail.html?settings.)

const apiClient = new Proxy(STUBS, {
  get: (t, k) => t[k] ?? EMPTY,
});

/* ⚠️ THE SIBLING PAGES ARE REACHED FROM THE RAIL, NOT FROM INSIDE THIS PANEL, so mounting
 * SettingsPanel alone could never show them — `?panel=templates` had no way in and the screen was
 * unlookable-at for the same reason Store Settings was before this harness existed. One query param
 * mounts the page directly, against the same stubs.
 *
 *   /settings.html                    Store Settings
 *   /settings.html?panel=templates    My templates — the baker's own saved designs
 *   /settings.html?panel=spattoo      Spattoo templates — the grid they stock a catalogue from
 *
 * ⚠️ The Spattoo grid is the one that most needs driving rather than reading: it saves on every tap
 * (no Save button), and a grid's behaviour — the tiles, the selected outline, the reveal as you
 * scroll — is invisible to a static render. See plans/baker-catalogue.md.
 */
const panel = new URLSearchParams(location.search).get('panel');

createRoot(document.getElementById('root')).render(
  panel === 'spattoo'
    ? <SpattooTemplatesPanel open apiClient={apiClient} onClose={() => {}} />
    : panel === 'templates'
      ? <TemplatesPanel open apiClient={apiClient} onClose={() => {}} />
      : <SettingsPanel open apiClient={apiClient} onClose={() => {}} />,
);
