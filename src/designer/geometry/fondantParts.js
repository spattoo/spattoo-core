import * as THREE from 'three';

/* ── Modelled fondant: a figure built from rolled pieces ──────────────────────────────────────────
 *
 * A teddy bear is a body, a head, two ears, a muzzle and four limbs — balls and ropes pressed
 * together. That is not an approximation of how a bear is made; it is how a bear is made. This
 * module is the parts list and the maths that decides where a piece comes to rest.
 *
 * ── WHY THIS IS AUTHORED AND NOT GENERATED ──────────────────────────────────────────────────────
 * grass.js sets the test, and cloud.js repeats it: procedural work succeeds on subjects with "no
 * precise familiar signature the eye can check". A cloud is a handful of lumps and there is no
 * proportion to get wrong. ⚠️ A BEAR IS THE OPPOSITE — everybody knows when the head is too big or
 * the ears sit too low, and nobody can say why. So nothing here generates a bear. A person places
 * the pieces and judges the proportions; this file only says what a piece IS and where it lands.
 * The eye that checks the familiar signature is the author's, which is the only eye that can.
 *
 * ── NO ASSET, AND THAT IS THE POINT ─────────────────────────────────────────────────────────────
 * The output is a PARTS LIST, not a mesh. A bear is a few hundred bytes of numbers: it recolours,
 * it reopens for editing, it ships with the design instead of alongside it, and it cannot lose
 * detail in optimisation — which is exactly what happened to the imported unicorn, whose texture and
 * smoothness went in the GLB conversion. There is no conversion here to lose anything in.
 *
 * ── FONDANT WORDS, NOT MATHS WORDS ──────────────────────────────────────────────────────────────
 * `ball`, `rope`, `egg`, `disc` — what a baker rolls. The primitive each maps to is an
 * implementation detail, and naming the tool after the craft costs nothing while the vocabulary is
 * still being set. Persisted in the config, so it is worth being right the first time.
 */

export const SHAPES = {
  ball: { label: 'Ball',  make: () => new THREE.SphereGeometry(1, 32, 24) },
  egg:  { label: 'Egg',   make: () => new THREE.SphereGeometry(1, 32, 24) },   // a ball, scaled
  rope: { label: 'Rope',  make: () => new THREE.CapsuleGeometry(1, 2, 12, 24) },
  cone: { label: 'Cone',  make: () => new THREE.ConeGeometry(1, 2, 28) },
  disc: { label: 'Disc',  make: () => new THREE.CylinderGeometry(1, 1, 1, 32) },
  ring: { label: 'Ring',  make: () => new THREE.TorusGeometry(1, 0.35, 14, 40) },
  slab: { label: 'Slab',  make: () => new THREE.BoxGeometry(2, 2, 2) },
};

export const SHAPE_ORDER = ['ball', 'egg', 'rope', 'cone', 'disc', 'ring', 'slab'];

// A piece as authored. `size` is a half-extent per axis, so every shape scales the same way and a
// ball with unequal sizes simply becomes an egg — which is what happens on a real bench too.
export const defaultPart = (shape, id) => ({
  id, shape,
  pos:  [0, 0, 0],
  size: [0.3, 0.3, 0.3],
  rot:  [0, 0, 0],
  color: null,      // null = take the customer's colour for the element
  mirror: false,    // ⚠️ see expandParts — one ear becomes two
});

/* ⚠️ MIRRORING IS EXPANSION, NOT DUPLICATION.
 *
 * A `mirror` part is stored ONCE and drawn twice, reflected across X. Storing two ears is the
 * obvious alternative and it is wrong: the moment they are two rows, an author who nudges one gets a
 * bear with mismatched ears and no warning. Symmetry a person has to maintain by hand is symmetry
 * that decays. It also halves the placing work, which is most of the work.
 *
 * A part sitting ON the centre line is not mirrored even when flagged — reflecting it would stack a
 * second copy in the same place, doubling the surface and darkening it where they z-fight.
 */
const ON_CENTRE = 1e-3;

export function expandParts(parts) {
  const out = [];
  for (const p of parts ?? []) {
    if (!p?.shape || !SHAPES[p.shape]) continue;      // an unknown shape is skipped, never guessed
    out.push({ ...p, reflected: false });
    if (p.mirror && Math.abs(p.pos?.[0] ?? 0) > ON_CENTRE) {
      out.push({
        ...p,
        id: `${p.id}~m`,
        pos: [-p.pos[0], p.pos[1], p.pos[2]],
        // Yaw and roll flip with the reflection; pitch does not. Without this a tilted ear leans the
        // same way on both sides and the bear looks knocked sideways rather than symmetric.
        rot: [p.rot?.[0] ?? 0, -(p.rot?.[1] ?? 0), -(p.rot?.[2] ?? 0)],
        reflected: true,
      });
    }
  }
  return out;
}

/* ── Where a piece comes to rest ─────────────────────────────────────────────────────────────────
 *
 * ⚠️ THIS IS CONTACT, NOT SIMULATION, and the difference is the whole design.
 *
 * A rigid-body engine is the obvious reading of "obeys physics" and it would destroy the tool: drop
 * an ear on a head and it rolls off, because a sphere resting on a sphere is an unstable equilibrium.
 * The bear would collapse into a pile every time it was touched.
 *
 * Fondant does not behave that way. It is TACKY — you press a piece on and it stays exactly where
 * you pressed it, at any angle, on any overhang. So gravity applies at the MOMENT OF PLACING (a
 * piece falls until it touches something, never floats in mid-air and never sinks through the
 * bench) and stops applying immediately afterwards. That is both what the material does and what
 * makes the tool usable.
 *
 * The contact maths approximates each piece by an ellipsoid of its half-extents. For two balls it
 * is exact — `y = other.y + √((rA+rB)² − d²)`, the sphere-on-sphere resting height. Away from balls
 * it stays plausible and never lets a piece float or interpenetrate deeply, which is all the eye
 * checks. Nothing downstream depends on it being exact: it decides a starting Y that the author is
 * free to drag afterwards.
 */
