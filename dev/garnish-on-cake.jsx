import { createRoot } from 'react-dom/client';
import { CakePreview, configureEnvMap, SceneBackground } from '../src/designer/canvas/CakeCanvas.jsx';
import { DESIGNER_GROUND } from '../src/designer/constants.js';
import { HARNESS_ASSETS_BASE } from './scene.js';   // light it the way production does
import { fillShape } from '../src/designer/geometry/pipingFill.js';
import { TOPPER_FINISHES } from '../src/designer/geometry/topperFinishes.js';
import { useThree, useFrame } from '@react-three/fiber';
import { useRef, useState, useEffect } from 'react';
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
/* Rotating the scene's environment, from the harness rather than from the product. This used to be
 * a `?envrot=` parameter inside `CakeCanvas` — dev tooling that shipped and stayed. `scene.environ-
 * mentRotation` is settable from here, so the sweep keeps working and production keeps its API. */
function EnvRotation({ deg }) {
  const { scene } = useThree();
  useFrame(() => {
    const want = (Number(deg) * Math.PI) / 180;
    if (scene.environmentRotation && scene.environmentRotation.y !== want) {
      scene.environmentRotation.set(0, want, 0);
    }
  });
  return null;
}

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

/* ⚠️ SWEEP KNOBS LIVE IN THE HARNESS, NOT IN THE PRODUCT. An earlier round put an `?envrot=`
 * override into `CakeCanvas` so rotation could be swept; it shipped, read the URL on every render of
 * the scene environment, and let anyone re-light a cake with a query string. Mutating the finish
 * table from here gets the same sweep with nothing added to production.
 * `?rough=0.34&envi=1.4&metal=0.9` on the gold finish. */
const _q = new URLSearchParams(location.search);
for (const [param, key] of [['rough', 'roughness'], ['envi', 'envIntensity'], ['metal', 'metalness']]) {
  if (_q.has(param)) TOPPER_FINISHES.gold[key] = Number(_q.get(param));
}

/* The map itself is set by `./scene.js`, which every harness on the real scene imports so none of
 * them can drift from production again. `?env=` overrides it for a sweep — against the PROXIED CDN,
 * so a comparison uses the same bytes production serves and cannot go stale: `512`, `1k`, or a path. */
const envArg = _q.get('env');
if (envArg) {
  configureEnvMap(HARNESS_ASSETS_BASE,
    envArg.includes('/') ? envArg : `code/env/lebombo_${envArg}.hdr`);
}

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

/* A solid #808080 PNG, inline. ⚠️ A DATA URI, not a file in `public/` — a measurement fixture has no
 * business shipping to customers, and 64x64 of one colour compresses to nothing. The artwork is
 * uniform so "renders at 1x" has an unambiguous meaning: the render should read 128. */
const PROBE_GREY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAXklEQVR4nO3PMQ0AMAzAsEIf9ILYYVWKESTzjhsd8KsBrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BbQEfPgFpLSbCLgAAAABJRU5ErkJggg==';

