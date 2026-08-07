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
const pastDue = new URLSearchParams(location.search).has('past_due');
const overrides = pastDue ? {
  fetchBakerProfile: async () => ({
    baker: { name: 'My Bakery', subscription_status: 'past_due', subscription_plan_display: 'Blaze' },
  }),
} : {};
const apiClient = new Proxy(overrides, {
  get: (target, k) => target[k] ?? (async () => null),
});

createRoot(document.getElementById('root')).render(
  <CakeDesigner apiClient={apiClient} onOrder={() => {}} onShareStore={() => {}} />,
);
