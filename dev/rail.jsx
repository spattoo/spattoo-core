import { createRoot } from 'react-dom/client';
import { CakeDesigner } from '../src/index.js';
import { HARNESS_ASSETS_BASE } from './scene.js';
import { STUBS as SETTINGS_STUBS } from './settingsStubs.js';
import { applyCakeShapeConfig } from '../src/index.js';

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
// `?settings` seeds the store data SettingsPanel reads, so Store Settings opened from the real rail
// shows real sections rather than an error — the frame beside the rail is what is being judged.
const withSettings = new URLSearchParams(location.search).has('settings');
/* `?caps=customer` answers /me with a CUSTOMER's capability set, so the rail renders the five items a
   signed-in customer actually gets — New Cake, Templates, Decorations, Share (design:create) and
   Uploads (element:manage) — instead of a baker's eleven.

   ⚠️ WITHOUT THIS THERE IS NO WAY TO LOOK AT THE CUSTOMER'S RAIL. `capabilities` stays null when /me
   is not stubbed and hasCap reads null as "everything allowed", so every item renders. That is the
   right default for inspecting the full rail and exactly wrong for judging the customer's, where the
   complaint is that five items spread down a blade sized for twelve. `?customer` does NOT do this —
   it only sets orderMode, which gates nothing in the rail. */
const CUSTOMER_CAPS = ['design:create', 'element:manage'];
const capsOverride = new URLSearchParams(location.search).get('caps') === 'customer'
  ? { fetchMe: async () => ({ id: 'u1', role: 'customer', capabilities: CUSTOMER_CAPS }) }
  : {};

/* ⚠️ TEMPLATES, because the START CHOOSER hands off to them and the Proxy below answers `null` for
   every unstubbed method — so the flyout opened on "No templates yet" and the handoff could only
   ever be judged against an empty grid. The shape follows dev/customiser.jsx's stub; `design` is a
   real one-tier snapshot (dev/docked-panels.jsx's shape) so tapping a card exercises loadDesign()
   rather than falling through the `if (templateDesign)` guard and silently doing nothing. */
const TPL_DESIGN = (color) => ({
  tiers: [{ shape: 'round', radius: 1.2, height: 2.1, color,
            frostingType: 'buttercream', frostingStyle: 'smooth',
            topPipings: [], bottomPipings: [], creamLayers: [] }],
  stickers: [], texts: [], garnishes: [],
});
/* ⚠️ THE LIST CARRIES NO `design`, AND THAT IS THE CONTRACT — not a shortcut taken in the stub.
   GET /api/templates stopped selecting it (spattoo-backend `lib/templateList.js`): a list row is
   what BROWSING needs, and the design is fetched by id for the ONE template somebody opens. A stub
   that still handed the whole design over would load a card instantly here and only here, and the
   by-id path — the entire point of the change — would never run in the harness that exists to show
   it running. See plans/template-browsing-at-scale.md, Layer 1.

   `t1` is `offering: 'premium'` so the Premium badge has something to draw on; it moved onto the
   thumbnail when the card's name row went away. */
/* ⚠️ A VOCABULARY, because without one the funnel has NO CHIPS AT ALL and the filter cannot be
   judged here. The Proxy answers `null` for an unstubbed `fetchTags`, so `filterTags` stayed empty
   and every category rendered nothing — a harness that could not show the control it was opened to
   look at.
   Two rows exist to make the check able to FAIL rather than to pass:
     `age_group` — deliberately suppressed (CATS_HANDLED_ELSEWHERE), and CARRIED by a template
       below. If nothing carried it, its chip would be missing because nothing matches it, and a
       suppression check would pass by accident.
     `dietary`   — a category CAT_ORDER does not name. It must render LAST rather than vanish;
       that is the whole difference between the suppression list and the whitelist it replaced. */