const design = {
  /* ⚠️ `?cloud=1` / `?rainbow=1` — the last two on-cake surfaces taking a chosen colour. Both hang off
   * the TIER (`tier.clouds`, `tier.rainbows`), not off the design root, which is why they are here
   * rather than beside `nameBlocks`. Single-colour rainbow bands on purpose: a measurement wants one
   * colour it asked for, not six it has to disentangle. */
  tiers: [{ shape: 'round', color: _q.get('tier') || '#F6DCE2', frostingType: 'buttercream', frostingStyle: 'smooth',
            clouds: _q.has('cloud')
              ? [{ id: 'cl1', surface: 'top', u: 0.5, v: 0.3, scale: 1.6,
                   color: _q.get('cloudcolor') || '#FFFFFF' }]
              : [],
            rainbows: _q.has('rainbow')
              ? [{ id: 'rb1', u: 0.5, scale: 1.1,
                   colors: Array(6).fill(_q.get('rainbowcolor') || '#F5A3B8') }]
              : [],
            /* ⚠️ `?drip=1` — a chocolate drip is a TOP PIPING carrying `drip: true`, not a design key
             * of its own, so it goes here. `TopDripRing` builds its own geometry, so no catalogue
             * GLB is needed to render one. */
            topPipings: _q.has('drip')
              ? [{ layerId: 'd1', drip: true, dripLength: 1.2,
                   color: _q.get('dripcolor') || '#3a2117' }]
              : [],
            bottomPipings: [],
            /* ⚠️ `?foil=1` PUTS GOLD LEAF ON THE WALL, because a finish does not only add shards — it
               changes the WALL'S OWN MATERIAL. With finish maps bound, `TierBody` sends `color` to
               white and drives the albedo from a baked map, and it raises `envMapIntensity` from 0.5
               to the foil's 4.5 for the WHOLE surface, base included. So the question this answers is
               not "do the shards shine": it is whether the cream a baker chose still renders as the
               colour they chose once a single flake is on it. Reported dull from the app 2026-09-09,
               with the flakes dull in the same frame.

               `?foilonly=1` puts ONE flake on the BACK of the cake, which separates the two causes:
               the material switch is fully bound, but nothing is stamped where a measurement samples.
               If the front wall shifts here, the shards are innocent and the finish path is the bug.
               ⚠️ NOT "the foil object with no flakes" — that was the first attempt and it measured
               nothing at all: `CakeTier` nulls `sideFoil` when the flake list is empty, so no maps
               were ever bound and the two passes were the same render. It read as a clean zero. */
            foil: (_q.has('foil') || _q.has('foilonly') || _q.has('foilring'))
              ? { color: _q.get('foilcolor') || '#e6be4a',
                  /* ⚠️ EACH KNOB IS OMITTED UNLESS THE URL SETS IT, so with no knobs this renders the
                     SHIPPED defaults. Repeating the defaults here instead silently pinned the
                     harness to the old values: a measurement taken right after changing
                     GOLD_LEAF_DEFAULTS reported the old numbers back, because the harness was
                     overriding the very thing under test. */
                  finish: { raggedness: 0.55, sizeScale: 1,
                            ...(_q.has('foilmetal')   && { metalness: Number(_q.get('foilmetal')) }),
                            ...(_q.has('foilrough')   && { roughness: Number(_q.get('foilrough')) }),
                            ...(_q.has('foilenv')     && { env:       Number(_q.get('foilenv')) }),
                            ...(_q.has('foilglow')    && { glow:      Number(_q.get('foilglow')) }),
                            ...(_q.has('foilcrinkle') && { crinkle:   Number(_q.get('foilcrinkle')) }) },
                  flakes: _q.has('foilring')
                    ? Array.from({ length: 8 }, (_, i) => ({ u: i / 8, v: 0.5, surface: 'side', rot: i * 40, size: 1.2, seed: i + 1 }))
                    : _q.has('foilonly') ? [{ u: Number(_q.get('foilu') ?? 0.5), v: 0.85, surface: 'side', rot: 0, size: 0.8, seed: 5 }] : [
                    { u: 0.46, v: 0.42, surface: 'side', rot: 12,  size: 1.1, seed: 3 },
                    { u: 0.50, v: 0.55, surface: 'side', rot: 200, size: 0.9, seed: 7 },
                    { u: 0.55, v: 0.36, surface: 'side', rot: 95,  size: 1.0, seed: 11 },
                  ] }
              : null,
            /* ⚠️ `?cream=1` PUTS UNCORRECTED CREAM NEXT TO A CORRECTED WALL, which is the only way to
               see whether fixing tiers alone makes a MISMATCH more visible than the original error.
               Same chosen colour on both: if they now read as two different colours, correcting one
               surface at a time is the wrong plan. */
            creamLayers: _q.has('cream')
              ? [{ layerId: 'c1', color: _q.get('creamcolor') || _q.get('tier') || '#F6DCE2', height: 0.42, order: 0, edge: 'wave', seed: 3, softness: _q.has('soft') ? Number(_q.get('soft')) : undefined }]
              : [] }],
  texts: [], ages: [],
  /* ⚠️ `?print=1` PUTS A PRINT ON THE CAKE so the claim in `shared/printExposure.js` — that a print
   * renders at exactly 1x its artwork — can be CHECKED rather than trusted. The artwork is a solid
   * mid-grey PNG, so "1x" means the render reads 128. A print is the one surface with a documented
   * exposure model of its own, and the only way to know it still holds is to measure it. */
  stickers: _q.has('print')
    ? [{ id: 'p1', imageUrl: PROBE_GREY, zone: 'top', surface: 'top',
         x: 0, z: 0, scale: 1.6, rotation: 0 }]
    : [],
  /* ⚠️ `?rope=1` PIPES A CREAM ROPE, which is the shape a real border is — small, rounded and
   * SELF-SHADOWING. The cream reference light was measured on the second-cream BAND, a large flat-ish
   * face on the wall, and grass already proved that geometry changes how much light a surface
   * receives as much as its material does. This exists to check whether one cream constant serves
   * both shapes or whether a piped border is being over-darkened. */
  piping: _q.has('rope')
    ? [{ id: 'r1', points: Array.from({ length: 40 }, (_, i) => {
           const t = (i / 39) * Math.PI * 1.4 + 0.3;
           return [Math.cos(t) * 1.45, 1.16, Math.sin(t) * 1.45];
         }),
         nozzle: 'round', thickness: 0.09, softness: 0.7, medium: 'cream',
         color: _q.get('ropecolor') || '#F6DCE2' }]
    : [],
  /* ⚠️ `?blocks=1` / `?grass=1` PUT THE REMAINING UNCORRECTED SURFACES ON THE REAL CAKE, so each can
   * be measured under the same light as the wall it sits against. Both take their colour from the
   * URL so the measurement can sweep it, exactly as the tier and cream do. */
  /* ⚠️ EXPLICIT `blocks`, NOT `text` — the canvas gates on `nameBlocks?.blocks?.length > 0`, so a
   * fixture passing only `text` renders nothing at all and silently looks like a working scene with
   * no blocks in it. Polar: `u` is the fraction around the board, `v` the fraction out from centre. */
  nameBlocks: _q.has('blocks')
    ? { blocks: [0.94, 0, 0.06].map((u, i) => ({ char: 'ABC'[i], u, v: 0.86, yaw: 0 })),
        zone: 'board', blockColor: _q.get('blockcolor') || '#F6DCE2',
        letterColor: _q.get('blockcolor') || '#F6DCE2' }
    : null,
  /* ⚠️ `ringWidth`, not `patches` — the canvas reads `boardGrass.ringWidth` to work out how far the
   * ring reaches across the board-to-cake gap. A fixture inventing a `patches` key renders a ring of
   * zero width: no error, no grass, and a measurement that reports "surface not found". */
  boardGrass: _q.has('grass')
    ? { ringWidth: 0.7, height: 0.16, color: _q.get('grasscolor') || '#4caf3d' }
    : null,
  /* ⚠️ THE ACRYLIC TOPPER GOES HERE BECAUSE THIS HARNESS USES THE REAL SCENE. every harness now uses
   * `SceneEnv`, the component production mounts — `topper.jsx` and `acrylic-text.jsx` each built
   * their own RoomEnvironment until 2026-09-05, which is why the glare being complained about was
   * invisible on both of them. `CakePreview` mounts SafeEnvironment and the real rig, so a topper
   * put here is the one a customer sees. `?topper=1`. */
  writings: new URLSearchParams(location.search).has('topper')
    /* ⚠️ `?topperside=1` PUTS IT ON THE WALL, which is where it is actually judged. On the TOP the
       piece lies almost edge-on to this camera and reads a few pixels tall — a picture that cannot
       show whether the finish is flat or not. On the wall it faces the viewer at the size a customer
       sees, which is how the dullness was reported in the first place. */
    ? [{ id: 'w', style: 'acrylic', text: 'Happy Birthday', font: 'ems_allure',
         ...(_q.has('topperside')
           ? { surface: 'side', sideAngle: 0, sideY: 0.5 }
           : { surface: 'top' }),
         /* ⚠️ `?topperfinish=silver` — the finishes are five entries in one table drawn by one
            gradient, so a change to the gradient reaches all of them. Judging it on gold alone and
            spreading the same numbers to the rest by analogy is the guess this harness exists to
            replace. */
         color: '#D4AF37', finish: _q.get('topperfinish') || 'gold' }]
    : [],
  /* ⚠️ `?bare=1` DROPS THE GARNISHES so a measurement can have the cake to itself. The standing panel
   * sits over the middle of the top surface, which is exactly where a print or a topper lands — a
   * sample taken with it present is a sample of whatever peeks out from behind it. */
  garnishes: _q.has('bare') ? [] : [
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

/* ⚠️ `?cycle=1` MOUNTS, UNMOUNTS AND REMOUNTS THE TOPPER — the sequence that broke it in dev (add,
 * remove, add again → black lettering, fixed only by a refresh). A harness that can only show the
 * FIRST mount cannot catch a shared resource being disposed under the second one. */
/* ⚠️ THE SCENE ON `window`, so a measurement can ask the RENDERER what it did rather than infer it
 * from pixels. This is what found the `envMapIntensity` problem: a sweep of the foil's own env value
 * produced byte-identical frames, and only reading the live material back — and then setting the
 * value on it directly and re-rendering — showed that three.js overwrites the uniform with
 * `scene.environmentIntensity` whenever the material's own `envMap` is null. From the outside that
 * is indistinguishable from "this knob is already optimal", which is the conclusion an earlier round
 * of this investigation drew and shipped a scene-wide change on.
 * Dev harness only; nothing in `src/` reads these. */
function SceneProbe() {
  const { scene, gl } = useThree();
  useEffect(() => { window.__scene = scene; window.__gl = gl; }, [scene, gl]);
  return null;
}

function App() {
  /* Present, then absent, then present again — the topper UNMOUNTS in between, which is what lets
     whatever disposes the shared PMREM do it before the second mount asks for the texture. */
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!_q.has('cycle')) return;
    const a = setTimeout(() => setOn(false), 1500);
    const b = setTimeout(() => setOn(true), 3000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  const shown = on ? design : { ...design, writings: [] };
  return (
  <div style={{ height: '100%', position: 'relative' }}>
    {/* ⚠️ THE PAGE ROTATES LIKE PRODUCTION; ONLY A MEASUREMENT FREEZES IT. `CakePreview` spins at
        1.4 and so does every real cake, so the default here is the product's. But a metal's
        appearance IS the reflection and therefore entirely angle-dependent, so sampling a spinning
        cake measures the camera: one unchanged setting read six times spanned more than any
        parameter ever moved it, and the frame never settles however long a script waits.
        `?still=1` stops it — an explicit, single, documented divergence taken by the measuring
        tool, not a quiet one baked into the page. */}
    {/* ⚠️ `shadows` — the LIVE designer renders `<SceneLights shadows />` and this preview did not,
        so every colour number here was measured on an unshadowed cake while a baker sees a shadowed
        one. A cast shadow lands on the tier wall, which is the exact patch the colour scripts
        sample. Matching it is not a detail. */}
    <CakePreview design={shown} shadows autoRotate={!_q.has('still')}>
      <SceneProbe />
      {/* ⚠️ A PATH WITH A SLASH GOES TO THE PROXIED CDN, same convention as `?env=`, so a per-material
          map can be compared against the bytes production actually serves rather than a local copy
          that can go stale: `?permat=code/env/studio_256.hdr`. A bare name still reads /_local. */}
      <PerMaterialEnv file={_q.get('permat')
        ? (_q.get('permat').includes('/') ? `/cdn/${_q.get('permat')}` : `/_local/env/${_q.get('permat')}.hdr`)
        : null} />
      {_q.has('envrot') && <EnvRotation deg={_q.get('envrot')} />}
      {/* ⚠️ THE DESIGNER'S OWN GROUND. The live scene mounts `<SceneBackground colour={DESIGNER_GROUND} />`
          and the preview canvas does not, so this page used to show a cake floating on white. It
          cannot change how the cake RENDERS — `scene.background` is not `scene.environment`, and
          three.js has no global illumination — but a colour judged against white and the same colour
          judged against the designer's grey are not the same judgement, and a person is the final
          check here. */}
      <SceneBackground colour={DESIGNER_GROUND} />
    </CakePreview>
    {/* The colour that was ASKED FOR, against the cake, so the gap is visible without a screenshot
        being sent anywhere. */}
    <div data-asked style={{ position: 'absolute', top: 12, left: 12, width: 90, height: 60,
                             background: asked, border: '1px solid rgba(0,0,0,.15)', borderRadius: 6 }} />
  </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
