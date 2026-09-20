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
  // The type the scatterable GLB below needs — see its note.
  { id: 'et-scatter', slug: 'scattered_decor', name: 'Scattered',  sort_order: 4 },
  /* ⚠️ RING TYPES, and the SLUGS are the contract. CakeDesigner resolves `drip` and `cream_piping`
   * by slug (dripType / creamPipingType), and the element grid deliberately EXCLUDES both — they
   * open a ring card through openPipingPopup instead of dropping a sticker. My first attempt put
   * `top_drip` in a topper's placement_config, which produced an ordinary sticker card: no Flood
   * top, no Length/Gloss, no rim tile. The type is what routes it, not the config key.
   *   · drip        → ONE candidate (rim). The single-candidate case, where the preview tile is
   *                   a picture of a choice that does not exist.
   *   · cream_piping with rim+board → TWO candidates. The case that must KEEP its tiles on a
   *                   phone, which is the half of the condition worth proving. */
  { id: 'et-drip',   slug: 'drip',         name: 'Drip',         sort_order: 5 },
  { id: 'et-piping', slug: 'cream_piping', name: 'Cream Piping', sort_order: 6 },
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
  /* ⚠️ duplicate TRUE on the first row only, so the two-button FOOTER exists here at all.
   * Every stub had `duplicate: false`, so "Duplicate" never rendered and the footer could only ever
   * be shown with one button — which is how the widest row on the card (Duplicate + "Remove from
   * cake" side by side at 390px) stayed unreachable in the harness. Same gap this file already
   * names for the catalogue, the GLB and the edge seat: a state that cannot be reached hides every
   * bug in it. Index 0 is Fiitball; the rest stay false so the one-button footer is still testable. */
  allowed_actions: { move: true, tilt: true, color: false, delete: true, resize: true, gradient: false, duplicate: i === 0 },
  placement_config: { r: 1, scale: { max: 6, min: 0.5, step: 0.5 }, top_surface: 'stand' },
  default_color: '#F0DEB8', sort_order: i,
}));

/* ⚠️ THE CARD TOPPER STUDIO, which nothing here could reach. It is a PROCEDURAL row — tapping it
 * opens a studio instead of dropping a picture on the cake — so it carries `placement_config.
 * procedural` and no image, and it cannot come out of the `.map` above with the rest. Without it
 * the whole topper chain (compose → place → tap it → open it again) was only ever testable against
 * a real database. */
/* ⚠️ A SCATTERABLE, RECOLOURABLE GLB — the one shape of element this harness could not make, and
 * the gap that let a real bug ship. Every other stub here is an SVG data URI, so they all take the
 * TEXTURE path; the GLB path (`StickerModel`) was untestable without a database. That is the path
 * where each instance clones the cached scene, and where sharing a material across instances made a
 * scattered element render every copy in the last colour picked.
 *
 * `sample-rosette.glb` already sat in dev/ for the piping harnesses, and the dev server serves it.
 * Scatter it, give it two or three colours, and the instances must differ. */
CAT_ELEMENTS.push({
  id: 'e9', name: 'Rosette scatter', description: 'a recolourable GLB, scattered',
  element_type_id: 'et-scatter', category_id: 'cat-1',
  image_url: '/sample-rosette.glb', thumbnail_url: CAT_THUMB('#d8b7c8'), thumb_key: null,
  allowed_zones: ['top_surface', 'side'],
  // `scatter: true` is what routes a drop through placeScatter; `r` is the per-instance size.
  placement_config: { scatter: true, r: 0.45, top_surface: 'lay', side: 'hug' },
  allowed_actions: { move: true, color: true, delete: true, resize: true },
  default_color: '#C86B8A', sort_order: 10,
});

