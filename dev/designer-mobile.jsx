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

/* ⚠️ ?catalog=1 — SEVERAL element types, which is the only way to see the picker's grouping.
 *
 * The football stub is one type holding one element, so the panel it produced had nothing to group
 * and the reported screen — CREAM PIPING, FOOD FOIL ("No elements yet"), BUTTERFLY ("No elements
 * yet"), IMAGE TOPPER — could not be reached here at all.
 *
 * Note WHERE the empty groups come from. `activeElementTypeIds` is built from the elements actually
 * loaded, so a type with no elements never renders; FOOD FOIL and BUTTERFLY were on screen because
 * they DO hold elements and the SEARCH removed them. Reproducing that needs types that are
 * populated and non-matching, which is what these are: search "clo" and only the clothes match.
 */
const CAT_THUMB = c => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${c}"/></svg>`)}`;
const CAT_TYPES = [
  { id: 'et-topper',  slug: 'topper',       name: 'Cake Topper',  sort_order: 0 },
  { id: 'et-foil',    slug: 'food_foil',    name: 'Food Foil',    sort_order: 1 },
  { id: 'et-fly',     slug: 'butterfly',    name: 'Butterfly',    sort_order: 2 },
  { id: 'et-image',   slug: 'image_topper', name: 'Image Topper', sort_order: 3 },
].map(t => ({ ...t,
  placement_rules: { zones: ['top_surface'], per_tier: false, max_per_zone: 4, top_tier_only: false, requires_frosting: false },
  default_allowed_actions: { move: true, color: false, style: false, delete: true, resize: true, fontSize: false, duplicate: false },
}));
const CAT_ELEMENTS = [
  ['e1', 'Fiitball',      'et-topper', '#c9d6c4', 'football sport'],
  ['e2', 'Crown',         'et-topper', '#e8d7a8', 'gold crown'],
  ['e3', 'Gold Leaf',     'et-foil',   '#e6c86a', 'edible foil'],
  ['e4', 'Blue Wing',     'et-fly',    '#a8c4e8', 'butterfly wing'],
  ['e5', 'baby shorts',   'et-image',  '#7fc3d6', 'baby clothes'],
  ['e6', 'baby romper',   'et-image',  '#8fd6cf', 'baby clothes'],
  ['e7', 'fondant baby',  'et-image',  '#e8a8b8', 'baby clothes dress'],
].map(([id, name, typeId, colour, description], i) => ({
  id, name, description, element_type_id: typeId, category_id: 'cat-1',
  image_url: CAT_THUMB(colour), thumbnail_url: CAT_THUMB(colour), thumb_key: null,
  allowed_zones: ['top_surface', 'side'],
  allowed_actions: { move: true, tilt: true, color: false, delete: true, resize: true, gradient: false, duplicate: false },
  placement_config: { r: 1, scale: { max: 6, min: 0.5, step: 0.5 }, top_surface: 'stand' },
  default_color: '#F0DEB8', sort_order: i,
}));

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
  /* ⚠️ THE REAL "Fiitball" ROW, copied from the dev database.
   *
   * Its two reported faults could not be reproduced here at all, because this harness stubs the
   * catalogue empty — so there was no element to place and every diagnosis had to be read out of the
   * source, which produced three wrong answers in a row.
   *
   * allowed_zones includes `board`; allowed_actions has resize TRUE and tilt FALSE. The panel showed
   * the opposite of both. Only a placed element can settle why. */
  fetchElementTypes:   async () => (PARAMS.has('catalog') ? CAT_TYPES : PARAMS.has('football') ? [{
    id: 'et-topper', slug: 'topper', name: 'Cake Topper', sort_order: 0,
    placement_rules: { zones: ['top_surface'], per_tier: false, max_per_zone: 1, top_tier_only: true, requires_frosting: false },
    default_allowed_actions: { move: true, color: true, style: false, delete: true, resize: true, fontSize: false, duplicate: false },
  }] : []),
  fetchElementCategories: async () => ((PARAMS.has('football') || PARAMS.has('catalog'))
    ? [{ id: 'cat-1', name: 'Sport', slug: 'sport', sort_order: 0, element_type_id: 'et-topper' }] : []),
  fetchElements:       async () => (PARAMS.has('catalog') ? CAT_ELEMENTS : PARAMS.has('football') ? [{
    id: 'fcd54dcb-adc4-4271-bc88-eb35e8ecdfc1', name: 'Fiitball',
    // A GLB the harness can actually serve; the geometry is irrelevant to which CONTROLS appear.
    image_url: '/sample-topper.glb', thumbnail_url: null, thumb_key: null,
    element_type_id: 'et-topper', category_id: 'cat-1',
    allowed_zones: ['top_surface', 'board'],
    // ?colour=1 flips `color` on, which is the state five real elements are in and the only
    // way to reach the colour control this card used to lack.
    allowed_actions: { move: true, tilt: false, color: PARAMS.has('colour'), delete: true, resize: true, gradient: false, duplicate: false },
    placement_config: { r: 1, board: 'hug', scale: { max: 6, min: 1, step: 0.5 },
                        metalness: 0.0018626748, roughness: 0.28121553,
                        top_surface: 'stand', single_per_slot: true },
    default_color: '#F0DEB8', sort_order: 0,
  }] : []),
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
  // ⚠️ Keep the THUMBNAIL and the SNAPSHOT where a test can read them. They come from two different
  // places — the picture from an off-screen canvas, the data from buildDesignSnapshot — and the whole
  // class of bug here is the two disagreeing: a saved cake that reloads plain while its thumbnail
  // still shows the decoration (see designSnapshot.js on grass).
  window.__lastSave = { name: t.name, designJson: t.designJson };
  window.__lastThumb = t.thumbnailBlob;
  console.log('[harness] saved template', t.name);
};

/* ⚠️ A STRIPED cake, reachable by URL: ?stripes=pastel | unicorn | sunset | rainbow.
 *
 * The wall treatment is several files deep — design → toCanvasConfig → CakeCanvas → CakeTier →
 * TierBody → the shader — and every one of those is a place it can be dropped silently. It was
 * already dropped once, in toCanvasConfig, where it saved and reloaded perfectly while drawing
 * nothing. One URL that renders the finished thing is the cheapest way to know the whole chain is
 * connected. */
/* ?reload=1 — hydrate from a SAVED SNAPSHOT in localStorage, exactly the way reopening an order does
 * (`loadDesign(order.design_snapshot)`). Save a cake, stash its designJson, reload: whatever survives
 * that is what a baker gets back when they edit their order. Nothing else exercises
 * buildDesignSnapshot → normalizeDesign → toCanvasConfig → the shader end to end. */
const RELOAD_KEY = 'spattoo-dev-design';
const reloadDesign = PARAMS.has('reload')
  ? (() => { try { return JSON.parse(localStorage.getItem(RELOAD_KEY) || 'null'); } catch { return null; } })()
  : null;

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
                initialDesign={reloadDesign ?? stripedDesign} />,
);
