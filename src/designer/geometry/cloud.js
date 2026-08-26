import * as THREE from 'three';

// ── A fondant cloud ───────────────────────────────────────────────────────────
// Generated, not modelled, for the reason grass.js sets out: procedural work succeeds on subjects
// with no "precise familiar signature the eye can check", and a cloud is the clearest case there is.
// It is a handful of lumps. There is no proportion to get wrong and no material trick to miss.
//
// The stronger reason is the WALL. A cloud pressed onto the side of a cake has to bend round it — a
// modelled plaque laid flat against a round tier touches in the middle and floats at its ends, which
// is what festoon.js bends imported strips to avoid. That is not a scale factor, so no authored
// asset fixes it.
//
// TWO VARIANTS, from two references, and they are made in genuinely different ways because a baker
// makes them in genuinely different ways:
//
//   'puff' — balls rolled and pressed together. SEPARATE lumps, at different depths, so the cluster
//            self-shadows and reads as a bunch. The seams between balls are the point.
//   'flat' — ONE piece, rolled out and cut. No seams at all: a cut-out has a single bevelled edge
//            all the way round, which is what makes it read as fondant instead of as paper.
//
// That difference is why the flat one is not "the puff seen from the front". Overlapping discs leave
// a visible circle where each pair meets, and a box slab underneath leaves a knife edge across the
// front — together they read as cut paper stuck on a cake. The outline is traced round the whole
// cluster instead and extruded once, bevelled, as a single object.

export const CLOUD_DEFAULTS = {
  variant: 'puff',          // 'puff' | 'flat'
  // Every measurement below is × the TIER radius, never a world constant (INVARIANTS #8), so one
  // authored cloud suits a 6" and a 10" untouched — the same rule the rainbow follows.
  scale: 1,                 // overall size; multiplies width and height together, shape untouched
  // Chunky rather than long. The references are close to as tall as they are wide — a 0.5 ratio
  // reads as a bank of cloud, not a bunch of balls.
  // Wider than tall, about 1.7 to 1. Measured off the reference rather than guessed twice: a bank
  // of cloud is 2.5:1 and a ball is 1:1, and neither is what a pressed bunch looks like.
  width: 0.46,
  height: 0.27,             // how tall at its highest point, above the surface it sits on
  // Three across and two on top is FIVE balls, which is what the reference has. Seven made each one
  // small, and small balls read as a texture rather than as the lumps a baker rolled.
  lobes: 3,                 // how many lumps ACROSS the bottom row
  rows: 2,                  // how many rows of them; the upper ones nestle into the gaps below
  variation: 0.22,          // how unequal they are; 0 is a row of identical balls, which is a caterpillar
  taper: 0.2,               // how much smaller the end balls are than the middle one
  depth: 0.10,              // 'flat' only: how thick the rolled-out piece is
  bevel: 0.45,              // 'flat' only: how soft the cut edge is, × half the thickness
  puffDepth: 0.28,          // 'puff' only: how DEEP the bunch is, front to back, × tier radius
  surface: 'top',           // 'top' | 'board' | 'side'
  offsetX: 0,               // where it sits along the surface
  // WHERE IT SITS, in two numbers that mean the same thing on the top and on the board: how far
  // ROUND the cake, and how far OUT from its middle. A cloud on the board used to sit at a distance
  // baked into the renderer (`R + width * 0.35`), which is a position nobody could move.
  yaw: 0,                   // 'top' and 'board': where round the cake, radians. 0 is the front
  standoff: 0,              // 'top' and 'board': how far out from the axis, × tier radius
  theta: 0,                 // 'side' only: where round the wall, radians. 0 is the front
  color: '#FFFFFF',
};

/**
 * Deterministic wobble for lump `i`, in 0…1.
 *
 * NOT Math.random. A design is saved as numbers and rendered again later — on the customer's phone,
 * in the baker's order, in the template thumbnail. A cloud that reshuffles its lumps on every render
 * is a different cloud each time it is looked at, and the thumbnail stops matching the cake.
 */
