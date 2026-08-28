import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import FondantBuild from './FondantBuild.jsx';
import { SHAPES, expandParts } from '../geometry/fondantParts.js';

/* ── Showing how it is made, in 3D ───────────────────────────────────────────────────────────────
 *
 * A baker opens an order with a photo of a fondant bear and does not know where to start. A written
 * step ("roll a ball about a third the size of the body") tells them WHAT; it does not show them the
 * ball becoming an ear. This is the showing.
 *
 * ⚠️ THERE IS NO NEW DATA HERE, and that is why this is cheap. Every piece in the model is already
 * A SCALED PRIMITIVE AT A POSITION — so the animation is an interpolation from "a plain ball on the
 * bench" to "that scale, in that place". Rolling a rope IS a ball elongating; tapering an egg IS a
 * sphere scaled unevenly. The model happens to be shaped exactly like the craft it describes.
 *
 * Three phases per piece, in the order a pair of hands does them:
 *
 *   ROLL   a ball of the right VOLUME appears on the bench and turns under an imaginary palm.
 *          Uniform scale, so it reads as a ball whatever it is about to become.
 *   SHAPE  that ball's scale lerps to the piece's real proportions. For a ball this is a no-op and
 *          the phase passes invisibly, which is correct — nobody shapes a ball.
 *   PLACE  it travels to where it belongs and SQUASHES slightly as it lands, because fondant
 *          pressed onto fondant flattens where it touches. Without the squash it reads as a rigid
 *          part clicking into a socket rather than a soft one being pressed on.
 *
 * ⚠️ EVERY FRAME IS REF WORK, NEVER STATE. Driving this with useState would re-render the whole
 * scene sixty times a second — the mistake already made once in this codebase and paid for.
 */

/* ── Fractions of one step ───────────────────────────────────────────────────────────────────────
 *
 * ⚠️ FORMING GETS MOST OF THE TIME, and the first cut had this backwards. It gave rolling the
 * largest share and lerped the shape smoothly in a third of a second, which produced an ASSEMBLY
 * animation: pieces appeared, morphed, and were placed. Assembly is the part a baker can already
 * picture. The part they are stuck on is "how do I make an ARM?" — and a smooth scale lerp is not
 * an answer, it is a dissolve.
 *
 * So the middle phase is the guide, and it is now more than half of every step.
 */
const PINCH_END = 0.22;   // tear off a piece and round it between the palms
const FORM_END  = 0.82;   // work it into shape — the part worth watching
                          // …and the remainder places it

// Where a piece is worked before it is placed — in front of the figure, clear of it, so the ball
// is never inside the thing being built.
const BENCH = new THREE.Vector3(0, 0, 1.5);

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// A ball of the same VOLUME as the finished piece — what a baker actually pinches off before
// shaping. Deriving it from the volume (not from the largest axis) is why a rope's starting ball
// looks like the right amount of fondant rather than a boulder.
export const startingRadius = (size) =>
  Math.cbrt(Math.max((size?.[0] ?? 0) * (size?.[1] ?? 0) * (size?.[2] ?? 0), 1e-9));

/* ── The hand action that makes each shape ───────────────────────────────────────────────────────
 *
 * ⚠️ THIS IS THE POINT OF THE WHOLE FILE. A shape does not just BECOME longer; it is rolled longer,
 * back and forth, in passes. Rhythm is what separates "somebody made this" from "this morphed" —
 * and with no hands on screen, the motion is the only thing carrying it. Each entry returns a small
 * per-frame overlay applied while the piece is being worked.
 *
 *   k     0→1 through the forming phase
 *   g     the group being posed
 *   r     the starting ball's radius, for sizing the movement
 *
 * Deliberately small movements. A piece that swings about reads as being juggled; fondant is worked
 * against a board with the weight of a palm on it.
 */
