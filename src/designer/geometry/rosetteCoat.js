import { mulberry32 } from '../utils/random.js';
/* ⚠️ THE SHAPE IS NOT RE-DERIVED HERE. `perimeter` walks a circle, a rounded rect OR any outline
 * (heart, oval, polygon, a number) by arc length and hands back a point and its outward normal;
 * `topContains` answers point-in-lid for all of them. Both already exist and are already used by
 * the piping ring, so a coat that packed its own idea of a heart would be a second answer to a
 * question core settled. */
import { perimeter, topContains, boundingRadius, topClamp } from './surface.js';

// ── Coating a whole cake in piped rosettes ──────────────────────────────────────────────────────
//
// The reference is a cake with no visible frosting at all: every square inch of the top and the
// side is a piped rose, packed shoulder to shoulder, with the gaps between them filled by the
// shoulders of their neighbours. Sandeep: *"cream piping is filled on entire cake. we need to
// achieve this."*
//
// ⚠️ THIS RETURNS PATHS, NOT MESHES, and that is the same bargain `pipingFill.js` already makes:
// *"a piped fill is a PATH, not a filled surface … nothing new renders it."* A rosette is a nozzle
// travelling in a spiral, so what this module owns is WHERE THE TIP GOES. `buildPipingStroke`
// already sweeps a nozzle along a seated centreline and `mergePenGeometries` already welds the
// results into one mesh — both shipped, both tuned, both measured against photographs. Returning
// polylines means this file needs no GPU to test and no second renderer to drift from the first.
//
// ⚠️ THE CENTRELINE COMES OUT SEATED. `buildPipingStroke`'s contract is explicit: *"the points
// handed to buildPipingStroke are the SEATED centerline already — the draw layer offsets each
// pointer hit along the surface normal by the rope radius."* So every point here is already lifted
// off the cake, and a caller must not lift it again.
//
// ── Why the old rosette style was dropped, and what is different now ────────────────────────────
// `creamPen.js` says the pen shipped "LINE style only — the shell and rosette styles were dropped
// (they didn't read well)". That is worth taking seriously rather than walking into twice. A flat
// Archimedean spiral of constant height reads as a COILED ROPE seen from above, not as a rose: a
// real rosette is domed, because the baker starts in the middle with the tip low, builds a peak,
// and spirals outward releasing pressure. Two things here address that and they are the two knobs
// most worth tuning first:
//
//   · `peak`      — the centre of the spiral is lifted and the rim is not, so the rose is a dome.
//   · `coilOverlap` — consecutive coils OVERLAP rather than sitting side by side, which is what
//                     hides the spiral and leaves only the petal edges visible.
//
// Neither is a claim that this reads correctly — that is a judgement to make by looking at it in
// the studio, which is why the studio exists.

/* ── WHAT THIS COSTS, MEASURED ──────────────────────────────────────────────────────────────────
 *
 * A coat is the most geometry any one decoration has ever asked for, so the numbers are here rather
 * than left to be rediscovered. A default tier (r 1.2, h 1.45) takes **144 roses**. Every rose is
 * the same shape, so the coat is ONE swept spiral instanced 144 times — building them separately in
 * world space measured 17.6M vertices and the page never finished drawing.
 *
 * Even instanced, the GPU still transforms every instance, so verts-per-rose is what matters — and
 * it is dominated by the NOZZLE PROFILE, not by the spiral. At samplesPerTurn 16:
 *
 *     round     4,482/rose → 0.6M     smooth rope, no ribs: does not read as a rose
 *     star5    11,202/rose → 1.6M     ← the default
 *     rose8    43,010/rose → 6.2M
 *     lobe12   56,450/rose → 8.1M
 *
 * ⚠️ THE CHEAP NOZZLE IS ALSO THE RIGHT ONE, which is luck rather than design. `star5` is labelled
 * "1M — the classic" in the catalogue, and a 1M open star is the tip a baker actually pipes a
 * rosette cake with. The measured rosette profiles (rose8, rose10) carry 192 cross-section points
 * because they were built to be looked at one stroke at a time; across 144 roses that is four times
 * the cost for detail nobody can see at this size.
 *
 * ⚠️ AND THE COAT DOES NOT CAST SHADOWS. Shadow mapping re-renders the whole instanced set a second
 * time, and self-shadowing between roses is not where the look comes from — the cream material's
 * own sheen is. Turning it on doubles the frame for very little.
 */