function wobble(i, salt = 0) {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The lumps a cloud is made of, in the cloud's own flat space: x across, y up from the surface.
 *
 * A CLUSTER, not a row. Balls laid in one line make an arch — a caterpillar with a curved back —
 * and the references are plainly not that: three or four along the bottom with two or three nestled
 * into the gaps on top, chunky, nearly as tall as they are wide, and the balls close to equal in
 * size. That is also how the thing is made: you roll a few balls and press them together, and the
 * upper ones sit in the dips between the lower ones because that is where they stay put.
 *
 * `lobes` is therefore the count ACROSS the bottom row, not the total. Each row above has one fewer
 * and is offset half a step, which is what nestling means.
 *
 * How far they sit into the base line depends on the variant, and it is not a cosmetic choice:
 *   'puff' rests ON it (centre one radius up, nothing below), because a ball set on a board sits on
 *          the board. Sinking it would put half a ball inside the board.
 *   'flat' dips BELOW it, and the outline is then cut off at the line — which is exactly how the
 *          cut-out is made and where its straight bottom comes from. Nothing is left underneath,
 *          because the shape stops at the cut.
 */
export function cloudLobes(params = {}, cake = {}) {
  const p = { ...CLOUD_DEFAULTS, ...params };
  const R = cake.radius ?? 1;
  const size = p.scale ?? 1;
  const width = p.width * R * size;
  const height = p.height * R * size;
  const depth = (p.puffDepth ?? 0) * R * size;
  const n = Math.max(1, Math.round(p.lobes));
  const flat = p.variant === 'flat';
  // A cut piece is rolled out flat and cut — one thickness of fondant, so one row. Stacking it would
  // be describing a different object.
  const rows = flat ? 1 : Math.max(1, Math.round(p.rows ?? 1));

  // Where a lump's middle sits, as a fraction of its own radius. Below 1 it dips under the line.
  const seat = flat ? 0.70 : 1;
  // How far each row sits above the one below, × the ball radius. Less than 1, so an upper ball
  // drops into the dip between two lower ones instead of balancing on top of one.
  const NESTLE = 0.78;
  // The top of the highest row has to reach `height`: seat·r + (rows-1)·NESTLE·r + r = height.
  const rMax = height / (seat + 1 + (rows - 1) * NESTLE);

  const half = width / 2;
  const lobes = [];
  let k = 0;
  for (let row = 0; row < rows; row++) {
    // One fewer each row up, so the cloud comes to a rounded top rather than a flat ceiling.
    const m = Math.max(1, n - row);
    for (let i = 0; i < m; i++) {
      // -1 … +1 across the row. A single lump sits in the middle.
      const t = m === 1 ? 0 : (i / (m - 1)) * 2 - 1;
      // Barely falls away toward the ends — the reference balls are close to equal, and a strong
      // taper is what turns a bunch into an arch. Then nudged unequal, because a symmetrical cloud
      // looks like a diagram of a cloud.
      const shape = 1 - (p.taper ?? 0) * t * t;
      const nudge = 1 + (p.variation ?? 0) * (wobble(k) - 0.5);
      const r = Math.max(rMax * 0.15, rMax * shape * nudge);
      // Upper rows are inset by half a step, which puts each ball over a gap in the row below.
      const span = Math.max(0, half - r) * (rows === 1 ? 1 : 1 - row * 0.22);
      // FRONT TO BACK, alternating. A bunch of pressed balls has depth in every direction — you can
      // see the ones behind catching less light — and rows in a single plane are a WALL of balls
      // seen face-on however much you jitter them. Alternating puts each ball behind the gap between
      // its neighbours, the same interlock the rows use going up, so the bunch closes rather than
      // showing daylight through it. The rows above alternate the other way, or every ball would sit
      // directly over the one below.
      const zSpread = Math.max(0, (depth / 2) - r);
      const side = ((i + row) % 2) * 2 - 1;
      lobes.push({
        // The bottom row's outermost EDGES reach ±half, so `width` is the cloud's real width and not
        // the distance between the middles of its end balls.
        x: t * span,
        y: r * seat + row * NESTLE * rMax,
        // A cut piece is one sheet: it has no depth to arrange.
        z: flat ? 0 : side * zSpread * (0.7 + 0.3 * wobble(k, 1)),
        r,
      });
      k++;
    }
  }
  return { lobes, width, height, thickness: p.depth * R * size };
}

/**
 * The outline of the whole cluster, as one closed loop — the 'flat' variant's actual shape.
 *
 * Traced with marching squares over a field that is positive inside any lump and negative below the
 * base line. That does two things at once: it UNIONS the lumps, so no seam is left where two of them
 * meet, and it CUTS the bottom straight where the fondant was trimmed against the board.
 *
 * Overlapping discs were the alternative and they read as cut paper: every pair leaves a visible
 * circle, and the slab that gave them a straight bottom left a knife edge across the front. A cut-out
 * has ONE edge, all the way round.
 */
export function cloudOutline(params = {}, cake = {}, { cells = 110 } = {}) {
  const { lobes, width, height } = cloudLobes({ ...params, variant: 'flat' }, cake);
  const pad = width * 0.03;
  const x0 = -width / 2 - pad, x1 = width / 2 + pad;
  const y0 = -pad, y1 = height + pad;

  const nx = Math.max(8, Math.round(cells));
  const ny = Math.max(8, Math.round(cells * ((y1 - y0) / (x1 - x0))));
  const dx = (x1 - x0) / nx, dy = (y1 - y0) / ny;

  // Positive inside. Below the base line it falls away, so the contour runs straight along the cut.
  const field = (x, y) => {
    if (y <= 0) return y - 1e-9;
    let best = -Infinity;
    for (const l of lobes) best = Math.max(best, l.r - Math.hypot(x - l.x, y - l.y));
    return best;
  };

  const F = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    F[j * (nx + 1) + i] = field(x0 + i * dx, y0 + j * dy);
  }
  const at = (i, j) => F[j * (nx + 1) + i];
  // Where the contour crosses an edge, by linear interpolation between the two corner values —
  // straight midpoints would leave the outline faceted at grid resolution.
  const lerp = (a, b, va, vb) => a + (b - a) * (va / (va - vb));

  const segs = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const xa = x0 + i * dx, xb = xa + dx, ya = y0 + j * dy, yb = ya + dy;
    const v00 = at(i, j), v10 = at(i + 1, j), v11 = at(i + 1, j + 1), v01 = at(i, j + 1);
    const code = (v00 > 0 ? 1 : 0) | (v10 > 0 ? 2 : 0) | (v11 > 0 ? 4 : 0) | (v01 > 0 ? 8 : 0);
    if (code === 0 || code === 15) continue;
    const B = () => [lerp(xa, xb, v00, v10), ya];
    const Rt = () => [xb, lerp(ya, yb, v10, v11)];
    const T = () => [lerp(xa, xb, v01, v11), yb];
    const L = () => [xa, lerp(ya, yb, v00, v01)];
    // Wound anticlockwise round the inside, so following "where this segment ends" walks the loop.
    // The two saddle cases are split the same way every time, which is enough here: a cloud is not
    // thin enough anywhere to pinch into two pieces.
    const table = {
      1: [[L, B]], 2: [[B, Rt]], 3: [[L, Rt]], 4: [[Rt, T]], 5: [[L, T], [B, Rt]],
      6: [[B, T]], 7: [[L, T]], 8: [[T, L]], 9: [[T, B]], 10: [[T, Rt], [B, L]],
      11: [[T, Rt]], 12: [[Rt, L]], 13: [[Rt, B]], 14: [[B, L]],
    };
    for (const [a, b] of table[code]) segs.push([a(), b()]);
  }
  if (!segs.length) return [];

  // Stitch the segments into a loop. Keyed on rounded coordinates because the same crossing point is
  // computed twice, once from each cell that shares the edge, and the two answers differ in the last
  // bits — an exact-match join would leave the loop in pieces.
  const q = v => `${Math.round(v[0] / (dx * 1e-3))}:${Math.round(v[1] / (dy * 1e-3))}`;
  const from = new Map();
  for (const [a, b] of segs) if (!from.has(q(a))) from.set(q(a), { a, b });

  let best = [];
  const used = new Set();
  for (const [startKey] of from) {
    if (used.has(startKey)) continue;
    const loop = [];
    let key = startKey;
    for (let guard = 0; guard < segs.length + 2; guard++) {
      const seg = from.get(key);
      if (!seg || used.has(key)) break;
      used.add(key);
      loop.push(seg.a);
      key = q(seg.b);
      if (key === startKey) break;
    }
    if (loop.length > best.length) best = loop;
  }
  return best.map(([x, y]) => new THREE.Vector2(x, y));
}

