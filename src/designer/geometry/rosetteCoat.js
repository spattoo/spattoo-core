import { mulberry32 } from '../utils/random.js';

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
  tierRadius = 1.2,
  tierHeight = 1.45,
  baseY = 0.1,
  rosetteRadius = ROSETTE_DEFAULTS.rosetteRadius,
  /* ⚠️ THE PIECE'S MEASURED SIZE, WHICH IS NOT DERIVABLE FROM ONE RADIUS. `pieceW` is how far it
   * reaches ACROSS the surface, `pieceH` how far UP the wall. For the procedural rose both are a
   * diameter and `rosetteRadius` answers for them — but a GLB is scaled on its widest horizontal
   * extent, so a piece wider than it is tall is SHORTER than 2r and every row sum built on r is
   * wrong. Sandeep: *"are we not doing it by the calculation involving height of the cake, and the
   * height of rosette?"* We were not, and that is what put the bottom row through the board. */
  pieceW = null,
  pieceH = null,
  overlap = SEAT_OVERLAP,
  rimRow = true,               // a row ACROSS the corner — see the note below
  rimOverhang = 0.35,          // how far the outer top ring may pass the rim, as a fraction of pieceW/2
  coverTop = true,
  coverSide = true,
  jitter = ROSETTE_DEFAULTS.jitter,
  seed = 1,
} = {}) {
  const rand = mulberry32(seed >>> 0);
  const W = pieceW ?? rosetteRadius * 2;        // across the surface
  const H = pieceH ?? rosetteRadius * 2;        // up the wall
  const o = clamp01(overlap);

  /* Centre-to-centre, per axis. Overlap is the fraction of a piece its neighbour covers, which is
   * how a baker would describe it, and it keeps the two axes independent — a piece that is wide and
   * shallow needs tighter ROWS and looser columns, and one number cannot say that. */
  const stepW = Math.max(1e-3, W * (1 - o));
  const stepH = Math.max(1e-3, H * (1 - o));
  const seats = [];
  const wobble = a => (jitter > 0 ? (rand() - 0.5) * 2 * a * jitter : 0);
  /* ⚠️ ONE PREDICATE FOR THE RIM, read in three places. The first version gated the top's reach
   * and the wall's ceiling on `rimRow` while gating the LOOP on `rimRow && coverTop && coverSide`
   * — so asking for the top alone pulled it back from the rim for a row that was never built, and
   * left exactly the bald ring the rim row exists to prevent. */
  const hasRim = rimRow && coverTop && coverSide;

  if (coverTop) {
    const topY = baseY + tierHeight;
    /* The outer ring may pass the rim so its shoulder closes the seam against the wall — on the
     * reference cake there is no line where the top stops. Measured off the piece, not a radius. */
    const reach = hasRim
      ? tierRadius - (W / 2) * RIM_BITE          // the rim row takes the outermost band
      : tierRadius + (W / 2) * rimOverhang;
    seats.push({ p: [0, topY, 0], n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], kind: 'top', stretch: 1 });
    /* ⚠️ RINGS ARE DISTRIBUTED TO `reach`, NOT STEPPED UNTIL THEY PASS IT. Walking out in whole
     * steps and stopping at the last one that fits leaves the outermost ring up to a FULL STEP
     * short — a bare annulus between the top's last ring and the shoulder row, which is what it
     * rendered as and what a top-down view showed as a clean pink ring. The wall never had this
     * because its rows were already spread between two fixed ends.
     *
     * Ceil then divide: the count is whatever it takes for the pitch to stay within the step, and
     * the outermost ring lands exactly on `reach`. Tighter than asked, never looser — the same
     * rule as every other count here. */
    const rings = Math.max(1, Math.ceil(reach / stepW));
    for (let ring = 1; ring <= rings; ring++) {
      const r = (reach * ring) / rings;
      const count = Math.max(1, Math.ceil((TAU * r) / stepW));
      const phase = rand() * TAU;
      for (let i = 0; i < count; i++) {
        const a = phase + (i / count) * TAU + wobble(0.12);
        const rr = r + wobble(stepW * 0.1);
        seats.push({
          p: [Math.cos(a) * rr, topY, Math.sin(a) * rr],
          n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], kind: 'top', stretch: 1,
        });
      }
    }
  }

  if (coverSide) {
    /* ⚠️ HALF THE PIECE'S OWN HEIGHT, NOT A FRACTION OF A RADIUS. A piece resting on the board has
     * its CENTRE at half its height; anything less and it hangs through the board, which is exactly
     * what was rendering. The top row is inset the same way so nothing overhangs the lid — the top
     * surface closes that seam from above, with `rimOverhang`. */
    const lo = baseY + H / 2;
    const hi = baseY + tierHeight - H / 2 - (hasRim ? (H / 2) * RIM_BITE : 0);
    const span = Math.max(0, hi - lo);
    /* Rows that FIT, from the cake's height and the piece's height. One row when the piece is as
     * tall as the wall — which is an answer, not a degenerate case. */
/* ⚠️ ALWAYS CEIL A COUNT, NEVER ROUND IT. A ring or a column has to take a WHOLE number of
 * pieces, and rounding picks the nearest — which half the time is the one BELOW, stretching the
 * real pitch past the spacing the coverage was calculated for. At span/step = 2.4 that is three
 * rows at 1.2 × step: twenty percent looser than the overlap that was supposed to close the gaps,
 * which rendered as bare rings of cake between every row and between the top row and the rim.
 *
 * Ceiling only ever makes the pitch TIGHTER than asked. Pieces that overlap a little more than
 * intended are invisible; a gap is not. Error in one direction is free, in the other it is the
 * whole failure mode. */
    const rows = span <= 1e-6 ? 1 : Math.max(1, Math.ceil(span / stepH) + 1);
    const perRow = Math.max(3, Math.ceil((TAU * tierRadius) / stepW));
    for (let r = 0; r < rows; r++) {
      /* ⚠️ ONE ROW SITS ON THE BOARD, it is not centred in the span. Centring looks reasonable in
       * isolation and puts a gap under the bottom row, which is the one edge a viewer is level
       * with. The top is the gap to tolerate, because the rim row closes it. */
      const y = rows === 1 ? lo : lo + (span * r) / (rows - 1);
      const stagger = (r % 2) * (TAU / perRow) / 2;    // half a step every other row → hex packing
      for (let i = 0; i < perRow; i++) {
        const a = stagger + (i / perRow) * TAU + wobble(0.1);
        const ca = Math.cos(a), sa = Math.sin(a);
        seats.push({
          p: [ca * tierRadius, y + wobble(stepH * 0.08), sa * tierRadius],
          n: [ca, 0, sa],
          /* `u` runs AROUND the cake, `v` runs UP it. Taking `u` from a fixed world axis would
           * twist every piece except the one facing the camera. */
          u: [-sa, 0, ca],
          v: [0, 1, 0],
          kind: 'side',
          stretch: 1,
        });
      }
    }
  }

  /* ── The shoulder ────────────────────────────────────────────────────────────────────────────
   *
   * ⚠️ A 90° EDGE CANNOT BE HIDDEN BY PIECES TANGENT TO EITHER FACE. Every top seat lies flat on
   * the lid and every side seat flat on the wall, so the corner between them is the one place
   * nothing is tangent to — and it rendered as a bald ring with the top reading as a lid resting
   * on the cake. Sandeep, with the reference photo: *"rim was covered completely by cream piping."*
   *
   * So the corner gets its own row, seated on the rim circle with a normal that BISECTS up and
   * outward. That is not a trick to fill a gap — it is how the cake is actually piped: each rim
   * rose has a foot on the side and a shoulder on the top, which is visible as a distinct ring in
   * the photograph.
   *
   * ⚠️ BENDING THE PIECE IS THE OTHER OPTION AND IT IS THE WRONG ONE. This codebase does bend GLB
   * meshes — `bendStripToFestoon` curves a strip into a swag — but a strip bends because it is
   * LONG, and curving it along its length is the whole point. A rose is as wide as it is tall;
   * bending one through 90° crumples it. Tilting is what a piping bag does anyway.
   */
  if (hasRim) {
    const topY = baseY + tierHeight;
    const count = Math.max(3, Math.ceil((TAU * tierRadius) / stepW));
    const phase = rand() * TAU;
    const k = Math.SQRT1_2;                       // cos 45° — the bisector's share of each axis

    /* ── How far the shoulder row has to be STRETCHED to meet its neighbours ──────────────────
     *
     * Sandeep, on a second GLB that left a band under the rim: *"can we make it something like we
     * should bend the rim glb till it touches the below / or covers the gap?"*
     *
     * Stretching rather than bending, for the reason bending was rejected before: a strip bends
     * because it is long, a compact piece just crumples. But the AMOUNT need not be a slider —
     * both neighbours' positions are known here, so the row can size itself.
     *
     * A rim piece leans at 45°, so half its height reaches `k·H/2` down the wall and the same
     * inward across the lid. The two gaps it must close:
     *
     *   down  — from its lower edge to the top of the highest side piece
     *   in    — from its inner edge to the outer edge of the outermost top ring
     *
     * Stretch is symmetric along that axis, so one factor closes both and the WORSE gap sets it.
     * Clamped at 1 below, because the row must never shrink and leave a gap it would otherwise
     * have covered, and at STRETCH_MAX above, because past that a piece reads as smeared rather
     * than piped — a gap that large is a piece-size problem, not a stretch problem.
     *
     * ⚠️ IT IS A FACTOR, NOT A SIZE. The caller scales the piece along its own up-the-wall axis;
     * the other two axes must not move, or the shoulder row comes out fatter than its neighbours
     * and the seam reappears as a ridge instead of a gap. */
    const halfReach = (H / 2) * k || 1e-6;
    const sideTop   = coverSide ? (baseY + tierHeight - H / 2 - (H / 2) * RIM_BITE) + H / 2 : topY;
    const topOuter  = coverTop  ? (tierRadius - (W / 2) * RIM_BITE) + W / 2 : tierRadius;
    const needDown  = (topY - sideTop) / halfReach;
    const needIn    = (tierRadius - topOuter) / ((W / 2) * k || 1e-6);
    const stretch   = Math.min(STRETCH_MAX, Math.max(1, needDown, needIn));
    for (let i = 0; i < count; i++) {
      const a = phase + (i / count) * TAU + wobble(0.1);
      const ca = Math.cos(a), sa = Math.sin(a);
      /* Normal bisects outward and up. `u` runs around the rim as everywhere else; `v` is the
       * remaining axis, which leans up-and-inward — it is n × u, written out rather than computed
       * so the sign is visible. */
      seats.push({
        p: [ca * tierRadius, topY, sa * tierRadius],
        n: [ca * k, k, sa * k],
        u: [-sa, 0, ca],
        v: [-ca * k, k, -sa * k],
        kind: 'rim',
        /* Along `v` only — see the note above. Every other seat carries 1 so a caller can apply
           it unconditionally rather than branching on kind. */
        stretch,
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