/* How tightly consecutive coils sit. 0 = coils just touch (a visible groove between every turn,
 * which reads as rope); 0.5 = each coil covers half the one before it. Measured off nothing — this
 * is the first thing to sweep in the studio. */
export const ROSETTE_DEFAULTS = Object.freeze({
  rosetteRadius: 0.26,   // world units; the designer's default tier radius is 1.2
  ropeRadius:    0.055,  // half the piped rope's width
  coilOverlap:   0.42,
  peak:          0.55,   // extra lift at the centre, as a fraction of rosette radius
  samplesPerTurn: 16,   // see WHAT THIS COSTS below
  startRadiusFrac: 0.18, // the first coil is not a point — a tip has width
  tailTurns:     0.12,   // the stroke runs on a little past the last full turn, as a real one does
  jitter:        0.1,    // how much each rose's start angle and seat wander, 0..1
});

/**
 * One rosette, as a flat spiral in its own tangent plane.
 *
 * Returns `[[u, v, lift], …]` — `u`/`v` across the surface, `lift` ALONG the normal, both in world
 * units. The caller maps that frame onto wherever the rose sits, which is what lets one spiral
 * serve the flat top and the vertical wall without this function knowing the difference.
 *
 * ⚠️ TURNS ARE DERIVED, NOT ASKED FOR. How many times a baker goes round is not a free choice —
 * it falls out of how wide the rose is and how fat the rope is. Asking for turns separately lets a
 * caller request a 4-turn rose with a fat rope, which is not a rose, it is a pile.
 */