/**
 * Where the cloud's base line sits in the world, and what it is standing on.
 *
 * 'board' and 'side' both rest on the board — a flat cloud pressed on the wall still stands on
 * something, it does not hover at an arbitrary height up the tier.
 */
export function cloudBaseY(surface, { topY = 0, boardY = 0 } = {}) {
  return surface === 'top' ? topY : boardY;
}

/**
 * The cloud placed in the world.
 *
 * `surface` decides the whole placement, not just a height:
 *   'top'   — sits on the cake top, facing the viewer, kept inside the rim.
 *   'board' — sits on the board, in front of the cake, so nothing has to fit anywhere.
 *   'side'  — pressed onto the wall. `x` becomes an ANGLE by dividing by the radius, so the cloud
 *             keeps the width it was drawn as: a plaque bent round a cake must not turn into a
 *             different amount of fondant to roll. For the puff that is done per ball here; the flat
 *             sheet is bent whole, which the renderer does to its vertices.
 */
export function cloudPlacement(params = {}, cake = {}) {
  const p = { ...CLOUD_DEFAULTS, ...params };
  const R = cake.radius ?? 1;
  const baseY = cloudBaseY(p.surface, cake);
  const onWall = p.surface === 'side';
  const onTop = p.surface === 'top';
  const flat = p.variant === 'flat';

  const { lobes, width: w0, height: h0, thickness: t0 } = cloudLobes(p, cake);
  const centerX = (p.offsetX ?? 0) * R;
  const standoff = (p.standoff ?? 0) * R;

  // ── Size is the author's, and so is position. Neither one moves the other ─────────────────────
  // A cloud dragged toward the rim used to SHRINK, on a fit solved so nothing overhung. Nobody
  // asked for that. There is a size control, which is what a size control is for, and a fondant
  // cloud on a real cake overhangs the edge — the reference photo shows exactly that.
  //
  // It cost twice over. The shrink itself was never wanted, and it dragged a position cap in behind
  // it: at exactly the rim the fit solved to zero, so the middle had to be held a tenth of the cake
  // short of the edge to stop a drag deleting the cloud. Take the fit away and the cap has nothing
  // to protect, so both are gone. Drag it to the rim and it hangs off the rim.
  //
  // On the board a cloud stands OUTSIDE the cake by default rather than under it, which is where the
  // hardcoded distance used to put it — but as a number that can be dragged.
  const outward = onTop ? standoff : (p.standoff ? standoff : R + w0 * 0.35);
  const width = w0, height = h0, thickness = t0;
  const yaw = p.yaw ?? 0;
  const spin = (x, z) => new THREE.Vector3(
    Math.cos(yaw) * x + Math.sin(yaw) * z, 0, -Math.sin(yaw) * x + Math.cos(yaw) * z);

  // Where the cloud's own middle ends up once it has been carried round the cake. Both variants use
  // it; they differ only in whether the shape is TURNED on arrival.
  const middle = spin(centerX, outward);

  const placed = lobes.map(l => {
    const { x, y, z, r } = l;
    if (onWall) {
      // Divided by the radius the ball's own middle sits at, so a row of balls bent round the cake
      // spans the same length of wall it spanned flat.
      const rw = R + r;
      const th = (p.theta ?? 0) + (centerX + x) / rw;
      const out = rw + z;
      return { r, position: new THREE.Vector3(Math.sin(th) * out, baseY + y, Math.cos(th) * out), rotationY: th };
    }
    // Carried to where it stands, and set down STILL FACING THE FRONT. Neither variant turns.
    //
    // The flat one never did — it is a cut sheet, and a quarter turn shows you its thin edge. The
    // puff did, on the reasoning that a bunch of balls reads the same from any angle so it may as
    // well keep its bulge pointing outward. That was wrong for the same reason the rainbow's was:
    // it made a DRAG turn the thing instead of moving it, and on a cake nobody is looking for the
    // side view of a cloud. Both are placed now, and neither is rotated.
    const pos = { x: middle.x + x, z: middle.z + z };
    return { r, position: new THREE.Vector3(pos.x, baseY + y, pos.z), rotationY: 0 };
  });

  return {
    variant: p.variant,
    lobes: placed,
    // The flat variant's shape is ONE outline, not a list of lumps, so the piece that gets cut is
    // the piece that goes on.
    outline: flat ? cloudOutline(p, cake) : null,
    // How that sheet meets the cake. The renderer bends it for a wall; elsewhere it is a translate.
    // Already carried round the cake, and NOT turned — so the renderer has a translate and nothing
    // else. `centerX` and `theta` are still here for the wall, where the sheet is bent rather than
    // placed and the bend needs to know where along the wall it starts.
    sheet: flat
      ? { onWall, wallR: R, theta: p.theta ?? 0, centerX, baseY,
          x: onWall ? 0 : middle.x,
          z: onWall ? 0 : middle.z,
          thickness, bevel: Math.max(0, Math.min(0.9, p.bevel ?? 0)) }
      : null,
    width, height, thickness, baseY,
  };
}

