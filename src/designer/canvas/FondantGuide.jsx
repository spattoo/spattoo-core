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

// Fractions of one step. Rolling gets the most time because it is the part a nervous baker is
// actually asking about; placing is quick because it is obvious once you can see the target.
const ROLL_END  = 0.42;
const SHAPE_END = 0.72;

// Where a piece is rolled before it is placed — in front of the figure, clear of it, so the ball
// is never inside the thing being built.
const BENCH = new THREE.Vector3(0, 0, 1.5);

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// A ball of the same VOLUME as the finished piece — what a baker actually pinches off before
// shaping. Deriving it from the volume (not from the largest axis) is why a rope's starting ball
// looks like the right amount of fondant rather than a boulder.
export const startingRadius = (size) =>
  Math.cbrt(Math.max((size?.[0] ?? 0) * (size?.[1] ?? 0) * (size?.[2] ?? 0), 1e-9));

/* The one piece being made right now. `t` runs 0→1 across the step. */
function ActivePiece({ part, t, color }) {
  const ref = useRef();
  const geom = useMemo(() => SHAPES[part.shape]?.make?.() ?? null, [part.shape]);

  useFrame(() => {
    const g = ref.current;
    if (!g) return;

    const r = startingRadius(part.size);
    const target = new THREE.Vector3(...(part.pos ?? [0, 0, 0]));

    if (t <= ROLL_END) {
      // Rolling: a uniform ball on the bench, turning. The turn is what says "rolling" — a static
      // sphere sitting there reads as a finished piece waiting, not as one being made.
      const k = t / ROLL_END;
      g.position.set(BENCH.x, r, BENCH.z);
      g.scale.setScalar(r);
      g.rotation.set(k * Math.PI * 2.2, k * Math.PI * 0.6, 0);
    } else if (t <= SHAPE_END) {
      // Shaping: the ball's uniform scale becomes the piece's real proportions, in place, so the
      // change of FORM is watched on its own rather than while it is also moving.
      const k = easeInOut((t - ROLL_END) / (SHAPE_END - ROLL_END));
      g.position.set(BENCH.x, THREE.MathUtils.lerp(r, part.size[1], k), BENCH.z);
      g.scale.set(
        THREE.MathUtils.lerp(r, part.size[0], k),
        THREE.MathUtils.lerp(r, part.size[1], k),
        THREE.MathUtils.lerp(r, part.size[2], k),
      );
      g.rotation.set(0, 0, 0);
    } else {
      // Placing: travel, then squash on contact. The squash peaks at touchdown and springs back —
      // fondant pressed on fondant flattens where it meets and does not stay flattened.
      const k = easeInOut(clamp01((t - SHAPE_END) / (1 - SHAPE_END)));
      const from = new THREE.Vector3(BENCH.x, part.size[1], BENCH.z);
      g.position.lerpVectors(from, target, k);
      /* ⚠️ ARCED, NOT STRAIGHT. A straight lerp from the bench to a point on the head passes
         THROUGH the body — the ear was seen tunnelling out of the bear's chest on its way up,
         which reads as a rendering fault rather than as a hand carrying a piece. A quadratic
         apex above both ends lifts it over, and it is also simply how an arm moves. */
      const apex = Math.max(from.y, target.y) + 0.45;
      const u = 1 - k;
      g.position.y = from.y * u * u + apex * 2 * u * k + target.y * k * k;
      // A short bump near the end: 1 → 0 → 1 over the last third of the travel.
      const press = Math.sin(clamp01((k - 0.66) / 0.34) * Math.PI) * 0.16;
      g.scale.set(part.size[0] * (1 + press * 0.5), part.size[1] * (1 - press), part.size[2] * (1 + press * 0.5));
      g.rotation.set(...(part.rot ?? [0, 0, 0]));
    }
  });

  if (!geom) return null;
  return (
    <group ref={ref}>
      <mesh geometry={geom} castShadow>
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
