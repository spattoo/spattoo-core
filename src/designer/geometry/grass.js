import * as THREE from 'three';
import { topContains, perimeter } from './surface.js';
import { pushStrand, STRAND_SIDES, STRAND_SEGS , finishGeometry } from './strand.js';
import { mulberry32 } from '../utils/random.js';

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

// Deterministic PRNG — `mulberry32` from utils/random.js, which calls itself "the ONE copy" and was.
// This file carried a local look-alike until gypsophila copied it and made three; verified identical
// for seeds 1, 7, 42 and 99999 over 500 draws before switching, so no blade moved.
// Grass must look random and be STABLE: unseeded, every blade would re-roll on each render and the
// patch would shimmer whenever an unrelated slider moved.
const rng = mulberry32;

/* One blade: a tapered 3-sided prism bowed along its length, ending in a POINT. The solid itself
   lives in strand.js now — a gypsophila twig is the same shape, and copying it would have been the
   textbook version of the rule about building something good twice. Behaviour is unchanged: the
   defaults there are this file's old constants. */
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
    pushStrand(pos, nor, idx, { origin, dir, bend, len, r0: o.thickness });
  }

  return finishGeometry(pos, nor, idx);
}

/* ── The flat field a ring of grass encloses ─────────────────────────────────────────────────────
 *
 * The cricket-cake pattern, and the one every reference of it shows: a flat green circle on the
 * cake top with piped grass ringing its edge, bat and ball and stumps sitting on the flat part.
 * `bandInner` has always been able to make the ring — it hollows out the middle and leaves grass
 * hugging the rim — but the hollow showed the CAKE through it, so the middle was whatever colour
 * the tier was. The flat green is the other half of the look and it did not exist.
 *
 * ⚠️ IT IS THE TIER'S OWN OUTLINE, SCALED — not a circle. `bandInner` is defined as a scale of the
 * outline rather than a radius, for the reason stated where it is used: a radius would put a round
 * patch on a sheet cake instead of a field that follows the edge. The cap is built from the same
 * `perimeter(shape)` every other surface in this codebase walks, so a heart tier gets a heart of
 * flat green and a number tier gets a number, through ONE path (INVARIANTS #1).
 *
 * ⚠️ IT SITS SLIGHTLY PROUD OF THE TOP, because a cap exactly at `topY` z-fights the tier's own cap
 * — two coplanar surfaces, and which one wins is down to depth precision and the camera angle, so
 * it flickers as the cake turns. A hair above is the standard answer and the one the sticker path
 * already uses.
 *
 * @param shape    the tier's footprint — anything `perimeter()` understands
 * @param scale    how far out the flat part reaches, as a fraction of the outline (= `bandInner`)
 * @param segments how finely the outline is sampled
 */
export function buildFieldCap(shape, { scale = 0.55, segments = 96 } = {}) {
  const perim = perimeter(shape);
  if (!perim?.length || !(scale > 0)) return null;
  const n = Math.max(24, Math.round(segments));
  // `finishGeometry` takes the index as { list, baseIndex } — the accumulator `pushStrand` fills —
  // not a bare array. A plain array sets an undefined index and the mesh throws on every frame.
  const pos = [], nor = [], idx = { list: [], baseIndex: 0 };
  pos.push(0, 0, 0); nor.push(0, 1, 0);            // the centre of the fan
  for (let i = 0; i < n; i++) {
    const p = perim.at((i / n) * perim.length);
    pos.push(p.x * scale, 0, p.z * scale);
    nor.push(0, 1, 0);
  }
  /* ⚠️ WOUND SO THE GEOMETRIC NORMAL POINTS UP, and the first version had it backwards — the cap
     was a down-facing disc that only showed because the material was left on DoubleSide while I
     was probing something else. Two wrongs looking like a right: with front-face culling it is
     invisible from the one angle anybody views a cake top from. The `normal` attribute says
     (0,1,0) either way, which is exactly why that attribute cannot be the thing checked; the test
     takes the cross product of the triangle's own edges. */
  for (let i = 0; i < n; i++) idx.list.push(0, 1 + ((i + 1) % n), 1 + i);
  return finishGeometry(pos, nor, idx);
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
// How far out a seat is, as a fraction of the outline it sits in: 0 at the centre, 1 exactly on the
// edge, >1 past it. Mirrors topContains' own branches so "on the edge" means the same thing to both.
// The outline case has no closed form, so it bisects — that path is rare (heart, number) and being
// right matters more there than being fast.
function edgeFraction(shape, x, z) {
  if (shape.outline) {
    let lo = 0, hi = 4;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (topContains(shape, x, z, mid)) hi = mid; else lo = mid;
    }
    return hi;
  }
  return shape.kind === 'rect'
    ? Math.max(Math.abs(x) / (shape.halfW || 1), Math.abs(z) / (shape.halfD || 1))
    : Math.hypot(x, z) / (shape.radius || 1);
}

