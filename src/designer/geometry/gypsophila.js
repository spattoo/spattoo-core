import * as THREE from 'three';
import { pushStrand, STRAND_SIDES, STRAND_SEGS , finishGeometry } from './strand.js';
import { mulberry32 } from '../utils/random.js';

// ── Gypsophila (baby's breath) ──────────────────────────────────────────────────────────────────
//
// The filler every florist-style cake uses: a cloud of tiny white blooms tucked between roses, run
// as a band round the rim, cascaded down one side, or scattered over the board. Never the subject —
// always the thing that makes the subject look arranged.
//
// ── WHY PROCEDURAL AND NOT A MODELLED SPRIG ─────────────────────────────────────────────────────
// The same two reasons grass.js gives, and they decide it again:
//   * It has to fit ANY tier and ANY density. A modelled sprig is authored at one size, and a cake
//     wants a few stems beside a rose and a hundred round a rim.
//   * Procedural work in this codebase succeeds where the subject has no precise familiar signature
//     the eye can check, and fails where it does (isomalt's refraction, the palette knife's marks).
//     A gypsophila floret is two or three millimetres of white puff. Nobody can tell a wrong one.
// And the third, which is about the GLB option specifically: one asset repeated is a repeat, and
// the eye finds a repeat faster than it finds a wrong petal. Every `jitter` in this repo is there
// because of that.
//
// ── ONE SPRIG, INSTANCED — AND NO PLACEMENT CODE HERE ───────────────────────────────────────────
// Same split as grass: this file builds ONE sprig at the origin growing up +Y, and the renderer
// instances it. ⚠️ It deliberately exports no seat function. `grassSeats` already answers "cover
// this top", "ring the rim" (`bandInner`), "put a clump here" (`patches`) and "keep out of that"
// (`hole`) against any tier outline, and a second distribution system would be a second answer to
// the same question (root CLAUDE.md rule 1, INVARIANTS #1).

export const GYP_DEFAULTS = Object.freeze({
  /* The sprig's own scale, in cake units — one stem from cut end to the furthest bloom. */
  height:     0.30,
  /* How many times the stem divides. 2 is a twig, 3 is a sprig, 4 is a branch and costs 3× the
     triangles for something nobody can see at cake scale. */
  levels:     4,
  /* Branches at each division. Real gypsophila forks in twos and threes; always two reads as a
     fishbone, so the builder takes this as a MAXIMUM and rolls 2 or 3 per node. */
  forks:      3,
  /* How far a branch leans off its parent, in radians at the first division. Later divisions open
     wider — a sprig is tight at the base and loose at the tips. */
  spread:     0.55,
  /* Each level's length as a fraction of its parent's. Below ~0.5 the sprig becomes a stick with
     specks on it. */
  shrink:     0.58,
  /* How much a branch bows over along its length. The bloom clusters are heavy for a stem that
     thin, so the tips always fall away from the axis. */
  droop:      0.35,
  thickness:  0.0030,  // stem radius at the cut end
  /* Blooms per tip. A gypsophila tip is not one flower, it is a tight corymb of them. */
  florets:    7,
  /* ⚠️ A RADIUS, AND IT IS TINY — this was 0.016 first, which is a bloom 11% as wide as the whole
     sprig. On a real stem a floret is two or three millimetres against sixty, so about 3%. At the
     wrong size they rendered as a handful of flat white diamonds on a bare twig; the airiness of
     gypsophila is MANY small dots, never a few big ones. */
  floretSize: 0.006,
  /* How much the blooms differ in size within a cluster: buds and open flowers sit together, and a
     cluster of identical balls is the other classic way this reads as plastic. */
  floretVary: 0.55,
  seed:       7,
});

/* ⚠️ `mulberry32` IS THE ONE COPY (utils/random.js), and grass had a local look-alike that this
   file then copied a third time. Verified identical for seeds 1, 7, 42 and 99999 over 500 draws
   before both were switched, so no procedural output moved. A sprig must look random and be
   STABLE: unseeded, every bloom would re-roll on each render and the cloud would shimmer whenever
   an unrelated slider moved. */

/* One bloom: an octahedron, 8 triangles, with its vertices pushed out unevenly so it reads as a
   puff rather than a bead. ⚠️ NOT a sphere — a sprig carries twenty of these and a cake carries
   hundreds of sprigs, so the per-bloom budget is what decides whether this ships on a phone. At
   this size (≈2mm against a 150mm cake) the silhouette is all there is, and eight facets with a
   rough normal give it. */