// Handles speak u in 0…1 and the geometry speaks radians, so both directions WRAP rather than clamp:
// dragging past the back of the cake carries on round it, it does not stick there.
const TAU = Math.PI * 2;
const clamp01 = x => Math.max(0, Math.min(1, x));
const wrapU = x => ((x % 1) + 1) % 1;
const wrapAngle = a => ((a % TAU) + TAU) % TAU;

/**
 * Where a cloud's drag handle sits — the cloud's own middle, standing on the surface.
 *
 * The same map the rainbow uses, and for the same reason: a point (0, y, standoff) turned by yaw
 * lands exactly where the handle machinery draws a top-surface point from (angle, radial fraction),
 * so the handle and the cloud cannot drift apart.
 *
 * On the WALL there is one freedom, not two. A wall cloud stands on the board — it does not float
 * partway up — so `theta` is the whole of its position and `v` is pinned at the board.
 */
export function cloudHandleAt(params = {}, cake = {}) {
  const p = { ...CLOUD_DEFAULTS, ...params };
  const R = cake.radius ?? 1;
  if (p.surface === 'side') return { surface: 'side', u: wrapU((p.theta ?? 0) / TAU), v: 0 };

  const { width } = cloudLobes(p, cake);
  const centerX = (p.offsetX ?? 0) * R;
  const out = p.surface === 'top'
    ? (p.standoff ?? 0) * R
    : (p.standoff ? p.standoff * R : R + width * 0.35);
  // The board is wider than the tier, so a cloud standing beside the cake is past v = 1 on the
  // tier's own scale. The caller passes the radius the handle is measured against.
  const scale = cake.handleRadius ?? R;
  return {
    surface: p.surface === 'top' ? 'top_surface' : 'board',
    u: wrapU(((p.yaw ?? 0) + Math.atan2(centerX, out)) / TAU),
    v: scale > 0 ? Math.min(1, Math.hypot(centerX, out) / scale) : 0,
  };
}

