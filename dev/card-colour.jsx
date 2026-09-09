import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
/* ⚠️ The assets base, so this renders under the SELF-HOSTED OUTDOOR map the product uses and not
 * drei's indoor `apartment` fallback. `check:harness-scene` exists because harnesses kept missing
 * this, and dev/scene.js's own note records what the divergence cost. Without it every number this
 * page produces describes a scene no customer has ever loaded. */
import './scene.js';
import { SceneLights, SceneEnv } from '../src/designer/canvas/CakeCanvas.jsx';
import { albedoForLight } from '../src/designer/shared/albedoForLight.js';

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
 */
const params = new URLSearchParams(location.search);
const COLOUR = '#' + (params.get('c') || '808080').replace('#', '');
const ROUGH = Number(params.get('r') ?? 0.86);
// `?fix=1` renders through the correction, so the same script can VERIFY the number it measured
// rather than only produce it.
const FIX = params.get('fix') === '1';
const ROLLOFF = Number(params.get('ro') ?? 0);
export const CARD_REFERENCE_LIGHT = [3.193, 2.940, 3.028];

function Card() {
  return (
    <mesh castShadow receiveShadow>
      {/* A plain box, not a cut word: the measurement is of the MATERIAL under this light, and a
          letterform only adds edges that the sampler would have to avoid. */}
      <boxGeometry args={[2.2, 2.2, 0.04]} />
      <meshStandardMaterial
        color={FIX ? albedoForLight(COLOUR, CARD_REFERENCE_LIGHT, { rolloff: ROLLOFF }) : COLOUR}
        roughness={ROUGH} metalness={0} />
    </mesh>
  );
}

createRoot(document.getElementById('root')).render(
  <Canvas shadows camera={{ position: [0, 0, 3.4], fov: 38 }}
    gl={{ preserveDrawingBuffer: true }} style={{ height: '100%' }}>
    <SceneLights shadows />
    <SceneEnv />
    <Card />
  </Canvas>,
);
