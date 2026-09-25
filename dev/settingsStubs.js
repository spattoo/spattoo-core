// Sample store data for the real SettingsPanel, shared by the settings harness and the rail harness
// (`rail.html?settings`), so Store Settings can be judged in place beside the rail with real content.

/* ⚠️ A REAL PICTURE, NOT `null`. Every stubbed template used to carry `thumbnail_url: null`, so the
   templates grid drew its placeholder — and a screenshot then proved the LAYOUT while showing
   nothing about whether a picture actually lands in a tile, which is the one thing a picture-only
   grid is built around. An inline SVG data URI keeps the harness offline and self-contained, and a
   different hue per template makes the order visible when tiles reveal as you scroll. */
const cakeThumb = (hue) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
     <rect width="180" height="180" fill="hsl(${hue} 45% 92%)"/>
     <rect x="42" y="96" width="96" height="52" rx="6" fill="hsl(${hue} 45% 74%)"/>
     <rect x="54" y="66" width="72" height="34" rx="5" fill="hsl(${hue} 45% 82%)"/>
     <circle cx="90" cy="58" r="7" fill="hsl(${hue} 55% 60%)"/>
   </svg>`);

export const STUBS = {
  // Wrapped in `baker`, the shape GET /baker/profile returns and SettingsPanel destructures. Returned
  // bare, every profile field — colours, name, Instagram — silently loaded as empty.
  fetchBakerProfile:  async () => ({ baker: {
    name: 'Sample Bakery', slug: 'sample', tagline: 'Baked fresh, every day',
    story: '', primary_color: '#2C4433', accent_color: '#6B8C74',
    logo_url: null, portrait_url: null, instagram_handle: 'samplebakery',
    website_url: '', storefront_published: true, storefront_theme_id: 1,
    storefront_customizations: {},
  } }),
  fetchBakerSettings: async () => ({
    delivery: { home_delivery: true, radius_km: 10 },
    store_hours: null,
    lead_time_days: 2,
  }),
  // Two accepted agreements, so the "Your agreements" list and its download button are both live.
  // With none the button is disabled and the section reads "No agreements recorded yet" — which is
  // one of the two things "I clicked it and nothing happened" can mean.
  // Four events, newest first, with doc names of different lengths — "PRIVACY" beside "TOS" is what
  // exposed the unaligned status column, so the sample has to contain both.
  fetchConsentHistory: async () => ({ events: [
    { docKey: 'privacy', version: '1.1', action: 'accepted', at: '2026-09-10T09:12:00Z' },
    { docKey: 'tos',     version: '1.1', action: 'accepted', at: '2026-09-10T09:12:00Z' },
    { docKey: 'tos',     version: '1.0', action: 'accepted', at: '2026-08-17T09:12:00Z' },
    { docKey: 'privacy', version: '1.0', action: 'accepted', at: '2026-08-17T09:12:00Z' },
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
  /* ── Templates: BOTH lists, because the screen is about the difference between them ──────────
     The Spattoo library is switched on and off; the baker's own are removed. Without a stub for
     `fetchMyTemplates` the Proxy answers EMPTY and "Your templates" renders its empty state — true
     to a new baker, and useless for looking at the section that carries the destructive action.
     One global arrives already excluded so the off state is on screen too. */
  fetchBakerTemplates: async () => ([
    { id: 'g1', name: 'Two-tier rose',   thumbnail_url: null, tier_count: 2, offering: 'standard', excluded: false },
    { id: 'g2', name: 'Number cake',     thumbnail_url: null, tier_count: 1, offering: 'standard', excluded: true  },
    { id: 'g3', name: 'Naked berry',     thumbnail_url: null, tier_count: 1, offering: 'standard', excluded: false },
  ]),
  /* ⚠️ Thumbnails here too, and the ids MATCH `fetchBakerCatalogue` — My templates reads its rows
     from this call and its offered state from that one, so `m1`/`m2` have to be the same templates
     in both or the toggles would attach to nothing. */
  fetchMyTemplates: async () => ([
    { id: 'm1', name: 'Anniversary gold', thumbnail_url: cakeThumb(15),  tier_count: 2, offering: 'standard', created_at: '2026-09-22T10:00:00Z' },
    { id: 'm2', name: 'Engagement ring',  thumbnail_url: cakeThumb(280), tier_count: 1, offering: 'standard', created_at: '2026-09-18T10:00:00Z' },
  ]),
  deleteBakerTemplate: async () => ({ ok: true }),

  /* ── The catalogue: what the baker CHOSE to offer ────────────────────────────────────────────
     `GET /baker/catalogue` returns BOTH kinds with `source`, because the PUT replaces the whole set
     — a screen showing only half still has to send the other half or it silently empties it. Two of
     the five start offered, so the grid shows both states without anybody tapping.
     `updateBakerCatalogue` logs what it would send: the whole catalogue, never a delta. */
  fetchBakerCatalogue: async () => ([
    { id: 'g1', name: 'Two-tier rose', thumbnail_url: cakeThumb(340), tier_count: 2, offering: 'standard', source: 'spattoo', offered: true  },
    { id: 'g2', name: 'Number cake',   thumbnail_url: cakeThumb(40),  tier_count: 1, offering: 'premium',  source: 'spattoo', offered: false },
    { id: 'g3', name: 'Naked berry',   thumbnail_url: cakeThumb(95),  tier_count: 1, offering: 'standard', source: 'spattoo', offered: false },
    { id: 'g4', name: 'Football',      thumbnail_url: cakeThumb(210), tier_count: 1, offering: 'standard', source: 'spattoo', offered: false },
    { id: 'm1', name: 'Anniversary gold', thumbnail_url: cakeThumb(15),  tier_count: 2, offering: 'standard', source: 'mine', offered: true  },
    { id: 'm2', name: 'Engagement ring',  thumbnail_url: cakeThumb(280), tier_count: 1, offering: 'standard', source: 'mine', offered: false },
  ]),
  updateBakerCatalogue: async (ids) => { console.log('PUT /baker/catalogue', ids); return { ok: true, offered_count: ids.length }; },

};

// Anything not stubbed answers with an empty shape instead of throwing.
export const EMPTY = async () => ({ events: [], items: [], flavours: [], templates: [], plans: [] });