/**
 * The parameters after a drag to (u, v) — the inverse of the above.
 *
 * `offsetX` is held, exactly as the rainbow holds its lean: it is part of how a cloud was authored,
 * and a drag should move the thing rather than reshape it. Which means the middle cannot come closer
 * to the axis than that offset, and the drag rests there instead of going imaginary.
 */
export function cloudDragTo(params = {}, cake = {}, u = 0, v = 0) {
  const p = { ...CLOUD_DEFAULTS, ...params };
  if (p.surface === 'side') return { theta: wrapAngle(u * TAU) };

  const R = cake.radius ?? 1;
  const scale = cake.handleRadius ?? R;
  const centerX = (p.offsetX ?? 0) * R;
  const want = clamp01(v) * scale;
  const out = Math.sqrt(Math.max(0, want * want - centerX * centerX));
  return {
    yaw: wrapAngle(u * TAU - Math.atan2(centerX, out)),
    standoff: R > 0 ? out / R : 0,
  };
}

/**
 * What the baker rolls, as proportions of the cake — never millimetres.
 *
 * The same rule the rainbow's guide follows: a millimetre is a promise about a cake nobody has seen,
 * and the baker bakes the cake they bake. "A ball two-fifths as wide as the cake" survives any size
 * and is how the work is actually done: roll, offer up, trim.
 */
export function cloudGuide(params = {}, cake = {}) {
  const { lobes, width, variant } = cloudPlacement(params, cake);
  const cakeWidth = (cake.radius ?? 1) * 2;
  return {
    variant,
    balls: lobes.length,
    widthOfCakeWidth: +(width / cakeWidth).toFixed(2),
    // Biggest first: it is the one a baker rolls to size and matches the rest against.
    ballsOfCakeWidth: lobes
      .map(l => +((l.r * 2) / cakeWidth).toFixed(2))
      .sort((a, b) => b - a),
  };
}
