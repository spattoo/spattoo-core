import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
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

/* ── Two places, side by side ────────────────────────────────────────────────────────────────────
 *
 * ⚠️ MAKING ON THE LEFT, ASSEMBLING ON THE RIGHT. The bench used to sit in FRONT of the figure, so
 * from the camera a piece was worked BELOW the bear and then travelled up into it. That reads as
 * one muddled space: the piece looks like part of the figure that has fallen off, and at the moment
 * of placing it passes across the very thing it is joining.
 *
 * Two clearly separate areas is how a bench actually works — you shape a piece in the space in
 * front of you and the figure stands to one side — and it lets a reader watch either half without
 * the other moving. Left-to-right because that is the direction the eye already travels, so the
 * journey of a piece runs the same way as the reading order.
 */
export const BENCH    = new THREE.Vector3(-1.15, 0, 0.15);   // where a piece is made
export const ASSEMBLY = new THREE.Vector3( 0.95, 0, 0);      // where the figure stands

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
/* ⚠️ ONE SHARED RHYTHM. The hands and the piece are posed from the SAME oscillation — if each had
 * its own, they would drift apart within a second and the hands would be seen rolling thin air
 * beside a piece moving to its own beat. Worse than no hands at all. */
export const rollPasses = (k) => Math.sin(k * Math.PI * 7);
export const pressPulse = (k) => Math.sin(clamp01(k) * Math.PI * 3);