export function rosetteSpiral({
  radius     = ROSETTE_DEFAULTS.rosetteRadius,
  ropeRadius = ROSETTE_DEFAULTS.ropeRadius,
  coilOverlap = ROSETTE_DEFAULTS.coilOverlap,
  peak        = ROSETTE_DEFAULTS.peak,
  samplesPerTurn = ROSETTE_DEFAULTS.samplesPerTurn,
  startRadiusFrac = ROSETTE_DEFAULTS.startRadiusFrac,
  tailTurns = ROSETTE_DEFAULTS.tailTurns,
  startAngle = 0,
  handed = 1,                 // +1 anticlockwise, -1 clockwise. A baker is consistent; a cake is not mixed.
} = {}) {
  const r0 = Math.max(1e-4, radius * startRadiusFrac);
  const rEnd = Math.max(r0 + 1e-4, radius - ropeRadius);   // the rope's OUTER edge lands on `radius`

  // Radial advance per turn: two rope radii is coils touching, less is coils overlapping.
  const pitch = Math.max(1e-4, 2 * ropeRadius * (1 - clamp01(coilOverlap)));
  const turns = Math.max(0.6, (rEnd - r0) / pitch) + Math.max(0, tailTurns);

  const total = Math.max(8, Math.round(turns * samplesPerTurn));
  const out = [];
  for (let i = 0; i <= total; i++) {
    const t = i / total;                       // 0 at the centre, 1 at the rim
    const theta = startAngle + handed * t * turns * 2 * Math.PI;
    const r = r0 + (rEnd - r0) * t;
    /* ⚠️ THE DOME IS WHY THIS IS NOT A COIL OF ROPE. Lift falls off from the centre on a curve
     * rather than a line: a real rose is steep in the middle and flattens toward the rim, because
     * the pressure is released gradually while the radius grows linearly. A linear falloff gives a
     * cone, which reads as a hat. */
    const lift = peak * radius * Math.pow(1 - t, 1.7);
    out.push([Math.cos(theta) * r, Math.sin(theta) * r, lift]);
  }
  return out;
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const TAU = Math.PI * 2;

/* ── How much of a piece its neighbour covers ────────────────────────────────────────────────────
 *
 * Expressed as OVERLAP rather than as a spacing multiple, because overlap is what a baker sets and
 * because it works per axis: a piece that is wide and shallow needs tighter rows than columns, and
 * a single spacing number cannot say that.
 *
 * ⚠️ DERIVED, THEN CORRECTED BY LOOKING, and both halves matter. Seats fall on a grid whose cells
 * are `step` across, so the furthest point from any centre is a cell CORNER at `step/√2`; covering
 * it needs `step ≤ √2·r`, i.e. overlap ≥ 1 − √2/2 ≈ 0.29. The first version used 1.62·r (overlap
 * 0.19) and the test caught it at 0.283 against a 0.26 radius. The second used 1.35·r (overlap
 * 0.33), which PASSED the test and still showed cake in the render — the test measures distance to
 * a SEAT, and what must be covered is the distance to a piece's visible EDGE, which is nearer
 * because a rose's outer coil lies almost flat. 0.4 closes it.
 *
 * Denser is also more faithful: on the reference cake the roses overlap heavily and there is no
 * flat frosting anywhere between them. */
export const SEAT_OVERLAP = 0.4;

/* ── The shoulder OVERLAYS the join, it does not fill a strip between two faces ──────────────────
 *
 * ⚠️ 0, AND THAT IS THE DESIGN RATHER THAN A TUNING. The first version had the rim row DISPLACE
 * its neighbours: the wall stopped short, the lid stopped short, and the shoulder filled the strip
 * between them. That makes three surfaces meeting at TWO seams, and both have to be exact — the
 * arithmetic had them touching with 0.004·H to spare, so any shortfall in the mesh opened a line
 * of bare cake. It did, repeatedly, and no amount of adjusting the strip's width fixed it because
 * narrowing one seam widens the other.
 *
 * A baker does not do that either. The wall gets piped, the top gets piped, and the shoulder roses
 * go ON the join afterwards. So both faces now cover themselves completely and the rim row is
 * PURELY ADDITIVE — a third layer over the corner. There is no seam to get right, because there is
 * no seam: cream over cream, which is what the reference photograph shows.
 *
 * Non-zero makes the faces retreat again and is kept only so that behaviour is reachable. */
const RIM_BITE = 0;

/* The most a shoulder piece may be stretched along the wall to close a seam. Past about half as
 * long again it stops reading as a piped rose and starts reading as a smear — and a gap that wide
 * is telling you the piece is too small for the cake, which is a different control. */
const STRETCH_MAX = 1.5;

/**
 * Where every rose sits on a round tier, with the frame it sits in.
 *
 * Returns `[{ p, n, u, v, kind }]` — `p` the seat on the cake surface, `n` the outward normal,
 * `u`/`v` two unit vectors spanning the tangent plane, `kind` 'top' | 'side'.
 *
 * ⚠️ TOP AND SIDE ARE PACKED DIFFERENTLY BECAUSE THEY ARE DIFFERENT SURFACES. The top is a disc and
 * packs as concentric rings from the middle out. The side is a cylinder unrolled into a band and
 * packs as staggered rows, which is hexagonal packing once it is wrapped back up. Treating the side
 * as "a disc seen edge on" is how a wall ends up with a bald stripe down it.
 *
 * ⚠️ EVERY RING TAKES A WHOLE NUMBER OF ROSES, so the ring closes — and the count is CEILED, never
 * rounded. See the note on `rows`: rounding drifts the pitch either way, and the loose direction
 * is the one that shows cake.
 */
export function rosetteSeats({
  /* The tier's footprint, as `tierShape()` describes it: `{radius}`, `{kind:'rect',halfW,halfD,
   * cornerR}` or `{outline}`. Absent falls back to a circle of `tierRadius`, so every existing
   * caller is unmoved. */
  shape = null,
  tierRadius = 1.2,
  tierHeight = 1.45,
  baseY = 0.1,
  rosetteRadius = ROSETTE_DEFAULTS.rosetteRadius,
  pieceW = null,
  pieceH = null,
  overlap = SEAT_OVERLAP,
  rimRow = true,
  rimOverhang = 0.35,
  coverTop = true,
  coverSide = true,
  jitter = ROSETTE_DEFAULTS.jitter,
  seed = 1,
} = {}) {
  const shp = shape ?? { radius: tierRadius };
  const perim = perimeter(shp);
  const rand = mulberry32(seed >>> 0);
  const W = pieceW ?? rosetteRadius * 2;
  const H = pieceH ?? rosetteRadius * 2;
  const o = clamp01(overlap);
  const stepW = Math.max(1e-3, W * (1 - o));
  const stepH = Math.max(1e-3, H * (1 - o));
  const topY = baseY + tierHeight;
  const seats = [];
  const wobble = a => (jitter > 0 ? (rand() - 0.5) * 2 * a * jitter : 0);
  const hasRim = rimRow && coverTop && coverSide;

  /* ── The lid ──────────────────────────────────────────────────────────────────────────────────
   *
   * ⚠️ A HEX GRID CLIPPED TO THE OUTLINE, NOT CONCENTRIC RINGS. Rings are a circle's answer and a
   * heart has no centre to ring about — the notch and the point need different numbers of pieces
   * at the same distance out. A staggered grid is the general one, and on a circle it packs at
   * least as tightly as rings did.
   *
   * ⚠️ PLUS A WALK OF THE EDGE, which is the part a grid cannot do. Clipping leaves the boundary
   * ragged: the last grid point can sit most of a step inside the outline, which on a round cake
   * was a visible annulus and on a heart would be a bald notch. Walking the perimeter puts a piece
   * ON the edge wherever the grid stopped short, at the same arc-length spacing as everything else.
   */
  if (coverTop) {
    const rowStep = stepW * (Math.sqrt(3) / 2);          // hex rows nest closer than columns
    const reach = boundingRadius(shp);
    const rows = Math.max(1, Math.ceil((2 * reach) / rowStep));
    for (let r = 0; r <= rows; r++) {
      const z = -reach + (2 * reach * r) / rows;
      const cols = Math.max(1, Math.ceil((2 * reach) / stepW));
      for (let c = 0; c <= cols; c++) {
        const x = -reach + (2 * reach * c) / cols + (r % 2 ? stepW / 2 : 0);
        if (!topContains(shp, x, z)) continue;
        seats.push({
          p: [x + wobble(stepW * 0.1), topY, z + wobble(stepW * 0.1)],
          n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], kind: 'top', stretch: 1,
        });
      }
    }
    /* The edge. Inset by a quarter piece so each straddles the outline — the outer half is covered
       by the shoulder row, and with no shoulder `rimOverhang` lets it hang over instead. */
    const inset = hasRim ? W * 0.25 : -(W / 2) * rimOverhang;
    const count = Math.max(3, Math.ceil(perim.length / stepW));
    for (let i = 0; i < count; i++) {
      const q = perim.at((perim.length * i) / count);
      let x = q.x - q.nx * inset, z = q.z - q.nz * inset;
      /* ⚠️ CLAMPED, BECAUSE AN INWARD OFFSET OVERSHOOTS AT A CONCAVE CORNER. Stepping along the
       * inward normal is fine on a convex edge and wrong in a heart's notch, where the two sides'
       * normals converge and the offset crosses straight out the other side — a piece left
       * floating in the cleft. `topClamp` snaps a stray point back onto the footprint's own
       * silhouette, which is the same function that keeps a decoration inside a heart rather than
       * inside some inscribed circle. Only bites where the offset actually overshot. */
      if (inset > 0 && !topContains(shp, x, z)) ({ x, z } = topClamp(shp, x, z, 1));
      seats.push({
        p: [x, topY, z],
        n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], kind: 'top', stretch: 1,
      });
    }
  }

  /* ── The wall ─────────────────────────────────────────────────────────────────────────────────
   * Walked by ARC LENGTH, which is what makes a heart work: the notch and the point are travelled
   * at the same speed as a straight run, so pieces stay evenly spaced where the curvature changes.
   * The outward normal comes from the walk, so `u` follows the wall rather than a world axis. */
  if (coverSide) {
    const lo = baseY + H / 2;
    const hi = topY - H / 2;
    const span = Math.max(0, hi - lo);
    const rows = span <= 1e-6 ? 1 : Math.max(1, Math.ceil(span / stepH) + 1);
    const perRow = Math.max(3, Math.ceil(perim.length / stepW));
    for (let r = 0; r < rows; r++) {
      const y = rows === 1 ? lo : lo + (span * r) / (rows - 1);
      const stagger = (r % 2) * (perim.length / perRow) / 2;
      for (let i = 0; i < perRow; i++) {
        const q = perim.at((stagger + (perim.length * i) / perRow) % perim.length);
        seats.push({
          p: [q.x, y + wobble(stepH * 0.08), q.z],
          n: [q.nx, 0, q.nz],
          u: [-q.nz, 0, q.nx],
          v: [0, 1, 0],
          kind: 'side',
          stretch: 1,
        });
      }
    }
  }

  /* ── The shoulder ─────────────────────────────────────────────────────────────────────────────
   * Purely additive — see the note on RIM_BITE. Normal bisects the wall's outward normal and up,
   * so each piece has a foot on the side and a shoulder on the lid, which is how it is piped.
   * The stretch factor is 1 now that both faces cover themselves; it stays on the seat so a caller
   * can still lengthen the shoulder for a mesh that falls short of its own extent. */
  if (hasRim) {
    const k = Math.SQRT1_2;
    const count = Math.max(3, Math.ceil(perim.length / stepW));
    const phase = rand() * perim.length;
    for (let i = 0; i < count; i++) {
      const q = perim.at((phase + (perim.length * i) / count) % perim.length);
      seats.push({
        p: [q.x, topY, q.z],
        n: [q.nx * k, k, q.nz * k],
        u: [-q.nz, 0, q.nx],
        v: [-q.nx * k, k, -q.nz * k],
        kind: 'rim',
        stretch: 1,
      });
    }
  }

  return seats;
}