// Where the outermost tufts start to lean, and how far they go at full overhang. 80° leaves them
// just short of pointing straight down the wall — past that they read as falling off rather than
// draping over.
const OVERHANG_START = 0.78;
const OVERHANG_MAX_LEAN = (80 * Math.PI) / 180;
const OVERHANG_REACH = 0.09;   // how far past the edge a seat may sit, as a fraction of the outline

// `hole` = { shape, scale } excludes anything standing inside ANOTHER outline. That is what makes a
// board ring possible: the grass is bounded OUTSIDE by the board and INSIDE by the cake, which are
// two different shapes. `bandInner` cannot express it — it hollows out the same outline it fills.
// Both are exclusions and they answer different questions, so both exist rather than one pretending.
// `patches` = [{ x, z, r }] turns the fill into DISCRETE CLUMPS at chosen spots — the volleyball
// cake, where grass anchors the ball on top and frames the composition on the board, rather than
// covering anything. It is a different question from the other two: whole-top and band both answer
// "cover this surface", a patch answers "put one here". Clipping still applies, so a clump dragged
// to the rim is trimmed by the edge (and drapes over it, if overhang is on) instead of floating.
export function grassSeats({ shape, spacing, jitter, inset = 0.98, seed = 7, bandInner = null, hole = null, overhang = 0, patches = null }) {
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
      // Overhang lets seats sit PAST the outline, so the outermost tufts straddle the edge instead
      // of stopping short of it. Without it the drape has nothing to hang from — a tuft entirely on
      // the top surface can only lean, never spill.
      const reach = overhang > 0 ? Math.max(inset, 1 + overhang * OVERHANG_REACH) : inset;
      if (!topContains(shape, px, pz, reach)) continue;
      // Hollow the middle out for a rim band. The hole is the tier's own outline scaled down, so it
      // follows a heart or a sheet as faithfully as a circle.
      if (bandInner != null && topContains(shape, px, pz, bandInner)) continue;
      // Standing where the cake is. A board ring must start at the wall, not under it.
      if (hole && topContains(hole.shape, px, pz, hole.scale ?? 1)) continue;
      // Inside one of the placed clumps, or nowhere at all.
      if (patches && !patches.some(p => Math.hypot(px - p.x, pz - p.z) <= (p.r ?? 0.35))) continue;
      // Tufts near the rim tip OUTWARD so their blades drape over the side. Only near the rim: in
      // the middle of a surface there is nothing to hang over, and tipping a clump there would lift
      // its blades off the cake on one side and bury them on the other.
      //
      // `lean` is the tilt in radians and `out` the compass direction to tilt toward, both resolved
      // here so the renderer only has to build a matrix. Radially-from-centre is an approximation on
      // a sheet — the same one the verge placement mode already makes for side decorations.
      let lean = 0;
      if (overhang > 0) {
        const e = edgeFraction(shape, px, pz);
        const t = Math.min(Math.max((e - OVERHANG_START) / (1 - OVERHANG_START), 0), 1.6);
        lean = t * overhang * OVERHANG_MAX_LEAN;
      }
      out.push({
        x: px, z: pz, yaw: rand() * Math.PI * 2, scale: 0.8 + rand() * 0.4,
        lean, out: lean > 0 ? Math.atan2(px, pz) : 0,
      });
    }
  }
  return out;
}

/**
 * Where the NEXT clump should go: the spot furthest from every clump already placed.
 *
 * The first version dropped every new clump at a fixed (u, v), so the second one landed exactly on
 * the first and "+ Add clump" looked broken — the count went up and the cake did not change. Adding
 * a fixed OFFSET would only move the collision to the third or fourth.
 *
 * So it samples the ring and takes the emptiest spot: the second clump lands opposite the first, the
 * third between them, and so on. Distances are measured in the surface's own (u, v) mapped to a unit
 * disc — every clump is on the same surface, so relative distance is all that matters and the radius
 * cancels. Deterministic, and it keeps working after the baker has dragged things around.
 */
export function nextPatchSpot(existing = [], { v = 0.62, r = 0.35 } = {}) {
  if (!existing.length) return { u: 0, v, r };
  const at = (u, vv) => [vv * Math.sin(u * Math.PI * 2), vv * Math.cos(u * Math.PI * 2)];
  const SAMPLES = 48;
  let bestU = 0, bestGap = -1;
  for (let i = 0; i < SAMPLES; i++) {
    const u = i / SAMPLES;
    const [x, z] = at(u, v);
    let gap = Infinity;
    for (const p of existing) {
      const [px, pz] = at(p.u ?? 0, p.v ?? v);
      gap = Math.min(gap, Math.hypot(x - px, z - pz));
    }
    if (gap > bestGap) { bestGap = gap; bestU = u; }
  }
  return { u: bestU, v, r };
}

// Triangles a patch will cost, so a density control can be honest about it before it is dragged.
export function grassTriangleCount(seatCount, strands = GRASS_DEFAULTS.strands) {
  return seatCount * strands * STRAND_SIDES * STRAND_SEGS * 2;
}
