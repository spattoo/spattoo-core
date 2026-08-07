import { createRoot } from 'react-dom/client';
import { CakeDesigner } from '../src/index.js';

// ── The spatula rail, on both surfaces ──────────────────────────────────────────────────────────
// The rail is drawn twice — a vertical column on desktop, a bottom bar on a phone — and for a while
// those were two hand-maintained arrays. Uploads was added to one and not the other, so a baker on
// a phone had no route to their own images and nothing anywhere said so: a missing nav item is not
// a crash, not a duplicate block, and no unit test renders this component.
//
// This mounts the real CakeDesigner so the two can be compared by looking. Narrow the window past
// 900px to get the phone bar.
//
// The stub answers nothing, deliberately. `capabilities` stays null when /me is not reachable, and
// hasCap treats null as "everything allowed" — so every rail item renders, which is exactly the
// state worth inspecting. Panels opened from it will be empty; the rail is the subject here.
// Every method answers null. A Proxy rather than a hand-written stub because the designer calls
// something like forty API methods at mount and this harness cares about none of them — a missing
// one throws inside an effect and the error boundary swallows the whole screen, which is a long way
// to travel to learn nothing about the rail.
//
// `capabilities` therefore stays null, and hasCap treats null as "everything allowed", so every
// rail item renders — exactly the state worth inspecting.
// `?past_due` makes fetchBakerProfile answer with a baker mid-dunning, so PastDueBanner can be
// looked at in place — above the real rail, at whatever width the window is. Every other method
// still answers null.
// `?status=past_due` for the dunning banner, `?status=expired` (or cancelled / paused) for the
// lapsed gate and its exit row. Both are states you cannot reach by using the app normally, which is
// exactly why they are the ones worth being able to open on demand.
const status = new URLSearchParams(location.search).get('status')
            || (new URLSearchParams(location.search).has('past_due') ? 'past_due' : null);
const overrides = status ? {
  fetchBakerProfile: async () => ({
    baker: {
      name: 'My Bakery', subscription_status: status,
      subscription_plan_display: 'Blaze', first_paid_at: '2026-01-01T00:00:00Z',
    },
  }),
} : {};
const apiClient = new Proxy(overrides, {
  get: (target, k) => target[k] ?? (async () => null),
});

// `?customer` renders in customer mode, which is the only mode CustomerTour runs in. The tour also
// checks localStorage, so it shows once and then never again — clearing the key is how you get it
// back, and doing that here beats hand-editing devtools every time.
const customer = new URLSearchParams(location.search).has('customer');
if (new URLSearchParams(location.search).has('retour')) {
  try { localStorage.removeItem('spattoo.tour.customer.v1'); } catch { /* ignore */ }
}

createRoot(document.getElementById('root')).render(
  <CakeDesigner
    apiClient={apiClient}
    orderMode={customer ? 'customer' : 'baker'}
    onOrder={() => {}}
    onShareStore={() => {}}
  />,
);