const FORMING = {
  // Rolled under flat palms, shuttling along its own length. The rock about Z is the wrist.
  rope: (k, g, r) => {
    const passes = rollPasses(k);
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

/* ── Hands ───────────────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ OUTLINED AND TRANSLUCENT, NEVER SOLID. The fondant is the subject; a pair of opaque hands in
 * front of it hides the very thing being shown, which is the usual failure of a filmed how-to and
 * the one advantage a drawn guide has. These are a palm's silhouette and nothing more — no fingers,
 * no skin tone, nothing that invites a judgement about whose hands they are.
 *
 * They exist because the motion alone was not enough: a rope elongating on a board says WHAT
 * happens and not HOW, and "how do I make an arm?" is the question the whole guide is for.
 *
 * Posed per shape from the shared rhythm above, so hand and piece move as one gesture.
 */
const ICON_INK = '#2E3338';

/* ── The hand, as an ICON ────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ A SOLID SIDE-ON SILHOUETTE — an open palm, fingers reaching left, thumb raised. Four attempts
 * to get here, and each failure taught the same lesson from a different angle:
 *
 *   1. A flattened ellipsoid per palm. Read as a DISC. A viewer who must be TOLD what a shape is
 *      has not been shown anything.
 *   2. Ellipsoid + fingers + thumb, modelled in 3D. From a camera above and in front the fingers
 *      pointed away and foreshortened into stubs; the pair read as two small crabs. Enlarging them
 *      only made the crabs bigger.
 *   3. Flat, but built from rounded RECTANGLES and seen palm-on. Legible, and still wrong: it read
 *      as a mitten or a comb, because a front-on hand is mostly a blob and the thing that makes a
 *      hand instantly recognisable is its PROFILE.
 *   4. This. Drawn side-on in curves, filled solid, billboarded to the camera. It survives any
 *      orbit and any size, because a silhouette is what an icon is.
 *
 * Solid rather than hollow: an outline needs a light interior, and a light interior over pale
 * fondant on a pale bench is three near-whites stacked. Dark ink separates cleanly from both, and
 * the slight transparency keeps the work readable underneath.
 *
 * Drawn here rather than loaded as an SVG — that would be an asset to ship and version, for one
 * closed path.
 */
function handShape() {
  const h = new THREE.Shape();
  /* ⚠️ THE PALM CARRIES THE MASS. The first cut of this path was drawn at roughly 4:1 and rendered
   * as two dark SLIVERS — a hand read from the side is not a thin blade, it is a broad wedge with
   * the fingers tapering off it. The heel is now nearly half as deep as the hand is long. */
  h.moveTo(-0.52, 0.020);
  // Along the top of the fingers, scalloped just enough to count them. A smooth edge is a flipper.
  h.quadraticCurveTo(-0.42, 0.085, -0.35, 0.055);
  h.quadraticCurveTo(-0.30, 0.105, -0.23, 0.070);
  h.quadraticCurveTo(-0.18, 0.115, -0.11, 0.080);
  h.quadraticCurveTo(-0.06, 0.120, -0.01, 0.090);
  // The thumb: up, over, and back down into the web. Without it this is a paddle.
  h.bezierCurveTo(0.020, 0.190, 0.060, 0.310, 0.130, 0.295);
  h.bezierCurveTo(0.190, 0.280, 0.165, 0.190, 0.145, 0.135);
  // Across the back of the hand and round the wrist.
  h.quadraticCurveTo(0.260, 0.130, 0.360, 0.125);
  h.bezierCurveTo(0.470, 0.118, 0.545, 0.060, 0.545, -0.020);
  // The heel — the deep part — and the underside sweeping back out to the fingertips.
  h.bezierCurveTo(0.545, -0.150, 0.430, -0.265, 0.230, -0.280);
  h.bezierCurveTo(0.060, -0.292, -0.130, -0.190, -0.300, -0.090);
  h.quadraticCurveTo(-0.430, -0.030, -0.520, 0.020);
  return h;
}

const HAND_GEOM = new THREE.ShapeGeometry(handShape(), 14);

function Hand({ position, rotation = 0, scale = 1, flip = false }) {
  return (
    // Billboarded: the icon turns to face the camera however the scene is orbited, which is the
    // whole reason it survives where the modelled hand did not.
    <Billboard position={position}>
      <mesh geometry={HAND_GEOM} rotation={[0, 0, rotation]}
            scale={[flip ? -scale : scale, scale, scale]}>
        <meshBasicMaterial color={ICON_INK} transparent opacity={0.86} depthWrite={false} />
      </mesh>
    </Billboard>
  );
}

/* Where the two palms sit for each action. `r` is the working ball's radius, so the hands scale
 * with the piece rather than dwarfing a nose or vanishing beside a body. */
function Hands({ shape, k, r, size }) {
  const p = Math.max(r, 0.05);

  /* ⚠️ DELIBERATELY NOT TO SCALE. A real palm dwarfs a bear's arm — drawn honestly it would cover
   * the piece completely and the guide would show two hands and no fondant. So a palm is sized to
   * the WORK, at roughly twice the piece across. Nobody reads it as a measurement; they read it as
   * "this is where your hands go". */
  /* One number: a hand keeps its proportions, where an ellipsoid was stretched per axis.
   *
   * ⚠️ CLAMPED, because A HAND IS A FIXED SIZE and the piece is not. Scaling it off the working
   * ball alone was fine for an arm and grotesque for the head — at 5× a 0.37 ball the pair filled
   * the bench and swallowed the very thing they were rounding. It still tracks the piece a little,
   * so a pea-sized eye does not get bench-sized hands, but it cannot run away.
   *
   * The lower bound matters as much: below ~0.5 the fingers were a few pixels each and the pair
   * read as two small crabs. Legibility, not realism, sets both ends. */
  const hs    = THREE.MathUtils.clamp(p * 4.0, 0.62, 1.0);
  const thick = hs * 0.10;

  if (shape === 'rope') {
    // Two flat palms ABOVE the rope, shuttling along it — the same `rollPasses` the rope uses.
    // The rope lies on its side, so its top is its RADIUS, not its length.
    const x   = rollPasses(k) * p * 0.6;
    const len = THREE.MathUtils.lerp(p, size[1], k);
    const top = THREE.MathUtils.lerp(p, size[0], k) * 2;
    /* ⚠️ Spread by at least a palm's own WIDTH. Placing them at ±len/2 put both hands on top of
       each other on a short rope — two palms occupying one space reads as a single blob, and the
       whole point is that a rope is rolled with two hands apart. */
    /* ⚠️ Two separations at once, and both were wrong first time. They must clear EACH OTHER
       (a hand's own width) or the pair merges into one grey mass — and they must be turned off
       square, because fingers pointing straight away from the camera foreshorten into stubs and
       the fan that makes a hand legible disappears. A three-quarter yaw shows the fingers. */
    const sep = Math.max(len * 0.55, hs * 0.62);
    return (
      <group>
        {/* Coming in from either side onto the rope, fingers reaching toward it. */}
        <Hand position={[x - sep, top + thick * 1.6, 0]} rotation={-0.35} scale={hs} flip />
        <Hand position={[x + sep, top + thick * 1.6, 0]} rotation={ 0.35} scale={hs} />
      </group>
    );
  }
  if (shape === 'disc' || shape === 'slab') {
    // One palm pressing down in the same three pulses the piece flattens in; the board takes the
    // other side, so a second palm underneath would be a lie.
    const press = Math.abs(pressPulse(k));
    const top   = THREE.MathUtils.lerp(p, size[1], k) * 2;
    // Pressing down from above: turned so the palm faces the work.
    return <Hand position={[hs * 0.1, top + thick * (3.4 - press * 2), 0]} rotation={-0.5} scale={hs} />;
  }
  // Rounding and tapering: cupped either side, turning with the piece.
  const wid = THREE.MathUtils.lerp(p, size[0], k);
  const mid = THREE.MathUtils.lerp(p, size[1], k);
  /* ⚠️ NO YAW ON THE PAIR. Turning the group about Y was right for modelled palms following the
     piece round; for BILLBOARDED icons it only walks them in a circle, and half a turn in they
     were both stacked on the same side of the ball with the work hidden behind them. The piece
     itself already turns — the hands only need to stay either side of it. */
  return (
    <group position={[0, mid, 0]}>
      {/* Cupped: palms turned to FACE each other, which is how a ball is rounded. */}
      {/* Clear of the piece by half a hand, or they cup thin air over the top of it. */}
      <Hand position={[-(wid + hs * 0.42), 0, 0]} rotation={-0.25} scale={hs} flip />
      <Hand position={[  wid + hs * 0.42,  0, 0]} rotation={ 0.25} scale={hs} />
    </group>
  );
}

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
    // The figure stands to the RIGHT, so a piece's authored position is relative to that area.
    const dest = new THREE.Vector3(...(part.pos ?? [0, 0, 0])).add(ASSEMBLY);

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
  // Hands only while the piece is being WORKED. During placing they would obscure the moment the
  // guide is least ambiguous about — where the piece goes.
  const working = t <= FORM_END;
  const formK = clamp01((t - PINCH_END) / (FORM_END - PINCH_END));

  return (
    <>
    {working && (
      <group position={[BENCH.x, 0, BENCH.z]}>
        <Hands shape={rolling ? 'ball' : part.shape} k={rolling ? t / PINCH_END : formK}
               r={r} size={part.size} />
      </group>
    )}
    <group ref={ref}>
      <mesh castShadow {...(rolling ? {} : { geometry: target })}>
        {rolling && <sphereGeometry args={[r, 32, 24]} />}
        {/* The piece being worked is lit a touch warmer than the ones already placed, so the eye
            knows which one to watch without an arrow or an outline pointing at it. */}
        <meshStandardMaterial color={part.color ?? color} roughness={0.72} metalness={0}
                              emissive="#5a3a1a" emissiveIntensity={0.14} />
      </mesh>
    </group>
    </>
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
      {/* Everything already made stands together, to the right. */}
      <group position={ASSEMBLY}>
        <FondantBuild parts={done} color={color} />
        {active && t >= 1 && (
          // Finished: hand it to the normal renderer, which is also what brings in the mirrored twin.
          <FondantBuild parts={[active]} color={color} />
        )}
      </group>
      {/* The piece being made travels from the bench into that group's space, so it is NOT a child
          of it — it carries the offset itself (see `dest`). */}
      {active && t < 1 && <ActivePiece part={active} t={t} color={color} />}
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
    <mesh ref={ref} position={[BENCH.x, 0.42, BENCH.z]} castShadow>
      <sphereGeometry args={[0.42, 32, 24]} />
      <meshStandardMaterial color={color} roughness={0.72} metalness={0} />
    </mesh>
  );
}

// How many pieces are on the bench once this step finishes — mirrored copies counted, because that
// is what a person looking at the screen counts.
export const piecesAfterStep = (parts, step) =>
  expandParts((parts ?? []).slice(0, step + 1)).length;
