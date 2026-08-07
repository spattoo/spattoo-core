import { createRoot } from 'react-dom/client';
import { CakeDesigner } from '../src/index.js';

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
  'element:manage', 'store:manage', 'billing:manage',
];

const STUBS = {
  // A baker with every capability, so the strip and the More sheet are both fully populated —
  // the busiest case, which is the one that used to overflow.
  fetchMe: async () => ({
    id: 'u1', role: 'owner', capabilities: CAPS,
    baker: { id: 'b1', name: 'Sample Bakery', slug: 'sample' },
  }),
  fetchBakerProfile: async () => ({
    name: 'Sample Bakery', slug: 'sample', primary_color: '#2C4433', accent_color: '#6B8C74',
    logo_url: null, storefront_published: true,
  }),
  fetchBakerSettings:  async () => ({ delivery: { home_delivery: true, radius_km: 10 }, lead_time_days: 2 }),
  fetchEntitlements:   async () => ({ ent: { premium_themes: false, edible_print_studio: true } }),
  fetchElementTypes:   async () => ([]),
  fetchElements:       async () => ([]),
  fetchTemplates:      async () => ([]),
  fetchCakeShapes:     async () => ([]),
  fetchMaterials:      async () => ([]),
  fetchTextures:       async () => ([]),
  fetchTextStyles:     async () => ([]),
  fetchBakerFlavours:  async () => ({ curated: true, flavours: [], visibility: {} }),
};

const apiClient = new Proxy(STUBS, {
  get: (t, k) => t[k] ?? (async () => ({ items: [], events: [], templates: [], plans: [], flavours: [] })),
});

createRoot(document.getElementById('root')).render(
  <CakeDesigner apiClient={apiClient} cfAssetsBase="" />,
);
