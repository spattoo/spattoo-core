import * as THREE from 'three';
import { topContains } from './surface.js';

// ── Piped grass ───────────────────────────────────────────────────────────────
// The Wilton 233 look: a flat nozzle face pierced with ~15 small holes, so one squeeze puts down a
// whole CLUMP of strands at once. Every nozzle in the cream pen's library is a single closed profile
// swept along a path (see NOZZLES / lobedProfile) — a grass tip cannot be written that way. A
// 20-lobe profile is one rope with 20 grooves, which is a gear, not grass.
//
// ── WHY PROCEDURAL AND NOT A MODELLED ASSET ─────────────────────────────────────
// Two reasons, and the second is the one that decides it:
//   * It has to fit ANY tier. A modelled patch is authored at one radius; the drip ring learned this
//     already and builds from the tier's real geometry (chocolateDrip.js).
//   * Grass is IRREGULAR BY NATURE. Procedural work in this codebase has failed exactly where the
//     subject has a precise familiar signature the eye can check (isomalt's refraction, the palette
//     knife's tool marks) and succeeded where it does not (drips, glaze, relief). There is no
//     canonical blade, so a "wrong" strand simply reads as a different strand.
//
// ── ONE TUFT, INSTANCED — NOT ONE BIG MESH ──────────────────────────────────────
// This file builds ONE tuft and a list of seats. A dense top is ~3000 tufts: merged into a single
// buffer that is ~400k triangles of unique geometry, which hurts on a phone. As an InstancedMesh it
// is one draw call over ~120 triangles of real geometry. So the split here is deliberate — geometry
// and placement are separate exports, and the renderer instances them.

export const GRASS_DEFAULTS = Object.freeze({
  strands:    11,     // holes in the nozzle face
  height:     0.22,   // longest blade, in cake units
  thickness:  0.011,  // blade radius at the base
  splay:      0.38,   // how far the clump fans out (0 = a brush, 1 = flat on the surface)
  droop:      0.30,   // how much a blade bows over along its length
  lengthVary: 0.40,   // shortest blade as a fraction of the longest is (1 - lengthVary)
  spacing:    0.075,  // centre-to-centre distance between tufts
  jitter:     0.55,   // how far a tuft may wander off its grid seat (fraction of spacing)
});

// Deterministic PRNG. Grass must look random and be STABLE: an unseeded Math.random would re-roll
// every blade on each re-render, so the patch would shimmer whenever an unrelated slider moved.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One blade: a tapered 3-sided prism bowed along its length. Three sides because a blade is seen
// end-on from every angle a cake is viewed at and nobody counts them — it is a quarter of the cost
// of a round tube and reads identically once shaded.
const SIDES = 3;
const SEGS  = 3;

function pushBlade(pos, nor, idx, { origin, dir, bend, len, r0 }) {
  const base = idx.baseIndex;
  const up   = dir.clone().normalize();
  // A frame around the blade's axis. Any perpendicular will do; pick the one that does not collapse
  // when the blade happens to point straight up.
  const ref  = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u    = new THREE.Vector3().crossVectors(up, ref).normalize();
  const v    = new THREE.Vector3().crossVectors(up, u).normalize();

  for (let s = 0; s <= SEGS; s++) {
    const t = s / SEGS;
    // Taper to a POINT, not a stump — a blade of grass ends in a tip, and a flat top end is the
    // single thing that makes piped grass read as a bundle of wires instead.
    const r = r0 * (1 - t) ** 0.8;
    // Bow: the blade leans further from its axis the higher up it goes, quadratically, so the base
    // stays planted and the tip is what droops.
    const centre = origin.clone()
      .addScaledVector(up, len * t)
      .addScaledVector(bend, len * t * t);
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2;
      const nx = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
      pos.push(centre.x + nx.x * r, centre.y + nx.y * r, centre.z + nx.z * r);
      nor.push(nx.x, nx.y, nx.z);
    }
  }
  for (let s = 0; s < SEGS; s++) {
    for (let k = 0; k < SIDES; k++) {
      const a = base + s * SIDES + k;
      const b = base + s * SIDES + ((k + 1) % SIDES);
      const c = a + SIDES, d = b + SIDES;
      idx.list.push(a, c, b, b, c, d);
    }
  }
  idx.baseIndex += (SEGS + 1) * SIDES;
}

