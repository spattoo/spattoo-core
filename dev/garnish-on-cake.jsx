import { createRoot } from 'react-dom/client';
import { CakePreview, configureEnvMap } from '../src/designer/canvas/CakeCanvas.jsx';
import { fillShape } from '../src/designer/geometry/pipingFill.js';

/* ⚠️ THE HARNESS MUST LIGHT THE CAKE THE WAY PRODUCTION DOES, and for a while it did not. With no
 * assets base configured, `envProps` falls back to drei's `apartment` preset — so localhost rendered
 * an INDOOR map while every deployed cake rendered the self-hosted OUTDOOR lebombo. The glare being
 * complained about is a reflection, and a metal shows nothing but the map, so the two scenes were not
 * comparable at all: three parameter sweeps were run, reported and documented against a map no
 * customer has ever seen. The fallback is right for a cold `npm run dev` — it beats a black scene —
 * but it is a fallback, and anything MEASURING the scene has to opt out of it explicitly.
 *
 * `?env=` picks the map, so sizes and sources can be compared in one run: `512`, `1k`, or a full
 * path. Default is exactly what ships. */
/* ⚠️ SERVED FROM THIS ORIGIN, NOT THE CDN, because the CDN will not have us. Its allowlist holds
 * `app.spattoo.com` and `localhost:3000`; the harness runs on 5190 and gets no
 * `access-control-allow-origin`, and a WebGL texture load without CORS fails — so pointing straight
 * at the CDN reproduced the very silent-fallback this harness exists to avoid. `scripts/fetch-hdri.sh`
 * drops the same files under `public/_local/` (gitignored), which vite serves same-origin.
 *
 * They are byte-identical to what production fetches, so the light is the real light. */
const envArg = new URLSearchParams(location.search).get('env');
configureEnvMap(location.origin, envArg
  ? (envArg.includes('/') ? envArg : `_local/env/lebombo_${envArg}.hdr`)
  : '_local/env/studio_256.hdr');

/* The whole chain, end to end: design.garnishes -> toCanvasConfig -> CakeContent -> Garnishes.
 * Tests can prove the maths; only this can prove the piece actually arrives on the cake. */

const leaf = [];
for (let i = 0; i <= 26; i++) { const t = i / 26; leaf.push([60 + t * 300, 210 - Math.sin(t * Math.PI) * 100]); }
for (let i = 26; i >= 0; i--) { const t = i / 26; leaf.push([60 + t * 300, 210 + Math.sin(t * Math.PI) * 100]); }
const paths = [leaf, ...fillShape(leaf, { pattern: 'hatch', spacing: 26, inset: 9, ropeWidth: 12, seed: 5 })];

/* ⚠️ THE COLOUR IS DRIVEN FROM THE URL, so this harness can be MEASURED rather than looked at.
 * `?color=%234EC5B0` renders the piece in that colour on the real cake scene — same lights, same
 * environment, same material as a customer sees. Without this the fixture was dark chocolate, which
 * is the one colour the environment wash does not show up on: it was measured, reported as correct,
 * and the bug survived four more rounds. A harness that can only be checked with the easy case is
 * not a harness. */
const asked = new URLSearchParams(location.search).get('color') || '#4A2C1B';

const design = {
  tiers: [{ shape: 'round', color: '#F6DCE2', frostingType: 'buttercream', frostingStyle: 'smooth',
            topPipings: [], bottomPipings: [], creamLayers: [] }],
  texts: [], ages: [], stickers: [], piping: [],
  /* ⚠️ THE ACRYLIC TOPPER GOES HERE BECAUSE THIS HARNESS USES THE REAL SCENE. `dev/topper.jsx` and
   * `dev/acrylic-text.jsx` each build their own RoomEnvironment, so neither shows the glare that is
   * actually complained about — a harness that lights its subject differently from the product cannot
   * be used to judge the product. `CakePreview` mounts SafeEnvironment and the real rig, so a topper
   * put here is the one a customer sees. `?topper=1`. */
  writings: new URLSearchParams(location.search).has('topper')
    ? [{ id: 'w', style: 'acrylic', text: 'Happy Birthday', font: 'ems_allure',
         surface: 'top', color: '#D4AF37', finish: 'gold' }]
    : [],
  garnishes: [
    // A CUT panel with a hole punched in it, beside a piped piece — the two ways of being made.
    { id: 'a', name: 'Panel', kind: 'cut', color: asked, plate: 420, radius: 0.5, mode: 'stand', scale: 1.3,
      rings: [
        [[110, 60], [310, 60], [270, 360], [150, 360], [110, 60]],
        Array.from({ length: 25 }, (_, i) => { const t = (i / 24) * Math.PI * 2;
          return [210 + Math.cos(t) * 45, 170 + Math.sin(t) * 45]; }),
      ] },
    { id: 'b', name: 'Leaf', color: asked, paths, rope: 6, plate: 420, theta: 3.4, radius: 0.55, mode: 'lie' },
  ],
};

createRoot(document.getElementById('root')).render(
  <div style={{ height: '100%', position: 'relative' }}>
    <CakePreview design={design} />
    {/* The colour that was ASKED FOR, against the cake, so the gap is visible without a screenshot
        being sent anywhere. */}
    <div data-asked style={{ position: 'absolute', top: 12, left: 12, width: 90, height: 60,
                             background: asked, border: '1px solid rgba(0,0,0,.15)', borderRadius: 6 }} />
  </div>
);
