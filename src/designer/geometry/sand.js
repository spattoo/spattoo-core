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

/* Equilateral rows: offsetting every other row by half a step makes the triangles equilateral only
   if the rows sit √3/2 apart. Square rows leave visible aisles along both axes. */
const ROW_PITCH = Math.sqrt(3) / 2;

/* How far the drift's edge may wander, as a fraction of the cake's reach, at `edgeBreak` 1. */
const EDGE_WANDER = 0.3;

export const SAND_DEFAULTS = Object.freeze({
  width:     0.34,      // how far the drift reaches past the cake, as a fraction of the tier
  /* ⚠️ THESE THREE WERE TUNED BY LOOKING, AND THE FIRST GUESS WAS GRAVEL. Started at spacing 0.034
     with 0.026 grains, which rendered as cornflakes with the board showing through at the wall —
     sand banked against a cake is solid where it meets it. Swept against the reference photo:
     0.034/0.026 gravel, 0.024/0.017 coarse, 0.019/0.013 reads as sand. The grain is SMALL and the
     pitch is TIGHT; neither works without the other, since fine grains spaced wide are a dusting. */
  rise:        0.055,   // how high the bank stands at the wall, in cake units
  feather:     1,       // what fraction of the span tapers; 1 is a bank, less is a layer with a rim
  topFeather:  0.35,    // a patch on the top is a LAYER — even across its middle, feathered at its rim
  topSize:     0.62,    // how much of the top a patch covers, as a fraction of the tier
  moundNoise:  0.55,    // how uneven its surface is (0 = a smooth ramp)
  /* ⚠️ FINE ENOUGH THAT A FACET IS GRAIN-SIZED. Coarse facets share a normal with their
     neighbours and the bank shades as one smooth surface — a beige ring. Resolution and
     `moundGrain` only work together: big facets with micro noise shade oddly, fine facets without
     it stay smooth. */
  moundStep:   0.016,   // lattice pitch — a facet should be about the size of a grain
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
  innerFrac = 1, outerFrac = 1 + SAND_DEFAULTS.width,
  rise = SAND_DEFAULTS.rise, feather = SAND_DEFAULTS.feather,
  moundNoise = SAND_DEFAULTS.moundNoise, moundGrain = SAND_DEFAULTS.moundGrain,
  edgeBreak = SAND_DEFAULTS.edgeBreak, moundStep = SAND_DEFAULTS.moundStep, seed = 17,
} = {}) {
  const n = valueNoise(seed), m = valueNoise(seed + 101);

  /* ⚠️ A CARTESIAN HEIGHTFIELD, NOT A POLAR GRID — and this is the third attempt at the same
     symptom, so it is worth saying what did not work. A drift on the TOP rendered with spokes
     radiating from the middle of the cake. The first fix removed the degenerate quads at ring 0
     (every vertex sitting on the origin); the second crowded the rings inward with `t^1.8` so the
     facets near the centre were less sliver-like. Both helped and neither cured it, because ANY
     polar grid runs its segments into a single point: facets stay radially aligned however the
     rings are spaced, and flat shading then reads them as spokes. Sandeep, on the second attempt:
     *"this one little out of sand look. too close spokes i think."*

     A regular lattice has no centre and no preferred direction, so there is nothing to radiate.
     The drift's shape comes from the HEIGHT going to zero at its limit rather than from the mesh
     being cut to a disc, which is also why the edge needs no special handling: the taper is already
     zero there. Cells entirely outside the limit are simply not emitted. */
  const limitAt = (x, z) => {
    const r = Math.hypot(x, z);
    const dir = r > 1e-9 ? { x: x / r, z: z / r } : { x: 0, z: 1 };
    const a = Math.atan2(dir.x, dir.z);
    /* Two octaves, or the limit comes out a STAR: one slow octave gives four or five big lobes,
       which reads as a flower rather than a drift. The finer one breaks them into a coastline. */
    const lobe = n(Math.cos(a) * 2.5 + 40, Math.sin(a) * 2.5 + 40);
    const fine = n(Math.cos(a) * 9 + 70, Math.sin(a) * 9 + 70);
    const mix = Math.min(1, Math.max(0, 0.62 * lobe + 0.38 * fine));
    const reach = shapeReach(shape, dir);
    const r0 = reach * innerFrac;
    const spanW = outerFrac - innerFrac;
    /* ⚠️ RAGGEDNESS BELONGS TO THE EDGE, NOT TO THE PATCH'S SIZE, and scaling it by the whole span
       is what turned a full-cover top drift into a FLOWER: the span there is the entire radius, so
       the edge swung between r 0.71 and 1.10 on a 1.2 tier — a 40% star, not a drift. How far loose
       sand creeps past its own edge does not grow just because there is more sand behind it, so the
       wander is capped at `EDGE_WANDER` of the cake's reach. A board ring is narrower than the cap
       and so keeps exactly the edge it had. */
    const bite = Math.min(spanW, EDGE_WANDER) * edgeBreak * mix;
    return { r, r0, r1: r0 + reach * (spanW - bite) };
  };

  const heightAt = (x, z) => {
    const { r, r0, r1 } = limitAt(x, z);
    if (r < r0 || r > r1 || r1 <= r0) return 0;
    const u = (r - r0) / (r1 - r0);
    const f = Math.min(1, Math.max(0.02, feather));
    const taper = u <= 1 - f ? 1 : 1 - (u - (1 - f)) / f;
    const profile = Math.pow(Math.max(0, taper), 1.6);
    if (profile <= 0) return 0;
    const a = Math.atan2(x, z);
    const swell = 0.65 + 0.7 * n(Math.cos(a) * 3 + 8, Math.sin(a) * 3 + 8);
    // Facet-scale noise: flat shading only speckles if ADJACENT facets differ.
    const micro = m(x * 90, z * 90) - 0.5;
    /* ⚠️ NEVER BELOW THE SURFACE IT SITS ON. The grain is signed, so where the profile has thinned
       to almost nothing the dip outweighs the bank and the mesh sinks through the board — -0.006
       here, enough to z-fight. Clamping at zero is also what makes the drift's edge its own
       silhouette rather than a cut. */
    return Math.max(0, rise * profile * (1 - moundNoise + moundNoise * swell)
         + rise * moundGrain * micro * Math.min(1, profile * 3));
  };

  // The lattice covers the drift's widest reach; everything beyond it is never visited.
  let ext = 0;
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    ext = Math.max(ext, shapeReach(shape, { x: Math.sin(a), z: Math.cos(a) }) * outerFrac);
  }
  const step = Math.max(0.004, moundStep);
  /* ⚠️ ROWS AND COLUMNS COUNT SEPARATELY, because the row pitch is `step * ROW_PITCH`, not `step`.
     Reusing one count for both left the lattice 0.43 short of the drift in +z — whole bearings had
     no mesh at all, which the per-sector probe caught and a render would have shown as a bite out
     of the side. The half-step margin covers the stagger on odd rows. */
  const cols = Math.ceil((ext * 2) / step) + 1;
  const rows = Math.ceil((ext * 2) / (step * ROW_PITCH)) + 1;
  const pos = [], idx = [], live = [];
  const key = (i, j) => i * (cols + 1) + j;
  /* ⚠️ ROWS OFFSET BY HALF A STEP, the same trick `grassSeats` uses for its seats: a square lattice
     leaves visible aisles along both axes, which trades a radial artefact for an orthogonal one. */
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= cols; j++) {
      const lx = -ext - step / 2 + j * step + (i % 2 ? step / 2 : 0);
      const lz = -ext - step / 2 + i * step * ROW_PITCH;
      /* ⚠️ A VERTEX OUTSIDE THE DRIFT IS PULLED ONTO ITS EDGE, not merely flattened. A lattice vertex
         lands wherever the lattice puts it, so a cell straddling the limit has corners beyond it —
         and zeroing their height alone leaves the mesh itself sticking out: sand reached 1.227 on a
         1.2 tier (over the rim) and 1.172 inside a 1.18 board ring (into the wall, where it
         z-fights). Snapping to the limit is free because the taper is already zero there. */
      const { r, r0, r1 } = limitAt(lx, lz);
      const snap = (px, pz) => {
        const pr = Math.hypot(px, pz);
        if (pr <= 1e-9) return [px, pz];
        const k = pr > r1 ? r1 / pr : (pr < r0 ? r0 / pr : 1);
        return [px * k, pz * k];
      };
      const [cx, cz] = snap(lx, lz);
      const h = (r >= r0 && r <= r1) ? heightAt(cx, cz) : 0;
      /* A little wander in the plane so the lattice itself never shows as a weave — ⚠️ SCALED TO THE
         LATTICE STEP, NOT TO `rise`. Scaled to rise it displaced a vertex by almost a whole step,
         which shears facets into slivers of aspect 8.7 and, at the limit, turns one inside out: a
         flipped face gets an inward normal and shades BLACK. Keep the displacement under a third of
         a step and the worst facet stays compact. */
      const wob = 0.35 * step * moundGrain * (h > 0 ? 1 : 0);
      // ⚠️ SNAP AFTER THE WANDER TOO — it is ±0.007 and that alone put sand over a 1.2 rim.
      const [x, z] = snap(cx + (m(cz * 60, cx * 60) - 0.5) * wob, cz + (n(cx * 60, cz * 60) - 0.5) * wob);
      pos.push(x, h, z);
      /* ⚠️ "INSIDE THE DRIFT" IS NOT "STANDS ABOVE THE BOARD", and conflating them ate the rim. The
         height is clamped at zero, and out at the feathered edge the grain dips below the bank
         often enough that whole cells came out flat — dropped as empty, which bit TEETH into the
         silhouette and turned a full-cover drift into a star. Where the sand IS and how tall it
         happens to be there are two different questions. */
      live.push(r >= r0 && r <= r1 ? 1 : 0);
    }
  }
  const liveAt = (i, j) => live[key(i, j)];
  /* ⚠️ ZERO-AREA TRIANGLES ARE DROPPED, because snapping collapses some boundary cells onto a line.
     `computeVertexNormals` gives a degenerate face a zero normal, and a zero normal shades BLACK —
     which is how the first version of this mesh ended up with specks at the centre. */
  const tri = (a, b, c) => {
    const ax = pos[a*3] - pos[c*3], az = pos[a*3+2] - pos[c*3+2];
    const bx = pos[b*3] - pos[c*3], bz = pos[b*3+2] - pos[c*3+2];
    const cross = ax * bz - az * bx;
    if (Math.abs(cross) <= 1e-10) return;
    /* ⚠️ WIND IT FROM THE AREA, NOT FROM THE LOOP ORDER. Snapping moves corners past each other, so
       255 of 24,772 boundary faces came out wound the other way — and a face wound the other way
       has a normal pointing DOWN, which backface-culls to a hole you can see the board through.
       Every face here belongs to a heightfield, so the sign of the in-plane area says which way up
       it is, whatever the lattice indices say. */
    if (cross < 0) idx.push(a, b, c); else idx.push(a, c, b);
  };
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = key(i, j), b = key(i, j + 1), c = key(i + 1, j), d = key(i + 1, j + 1);
      // A cell wholly outside the drift is not emitted — that, and only that, shapes its edge.
      if (!liveAt(i, j) && !liveAt(i, j + 1) && !liveAt(i + 1, j) && !liveAt(i + 1, j + 1)) continue;
      tri(a, c, b); tri(b, c, d);
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

export const ZONES_TOP = 'top';
export const ZONES_BOARD = 'board';

/* ── Where a drift sits, as the span and the taper it needs ──────────────────────────────────────
 *
 * Sandeep, with three references — a patch in the middle of a top, a near-full cover, and a board
 * ring with sand on the top as well: *"sand not only placed on the board, but can also go on the
 * top. size should be adjustable."*
 *
 * Both placements are the same mesh over a different radial span, so this is the ONE place that
 * knows which is which, and `SandBed` and the studio both read it rather than branching themselves.
 * `size` means the same thing in both — how much sand there is — which is what makes one slider
 * honest: on the board it is how far past the cake the drift reaches, on the top how much of the
 * surface it covers.
 */
export function sandSpan(zone, size = SAND_DEFAULTS.width) {
  return zone === ZONES_TOP
    ? { innerFrac: 0, outerFrac: Math.max(0.05, size), feather: SAND_DEFAULTS.topFeather }
    : { innerFrac: 1, outerFrac: 1 + Math.max(0.02, size), feather: 1 };
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