// ONE tuft, seated at the origin and growing up +Y. Instance this; do not call it per seat.
export function buildGrassTuft(opts = {}) {
  const o = { ...GRASS_DEFAULTS, ...opts };
  const rand = rng(o.seed ?? 1);
  const pos = [], nor = [], idx = { list: [], baseIndex: 0 };

  for (let i = 0; i < o.strands; i++) {
    // Blades leave the nozzle face, so they start spread over a small disc rather than all from one
    // point — a single origin gives a firework, which is the other classic way this reads wrong.
    const fa = rand() * Math.PI * 2;
    const fr = Math.sqrt(rand()) * o.thickness * 2.2;
    const origin = new THREE.Vector3(Math.cos(fa) * fr, 0, Math.sin(fa) * fr);

    // Fan outward: tilt away from vertical, more for blades that started nearer the rim of the face.
    const tilt = o.splay * (0.35 + 0.65 * rand()) * (Math.PI / 4);
    const az   = fa + (rand() - 0.5) * 1.2;
    const dir  = new THREE.Vector3(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az));

    // The bow is horizontal and points the way the blade already leans, so it exaggerates the lean
    // rather than fighting it.
    const lean = o.droop * (0.4 + rand());
    // The downward sag is a FRACTION of the height this blade actually gained, never an absolute
    // drop. An absolute one sank the tips of the flattest blades into the cake at high droop —
    // y(t) = len·dir.y·(t − sag·t²) stays positive for sag ≤ 0.8, whatever the lean.
    const sagFrac = Math.min(0.8, o.droop * 0.8);
    const bend = new THREE.Vector3(Math.cos(az) * lean, -dir.y * sagFrac, Math.sin(az) * lean);

    const len = o.height * (1 - o.lengthVary * rand());
    pushBlade(pos, nor, idx, { origin, dir, bend, len, r0: o.thickness });
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx.list);
  g.computeBoundingSphere();
  return g;
}

// Where the tufts sit on a surface. A jittered grid clipped by the shape's own containment test, so
// round, sheet, heart and number tiers all work through ONE path rather than a branch per family
// (INVARIANTS #1). `inset` keeps the patch off the very edge; pass 1 to run right to it.
//
// `bandInner` (0..1, null = cover the whole top) hollows out the middle to leave grass hugging the
// rim — the football-cake look, where the design shows through and the grass rings it. It is a SCALE
// of the tier's own outline, not a radius: measuring distance from the centre would put a circular
// ring on a sheet cake instead of a band that follows the edge. Same containment test, run at a
// smaller scale, so the hole is the tier's shape and corners stay grassed.
//
// Returns [{ x, z, yaw, scale }] — yaw and scale vary per seat so a field of identical tufts does
// not read as wallpaper.
// `hole` = { shape, scale } excludes anything standing inside ANOTHER outline. That is what makes a
// board ring possible: the grass is bounded OUTSIDE by the board and INSIDE by the cake, which are
// two different shapes. `bandInner` cannot express it — it hollows out the same outline it fills.
// Both are exclusions and they answer different questions, so both exist rather than one pretending.
export function grassSeats({ shape, spacing, jitter, inset = 0.98, seed = 7, bandInner = null, hole = null }) {
  const s    = spacing ?? GRASS_DEFAULTS.spacing;
  const j    = jitter  ?? GRASS_DEFAULTS.jitter;
  const rand = rng(seed);
  const ext  = shape.outline || shape.kind === 'rect'
    ? Math.max(shape.halfW ?? 0, shape.halfD ?? 0)
    : (shape.radius ?? 1);
  const out = [];
  // Rows offset by half a step: a square grid leaves visible aisles no matter how much you jitter it.
  const rowH = s * 0.866;
  let row = 0;
  for (let z = -ext; z <= ext; z += rowH, row++) {
    for (let x = -ext - (row % 2 ? s / 2 : 0); x <= ext; x += s) {
      const px = x + (rand() - 0.5) * s * j;
      const pz = z + (rand() - 0.5) * rowH * j;
      if (!topContains(shape, px, pz, inset)) continue;
      // Hollow the middle out for a rim band. The hole is the tier's own outline scaled down, so it
      // follows a heart or a sheet as faithfully as a circle.
      if (bandInner != null && topContains(shape, px, pz, bandInner)) continue;
      // Standing where the cake is. A board ring must start at the wall, not under it.
      if (hole && topContains(hole.shape, px, pz, hole.scale ?? 1)) continue;
      out.push({ x: px, z: pz, yaw: rand() * Math.PI * 2, scale: 0.8 + rand() * 0.4 });
    }
  }
  return out;
}

// Triangles a patch will cost, so a density control can be honest about it before it is dragged.
export function grassTriangleCount(seatCount, strands = GRASS_DEFAULTS.strands) {
  return seatCount * strands * SIDES * SEGS * 2;
}