const TAGS_STUB = [
  { id: 'g1', slug: 'birthday',    name: 'Birthday',       category: 'occasion',     sort_order: 10 },
  { id: 'g2', slug: 'anniversary', name: 'Anniversary',    category: 'occasion',     sort_order: 30 },
  { id: 'g3', slug: 'sorry',       name: 'Sorry',          category: 'emotion',      sort_order: 10 },
  { id: 'g4', slug: 'with-you',    name: "We're with you", category: 'emotion',      sort_order: 75 },
  { id: 'g5', slug: 'mother',      name: 'Mom',            category: 'relationship', sort_order: 10 },
  { id: 'g6', slug: 'rustic',      name: 'Rustic',         category: 'style',        sort_order: 10 },
  { id: 'g7', slug: 'pink',        name: 'Pink',           category: 'color',        sort_order: 10 },
  { id: 'g8', slug: 'kids-4-12',   name: 'Kids (4–12)',    category: 'age_group',    sort_order: 10 },
  { id: 'g9', slug: 'eggless',     name: 'Eggless',        category: 'dietary',      sort_order: 10 },
];

/* ⚠️ `tag_slugs` ON EVERY ROW, because `offeredTags` narrows the vocabulary to tags at least one
   LOADED TEMPLATE carries — a tags stub on its own still renders nothing. Between them these three
   carry all nine slugs above, so every group has something to match. */
const TEMPLATES_FULL = [
  /* ⚠️ `search_slugs` ON THE THREE REAL ROWS, because that is the half of search this harness could
     not reach otherwise. It is what the server derives from the DESIGN — the decorations on the cake
     and the words piped on it — so a cake is findable by what is ON it rather than only by its name.
     On dev, `Dino` carries ["dinosaur","palm tree","color triangle banner"]; these mirror that shape.
     ⚠️ Only these three, matching the note below: the 45 fillers stay untagged so the counts other
     assertions pin do not move. `search_slugs` feeds the SEARCH BOX only, never the chips. */
  { id: 't1', name: 'Rose & Pistachio',  tier_count: 1, thumbnail_url: '/sample-cake-1.png', attrs: { min_weight_kg: 1 },   offering: 'premium',
    tag_slugs: ['birthday', 'sorry', 'mother', 'pink'],
    search_slugs: ['sugar rose', 'pistachio crumb', 'happy birthday amma'],  design: TPL_DESIGN('#F6DCE2') },
  { id: 't2', name: 'Cocoa Drip',        tier_count: 1, thumbnail_url: '/sample-cake-2.png', attrs: { min_weight_kg: 1.5 },
    tag_slugs: ['anniversary', 'with-you', 'rustic', 'kids-4-12'],
    search_slugs: ['chocolate drip', 'gold leaf', 'palm tree'],              design: TPL_DESIGN('#C9A227') },
  { id: 't3', name: 'Buttercream Bloom', tier_count: 1, thumbnail_url: '/sample-cake-2.png', attrs: null,
    tag_slugs: ['birthday', 'eggless'],
    search_slugs: ['classic shell border', 'daisy flower half'],             design: TPL_DESIGN('#EDE7DA') },
  /* ⚠️ ENOUGH OF THEM TO SCROLL. Three templates cannot exercise a grid that reveals a page at a
     time: the first page would be the whole catalogue and the sentinel would never fire, so the
     check would pass without the feature existing. Forty-five filler rows put the count either side
     of the 24 page size twice over.
     ⚠️ THEY CARRY NO tag_slugs, deliberately. The three above are what the CATEGORY chip checks
     read, and tagging these would change every count those assertions pin. */
  /* ⚠️ THE BAKER'S OWN, AND THEY LIVE HERE RATHER THAN ONLY IN THE CATALOGUE STUB. They used to be
     invented separately as `own-1`/`own-2`, which meant the flyout browsed a list that did not
     contain them while the catalogue screens managed two designs the flyout had never heard of —
     "one catalogue rather than two unrelated lists" was not true for the baker's own work. Filtering
     the flyout by `offered` made that visible immediately: the one own design in the catalogue could
     never appear in it. */
  { id: 'own-1', name: 'Anniversary gold', tier_count: 2, thumbnail_url: '/sample-cake-1.png', attrs: null,
    tag_slugs: ['anniversary'],                                    design: TPL_DESIGN('#C9A227') },
  { id: 'own-2', name: 'Engagement ring',  tier_count: 1, thumbnail_url: '/sample-cake-2.png', attrs: null,
    tag_slugs: [],                                                 design: TPL_DESIGN('#EDE7DA') },
  ...Array.from({ length: 45 }, (_, i) => ({
    id: `f${i + 1}`,
    name: `Filler ${String(i + 1).padStart(2, '0')}`,
    tier_count: 1,
    thumbnail_url: i % 2 ? '/sample-cake-2.png' : '/sample-cake-1.png',
    attrs: null,
    design: TPL_DESIGN('#EDE7DA'),
  })),
];
/* ⚠️ WHAT IS IN THE CATALOGUE, IN ONE PLACE. `GET /api/templates` now labels every row with
   `offered` and `source` (spattoo-api lib/templateList.js), and the flyout filters on the first —
   so a stub without these flags renders an EMPTY Catalogue and a filter bug and a working filter
   look identical. One Spattoo cake and one of the baker's own are in it, so both screens have
   something to show at rest: the flyout draws these two, Library draws the other 48. */