/* ⚠️ A NUMBER TOPPER ROW, so `design.ages` can be non-empty and the AGE CARD exists at all.
 * Without one, addAge is never called here, design.ages stays [], and the age card — its Duplicate,
 * its finish chooser and its remove button — could not be looked at in this harness. Same gap this
 * file already names for the catalogue, the GLB, the edge seat and the two-button footer: a state
 * that cannot be reached hides every bug in it. `number_topper` is the procedural key the row uses
 * (see addAgeFromRow in CakeDesigner). */
/* ⚠️ A PHOTO FRAME (`photoMask`), so the Photo / Border card exists in this harness at all.
 * Nothing here carried one, so "Select image", the Border dial and the whole photo-frame branch of
 * buildToolbar could only ever be looked at against a real database. Fifth state this file has had
 * to be taught (catalogue, GLB, edge seat, two-button footer, number topper) — a state that cannot
 * be reached hides every bug in it.
 *
 * `photoMask` is what routes the instance down the photo branch; no overlay, so the procedural
 * BORDER control renders (an overlay IS the border, and hides it). */
/* ⚠️ A CHOCOLATE DRIP (`top_drip`) and a CLUSTER BALL, because neither card could be reached here.
 * The drip card (Flood top / Color / Length / Gloss, and its single RIM tile) and the faux-ball card
 * (Colour · Size · Spin, Finish, Create cluster) had to be judged from source alone — the sixth and
 * seventh states this harness has had to be taught today, after the catalogue, the GLB, the edge
 * seat, the two-button footer, the number topper and the photo frame.
 *
 * `top_drip` is the placement key that routes a ring down the drip branch (Length + Gloss + Flood
 * instead of Size); `cluster` is what grows the ball into a cluster and gives the card its handle. */
CAT_ELEMENTS.push({
  id: 'e14', name: 'Chocolate drip', description: 'a rim drip with optional flooded top',
  element_type_id: 'et-drip', category_id: 'cat-1',
  image_url: CAT_THUMB('#6b4b34'), thumbnail_url: CAT_THUMB('#6b4b34'), thumb_key: null,
  allowed_zones: ['rim'],
  allowed_actions: { move: false, color: true, delete: true, resize: true },
  placement_config: { top_drip: true, r: 1 },
  default_color: '#4a2c17', sort_order: 14,
});

// Multi-zone piping: rim AND board → two candidates, so the tile row must survive on a phone.
CAT_ELEMENTS.push({
  id: 'e16', name: 'Shell border', description: 'a piped shell border, rim or board',
  element_type_id: 'et-piping', category_id: 'cat-1',
  /* ⚠️ image_url IS THE GLB for a piping ring — resolvePipingGlbs returns it as glbUrl, and the
     swept section is built from that mesh. A CAT_THUMB data-URI here handed an SVG to the GLB
     loader: four "Unexpected token '<'" errors per open. Same mistake shape as photo `mask`, which
     is a mask IMAGE url. The THUMBNAIL is the picture; image_url is the geometry. */
  image_url: '/sample-rosette.glb', thumbnail_url: CAT_THUMB('#f0e2d0'), thumb_key: null,
  allowed_zones: ['rim', 'board'],
  allowed_actions: { color: true, delete: true, resize: true },
  placement_config: { r: 1, bottom_y_adjustable: true },
  default_color: '#F5E6C8', sort_order: 16,
});

CAT_ELEMENTS.push({
  id: 'e15', name: 'Faux ball', description: 'a metallic ball you can scatter into a cluster',
  element_type_id: 'et-topper', category_id: 'cat-1',
  image_url: CAT_THUMB('#c9a227'), thumbnail_url: CAT_THUMB('#c9a227'), thumb_key: null,
  allowed_zones: ['top_surface', 'side'],
  allowed_actions: { move: true, tilt: true, color: true, delete: true, resize: true, duplicate: true },
  placement_config: { cluster: true, r: 0.5, scale: { max: 3, min: 0.3, step: 0.05 },
                      top_surface: 'stand', side: 'hug' },
  default_color: '#C9A227', sort_order: 15,
});

