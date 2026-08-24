import { createRoot } from 'react-dom/client';
import { CakeDesigner } from '../src/index.js';
import { STRIPE_PRESETS } from '../src/designer/stripePresets.js';

/* ── The real designer, on a phone, against a stubbed API. Open /designer-mobile.html ────────────
 *
 * dev/main.jsx mounts the designer behind AuthGate against api.spattoo.dev, which means a login and
 * a captcha before you can look at a nav bar. That is a long way to go to check a 56px strip, and it
 * is why the mobile bottom nav shipped for a long time without anybody seeing it at a real phone
 * width — the same gap dev/settings.jsx was written to close for the settings panel.
 *
 * Stubbed with a Proxy rather than by hand: anything not named below answers with an empty shape
 * instead of throwing, so a new apiClient method never breaks this harness. Explicit stubs are only
 * for what the chrome needs to render — this is for looking at the FRAME, not the cake.
 *
 * Give it a phone viewport (device toolbar, or a narrow window): the designer switches on
 * `windowWidth <= 640`, so a wide window shows the desktop rail and none of what this is for.
 */

const CAPS = [
  'design:create', 'order:view', 'order:manage', 'customer:manage',
  // ⚠️ template:manage gates BOTH "Save as Template" entries — the Actions sheet item and the
  // desktop button. Without it the entire save flow was unreachable here, and with it the offer to
  // record a reel that now follows a successful save.
  'template:manage',
  'element:manage', 'store:manage', 'billing:manage',
];

// Explicit branches, not a lookup with `??`: `{ none: null }['none']` IS null, and `null ?? default`
// falls straight back to the default — so the one option that has to produce null was the one
// option that could not.
const PARAMS = new URLSearchParams(location.search);
// ?name=… overrides the bakery name, so the header can be looked at with the long names real bakers
// actually have ("Sweet Sensations Cakes & Bakes"), not only with a short fixture that never
// exercises the overflow.
const BAKER_NAME = PARAMS.get('name') || 'Sample Bakery';
const LOGO_PARAM = PARAMS.get('logo');
const LOGO_SRC = LOGO_PARAM === 'none' ? null
               : LOGO_PARAM === 'wide' ? '/sample-logo-wordmark.png'
               : '/feelings-flavours-logo.png';

