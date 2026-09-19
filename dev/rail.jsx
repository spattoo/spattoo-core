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
const apiClient = new Proxy(withSettings ? { ...SETTINGS_STUBS, ...overrides } : overrides, {
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

createRoot(document.getElementById('root')).render(
  <CakeDesigner
    initialDesign={garnishDesign}
    /* The same assets base every harness on the real scene uses: production lighting, and the stroke
       meshes the modelled cream styles need. Without it the designer falls back to a preset light and
       renders Vertical Piping as a smooth wall — a different cake from the one being judged. */
    cfAssetsBase={HARNESS_ASSETS_BASE}
    apiClient={apiClient}
    orderMode={customer ? 'customer' : 'baker'}
    onOrder={() => {}}
    onShareStore={() => {}}
  />,
);