/**
 * ONE rose, in its own canonical frame, ready to sweep: X and Z across the surface, Y along the
 * normal. Seated — the rope radius is already added — so the result sits on a surface at y = 0.
 *
 * ⚠️ THIS IS THE ONE A RENDERER SHOULD USE. Every rose on a cake is the same shape at a different
 * place, so the whole coat is ONE swept geometry and a transform per seat — `rosetteSeats` returns
 * exactly the frame that transform needs. Building each rose separately in world space costs a
 * hundred-odd copies of the same mesh: measured at **17.6 million vertices** for a single tier,
 * which does not render at all. See the warning on `rosetteCoatPaths`.
 */
export function rosetteLocalPath(opts = {}) {
  const o = { ...ROSETTE_DEFAULTS, ...opts };
  return rosetteSpiral(o).map(([u, v, lift]) => [u, o.ropeRadius + lift, v]);
}

/**
 * Every rosette on the cake, as seated 3D centrelines in WORLD space.
 *
 * ⚠️ NOT THE RENDERING PATH — use `rosetteLocalPath` + `rosetteSeats` and instance. This returns
 * the literal route the nozzle travels over the whole cake, which is the honest answer to "how is
 * this piped" and the right input for a build guide or a path export. Swept as geometry it is one
 * mesh per rose and it measured at 17.6M vertices on a default tier; the browser gave up before it
 * drew anything. Kept because the question it answers is real, labelled because the cost is not
 * obvious from the name.
 *
 * @returns {{ paths: number[][][], seats: object[] }} one polyline per rose, in seat order.
 */