const horizontalRadius = (p) => Math.max(p.size?.[0] ?? 0, p.size?.[2] ?? 0);
const verticalRadius   = (p) => p.size?.[1] ?? 0;

export function restingY(part, others, benchY = 0) {
  const rxz = horizontalRadius(part), ry = verticalRadius(part);
  // The bench. A piece touching nothing else sits on the board, never below it.
  let y = benchY + ry;

  for (const o of others ?? []) {
    if (!o || o.id === part.id) continue;
    const dx = (part.pos?.[0] ?? 0) - (o.pos?.[0] ?? 0);
    const dz = (part.pos?.[2] ?? 0) - (o.pos?.[2] ?? 0);
    const d  = Math.hypot(dx, dz);
    const reach = rxz + horizontalRadius(o);
    if (reach <= 0 || d >= reach) continue;          // no overlap in plan — it falls past this piece

    // Reduces to the exact sphere formula when both are balls; degrades gently otherwise.
    const lift = (ry + verticalRadius(o)) * Math.sqrt(Math.max(0, 1 - (d / reach) ** 2));
    y = Math.max(y, (o.pos?.[1] ?? 0) + lift);
  }
  return y;
}

// Drop a piece onto whatever is already built. Everything placed BEFORE it holds it up; nothing
// placed after moves it — a bear is built from the bench upward, like the real thing.
export function settle(part, others, benchY = 0) {
  return { ...part, pos: [part.pos?.[0] ?? 0, restingY(part, others, benchY), part.pos?.[2] ?? 0] };
}

/* The whole figure's extent, so a viewer can frame it and the designer can fit it to a placement
 * box the same way it fits a GLB. Mirrored copies included — a bear is wider than its stored parts. */
export function buildBounds(parts) {
  const all = expandParts(parts);
  if (!all.length) return null;
  const box = new THREE.Box3();
  for (const p of all) {
    const c = new THREE.Vector3(p.pos?.[0] ?? 0, p.pos?.[1] ?? 0, p.pos?.[2] ?? 0);
    // Half-extents, ignoring rotation on purpose: an over-tight box crops the figure, and this is
    // used for framing rather than for collision.
    const r = new THREE.Vector3(...(p.size ?? [0, 0, 0]));
    box.expandByPoint(c.clone().sub(r));
    box.expandByPoint(c.clone().add(r));
  }
  return box;
}

/* ── Presets ─────────────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ AN EMPTY BENCH IS THE WRONG PLACE TO START, and this is the difference between a tool people
 * use and one they open once. Getting a bear right from nothing means judging nine proportions at
 * the same time; getting one right from a bear means nudging the ears. Bear, bunny and cat are the
 * same skeleton with different ears and muzzle — so the preset is not nine presets, it is one with
 * three heads.
 *
 * Transcribed from a modelled bear rather than derived from ratios. The numbers below have no
 * formula behind them and should not acquire one: they are what looked right.
 */
const bear = () => {
  const P = (id, shape, pos, size, extra = {}) => ({ ...defaultPart(shape, id), pos, size, ...extra });
  return [
    P('body',  'egg',  [0,  0.42, 0],     [0.42, 0.46, 0.38]),
    P('head',  'ball', [0,  1.10, 0.02],  [0.38, 0.36, 0.36]),
    // ⚠️ The muzzle has to CLEAR the head, not sit inside it. At its first depth the head's own
    // surface (z 0.38) swallowed all but 0.08 of it, so the nose read as a lone dot floating on a
    // blank face — the one thing a bear cannot survive.
    P('muzzle','egg',  [0,  0.99, 0.40],  [0.19, 0.15, 0.17]),
    P('nose',  'ball', [0,  1.03, 0.54],  [0.06, 0.05, 0.05], { color: '#3B2B24' }),
    P('eye',   'ball', [0.15, 1.19, 0.32], [0.045, 0.045, 0.04], { mirror: true, color: '#3B2B24' }),
    // One ear, one arm, one leg — each mirrored. Nudging an ear moves both, forever.
    P('ear',   'ball', [0.28, 1.38, -0.02], [0.14, 0.14, 0.09], { mirror: true }),
    P('arm',   'rope', [0.44, 0.62, 0.06],  [0.13, 0.26, 0.13], { mirror: true, rot: [0, 0, 0.5] }),
    P('leg',   'egg',  [0.26, 0.13, 0.10],  [0.19, 0.16, 0.24], { mirror: true }),
  ];
};

export const PRESETS = {
  bear:  { label: 'Teddy bear', parts: bear },
  // Same skeleton, taller ears and no muzzle bulge — proof the preset is a skeleton rather than a
  // one-off, and the cheapest possible second animal.
  bunny: {
    label: 'Bunny',
    parts: () => bear()
      .filter(p => p.id !== 'muzzle')
      .map(p => (p.id === 'ear'
        ? { ...p, shape: 'egg', pos: [0.21, 1.52, -0.02], size: [0.10, 0.30, 0.08] }
        : p)),
  },
};

export const FONDANT_BUILD_VERSION = 1;

// What gets persisted. Version-stamped from the first row written: a parts list whose meaning
// changes later must be readable as the older meaning, and adding the field afterwards means
// guessing which rows predate it.
export const toConfig = (parts) => ({ version: FONDANT_BUILD_VERSION, parts: parts ?? [] });
