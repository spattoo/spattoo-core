import { createRoot } from 'react-dom/client';
import { CakePreview, SceneBackground, SceneLights, configureSceneEnv } from '../src/designer/canvas/CakeCanvas.jsx';
import { DESIGNER_GROUND } from '../src/designer/constants.js';
import './scene.js';                       // the self-hosted HDRI, not drei's indoor fallback

/* ── Is the scene lit like a photograph, or like a softbox? ───────────────────────────────────────
 *
 * Sandeep, on a wafer skirt that had just been fixed structurally: *"overall looks over exposed.
 * dont know why are we not able to get the reference image kind of environmental look."* Measured
 * against the reference photograph in the same frame, renders come out at mean 193–205 where the
 * photograph is 169, with 60–87% of its contrast. Brighter AND flatter — one cause, not two.
 *
 * The cause is in the rig's arithmetic, not in any material:
 *
 *     key   [6,14,8]   1.10
 *     ambient          0.45      (everywhere)
 *     back  [-4,4,-4]  0.40
 *     environment IBL  1.25
 *
 * Key-to-fill is about 1.3 : 1. Daylight runs 3:1 to 5:1. Nothing on this cake has a dark side,
 * so nothing has falloff — which is also why white-on-white had nothing to separate it.
 *
 * ⚠️ WHY THIS IS A RIG AND NOT A PATCH. Every reference light in this repo — CARD_REFERENCE_LIGHT,
 * cream's, the wall's, the drip's, the foil's — was MEASURED UNDER THESE EXACT NUMBERS, each with
 * its own harness and a recorded sweep. Changing ambient or the key invalidates all of them at
 * once. `dev/card-colour.jsx` also records that tone mapping is more than half the washout (ACES
 * 122, linear 58, Neutral 40 on one saturated test colour) and warns in the same breath that this
 * repo "has already shipped and reverted one scene-wide lighting change in a day".
 *
 * So the change gets made ONCE, with every surface measured in the same pass. This page renders one
 * cake carrying all of them — white buttercream wall, a coloured tier, cream piping, a chocolate
 * drip, a wafer skirt — under lighting the URL controls, beside the reference photograph. A
 * candidate rig is not "looks better"; it is a row in the table `scripts/measure-scene-light.mjs`
 * prints.
 *
 *   ?amb= ?key= ?fill= ?env=   the four numbers above
 *   ?tm=aces|neutral|linear|none               tone mapping
 *   ?still=1                                   stop the turntable, for measuring
 *   ?subject=full|white|colour                 which cake
 */
const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);

const AMB  = num('amb', 0.45);
const KEY  = num('key', 1.10);
const FILL = num('fill', 0.40);
const ENV  = num('env', 1.25);

configureSceneEnv({ intensity: ENV });

/* ⚠️ THE REAL COMPONENT, PARAMETERISED — NOT A COPY OF IT. `check:harness-scene` refuses a page that
   builds its own lamps, and it is right to: six harnesses had drifted to ambient 0.5–0.55 with a key
   of 1.5, the very values SceneLights was softened away from. A calibration page has to vary the rig,
   which is the one case the gate could not allow for — so the fix is for SceneLights to TAKE the
   numbers rather than for this file to invent them. One definition, swept from outside. Only the
   intensities move; the positions are production's, because sweeping two things answers neither. */
const Rig = () => <SceneLights shadows ambient={AMB} keyLight={KEY} fill={FILL} />;

const SUBJECT = q.get('subject') ?? 'full';

/* ⚠️ ONE CAKE CARRYING EVERY SURFACE THAT HAS A REFERENCE LIGHT. Measuring them separately is how
   a rig gets tuned until the wall is right and the gold is wrong — they have to move together. */
const tier = (over = {}) => ({
  shape: 'round', color: '#F6F2E9', frostingType: 'buttercream', frostingStyle: 'smooth',
  topPipings: [], bottomPipings: [], creamLayers: [], ...over,
});

const DESIGNS = {
  white:  { tiers: [tier({ color: '#FFFFFF' })] },
  colour: { tiers: [tier({ color: '#D94F6E' })] },
  full:   { tiers: [tier({
    color: '#F6F2E9',
    wafer: { count: 85, width: 2.4, height: 1.18, rise: 0.16, taper: 0, ripple: 0.12, ripples: 1.3,
             sway: 0.02, curl: 0.06, splay: 0.03, lean: 0, jitter: 0.4, hem: 'straight', notch: 0.10,
             colour: '#FDFBF7', fin: true, finAngle: 62, ao: 0.45 },
  })] },
};

function App() {
  const design = DESIGNS[SUBJECT] ?? DESIGNS.full;
  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: "'Quicksand', sans-serif" }}>
      {/* ⚠️ THE REFERENCE IS IN THE FRAME, NOT IN ANOTHER FILE. Comparing a render against a
          photograph in a separate capture matches its EXPOSURE, which is arbitrary — that cost a
          whole calibration earlier today. One screenshot, one compression, one display. */}
      <div style={{ width: 300, padding: 16, background: '#fff', borderRight: '1px solid #e7e7e7' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#2C4433' }}>Scene calibration</div>
        <div style={{ fontSize: 11, color: '#777', margin: '6px 0 12px' }}>
          amb {AMB} · key {KEY} · fill {FILL} · env {ENV}
          <br />key:fill {(KEY / (AMB + FILL)).toFixed(2)} : 1
        </div>
        <img src="/ref/wafer-white.jpg" alt="reference"
          style={{ width: '100%', borderRadius: 8, display: 'block' }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <div style={{ fontSize: 10.5, color: '#999', marginTop: 8, lineHeight: 1.5 }}>
          Put the reference photograph at <code>dev/public/ref/wafer-white.jpg</code>. The measuring
          script reads BOTH halves of one screenshot, so exposure cannot drift between them.
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', background: DESIGNER_GROUND }}>
        {/* ⚠️ INSIDE the Canvas, via CakePreview's children slot — SceneBackground calls an R3F hook
            and throws "Hooks can only be used within the Canvas component" anywhere else. */}
        <CakePreview design={design} shadows autoRotate={!q.has('still')} lights={<Rig />}>
          <SceneBackground colour={DESIGNER_GROUND} />
        </CakePreview>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