const FORMING = {
  // Rolled under flat palms, shuttling along its own length. The rock about Z is the wrist.
  rope: (k, g, r) => {
    const passes = Math.sin(k * Math.PI * 7);
    g.position.x = BENCH.x + passes * r * 0.55;
    g.rotation.z = Math.PI / 2 + passes * 0.10;   // lying down, rocking
    g.rotation.y = 0;
  },
  // Rounded first, then one end narrowed — the piece turns under the hands as it tapers.
  egg: (k, g) => { g.rotation.y = k * Math.PI * 1.6; g.rotation.z = Math.sin(k * Math.PI * 4) * 0.06; },
  // Same turning, plus the rock that comes from working one end harder than the other.
  cone: (k, g) => { g.rotation.y = k * Math.PI * 1.6; g.rotation.z = Math.sin(k * Math.PI * 3) * 0.12; },
  // Pressed flat. Three distinct presses rather than one squash, because that is how a disc is
  // actually made — press, turn, press again.
  disc: (k, g) => { g.rotation.y = k * Math.PI; },
  // Rolled long, then brought round. The spin shows the ring closing.
  ring: (k, g) => { g.rotation.x = -Math.PI / 2 + k * 0.5; g.rotation.z = k * Math.PI * 1.2; },
  slab: (k, g) => { g.rotation.y = k * 0.3; },
  // A ball is not shaped — it is only rounded, so it keeps turning between the palms.
  ball: (k, g) => { g.rotation.y = k * Math.PI * 2; g.rotation.x = k * Math.PI * 0.8; },
};

/* How much of the way to its final proportions the piece is at `k`.
 *
 * ⚠️ A DISC AND A SLAB ARE PRESSED, NOT STRETCHED: they flatten in punches, so the eased curve is
 * stepped for them. Everything else grows steadily under a rolling palm. */
const formProgress = (shape, k) =>
  (shape === 'disc' || shape === 'slab')
    ? easeInOut(clamp01(Math.floor(k * 3 + 0.5) / 3))    // three distinct presses
    : easeInOut(k);

/* The one piece being made right now. `t` runs 0→1 across the step. */
function ActivePiece({ part, t, color }) {
  const ref = useRef();
  const target = useMemo(() => SHAPES[part.shape]?.make?.() ?? null, [part.shape]);
  const r = startingRadius(part.size);

  /* ⚠️ THE PINCH PHASE DRAWS A REAL SPHERE, not the target geometry scaled down. It used to draw
   * the target — so a step captioned "roll a ball, then pinch it into a cone" opened on a tiny
   * CONE, and the one moment the guide claims to show a ball being rolled showed the finished
   * shape instead. The swap happens exactly when the hands change action, which is where a baker
   * would look for it anyway. */
  const rolling = t <= PINCH_END;

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const dest = new THREE.Vector3(...(part.pos ?? [0, 0, 0]));

    if (rolling) {
      // Rounding it between the palms: a real ball, turning, on the bench.
      const k = t / PINCH_END;
      g.position.set(BENCH.x, r, BENCH.z);
      g.scale.setScalar(1);
      g.rotation.set(k * Math.PI * 2.4, k * Math.PI * 0.8, 0);
    } else if (t <= FORM_END) {
      // Worked into shape, IN PLACE, so the change of form is watched on its own rather than while
      // it is also travelling.
      const k = clamp01((t - PINCH_END) / (FORM_END - PINCH_END));
      const f = formProgress(part.shape, k);
      g.scale.set(
        THREE.MathUtils.lerp(r, part.size[0], f),
        THREE.MathUtils.lerp(r, part.size[1], f),
        THREE.MathUtils.lerp(r, part.size[2], f),
      );
      /* ⚠️ A ROPE IS ROLLED LYING DOWN, so once it is turned on its side its half-height is its
         RADIUS, not its long axis. Resting it at size[1] left the arm hovering a visible gap above
         the board while it was being rolled — which is the one thing a rolling animation cannot
         afford, since rolling is contact with the board. */
      const halfHeight = part.shape === 'rope' ? part.size[0] : part.size[1];
      g.position.set(BENCH.x, THREE.MathUtils.lerp(r, halfHeight, f), BENCH.z);
      g.rotation.set(0, 0, 0);
      (FORMING[part.shape] ?? FORMING.ball)(k, g, r);
    } else {
      // Placing: travel, then squash on contact. The squash peaks at touchdown and springs back —
      // fondant pressed onto fondant flattens where it meets and does not stay flattened.
      const k = easeInOut(clamp01((t - FORM_END) / (1 - FORM_END)));
      const from = new THREE.Vector3(BENCH.x, part.size[1], BENCH.z);
      g.position.lerpVectors(from, dest, k);
      /* ⚠️ ARCED, NOT STRAIGHT. A straight lerp from the bench to a point on the head passes
         THROUGH the body — the ear was seen tunnelling out of the bear's chest on its way up,
         which reads as a rendering fault rather than as a hand carrying a piece. A quadratic
         apex above both ends lifts it over, and it is also simply how an arm moves. */
      const apex = Math.max(from.y, dest.y) + 0.45;
      const u = 1 - k;
      g.position.y = from.y * u * u + apex * 2 * u * k + dest.y * k * k;
      const press = Math.sin(clamp01((k - 0.66) / 0.34) * Math.PI) * 0.16;
      g.scale.set(part.size[0] * (1 + press * 0.5), part.size[1] * (1 - press), part.size[2] * (1 + press * 0.5));
      g.rotation.set(...(part.rot ?? [0, 0, 0]));
    }
  });

  if (!target) return null;
  return (
    <group ref={ref}>
      <mesh castShadow {...(rolling ? {} : { geometry: target })}>
        {rolling && <sphereGeometry args={[r, 32, 24]} />}
        {/* The piece being worked is lit a touch warmer than the ones already placed, so the eye
            knows which one to watch without an arrow or an outline pointing at it. */}
        <meshStandardMaterial color={part.color ?? color} roughness={0.72} metalness={0}
                              emissive="#5a3a1a" emissiveIntensity={0.14} />
      </mesh>
    </group>
  );
}

