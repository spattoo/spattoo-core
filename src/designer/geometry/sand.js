import * as THREE from 'three';
import { mulberry32 } from '../utils/random.js';
import { shapeReach } from './surface.js';

/* ── Sand on the board ───────────────────────────────────────────────────────────────────────────
 *
 * Crushed-biscuit sand banked around the foot of a cake, with shells and pebbles sitting in it —
 * the beach look. Sandeep, with a reference photo: *"can we create sand like this? i dont think its
 * possible with glb."*
 *
 * ── WHY PROCEDURAL AND NOT A MODELLED ASSET ─────────────────────────────────────────────────────
 * The same two reasons the drip and the grass are, and here the first one is decisive:
 *   * It has to fit ANY board. A modelled ring is authored at one radius, and the board's size
 *     follows the cake's — a 6" and a 10" would need different assets, or one stretched until the
 *     grain size lies.
 *   * Sand has NO canonical grain. Procedural work in this codebase has failed where the subject
 *     has a precise familiar signature the eye checks (isomalt's refraction, the palette knife's
 *     tool marks) and succeeded where it does not (drips, glaze, relief, grass). A "wrong" grain is
 *     simply a different grain, which is the condition under which this approach works.
 *
 * ── IT IS A SEAT PROBLEM, AND THAT IS ALREADY SOLVED ────────────────────────────────────────────
 * ⚠️ NOTHING HERE PLACES ANYTHING. `grassSeats` already fills a surface in offset rows with a hole
 * punched for the cake — which is exactly a board ring — and `useSurfaceSeats`/`useSeatedInstances`
 * already turn seats into one InstancedMesh with per-instance scale, yaw and shade. Sand needs a
 * GRAIN and a thinning rule; writing a second placement engine beside the proven one is the copy
 * `check:dup` exists to catch, and the drift INVARIANTS #15 is about.
 *
 * So this file is deliberately two small things: what one grain looks like, and how a drift of them
 * thins as it leaves the cake.
 */

export const SAND_DEFAULTS = Object.freeze({
  width:     0.34,      // how far the drift reaches past the cake, as a fraction of the tier
  /* ⚠️ THESE THREE WERE TUNED BY LOOKING, AND THE FIRST GUESS WAS GRAVEL. Started at spacing 0.034
     with 0.026 grains, which rendered as cornflakes with the board showing through at the wall —
     sand banked against a cake is solid where it meets it. Swept against the reference photo:
     0.034/0.026 gravel, 0.024/0.017 coarse, 0.019/0.013 reads as sand. The grain is SMALL and the
     pitch is TIGHT; neither works without the other, since fine grains spaced wide are a dusting. */
  rise:        0.055,   // how high the bank stands at the wall, in cake units
  moundNoise:  0.55,    // how uneven its surface is (0 = a smooth ramp)
  /* ⚠️ FINE ENOUGH THAT A FACET IS GRAIN-SIZED. At 16x200 the facets were large, neighbours shared
     a normal and the bank shaded as one smooth surface — a beige ring. Resolution and `moundGrain`
     only work together: big facets with micro noise shade oddly, fine facets without it stay
     smooth. 36x360 is ~26k triangles, still an eighth of what the grains-only version cost. */
  moundRings:  36,      // radial resolution of the bank
  moundSegments: 360,   // around it — a facet should be about the size of a grain
  moundGrain:  0.85,    // facet-scale height noise — the speckle itself
  edgeBreak:   0.55,    // how much the outer limit wanders; 0 is a printed circle
  /* ⚠️ THE CRUMBS ARE A GARNISH ON THE BANK NOW, NOT THE SAND ITSELF, so these are far sparser
     than the version that tried to BE the sand with 9,600 grains. They exist for the outer edge,
     where real sand does break into separate pieces, and for a little tooth on top of the mass. */
  spacing:   0.040,     // grain pitch — the seat grid, before jitter
  jitter:    1.0,       // full jitter: a visible grid is the one thing sand must never have
  grainSize: 0.009,     // a grain's radius at scale 1, in cake units
  sizeVary:  0.85,      // how much grains differ in size; sand is not graded
  falloff:   0.5,       // how fast it thins going out (0 = an even carpet, 1 = hugs the wall)
  shadeVary: 0.26,      // per-grain lightness spread — one flat colour reads as gravel, not sand
  roughness: 0.92,
  colour:    '#d9b584',
  seed:      11,
});