const STUBS = {
  // A baker with every capability, so the strip and the More sheet are both fully populated —
  // the busiest case, which is the one that used to overflow.
  fetchMe: async () => ({
    id: 'u1', role: 'owner', capabilities: CAPS,
    baker: { id: 'b1', name: BAKER_NAME, slug: 'sample' },
  }),
  // The real contract is { baker, user } — CakeDesigner reads `baker` off the result and ignores a
  // flat object entirely. Stubbed flat, this harness ran with NO baker profile at all: no name, no
  // logo, no brand colour, and an avatar showing '?'. Which meant the one thing it looked like it
  // was exercising — per-baker branding — was the one thing it never touched.
  fetchBakerProfile: async () => ({
    baker: {
      name: BAKER_NAME, slug: 'sample',
      primary_color: '#2C4433', accent_color: '#6B8C74',
      // A real mark by default, so the branded path is what the harness shows — null meant every
      // screenshot was the no-logo fallback, the same gap dev/storefront.jsx had to close.
      //
      // `?logo=none` switches to the TEXT fallback, and `?logo=wide` to a ~6:1 wordmark. Both paths
      // matter and they fail differently: the mark is capped by height, the wordmark by width, and
      // the text is a different size again. A harness that can only show one of the three is how a
      // branch goes unlooked-at for months.
      logo_url: LOGO_SRC, storefront_published: true,
      // ⚠️ A catalogue author, so the reel recorder is REACHABLE here. It is gated on this flag, and
      // a harness that cannot reach a state hides every bug in it — this feature shipped three times
      // before anybody could see it, twice with a defect that one load of this page would have
      // caught. `?author=no` switches it off to check the gate still hides it.
      is_catalog_author: PARAMS.get('author') !== 'no',
    },
    user: { firstName: 'Asha', lastName: 'Otto' },
  }),
  fetchBakerSettings:  async () => ({ delivery: { home_delivery: true, radius_km: 10 }, lead_time_days: 2 }),
  /* ⚠️ The reel entitlements are BOTH switchable, because they are separate questions and each has
   * a branch nobody could otherwise look at:
   *
   *   ?capture=yes  — reel_capture WITHOUT is_catalog_author. This is how every ordinary paying
   *                   baker reaches the feature; pair it with ?author=no to see the path they get.
   *   ?branding=no  — reel_branding off, so the frames carry "made with Spattoo" instead of the
   *                   bakery's name. Defaulting this to ON meant the free mark — the version most
   *                   bakers will actually publish — rendered nowhere in the harness. */
  fetchEntitlements:   async () => ({ ent: {
    premium_themes: false, edible_print_studio: true,
    reel_capture:  PARAMS.get('capture') === 'yes',
    reel_branding: PARAMS.get('branding') !== 'no',
  } }),
  fetchElementTypes:   async () => ([]),
  fetchElements:       async () => ([]),
  fetchTemplates:      async () => ([]),
  fetchCakeShapes:     async () => ([]),
  fetchMaterials:      async () => ([]),
  fetchTextures:       async () => ([]),
  fetchTextStyles:     async () => ([]),
  fetchBakerFlavours:  async () => ({ curated: true, flavours: [], visibility: {} }),
  // Real occasion tags. The catch-all Proxy below answers unknown methods with an OBJECT, and the
  // save-as-template modal maps over this — so without a stub the modal threw
  // "filterTags.filter is not a function" and had never once opened in this harness.
  fetchTags:           async () => ([
    { id: 't1', name: 'Birthday',  slug: 'birthday',  category: 'occasion' },
    { id: 't2', name: 'Wedding',   slug: 'wedding',   category: 'occasion' },
    { id: 't3', name: 'Anniversary', slug: 'anniversary', category: 'occasion' },
  ]),
};

const apiClient = new Proxy(STUBS, {
  get: (t, k) => t[k] ?? (async () => ({ items: [], events: [], templates: [], plans: [], flavours: [] })),
});

/* ⚠️ onSaveTemplate is a PROP, not an apiClient method, so the Proxy above cannot stand in for it.
 * Without it "Save as Template" answers "Saving templates is unavailable here" and the whole success
 * path — including the offer to record a reel, which only appears there — was unreachable in the
 * harness. Resolves rather than rejects; `?save=fail` exercises the error branch. */
const onSaveTemplate = async t => {
  if (PARAMS.get('save') === 'fail') throw new Error('Could not save (stubbed failure).');
  console.log('[harness] saved template', t.name, t);
};

/* ⚠️ A STRIPED cake, reachable by URL: ?stripes=pastel | unicorn | sunset | rainbow.
 *
 * The wall treatment is several files deep — design → toCanvasConfig → CakeCanvas → CakeTier →
 * TierBody → the shader — and every one of those is a place it can be dropped silently. It was
 * already dropped once, in toCanvasConfig, where it saved and reloaded perfectly while drawing
 * nothing. One URL that renders the finished thing is the cheapest way to know the whole chain is
 * connected. */
const STRIPE_KEY = PARAMS.get('stripes');
const stripedDesign = STRIPE_KEY ? {
  tiers: [{
    color: '#F1EEDC', radius: 1.2, height: 1.45, shape: 'round',
    frostingType: 'buttercream', frostingStyle: 'smooth',
    stripes: STRIPE_PRESETS[STRIPE_KEY] ?? STRIPE_PRESETS.pastel,
  }],
} : null;

createRoot(document.getElementById('root')).render(
  <CakeDesigner apiClient={apiClient} cfAssetsBase="" onSaveTemplate={onSaveTemplate}
                initialDesign={stripedDesign} />,
);
