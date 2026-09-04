import { createRoot } from 'react-dom/client';
import { CakePreview, configureEnvMap } from '../src/designer/canvas/CakeCanvas.jsx';
import { fillShape } from '../src/designer/geometry/pipingFill.js';
import { TOPPER_FINISHES } from '../src/designer/geometry/topperFinishes.js';
import { useThree, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

/* SPIKE (`?permat=<hdr>`): can ONE material get its own environment while the scene keeps another?
 *
 * ⚠️ THIS IS THE ONLY REMAINING ROUTE TO A TOPPER-ONLY FIX. `envMapIntensity` is proven inert — 0.5
 * through 3.0 render bit-identically — because `scene.environment` is a SCENE property a material
 * cannot oppose. Assigning an actual `envMap` texture is a different question from setting it to
 * null (which R3F was seen to re-attach), and it is the question nobody has answered.
 *
 * If this works, metals can be lit by the studio map while fondant and faux balls keep lebombo, and
 * the glare is fixable without re-lighting the cake. If it does not, the idea is dead and the next
 * candidate is a layers split or a second render pass. */
function PerMaterialEnv({ file }) {
  const { scene, gl } = useThree();
  const env = useRef(null), done = useRef(false);
  if (file && !env.current) {
    env.current = 'loading';
    new RGBELoader().load(file, (tex) => {
      const pm = new THREE.PMREMGenerator(gl);
      env.current = pm.fromEquirectangular(tex).texture;
      tex.dispose(); pm.dispose();
    });
  }
  /* Re-applied every frame until it takes: the topper mounts after this component, and R3F rebuilds
     materials on prop changes — a one-shot effect would silently miss both. */
  useFrame(() => {
    if (!file || done.current || !env.current || env.current === 'loading') return;
    let hit = 0;
    scene.traverse((o) => {
      if (o.isMesh && o.material && o.material.metalness > 0.5 && o.material.envMap !== env.current) {
        o.material.envMap = env.current; o.material.needsUpdate = true; hit++;
      }
    });
    if (hit) { window.__permat = (window.__permat || 0) + hit; }
  });
  return null;
}

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
/* ⚠️ THE SWEEP KNOBS LIVE HERE, IN THE HARNESS, NOT IN THE PRODUCT. An earlier round put an
 * `?envrot=` override into `CakeCanvas` so the rotation could be swept — dev tooling that then
 * shipped, read the URL on every render of the scene environment, and let anyone rotate the lighting
 * with a query string. Mutating the finish table from the harness gets the same sweep with nothing
 * added to production. `?rough=0.34&envi=1.4` on the gold finish. */
const _q = new URLSearchParams(location.search);
for (const [param, key] of [['rough', 'roughness'], ['envi', 'envIntensity'], ['metal', 'metalness']]) {
  if (_q.has(param)) TOPPER_FINISHES.gold[key] = Number(_q.get(param));
}

const envArg = new URLSearchParams(location.search).get('env');
configureEnvMap(location.origin, envArg
  ? (envArg.includes('/') ? envArg : `_local/env/lebombo_${envArg}.hdr`)
  : '_local/env/lebombo_256.hdr');

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
    {/* ⚠️ autoRotate OFF, AND THIS IS THE WHOLE MEASUREMENT. `CakePreview` spins at 1.4 by default,
        so every glare reading ever taken here was sampled at a RANDOM CAMERA ANGLE — fatal for a
        metal, whose appearance is nothing but the reflection and therefore entirely angle-dependent.
        It is why measuring one setting six times gave a spread wider than any parameter produced,
        and why the frame never settles no matter how long the script waits. Sweeping a material
        against a moving camera measures the camera. */}
    <CakePreview design={design} autoRotate={false}>
      <PerMaterialEnv file={_q.get('permat') ? `/_local/env/${_q.get('permat')}.hdr` : null} />
    </CakePreview>
    {/* The colour that was ASKED FOR, against the cake, so the gap is visible without a screenshot
        being sent anywhere. */}
    <div data-asked style={{ position: 'absolute', top: 12, left: 12, width: 90, height: 60,
                             background: asked, border: '1px solid rgba(0,0,0,.15)', borderRadius: 6 }} />
  </div>
);