const OCTA_DIR = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
const OCTA_FACE = [
  [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
  [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
];
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
function pushBloom(pos, nor, idx, centre, r, rand) {
  const base = idx.baseIndex;
  /* ⚠️ EVERY BLOOM GETS ITS OWN ROTATION, and without it the whole sprig reads as a scatter of
     identical white DIAMONDS. An octahedron seen down one of its axes has a square silhouette, and
     built axis-aligned every single one presents the same square to the camera at the same time —
     so the eye stops seeing flowers and starts seeing a repeated glyph. It is the same fault
     `jitter` exists for everywhere else in this repo, and it costs nothing to fix: a random
     orientation makes the same eight triangles read as a rough little ball.
     A uniformly random quaternion, not three Euler angles — Euler clumps toward the poles. */
  const u1 = rand(), u2 = rand(), u3 = rand();
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
  _q.set(s1 * Math.sin(2 * Math.PI * u2), s1 * Math.cos(2 * Math.PI * u2),
         s2 * Math.sin(2 * Math.PI * u3), s2 * Math.cos(2 * Math.PI * u3));
  for (const [x, y, z] of OCTA_DIR) {
    const k = r * (0.75 + 0.5 * rand());
    _v.set(x, y, z).applyQuaternion(_q);
    pos.push(centre.x + _v.x * k, centre.y + _v.y * k, centre.z + _v.z * k);
    nor.push(_v.x, _v.y, _v.z);
  }
  for (const [a, b, c] of OCTA_FACE) idx.list.push(base + a, base + b, base + c);
  idx.baseIndex += OCTA_DIR.length;
}

/* ONE sprig, seated at the origin and growing up +Y. Instance this; do not call it per seat. */
export function buildGypSprig(opts = {}) {
  const o = { ...GYP_DEFAULTS, ...opts };
  const rand = mulberry32(o.seed ?? 1);
  const pos = [], nor = [], idx = { list: [], baseIndex: 0 };
  const levels = Math.max(1, Math.round(o.levels));

  /* Grown depth-first from the cut end. Each call draws its own stem and then either forks or
     flowers; the strand hands back where it actually ENDED, so a branch starts on its parent's tip
     rather than on a recomputed guess at the curve (which drifts, and the joints come apart). */
  const grow = (origin, dir, len, r0, level) => {
    /* A stem that forks does not taper to a point — it hands its thickness on. Only the last
       level, which carries the blooms, closes off. */
    const r1 = level >= levels ? 0 : r0 * o.shrink;
    /* The bow is horizontal and follows the lean the branch already has, so it exaggerates the
       direction instead of fighting it. Deeper levels droop more: the cluster is heaviest at the
       end of the thinnest stem. */
    const lean = o.droop * (0.4 + rand()) * (level / levels);
    const az = Math.atan2(dir.z, dir.x) + (rand() - 0.5) * 1.4;
    const bend = new THREE.Vector3(Math.cos(az) * lean, -Math.abs(dir.y) * lean * 0.8, Math.sin(az) * lean);

    const end = pushStrand(pos, nor, idx, { origin, dir, bend, len, r0, r1 });

    /* ⚠️ BLOOMS RIDE THE LAST TWO LEVELS, NOT JUST THE TIPS. Flowering only at the ends gave a bare
       twig with a pom-pom on each arm — which is a dandelion clock, not gypsophila. A real stem
       carries clusters all along its finer branches, and that is where the cloud comes from. */
    if (level >= levels - 1) {
      const n = Math.max(1, Math.round(o.florets)) / (level >= levels ? 1 : 2);
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, b = Math.acos(2 * rand() - 1);
        const d = o.floretSize * 2.2 * Math.cbrt(rand());
        const c = end.tip.clone().add(new THREE.Vector3(
          Math.sin(b) * Math.cos(a) * d, Math.cos(b) * d, Math.sin(b) * Math.sin(a) * d));
        pushBloom(pos, nor, idx, c, o.floretSize * (1 - o.floretVary * rand()), rand);
      }
    }

    if (level >= levels) return;

    /* Two or three, rolled per node. Always the maximum reads as a fishbone — the regularity shows
       up long before any individual branch does. */
    const n = 2 + (rand() < 0.5 ? 1 : 0) * Math.max(0, Math.round(o.forks) - 2);
    const openness = o.spread * (0.7 + 0.6 * (level / levels));
    for (let i = 0; i < n; i++) {
      const roll = (i / n) * Math.PI * 2 + rand() * 1.2;
      const tilt = openness * (0.5 + rand());
      const up = end.dir.clone();
      const ref = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const u = new THREE.Vector3().crossVectors(up, ref).normalize();
      const v = new THREE.Vector3().crossVectors(up, u).normalize();
      const child = up.clone().multiplyScalar(Math.cos(tilt))
        .addScaledVector(u, Math.sin(tilt) * Math.cos(roll))
        .addScaledVector(v, Math.sin(tilt) * Math.sin(roll))
        .normalize();
      grow(end.tip.clone(), child, len * o.shrink * (0.8 + 0.4 * rand()), r1, level + 1);
    }
  };

  /* ⚠️ `height` IS WHAT THE SPRIG REACHES, so the first stem is solved for rather than guessed.
     Each level is `shrink` of its parent, so the chain from cut end to furthest bloom sums a
     geometric series; dividing by it makes the knob mean what its name says. Written as
     `height * (1 - shrink)` first, which gave a 0.21 sprig for a 0.30 setting — a control that
     lies about its own units is the thing INVARIANTS #8 is about. The reach is still a little under
     `height` because droop trades length for lean, and that is the honest part of it. */
  const chain = (1 - Math.pow(o.shrink, levels)) / (1 - o.shrink || 1);
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0),
       o.height / chain, o.thickness, 1);

  return finishGeometry(pos, nor, idx);
}

/* What a field costs, so a density control can be bounded by a number rather than by a guess. The
   branch count is a geometric series over the levels; blooms ride only on the last one. */
export function gypTriangleCount(seatCount, opts = {}) {
  const o = { ...GYP_DEFAULTS, ...opts };
  const levels = Math.max(1, Math.round(o.levels));
  const perNode = 2.5;                                    // 2 or 3, rolled evenly
  let stems = 0, tips = 1;
  for (let i = 1; i <= levels; i++) { stems += tips; tips *= perNode; }
  const stemTris = stems * STRAND_SIDES * STRAND_SEGS * 2;
  const bloomTris = (tips / perNode) * Math.max(1, Math.round(o.florets)) * OCTA_FACE.length;
  return Math.round(seatCount * (stemTris + bloomTris));
}
