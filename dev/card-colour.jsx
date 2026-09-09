import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
/* ⚠️ The assets base, so this renders under the SELF-HOSTED OUTDOOR map the product uses and not
 * drei's indoor `apartment` fallback. `check:harness-scene` exists because harnesses kept missing
 * this, and dev/scene.js's own note records what the divergence cost. Without it every number this
 * page produces describes a scene no customer has ever loaded. */
import './scene.js';
import { SceneLights, SceneEnv } from '../src/designer/canvas/CakeCanvas.jsx';
import { albedoForLight } from '../src/designer/shared/albedoForLight.js';
import * as THREE from 'three';

/* ── What does the cake's light do to a card topper's colour? ─────────────────────────────────────
 *
 * ⚠️ NOT `colour-probe.jsx`. That page carries a warning about itself: it invented its own rig
 * (ambient 0.5, one directional, no environment) and its numbers were read as though they were the
 * cake's, which produced a documented conclusion that every colour washes out — wrong, and only the
 * cake showed it. So this page mounts `SceneLights shadows` and `SceneEnv`, the two things
 * CakeCanvas mounts, and nothing of its own.
 *
 * A flat card facing the camera, filling the frame, in whatever colour `?c=` asks for. The measuring
 * script reads the middle pixel: albedo in, rendered pixel out, and the ratio is the reference light
 * INVARIANT #16 divides by.
 *
 * ── ⚠️ WHY A SATURATED COLOUR CANNOT BE RENDERED HERE, AND WHERE THE LIFT COMES FROM ────────────
 *
 * `colour-probe.jsx` recorded that sweeping `envMapIntensity` changed the pixel NOT AT ALL, and
 * asked for the lights, the tone mapping and the colour space to be swept next. Measured here, on
 * #eaf508 — a yellow whose BLUE channel is 8 — with the correction applied at rolloff 6:
 *
 *     envMapIntensity  1 → 0     blue 122, 122, 122, 122     no effect whatsoever, reproduced
 *     ACES (the scene's)         blue 122   (asked 8)
 *     none / linear              blue  58
 *     NeutralToneMapping         blue  40
 *
 * So TONE MAPPING is more than half of it. ACES exists to roll off and DESATURATE the top of the
 * range, which is precisely the signature of a saturated colour arriving milky — and it is applied
 * after everything, so no albedo divisor can reach it. That is the answer to the open question, and
 * it is not the environment.
 *
 * ⚠️ THE REST IS NOT TONE MAPPING. Even with none, blue lands on 58 against an asked-for 8. A
 * dielectric reflects a few percent of every light source ADDITIVELY however matte it is, so a
 * white key light puts a white specular on top of any albedo. Driving the albedo to zero cannot
 * remove it — the same wall the chocolate drip hit at grey 152.
 *
 * ⚠️ AND NOTHING HERE CHANGES THE SCENE. `NeutralToneMapping` (Khronos PBR Neutral) is built for
 * exactly this problem and is a third of ACES's error — but tone mapping is scene-wide, every
 * reference light already measured was measured under ACES, and this repo has already shipped and
 * reverted one scene-wide lighting change in a day. It is a product decision with a re-measurement
 * attached, not a studio fix.
 */
const params = new URLSearchParams(location.search);
const COLOUR = '#' + (params.get('c') || '808080').replace('#', '');
const ROUGH = Number(params.get('r') ?? 0.86);
// `?fix=1` renders through the correction, so the same script can VERIFY the number it measured
// rather than only produce it.
const FIX = params.get('fix') === '1';
const ROLLOFF = Number(params.get('ro') ?? 0);
// ?env= scales this material's share of the environment map. A dielectric still reflects ~4% of the
// sky ADDITIVELY however matte it is, which is the one thing an albedo divisor cannot touch.
const ENV = params.get('env') === null ? 1 : Number(params.get('env'));
/* ?tm= names the tone mapping. ACES compresses and DESATURATES the top of the range — the exact
 * signature of a saturated colour arriving milky — and it is the one term neither the environment
 * sweep nor any albedo divisor could reach. */
const TONE = {
  aces: THREE.ACESFilmicToneMapping, none: THREE.NoToneMapping,
  linear: THREE.LinearToneMapping, neutral: THREE.NeutralToneMapping ?? THREE.NoToneMapping,
}[params.get('tm') || 'default'];
export const CARD_REFERENCE_LIGHT = [3.193, 2.940, 3.028];

function Card() {
  return (
    <mesh castShadow receiveShadow>
      {/* A plain box, not a cut word: the measurement is of the MATERIAL under this light, and a
          letterform only adds edges that the sampler would have to avoid. */}
      <boxGeometry args={[2.2, 2.2, 0.04]} />
      <meshStandardMaterial
        color={FIX ? albedoForLight(COLOUR, CARD_REFERENCE_LIGHT, { rolloff: ROLLOFF }) : COLOUR}
        roughness={ROUGH} metalness={0} envMapIntensity={ENV} />
    </mesh>
  );
}

createRoot(document.getElementById('root')).render(
  <Canvas shadows camera={{ position: [0, 0, 3.4], fov: 38 }}
    gl={{ preserveDrawingBuffer: true }} style={{ height: '100%' }}
    onCreated={({ gl }) => { if (TONE !== undefined) gl.toneMapping = TONE; }}>
    <SceneLights shadows />
    <SceneEnv />
    <Card />
  </Canvas>,
);