const OFFERED_IDS = new Set(['t1', 'own-1']);
const TEMPLATES_STUB = [
  ...TEMPLATES_FULL.map(({ design, ...t }) => ({
    ...t,
    source:  t.id.startsWith('own-') ? 'mine' : 'spattoo',
    offered: OFFERED_IDS.has(t.id),
  })),
  /* ⚠️ A PHOTOGRAPH IN THE CATALOGUE AT REST, because without one this harness cannot reach the
     photo paths at all — and those are the ones that were broken. A photo tile OPENS (enlarged
     view + "Request quote" / "Create order for a customer"); a design tile PICKS. The two gestures
     are different code, and a stub catalogue of designs only exercises half of it.

     `offered: true` is load-bearing: the flyout filters on it, so an un-offered photo would sit in
     Library and never appear on the surface being tested.

     ⚠️ `thumbnail_key` MUST BE HERE. The baker's "create order for a customer" seeds the order from
     `t.thumbnail_key` (the picture is already in R2, so it is referenced rather than re-uploaded).
     Without it the code still opens the order — deliberately — but with no photo attached, so a
     harness missing this field would exercise the degraded path and look like it passed.

     No `design`, matching migration 116's CHECK: a photo has none, which is exactly why tapping one
     used to fall through `startFromTemplate`'s early return and do nothing. */
  {
    id: 'photo-1', name: 'Isomalt shard cake', type: 'photo',
    tier_count: null, thumbnail_url: '/sample-cake-3.png',
    thumbnail_key: 'catalogue/photos/stub-isomalt.webp',
    attrs: null, offering: 'standard', source: 'mine', offered: true,
  },
];
/* ⚠️ `fetchTemplate` HAS TO BE STUBBED NOW. The Proxy below answers anything unstubbed with
   `async () => null`, so without this the card's by-id fallback resolves null, `templateDesign`
   stays null, and CLICKING A TEMPLATE SILENTLY DOES NOTHING — no error, no log, just a flyout that
   will not close. That is the exact failure this harness is here to make visible. */
/* ⚠️ THE CATALOGUE SCREENS NEED STUBS OR THEY OPEN ON NOTHING. The Proxy below answers anything
   unstubbed with `async () => null`, which is the same trap this file already warns about for
   `fetchTemplate`: Library and Catalogue would render their empty states and the submenu would look
   like it led nowhere. Keyed to the SAME ids as TEMPLATES_STUB, so what the flyout browses and what
   the catalogue screens manage are one catalogue rather than two unrelated lists.
   Two offered at rest (one Spattoo cake, one of the baker's own), so both states are on screen
   before anybody taps. */
/* ⚠️ MUTABLE, AND THAT IS THE POINT — a frozen catalogue cannot test the thing most worth testing.
   `PUT /baker/catalogue` REPLACES the set, and "move to library" builds the new set from a FRESH
   `GET /baker/catalogue` rather than from the tiles on screen (see moveToLibrary in CakeDesigner).
   With a constant stub the second removal re-read the ORIGINAL catalogue and correctly computed a
   set still containing the cake removed first — so the assertion guarding against emptying the
   catalogue could never pass, and the harness looked like a product bug. The stub now remembers
   what was written, exactly as the API would. */