CAT_ELEMENTS.push({
  id: 'e13', name: 'Circle photo frame', description: 'a photo set into a round frame',
  element_type_id: 'et-image', category_id: 'cat-1',
  image_url: CAT_THUMB('#e9e2ef'), thumbnail_url: CAT_THUMB('#e9e2ef'), thumb_key: null,
  allowed_zones: ['top_surface', 'side'],
  allowed_actions: { move: true, tilt: true, color: true, delete: true, resize: true, duplicate: true },
  /* ⚠️ `photo.mask` IS A MASK IMAGE URL, not a keyword. frameMaskOf() feeds it straight to
     loadImage(), and BorderBacking / PhotoBacking take it as maskUrl — so 'circle' produced eight
     "Could not load circle?cors=1" page errors and a frame with no backing. A data URI keeps the
     harness self-contained (no network, no CORS): white disc = keep, transparent = cut away. */
  placement_config: { r: 1, scale: { max: 6, min: 0.5, step: 0.5 }, top_surface: 'stand',
                      photo: { mask: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="62" fill="#fff"/></svg>')}` } },
  default_color: '#1a1a1a', sort_order: 13,
});

CAT_ELEMENTS.push({
  id: 'e12', name: 'Number topper', description: 'a number cut from card',
  element_type_id: 'et-topper', category_id: 'cat-1',
  image_url: CAT_THUMB('#cbb7e0'), thumbnail_url: CAT_THUMB('#cbb7e0'), thumb_key: null,
  allowed_zones: ['top_surface'],
  allowed_actions: { move: true, delete: true, resize: true },
  placement_config: { number_topper: { digits: '5' } },
  default_color: '#B08CD9', sort_order: 12,
});

CAT_ELEMENTS.push({
  id: 'e8', name: 'Card topper studio', description: 'numbers and names cut from card',
  element_type_id: 'et-topper', category_id: 'cat-1',
  image_url: CAT_THUMB('#f0d9dd'), thumbnail_url: CAT_THUMB('#f0d9dd'), thumb_key: null,
  allowed_zones: ['top_surface'],
  allowed_actions: { move: true, delete: true, resize: true },
  placement_config: { procedural: 'card_topper' },
  default_color: '#D94F6E', sort_order: 9,
});

/* An ACRYLIC TOPPER row — `procedural: 'writing'` plus the `placement_config.acrylic` the Acrylic
 * Topper Studio writes. Without one, the only way to reach the acrylic writing card here was to add a
 * cream message and switch Look, which is a DIFFERENT path: a row-seeded message carries `lockLook`,
 * so the Look switch is hidden and the card is the one a customer actually meets.
 *
 * Deliberately authors nothing but the words. Face, size, sheet, bar and legs are left unsaid so
 * this row shows what ACRYLIC_DEFAULTS seed — which is the thing worth looking at.
 */
CAT_ELEMENTS.push({
  id: 'e10', name: 'Acrylic topper', description: 'words cut from mirror acrylic',
  element_type_id: 'et-topper', category_id: 'cat-1',
  image_url: CAT_THUMB('#d9c58a'), thumbnail_url: CAT_THUMB('#d9c58a'), thumb_key: null,
  allowed_zones: ['top_surface', 'side'],
  allowed_actions: { move: true, delete: true, resize: true },
  placement_config: { procedural: 'writing', acrylic: { text: { default: 'Happy Birthday' } } },
  sort_order: 8,
});

/* ⚠️ AN EDGE-SEATED FIGURE, which nothing here could make. Every row above seats on the top surface
 * or hugs a wall, so the `perch`/`verge` modes — and with them `edgeSeatSeed`, the shared front-edge
 * seed both the add path and the chooser's move path call — were unreachable without a database.
 *
 * That gap let a crash ship. `edgeSeatSeed` took the front edge as `kind === 'rect' ? halfD : radius`,
 * and an OUTLINE tier (heart, butterfly, oval, hexagon, glyph) carries no `radius` at all, so the seat
 * was NaN; `nearestOnPolygon` cannot beat its Infinity seed with a NaN distance, returned null, and the
 * designer died on `p.x` with the WebGL context. Reported by a baker perching a fondant doll on a heart.
 *
 * Open the case it broke on:  ?shape=heart&style=smooth&catalog=1  (and ?shape=round for the control). */
CAT_ELEMENTS.push({
  id: 'e11', name: 'Fondant doll', description: 'a figure that sits on the cake edge',
  element_type_id: 'et-topper', category_id: 'cat-1',
  image_url: CAT_THUMB('#e8b6c2'), thumbnail_url: CAT_THUMB('#e8b6c2'), thumb_key: null,
  allowed_zones: ['rim', 'top_surface'],
  allowed_actions: { move: true, tilt: true, color: false, delete: true, resize: true },
  placement_config: {
    // A hero figure: one per surface, so it is placed by CHOOSING a slot ("Edge" for the rim) rather
    // than dropped anywhere — which is the path that runs edgeSeatSeed, and the path that crashed.
    single_per_slot: true,
    r: 1, scale: { max: 6, min: 0.5, step: 0.5 },
    rim: 'perch', perch: { tilt_deg: 12 },   // straddles the edge, leaning back a little
    top_surface: 'stand',
  },
  default_color: '#E8B6C2', sort_order: 11,
});

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
  // Kept chocolate pieces, for the "My decorations" shelf. Same trap as fetchTags below and the
  // second time it has been paid for: the Proxy answers with an OBJECT, `rows ?? []` keeps it
  // because `{}` is not nullish, and opening Decorations threw
  // "(savedGarnishes ?? []).filter is not a function" — the whole panel, not just the shelf.
  fetchGarnishes:      async () => ([]),
  /* ⚠️ AN ARRAY, not the Proxy's empty object. The shelf `.map`s what comes back, so a `{}` from the
     catch-all stub took the whole designer down the moment a card topper row existed — the same
     shape `fetchGarnishes` is stubbed for, and for the same reason. */
  fetchCardToppers:    async () => ([]),
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

/* ⚠️ `?style=` OPENS THE REAL DESIGNER ON A CREAM STYLE, and `?assets=` points it at a local copy of
 * the assets bucket. Together they are the only way to see a MODELLED style (wall:'strokes', whose
 * mesh is an R2 key) in the app rather than in a geometry harness — and "it renders in the harness"
 * has been wrong about the app often enough in this project to be worth the two query keys. */
const STYLE_KEY = PARAMS.get('style');
/* ⚠️ `?shape=` TAKES A FAMILY, not a catalog key. Every shape but round and rect is an admin-authored
 * DB row, so a dev harness with no database cannot name one — but a design tier carries its own
 * geometry (`shapeFamily` + `shapeConfig`, see cakeShapes.js), which is exactly what a row would hand
 * it. `?shape=heart` is therefore the same cake the catalog would build, minus the row. */
const SHAPE = PARAMS.get('shape') || 'round';
const shapeTier = SHAPE === 'rect' ? { shape: 'rect', width: 2.4, depth: 1.8 }
  : SHAPE !== 'round' ? { shapeFamily: SHAPE, shapeConfig: {}, width: 2.4, depth: 2.4 }
  : { shape: 'round', radius: 1.2 };
const styledDesign = STYLE_KEY ? {
  tiers: [{
    color: '#F1EEDC', height: 1.45, ...shapeTier,
    frostingType: 'buttercream', frostingStyle: STYLE_KEY,
  }],
} : null;

createRoot(document.getElementById('root')).render(
  <CakeDesigner apiClient={apiClient} cfAssetsBase={PARAMS.get('assets') ?? ''} onSaveTemplate={onSaveTemplate}
                initialDesign={reloadDesign ?? styledDesign ?? stripedDesign} />,
);