export function rosetteCoatPaths(opts = {}) {
  const o = { ...ROSETTE_DEFAULTS, ...opts };
  const seats = rosetteSeats(o);
  const rand = mulberry32(((o.seed ?? 1) >>> 0) + 7919);

  const paths = seats.map(seat => {
    /* Each rose starts at its own angle. Without this every rose on the cake has its tail pointing
     * the same way, and a hundred identical tails read as a texture map rather than as piping. */
    const startAngle = rand() * TAU * (o.jitter > 0 ? 1 : 0);
    const spiral = rosetteSpiral({ ...o, startAngle });
    const [px, py, pz] = seat.p;
    const [nx, ny, nz] = seat.n;
    const [ux, uy, uz] = seat.u;
    const [vx, vy, vz] = seat.v;
    /* Seated: the rope's own radius lifts it clear of the cake, and the spiral's own `lift` domes
     * it on top of that. Both run along the surface normal, which is why a wall rose leans out of
     * the cake rather than up into the air. */
    return spiral.map(([su, sv, lift]) => {
      const off = o.ropeRadius + lift;
      return [
        px + ux * su + vx * sv + nx * off,
        py + uy * su + vy * sv + ny * off,
        pz + uz * su + vz * sv + nz * off,
      ];
    });
  });

  return { paths, seats };
}