let CATALOGUE_STUB = TEMPLATES_STUB.map(t => ({
  id: t.id, name: t.name, thumbnail_url: t.thumbnail_url, tier_count: t.tier_count,
  offering: t.offering ?? 'standard', source: t.source, offered: t.offered,
  /* ⚠️ `type` AND `thumbnail_key` TRAVEL, because `GET /api/baker/catalogue` returns both and this
     stub stands in for that route. Dropping them here would make Library unable to tell a photo
     from a design — and a photo opened from the Library shelf would have a picture and no key to
     order from, which is a real bug the real route was changed to prevent. A stub that is kinder
     than the API hides exactly the failures it exists to surface. */
  type: t.type ?? 'basic', thumbnail_key: t.thumbnail_key ?? null,
  /* ⚠️ THE SEARCHABLE FIELDS TRAVEL HERE TOO, or Library's search box is name-only IN THE HARNESS
     and looks broken for a reason the product does not have. `GET /api/baker/catalogue` returns
     these now; a stub poorer than the API hides exactly the behaviour it exists to exercise —
     the same trap as the missing `createManualOrder` stub. */
  tag_slugs: t.tag_slugs ?? [], search_slugs: t.search_slugs ?? [], attrs: t.attrs ?? null,
}));
const MY_TEMPLATES_STUB = CATALOGUE_STUB.filter(t => t.source === 'mine')
  .map(({ source, offered, ...t }) => ({ ...t, created_at: '2026-09-22T10:00:00Z' }));

const templatesOverride = {
  fetchTemplates: async () => TEMPLATES_STUB,
  /* ⚠️ `?slowpick=800` AND `?failpick` EXIST BECAUSE A ZERO-LATENCY STUB CANNOT SHOW A WAIT.
     Picking a template awaits this call — the list row carries no `design`, deliberately — and in
     the app that is a ~1s network round trip with a spinner on the tapped tile. Here it resolved in
     a single microtask, so `setPickingId` and its clear landed in one flush and the spinner never
     reached the DOM: sampled every 25ms across 1.5s, ZERO frames showed it. That reads exactly like
     the feature being broken, which is the trap this harness exists to avoid.

     `?failpick` resolves null instead, which is the path `startFromTemplate` takes when a fetch
     fails — the one occasion nothing is going to happen, and the only way to prove the `finally`
     stops the spinner rather than leaving it turning for ever. */
  fetchTemplate:  async (id) => {
    const q = new URLSearchParams(location.search);
    const delay = Number(q.get('slowpick') ?? 0);
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
    if (q.has('failpick')) return null;
    return TEMPLATES_FULL.find(t => t.id === id) ?? null;
  },
  // An ARRAY, not an envelope: CakeDesigner takes `fetchTags` at face value only when Array.isArray,
  // and the save-as-template modal calls `filterTags.filter()` on it.
  fetchTags:      async () => TAGS_STUB,

  // Templates ▸ Library and Templates ▸ Catalogue.
  /* ⚠️ WITHOUT THIS THE UPLOAD BUTTON DOES NOT EVEN APPEAR. The control is gated on the method
     existing (`apiClient?.uploadCataloguePhoto`), because a released baker app predating it cannot
     honour the call — so an unstubbed harness shows no button and looks like the feature was never
     built. Adds to the stub catalogue so the grid changes, which is the thing worth watching. */
  uploadCataloguePhoto: async ({ name, thumbnail_url }) => {
    console.log('[harness] POST /baker/templates (photo)', { name, thumbnail_url });
    CATALOGUE_STUB = [...CATALOGUE_STUB, {
      id: `photo-${Date.now()}`, name, thumbnail_url: '/sample-cake-1.png',
      tier_count: null, offering: 'standard', source: 'mine', offered: true, type: 'photo',
    }];
    return { ok: true };
  },
  /* ⚠️ WITHOUT THIS THE "CREATE ORDER FOR A CUSTOMER" BUTTON DOES NOT APPEAR — same trap as
     `uploadCataloguePhoto` above. It is gated on `hasCap('order:manage') && apiClient
     ?.createManualOrder`, and `hasCap` reads null capabilities as allow-everything here, so the
     METHOD is the half that decides. An unstubbed harness shows a photo preview with no button and
     looks like the feature was never built — which is indistinguishable from the bug being fixed. */
  createManualOrder: async (payload) => {
    console.log('[harness] POST /orders/manual', payload);
    return { id: 'ord-stub-1', orderId: 'ord-stub-1' };
  },
  fetchBakerCatalogue:  async () => CATALOGUE_STUB,
  fetchMyTemplates:     async () => MY_TEMPLATES_STUB,
  deleteBakerTemplate:  async (id) => { console.log('[harness] DELETE template', id); return { ok: true }; },
  // Logs the WHOLE set it was handed — the contract both screens must honour, since the route
  // replaces rather than merges and a screen sending only its own half would empty the other.
  updateBakerCatalogue: async (ids) => {
    console.log('[harness] PUT /baker/catalogue', ids);
    // Replace-set, like the route: anything listed is offered, anything absent is not.
    const next = new Set(ids);
    CATALOGUE_STUB = CATALOGUE_STUB.map(t => ({ ...t, offered: next.has(t.id) }));
    return { ok: true, offered_count: ids.length };
  },
};