/* ── The guide ───────────────────────────────────────────────────────────────────────────────────
 *
 * `step` is which piece is being made (0-based); `t` is progress through it. The pieces BEFORE it
 * are drawn finished and still — a guide that re-animated the whole figure every step would make
 * the viewer re-watch seven pieces to see the eighth.
 *
 * ⚠️ The mirrored copy of a pair appears only when the step COMPLETES. Animating both from the
 * bench at once shows two balls being rolled simultaneously, which no pair of hands does — you roll
 * one, then the other, and the honest simplification is to make one and let its twin arrive with it.
 */
export default function FondantGuide({ parts, step = 0, t = 1, color = '#C9A227' }) {
  const list   = useMemo(() => (parts ?? []).filter(p => p?.shape && SHAPES[p.shape]), [parts]);
  const done   = useMemo(() => list.slice(0, step ?? 0), [list, step]);
  const active = step == null ? null : (list[step] ?? null);

  /* ⚠️ `step == null` is the COLOUR step — the fondant exists but no piece has been made yet. It
     shows the coloured lump turning under a hand, because a step that showed an empty bench would
     read as the guide having nothing to say about the part a baker is most stuck on. */
  if (step == null) return <KneadingLump color={color} />;

  return (
    <group>
      <FondantBuild parts={done} color={color} />
      {active && (t >= 1
        // Finished: hand it to the normal renderer, which is also what brings in the mirrored twin.
        ? <FondantBuild parts={[active]} color={color} />
        : <ActivePiece part={active} t={t} color={color} />)}
    </group>
  );
}

/* The coloured lump, before anything is made from it. Turning slowly: kneading is what the step
 * describes, and a static ball reads as fondant already prepared rather than being worked. */
function KneadingLump({ color }) {
  const ref = useRef();
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.5;
    ref.current.rotation.x += dt * 0.22;
  });
  return (
    <mesh ref={ref} position={[0, 0.42, 0]} castShadow>
      <sphereGeometry args={[0.42, 32, 24]} />
      <meshStandardMaterial color={color} roughness={0.72} metalness={0} />
    </mesh>
  );
}

// How many pieces are on the bench once this step finishes — mirrored copies counted, because that
// is what a person looking at the screen counts.
export const piecesAfterStep = (parts, step) =>
  expandParts((parts ?? []).slice(0, step + 1)).length;
