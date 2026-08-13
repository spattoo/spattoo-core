import { createRoot } from 'react-dom/client';
import SettingsPanel from '../src/settings/SettingsPanel.jsx';

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
const STUBS = {
  fetchBakerProfile:  async () => ({
    name: 'Sample Bakery', slug: 'sample', tagline: 'Baked fresh, every day',
    story: '', primary_color: '#2C4433', accent_color: '#6B8C74',
    logo_url: null, portrait_url: null, instagram_handle: 'samplebakery',
    website_url: '', storefront_published: true, storefront_theme_id: 1,
    storefront_customizations: {},
  }),
  fetchBakerSettings: async () => ({
    delivery: { home_delivery: true, radius_km: 10 },
    store_hours: null,
    lead_time_days: 2,
  }),
  // Two accepted agreements, so the "Your agreements" list and its download button are both live.
  // With none the button is disabled and the section reads "No agreements recorded yet" — which is
  // one of the two things "I clicked it and nothing happened" can mean.
  fetchConsentHistory: async () => ({ events: [
    { docKey: 'tos',     version: '2026-08-01', action: 'accepted', at: '2026-08-01T09:12:00Z' },
    { docKey: 'privacy', version: '2026-08-01', action: 'accepted', at: '2026-08-01T09:12:00Z' },
  ] }),
  fetchLegalCurrent:   async () => ({ documents: [] }),
  fetchDeletionStatus: async () => null,
  fetchStorefrontThemes: async () => ([
    { id: 1, key: 'spotlight',  name: 'Spotlight',  is_active: true,  is_premium: false },
    // Premium and coming-soon, so the picker's two non-default card states are both visible. A
    // premium theme shows "Blaze" unless fetchEntitlements says otherwise; "Soon" wins on the
    // inactive one, because a theme nobody can select is not an upgrade prompt.
    { id: 2, key: 'patisserie', name: 'Patisserie', is_active: true,  is_premium: true },
    { id: 3, key: 'aurora',     name: 'Aurora',     is_active: false, is_premium: true },
  ]),
  // Blaze-and-below by default, so the locked card is what the harness shows. Flip to true to see
  // the unlocked side.
  fetchEntitlements: async () => ({ ent: { premium_themes: false, edible_print_studio: false } }),
  // `curated: false` is the state a brand-new baker is in: no settings rows, so EVERY flavour is
  // offered by default. It is what makes the publish confirm's "you are offering all N flavours"
  // notice render — the whole reason that notice exists is a state nobody would think to set up
  // by hand.
  fetchBakerFlavours: async () => ({
    curated: false,
    flavours: [
      { id: 'f1', name: 'Chocolate',    excluded: false, conflicts_with: [], baseline_conflicts: [] },
      { id: 'f2', name: 'Vanilla',      excluded: false, conflicts_with: [], baseline_conflicts: [] },
      { id: 'f3', name: 'Red Velvet',   excluded: false, conflicts_with: [], baseline_conflicts: [] },
      { id: 'f4', name: 'Rasmalai',     excluded: false, conflicts_with: [], baseline_conflicts: [] },
      { id: 'f5', name: 'Butterscotch', excluded: false, conflicts_with: [], baseline_conflicts: [] },
    ],
    visibility: { price_visibility: 'private' },
  }),
  updateBakerProfile:  async (b) => { console.log('PUT /baker/profile', b); return { ok: true }; },
  updateBakerSettings: async (b) => { console.log('PUT /baker/settings', b); return { ok: true }; },
  getSignedUploadUrl:  async () => ({ url: '', key: '', publicUrl: '' }),
  publishStorefront:   async () => ({ ok: true }),
  unpublishStorefront: async () => ({ ok: true }),
};

const apiClient = new Proxy(STUBS, {
  get: (t, k) => t[k] ?? (async () => ({ events: [], items: [], flavours: [], templates: [], plans: [] })),
});

createRoot(document.getElementById('root')).render(
  <SettingsPanel open apiClient={apiClient} onClose={() => {}} />,
);