/* ⚠️ onSaveTemplate IS A PROP, NOT AN apiClient METHOD, so the Proxy below cannot stand in for it.
   Without one, "Save as Template" answers "Saving templates is unavailable here" and the modal's
   tag chips — the whole of findability item 5 — could not be driven in this harness at all.
   Records what was TICKED, under both field names, so a check can tell the two apart: a core that
   sent only `tagIds` would leave a host built on `occasionTagIds` posting nothing. */
const onSaveTemplate = async (t) => {
  window.__lastSave = {
    name: t.name, designJson: t.designJson,
    tagIds: t.tagIds ?? null, occasionTagIds: t.occasionTagIds ?? null,
  };
  console.log('[harness] saved template', t.name, 'tagIds:', JSON.stringify(t.tagIds));
};

const apiClient = new Proxy(withSettings ? { ...SETTINGS_STUBS, ...overrides, ...capsOverride, ...templatesOverride } : { ...overrides, ...capsOverride, ...templatesOverride }, {
  // Unstubbed methods still answer null: the designer reads some as arrays, so an empty OBJECT crashes it.
  get: (target, k) => target[k] ?? (async () => null),
});

// `?customer` renders in customer mode, which is the only mode CustomerTour runs in. The tour also
// checks localStorage, so it shows once and then never again — clearing the key is how you get it
// back, and doing that here beats hand-editing devtools every time.
const customer = new URLSearchParams(location.search).has('customer');
if (new URLSearchParams(location.search).has('retour')) {
  try { localStorage.removeItem('spattoo.tour.customer.v1'); } catch { /* ignore */ }
}

/* `?garnish=1` opens the designer with a chocolate garnish already standing on the cake, so its CARD —
   Where it sits, How it sits, the drag hint — can be reached by clicking the piece, without a studio
   drawing and without an account. `?garnishzone=side` starts it on the wall. */
/* `?tier=%23FFFFFF` (and `&style=piped_modelled`) opens on a cake of that colour and cream style, so a
   ground or lighting change can be judged in the REAL designer — floor, shadow and all — not only on a
   harness that has no floor. */
/* ⚠️ `?shape=heart` (also butterfly / hexagon / oval / square), with `&w=3&d=2` for its proportions.
   The code SHIPS the curves and the catalogue ships only round + rect — a heart is a row an admin
   authors — so until now the only non-round cake reachable in the real designer needed a database.
   That is why the FRONT marker could sit buried in the gold of every outline shape without anyone
   seeing it: the two shapes anyone opens by habit are the two it was right on. These are authored
   locally, exactly as dev/shapes.jsx does, and only to be looked at. */
const _seed = new URLSearchParams(location.search);
applyCakeShapeConfig([
  { key: 'square',    label: 'Square',    family: 'rounded_rect', config: { square: true } },
  { key: 'heart',     label: 'Heart',     family: 'heart',        config: { plump: 1, cleft: 1 } },
  { key: 'butterfly', label: 'Butterfly', family: 'butterfly',    config: { wing: 1 } },
  { key: 'hexagon',   label: 'Hexagon',   family: 'polygon',      config: { sides: 6, rotation: 0 } },
  { key: 'oval',      label: 'Oval',      family: 'oval',         config: {} },
]);
const _shape = _seed.get('shape');
const _w = Number(_seed.get('w')) || 2.4;
const _d = Number(_seed.get('d')) || 2.4;
/* ⚠️ `?piping=1` puts a border on the tier's wall, because until now nothing could.
   A piping element is a DB row carrying a GLB url, so the stub client's `null` meant the designer
   could be opened but no border could ever be put on it — and the Height control, the on-cake drag
   and every festoon path live only on a cake that has one. `dev/sample-rosette.glb` is the repeatable
   shell already in the repo.

   ⚠️ NOT the swag path. `buildFestoons` bends a long STRIP, and a rosette's longest axis is its own
   width — bent, it comes out as a ring of blobs bigger than the cake. Swags are looked at on
   dev/festoons.html instead, which builds the strip it needs rather than borrowing one that is the
   wrong shape. A fixture that renders something nobody would pipe teaches the wrong thing. */