/* ── One grain ───────────────────────────────────────────────────────────────────────────────────
 *
 * An icosahedron with its vertices pushed in and out at random: twenty triangles, no smooth
 * shading, so every grain catches the key light on a different facet. That is what makes a drift
 * look granular rather than like spilled paint.
 *
 * ⚠️ ONE GEOMETRY, MANY GRAINS — the variety comes from the INSTANCE, not from the mesh. An
 * InstancedMesh draws a single geometry, so a per-grain shape would mean a mesh per grain and the
 * draw calls grass was made instanced to avoid. Per-instance scale (`sizeVary`), a random yaw and a
 * shade jitter give the eye more difference than a second silhouette would, at no cost.
 *
 * ⚠️ FLAT-SHADED ON PURPOSE. `computeVertexNormals` on a non-indexed buffer gives each face its own
 * normal, which is the whole look: a smoothed grain is a pebble, and a drift of pebbles is gravel.
 */
export function buildSandGrain({ radius = 1, rough = 0.42, seed = 3 } = {}) {
  // IcosahedronGeometry is already non-indexed, so every face owns its three vertices — which is
  // what lets computeVertexNormals below give each facet its own normal.
  const geo = new THREE.IcosahedronGeometry(radius, 0);
  const pos = geo.attributes.position;
  const rand = mulberry32(seed);
  // Jitter by VERTEX KEY, not by index: toNonIndexed repeats a shared corner once per face, and
  // moving those copies apart would split the grain into loose triangles.
  const moved = new Map();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    let k = moved.get(key);
    if (k === undefined) { k = 1 + (rand() - 0.5) * 2 * rough; moved.set(key, k); }
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/* ── A drift, not a carpet ───────────────────────────────────────────────────────────────────────
 *
 * Sand banked against a cake is dense at the wall and peters out into scattered crumbs — look at
 * any beach-cake photo and the outer third is bare board showing through. An even fill reads as
 * a doormat.
 *
 * So seats are kept with a probability that falls with distance from the cake. Thinning the FILL
 * rather than shrinking the band is what leaves those stray crumbs at the edge; a smaller band
 * would just move a hard boundary inward, and a hard boundary is the tell.
 *
 * `inner` and `outer` are radii in cake units. Deterministic from `seed`, so a drift does not
 * reshuffle itself every render.
 */
export function thinOutward(seats, { inner, outer, falloff = SAND_DEFAULTS.falloff, seed = 5 } = {}) {
  if (!(falloff > 0) || !(outer > inner)) return seats;
  const rand = mulberry32(seed);
  const span = outer - inner;
  return seats.filter(s => {
    const t = Math.min(1, Math.max(0, (Math.hypot(s.x, s.z) - inner) / span));
    // Keep everything at the wall, almost nothing at the lip. The curve is gentle at first so the
    // bank stays solid where it meets the cake, then falls away.
    return rand() < 1 - falloff * t * t;
  });
}

/* ── The bank itself ─────────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ A DRIFT OF DISCRETE GRAINS CANNOT READ AS SAND, AND THE ARITHMETIC SAYS SO. Sandeep, on the
 * first version: *"its like small stones but not like sand."* He is right, and more grains is not
 * the answer: a real grain on a 15cm cake is sub-millimetre, so making them small enough to stop
 * being legible individually needs roughly 65,000 of them — 1.3M triangles — where the version he
 * was looking at already cost 192k for 9,600.
 *
 * Look at the reference again and sand is a CONTINUOUS MASS near the cake that only breaks into
 * separate crumbs at its outer edge. So the mass is a surface and the crumbs stay instanced: a
 * banked ring, thick where it meets the wall and feathering to nothing at the lip, carrying enough
 * height noise to be uneven — and FLAT-SHADED, so the facets themselves do the speckling that a
 * normal map would otherwise have to fake.
 *
 * ⚠️ THE INNER EDGE IS `shapeReach`, NOT A RADIUS. A heart cake and a sheet have a board ring too,
 * and sampling the shape's own reach per angle is what makes this follow them — the same accessor
 * `boardRingClamp` and `edgeSeatSeed` already use for exactly this question.
 *
 * It is also far CHEAPER than what it replaces: ~5k triangles for the bank against 192k of grains.
 */
/* ⚠️ ONE VOCABULARY — the option names are the SAME keys as SAND_DEFAULTS, deliberately. They were
 * briefly shortened here (`noise`, `grain`, `rings`) because this function IS the mound, which read
 * well and silently ate any caller that passed the documented name: a test asking for
 * `moundGrain: 0` got the default instead and compared a mesh with itself, reporting a difference
 * of exactly zero. A translation layer between a defaults table and the function it configures is
 * a trap with no upside. */
export function buildSandMound(shape, {
  width = SAND_DEFAULTS.width, rise = SAND_DEFAULTS.rise,
  moundNoise = SAND_DEFAULTS.moundNoise, moundGrain = SAND_DEFAULTS.moundGrain,
  edgeBreak = SAND_DEFAULTS.edgeBreak,
  moundRings = SAND_DEFAULTS.moundRings, moundSegments = SAND_DEFAULTS.moundSegments, seed = 17,
} = {}) {
  const noise = moundNoise, grain = moundGrain, rings = moundRings, segments = moundSegments;
  const n = valueNoise(seed), m = valueNoise(seed + 101);
  const pos = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;                       // 0 at the cake wall, 1 at the lip
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const dir = { x: Math.sin(a), z: Math.cos(a) };
      const inner = shapeReach(shape, dir);
      /* ⚠️ THE OUTER EDGE IS NOT A CIRCLE. A bank that ends on a perfect ring reads as a printed
         band however good its surface is — the eye finds the arc instantly. The limit wanders with
         a slow noise, so the drift runs further out in some places than others. */
      const lip = inner * width * (1 - edgeBreak + edgeBreak * (0.4 + 1.2 * n(Math.cos(a) * 2.5 + 40, Math.sin(a) * 2.5 + 40)));
      const r = inner + lip * t;
      const profile = Math.pow(1 - t, 1.6);    // banked at the wall, running out to nothing
      // Macro: a slow swell around the ring, so the pile is not the same depth all the way round.
      const swell = 0.65 + 0.7 * n(Math.cos(a) * 3 + 8, Math.sin(a) * 3 + 8);
      /* ⚠️ MICRO IS WHAT MAKES IT SAND, and leaving it out is why the first bank read as a smooth
         beige ring. Flat shading only speckles if ADJACENT FACETS DIFFER — at low frequency every
         neighbour shares a normal and the whole thing shades as one surface. This is noise at the
         scale of a facet, so each one catches the light on its own. */
      const px = dir.x * r, pz = dir.z * r;
      const micro = m(px * 90, pz * 90) - 0.5;
      const h = rise * profile * (1 - noise + noise * swell) + rise * grain * micro * Math.min(1, profile * 3);
      // A little wander in the plane too: a perfectly radial grid shows as spokes under raking light.
      const wob = 0.25 * grain * rise;
      pos.push(px + (m(pz * 60, px * 60) - 0.5) * wob, Math.max(0, h), pz + (n(px * 60, pz * 60) - 0.5) * wob);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  // Flat facets ARE the grain: a smoothed bank is a dune, and a dune is not what sits on a board.
  const flat = geo.toNonIndexed();
  geo.dispose();
  flat.computeVertexNormals();
  flat.computeBoundingSphere();
  return flat;
}

/* Smooth value noise on a wrapped grid — deterministic from `seed`, so a bank does not reshuffle
 * itself between renders. Small and local rather than imported: the one other noise in the codebase
 * is a canvas fleck stamper, which answers a different question. */
function valueNoise(seed, G = 64) {
  const rand = mulberry32(seed);
  const g = new Float32Array(G * G);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const at = (x, y) => g[(((y % G) + G) % G) * G + (((x % G) + G) % G)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
}

/* ── Grains are not graded ───────────────────────────────────────────────────────────────────────
 *
 * `grassSeats` varies a seat's scale by ±20%, which is right for tufts cut by the same nozzle and
 * wrong for crushed biscuit: real sand runs from dust to crumbs several times its size.
 *
 * ⚠️ SKEWED SMALL, NOT SPREAD EVENLY. Squaring a uniform draw puts most grains near the bottom of
 * the range and a few near the top, which is what a crumb pile actually is — an even spread reads
 * as gravel, every piece the same order of size. The seat's own scale is multiplied rather than
 * replaced, so whatever variety the seating already had survives.
 */
export function varyGrainSize(seats, { sizeVary = SAND_DEFAULTS.sizeVary, seed = 9 } = {}) {
  if (!(sizeVary > 0)) return seats;
  const rand = mulberry32(seed);
  const lo = Math.max(0.05, 1 - 0.6 * sizeVary);
  const hi = 1 + 1.4 * sizeVary;
  return seats.map(s => {
    const r = rand();
    return { ...s, scale: (s.scale ?? 1) * (lo + (hi - lo) * r * r) };
  });
}

/** Triangles a drift costs: twenty per grain, however many grains. One draw call regardless. */
export function sandTriangleCount(seatCount) {
  return seatCount * 20;
}