const _piping = _seed.has('piping') ? [{
  layerId: 'seed-pipe', cardId: 'seed-card', name: 'Seed border',
  glbUrl: '/sample-rosette.glb', color: '#c96a5a',
  size: 1, arrangement: 'ring', yOffset: 0,
  /* `&py=0.4` starts the border PART WAY UP the wall. At the base — where a border naturally sits —
     the anchor and the cream you grab are nearly the same height, so a drag that snapped the anchor
     to the pointer looked identical to one that kept the grab offset. The bug INVARIANTS #10 law 5
     describes only appears once those two are apart. */
  userYOffset: Number(_seed.get('py')) || 0,
}] : [];

const garnishDesign = (_seed.has('garnish') || _seed.has('tier') || _shape || _piping.length) ? {
  tiers: [{ shape: _shape || 'round', width: _w, depth: _d, radius: _w / 2,
            height: 1.0, color: _seed.get('tier') || '#F6DCE2', frostingType: 'buttercream',
            frostingStyle: _seed.get('style') || 'smooth',
            topPipings: [], bottomPipings: _piping, creamLayers: [] }],
  garnishes: _seed.has('garnish') ? [{
    id: 'g-seed', name: 'Panel', kind: 'cut', color: '#4A2C1B', plate: 420, scale: 1.2,
    zone: new URLSearchParams(location.search).get('garnishzone') || 'top', mode: 'stand',
    theta: Math.PI / 2, radius: 0.55, height: 0.5, yaw: 0,   // 0.55 = GARNISH_DEFAULTS, where the fan was tuned
    rings: [[[110, 60], [310, 60], [270, 360], [150, 360], [110, 60]]],
  }] : [],
} : null;

/* ── Rail skins, so all three can be seen ────────────────────────────────────────────────────────
 * `?skin=walnut` picks one. The stub answers the shape the real route does — skins + served — so
 * the designer's resolver is exercised rather than bypassed; `served` is what the SERVER decided,
 * and the client is not supposed to second-guess it.
 */
const SKINS = [
  { key:'chrome', name:'Chrome', is_default:true,  is_premium:false,
    stops:['#121214','#08080a','#08080a','#020203'], joint_at:null, texture:'none',
    ink:'rgba(255,255,255,0.78)', ink_active:'#ffffff' },
  { key:'walnut', name:'Walnut', is_default:false, is_premium:true,
    stops:['#3A2616','#4C321C','#3C2717','#2C1D11'], joint_at:0.62, texture:'grain',
    ink:'rgba(255,255,255,0.78)', ink_active:'#ffffff' },
  { key:'slate',  name:'Slate',  is_default:false, is_premium:true,
    stops:['#2B3038','#232830','#1E232A','#161A20'], joint_at:null, texture:'none',
    ink:'rgba(255,255,255,0.80)', ink_active:'#ffffff' },
];
const WANTED = new URLSearchParams(location.search).get('skin') || 'chrome';

const withSkins = (api) => new Proxy(api, {
  get: (t, k) => k === 'fetchRailSkins'
    ? async () => ({ skins: SKINS, chosen: WANTED, served: WANTED, entitled: true })
    : Reflect.get(t, k),
});

createRoot(document.getElementById('root')).render(
  <CakeDesigner
    initialDesign={garnishDesign}
    /* The same assets base every harness on the real scene uses: production lighting, and the stroke
       meshes the modelled cream styles need. Without it the designer falls back to a preset light and
       renders Vertical Piping as a smooth wall — a different cake from the one being judged. */
    cfAssetsBase={HARNESS_ASSETS_BASE}
    apiClient={withSkins(apiClient)}
    orderMode={customer ? 'customer' : 'baker'}
    onOrder={() => {}}
    onShareStore={() => {}}
    onSaveTemplate={onSaveTemplate}
  />,
);
