import * as THREE from 'three';

// ── A fondant rainbow ─────────────────────────────────────────────────────────────────────────
// Concentric rounded ropes: an arch, optionally on legs that run down to the board. The band count,
// the colours and how far the legs reach are all authored.
//
// ── WHY PROCEDURAL AND NOT A MODELLED ASSET ───────────────────────────────────────────────────
// A modelled arch is authored at ONE leg length, and the whole point of this decoration is that the
// legs reach the board — which is a different distance on a single tier than on a stack, and
// different again on a taller tier. chocolateDrip.js met this first and grass.js restated it: a
// modelled patch is authored at one radius, so it builds from the tier's real geometry instead.
//
// It also passes grass.js's test for when procedural work succeeds here — it fails on subjects with
// "a precise familiar signature the eye can check" (isomalt's refraction, a palette knife's tool
// marks) and succeeds where there is none. A fondant rainbow is concentric tubes. There is no
// material trick to get wrong; it is geometry, and geometry is the thing this can actually do.
//
// ── EVERYTHING IS A RATIO OF THE CAKE ─────────────────────────────────────────────────────────
// Not one measurement here is a world constant. `innerRadius`, `thickness` and `gap` are fractions
// of the tier's radius, so the same authored rainbow suits a 6" and a 10" without being re-tuned —
// and INVARIANTS #8 says a world dimension is never hardcoded anyway.
//
// The ratios are also what the baker's guide can honestly say. We cannot promise "roll a 42 cm
// rope": the baker bakes the cake they bake, and a millimetre is a promise about a cake we have not
// seen. "The outer band is about 1.6× the width of the cake" survives any size they choose, which is
// the same reason the X-ray stores `tier_width_ratio` and derives millimetres last (openai.js).

export const RAINBOW_DEFAULTS = Object.freeze({
  bands: 6,
  // Pastel, matching the fondant a baker actually colours — a saturated spectrum reads as plastic.
  colors: ['#F5A3B8', '#F7C59F', '#F7E7A0', '#A8D5A2', '#A3C7E8', '#C9AEDD'],
  // Read off the references rather than picked: a TIGHT hole under a stack of FAT ropes. That
  // proportion is what makes the band stack itself reach past the cake, so the legs come down beside
  // it and nearly touch. A wide hole with thin ropes gives a shallow hoop that can only miss the
  // cake by being shoved backwards — a different object, and not one anybody decorates.
  // Overall size — multiplies the hole, the ropes and the gaps together, so the SHAPE is untouched
  // and only how big it is changes. Separate from innerRadius on purpose: that one changes the
  // PROPORTION (a tighter hole under the same ropes), which is a different rainbow, not a bigger one.
  scale: 1,
  innerRadius: 0.30,   // × tier radius — the hole under the arch
  thickness:   0.115,  // × tier radius — one rope's diameter
  // Ropes TOUCH. Zero, and there is no control for it: a rainbow is fondant, and separate ropes with
  // daylight between them do not hold each other up — they are one piece pressed together, or they
  // are six ropes that fall over. Kept as a parameter because the geometry reads more clearly with
  // it named than with the arithmetic silently assuming zero.
  gap:         0,
  // The two feet land INDEPENDENTLY — 'board' | 'top' | 'none' each. A single setting could only
  // ever make a symmetric arch, and the shape a rainbow cake actually uses is lopsided: it springs
  // off the top of the cake on one side, arcs over, and sweeps down past the edge to the board on
  // the other. Both to 'board' is the backdrop; both to 'top' is the small arch that sits on the
  // cake. One of each is the one everybody actually means.
  // WHICH SURFACE it sits on.
  //   'top'  — an arch over the cake: a flat plane, feet on the board and/or the cake top.
  //   'side' — laid ON the wall, facing front: the same arch, bent around the tier so it hugs.
  // A wall rainbow is not a flat one turned sideways. Left flat against a round cake its middle would
  // touch and its ends float — which is exactly what festoon.js bends imported strips to avoid.
  surface: 'top',
  // Where round the wall it sits, radians, for `surface: 'side'`. 0 is the front.
  theta: 0,
  // How far the ropes stand off the wall, × tier radius. FIXED, with no control — the same call as
  // `gap`, for the same reason: it is not a decision anybody makes. Fondant pressed onto a cake is
  // pressed onto it, and the only reason this is not zero is to stop the two surfaces flickering
  // against each other, which is a rendering detail rather than a choice about the decoration.
  proud: 0.02,
  footLeft:  'top',
  footRight: 'board',
  // Where a foot RESTING ON THE CAKE sits, as a fraction of the tier radius out from the middle
  // (0 = the centre, 1 = the rim). Null derives it, which is almost always what you want — see
  // archCenterX. Only meaningful when one foot is on the top and the other is not.
  // WHERE IT STANDS, × tier radius, along the cake. A fixed number, not a derived one.
  //
  // It used to be derived from the outer radius so the resting foot always landed at `topFootAt`.
  // That quietly made POSITION a function of SIZE: dragging the inner radius from 0.2 to 0.6 slid
  // the whole rainbow 0.4R across the cake, because a smaller hole means a smaller outer radius
  // means a different centre. Changing how big something is must not move it — where it stands is
  // the author's decision, and nothing else's.
  //
  // The default is the value that derivation produced at the default proportions, so the shape that
  // was tuned against the references is unchanged; it is simply frozen instead of recomputed.
  //
  // MEASURED TOWARD THE FALLING SIDE, not toward +x. A rainbow leans: one foot rests on the cake and
  // the other falls past its edge to the board, and the arch has to sit off-centre TOWARD the side it
  // falls down. Signing it against the world instead meant swapping the feet left the arch shifted
  // the wrong way — the falling leg landed on the cake and the clearance rule shoved the whole thing
  // backwards to escape. Now mirroring is free: swap the feet and it leans the other way, unchanged.
  offsetX: 0.71,
  // Only consulted when offsetX is null — the old derived behaviour, kept because it is genuinely
  // useful when authoring a NEW shape: set the resting foot where you want it, read off the offsetX
  // it implies, then fix it there.
  topFootAt: 0.28,
  // Where the arc STARTS, as a fraction of the cake's height: 0 = the board, 1 = the top of the
  // cake, above 1 = clear of it. Pinning it to the top was wrong — that makes the arch straddle the
  // cake like a cage, with a leg standing off each side. On a real one the arc springs from about
  // halfway up and the cake overlaps its lower half.
  spring: 1,
  // How far behind the cake's CENTRE LINE it stands, × tier radius. Zero by default.
  //
  // This was 0.9, and that was wrong twice over. A rainbow of these proportions clears the cake by
  // being WIDER than it, not by standing behind it — so setting it back put the rainbow at the front
  // of the board with a visible gap down the side, which is not how one is ever decorated. Standing
  // back was compensating for an arch too shallow to clear any other way; fix the proportions and
  // the need disappears. A little forward or back is taste; it is not what clears the cake.
  standoff: 0,
  // ── WHERE IT STANDS on the surface, × tier radius ─────────────────────────────────────────────
  // A plain translation, and the ONLY thing a drag writes. It used to write `yaw`, which carried the
  // arch round the cake's axis and TURNED it on the way — so dragging it toward the middle swung it
  // edge-on instead of moving it. Nobody decorating a cake wants a rainbow seen from the side.
  //
  // 0,0 is the middle of the surface. Not `offsetX`: that is the arch's LEAN, part of its shape.
  px: 0,
  pz: 0,
  flatten: 0,          // 0 = round rope, → 1 squashes it into a flat band (references 1 and 3)

  // ── Curled ends ───────────────────────────────────────────────────────────────────────────────
  // A second rainbow shape, not a second generator: same ropes, same arch, same everything, and the
  // ends roll up instead of reaching for a surface. Set a side's foot to 'curl' to get it.
  curlTurns: 1.35,     // how far round the end winds, in whole turns
  // How wide the coil starts, in ROPE THICKNESSES. Same on every band — see bandPath.
  curlSize: 0.75,
  // How far the coil closes: 0 leaves a loose hook the same width as the arch, 1 winds it in as
  // tight as the rope's own thickness allows. Never tighter — see bandPath.
  curlTightness: 0.82,
  // How much further one side of the stack runs before it rolls up. Zero puts every coil at one

  arcSegments: 96,     // along the path
  tubeSegments: 12,    // around the rope
});

// Where the feet stop, in world Y.
//   board — the top of the board, so it stands beside the cake (reference 1)
//   top   — the top of the cake, so it sits on it (references 2 and 4)
//   none  — no legs at all: a bare half-circle
//   curl  — no leg either: the rope carries on past the arch and rolls up (reference 5)
// The distance is never authored, only chosen: `board` on a three-tier stack is a long way further
// than on a single, and that is the whole reason this is not a GLB.
export function legFootY(legs, { topY = 0, boardY = 0 } = {}) {
  if (legs === 'top') return topY;
  if (legs === 'none' || legs === 'curl') return null;
  return boardY;
}

/**
 * The rope's end, rolled up — the curled rainbow's whole difference from the plain one.
 *
 * Walked forward one small turn at a time rather than solved as a spiral formula, and that is the
 * point of it: the walk STARTS with the heading and the curvature the arch already had, so there is
 * no crease where the arch stops and the coil begins. A spiral about a fixed pole cannot do that —
 * its tangent sits a fixed angle off the circle's, so the join kinks by that angle however the
 * numbers are chosen.
 *
 * The radius runs down from the band's own to `rEnd` across the coil, which is what a baker's hand
 * does: the rope keeps turning and each turn comes in tighter.
 *
 * @param heading  direction of travel at the start, radians
 * @param dir      +1 or -1 — which way it winds
 */
export function curlPoints({ x, y, z = 0, zEnd = null, heading, dir = -1, turns = 1, radius0, rEnd, segments = 64 }) {
  const pts = [];
  const total = turns * Math.PI * 2;
  if (!(total > 0) || !(radius0 > 0)) return pts;

  // Eased, not linear, so the rope leaves the arch's plane smoothly instead of setting off at an
  // angle from the first point.
  const ease = u => u * u * (3 - 2 * u);
  const lift = zEnd == null ? 0 : zEnd - z;

  const steps = Math.max(8, Math.round(segments * turns));
  const dTheta = total / steps;
  let th = heading, px = x, py = y;
  for (let i = 0; i < steps; i++) {
    const u = (i + 0.5) / steps;
    const r = radius0 + (rEnd - radius0) * u;
    const ds = r * dTheta;
    const pz = z + lift * ease(Math.min(1, u * 2));
    // Turn half, step, turn half — the midpoint rule. Turning a whole step before moving swings the
    // coil wide of where that curvature actually puts it, and the error compounds over two turns.
    th += dir * dTheta / 2;
    px += Math.cos(th) * ds;
    py += Math.sin(th) * ds;
    th += dir * dTheta / 2;
    pts.push(new THREE.Vector3(px, py, pz));
  }
  return pts;
}

/**
 * The centreline of ONE band, as world points: up the left leg, over the arch, down the right.
 *
 * The leg meets the arc TANGENTIALLY — a semicircle's end tangent is already vertical — so there is
 * no corner between them to round off or crease. That is why this can be sampled as one smooth run
 * of points rather than stitched from separate curves with a join to argue about.
 */
export function bandPath({
  radius, archY, footLeftY, footRightY, standoff = 0, centerX = 0,
  arcSegments = RAINBOW_DEFAULTS.arcSegments,
  // A curled end, per side. Set instead of a foot, never as well as one — a rope that reaches the
  // board has no spare end to roll up.
  curlLeft = false, curlRight = false, thickness = 0,
  curlTurns = RAINBOW_DEFAULTS.curlTurns,
  curlSize = RAINBOW_DEFAULTS.curlSize,
  endAngle = 0,
  curlTightness = RAINBOW_DEFAULTS.curlTightness,
  bandIndex = 0, bandCount = 1,
}) {
  const pts = [];
  const z = standoff;   // one plane, set back from the cake's centre — a rainbow is flat
  // Each leg is drawn only if its foot is BELOW where the arc springs. A foot at or above that is
  // not a short leg, it is no leg — the arc simply ends there.
  const hasLeft  = footLeftY  != null && footLeftY  < archY;
  const hasRight = footRightY != null && footRightY < archY;

  // ── How big the coil is ───────────────────────────────────────────────────────────────────────
  // Measured in ROPES, not in bands. A scroll end is a small thing a couple of rope-widths across,
  // and it is the same small thing on every band, because a baker rolls each end the same way.
  //
  // Starting it at the band's own radius instead — to match the arch's curvature exactly at the
  // join — was the obvious idea and produced nonsense: the first turn of a coil is as wide as the
  // curve it starts from, so the outer band swung out to x = 3.17 on a cake of radius 1.2. The join
  // needs a continuous TANGENT, which the walk gives it by construction; matching curvature as well
  // is not worth a coil the size of the rainbow. A scroll has an inflection at the join anyway —
  // that S is what makes it read as rolled.
  //
  // A coil cannot close tighter than the rope is thick without eating itself: at radius thickness/2
  // the inside of the tube meets its own axis and the tip turns inside out. Kept clear of it.
  const minR = Math.max(1e-4, thickness * 0.62);
  const r0 = Math.max(minR, thickness * Math.max(0.6, curlSize));
  const t = Math.max(0, Math.min(1, curlTightness));
  const rEnd = r0 + (minR - r0) * t;

  // ── Which way the coil winds ──────────────────────────────────────────────────────────────────
  // AGAINST the arch, so the end scrolls outward and away.
  //
  // Winding it the same way as the arch is the intuitive answer and it is wrong. The arch travels
  // left to right, heading swinging up → right → down: clockwise. Carry on clockwise from the right
  // end and the coil sweeps down, then back LEFT under the arch, and straight through the ropes
  // inside it — measured at every fan setting, the worst gap between a coil and another band was
  // 0.000 to 0.004 against a rope 0.138 thick. Not close: passing clean through.
  //
  // Which is also the physical answer. A baker cannot roll the end inward; the rest of the rainbow
  // is in the way. It gets rolled outward, and the S that leaves at the join is what a scroll IS.
  const ARCH_DIR = -1;
  const CURL_DIR = -ARCH_DIR;
  const curlArgs = { z, turns: curlTurns, radius0: r0, rEnd };

  // ── Where each band stops ─────────────────────────────────────────────────────────────────────
  // Handed in, not worked out here. The curls are a STACK — the innermost rests on the cake, each
  // next one sits on the one below and steps a little left — and a stack cannot be solved one band
  // at a time, because where a coil sits depends on the coil under it. `curlChain` solves the whole
  // run in rainbowBands and hands each band the angle it stops at.
  //
  // Everything this replaced was mine and none of it was asked for: a fan that ran the ends past the
  // springing point (which buried five of six coils INSIDE the cake), a splay that spread the bands
  // apart until the rainbow opened like a peacock, and a lift that pushed the coils out of the plane
  // to stop them intersecting. All three existed to stop coils tangling. Stacking them cannot tangle
  // them — each one is placed exactly one coil-width from its neighbour, which is what "sits on"
  // means — so all three are gone, and the arch is left alone. The inner radius does not move.
  const aLeft = Math.PI - (curlLeft ? (endAngle ?? 0) : 0);
  const aRight = curlRight ? (endAngle ?? 0) : 0;
  const arcPoint = a => new THREE.Vector3(
    centerX + Math.cos(a) * radius, archY + Math.sin(a) * radius, z);

  const headingOf = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

  // ── The left end ──────────────────────────────────────────────────────────────────────────────
  if (curlLeft) {
    // Walked BACKWARD from the arc's start, away from the arch, then reversed onto the front of the
    // path — the points have to read left-to-right like every other band. Walking backwards flips
    // which way the curve turns, hence the sign.
    const a0 = arcPoint(aLeft), a1 = arcPoint(aLeft - 0.01);
    const coil = curlPoints({ ...curlArgs, x: a0.x, y: a0.y,
      heading: headingOf(a1, a0), dir: -CURL_DIR });
    pts.push(...coil.reverse());
  } else if (hasLeft) {
    pts.push(new THREE.Vector3(centerX - radius, footLeftY, z));
  }

  // Left (π) round to right (0), plus whatever each curled end runs on for. Descending so the run
  // reads left-to-right with the legs.
  const span = aLeft - aRight;
  const segs = Math.max(2, Math.round(arcSegments * (span / Math.PI)));
  for (let i = 0; i <= segs; i++) {
    const a = aLeft - (i / segs) * span;
    pts.push(arcPoint(a));
  }

  // ── The right end ─────────────────────────────────────────────────────────────────────────────
  if (curlRight) {
    const end = pts[pts.length - 1], prev = pts[pts.length - 2];
    pts.push(...curlPoints({ ...curlArgs, x: end.x, y: end.y,
      heading: headingOf(prev, end), dir: CURL_DIR }));
  } else if (hasRight) {
    pts.push(new THREE.Vector3(centerX + radius, footRightY, z));
  }
  return pts;
}

/** Centreline radius of band `i`, counting outwards from the arch's hole. */
/**
 * How far the arch is shifted SIDEWAYS, so a foot that rests on the cake actually lands on it.
 *
 * A centred arch is wider than the cake, so a foot stopping at cake-top height stops in mid-air
 * beside it — which is exactly what the first asymmetric render did. Shifting the arch toward the
 * board side puts the resting foot back on the cake and pushes the descending leg clear of the rim.
 *
 * Derived from the OUTERMOST band, because that is the one that would overhang first; the inner
 * bands then fan inboard of it across the top, which is what the reference does.
 *
 * Zero when both feet land the same way — a symmetric arch has nothing to lean out of the way of.
 */
export function archCenterX({ footLeftY, footRightY, outerRadius, cakeRadius, topFootAt = 0.55, topY }) {
  const leftOnTop  = footLeftY  === topY;
  const rightOnTop = footRightY === topY;
  if (leftOnTop === rightOnTop) return 0;          // both on the cake, or neither
  const rest = cakeRadius * Math.max(0, Math.min(1, topFootAt));
  // Push the resting side inboard: left foot sits at −rest, so the centre moves right, and mirrored.
  return leftOnTop ? outerRadius - rest : rest - outerRadius;
}

export function bandRadius(i, { innerRadius, thickness, gap }) {
  return innerRadius + thickness / 2 + i * (thickness + gap);
}

/**
 * An arch STANDING ON THE CAKE has to fit on it.
 *
 * When both feet rest on the top surface, the rainbow is not leaning against the cake — it is
 * standing on it, and a foot hanging over the edge is resting on nothing. Its span is set by the
 * outermost band, and both feet sit at centre ± that radius, so the whole thing fits exactly when
 * that reaches no further than the rim. The standoff counts too: a foot is only on the cake if it is
 * inside the FOOTPRINT, which is a distance in the plane.
 *
 * Returns the factor to shrink the band radii by — 1 when it already fits. Shrinking rather than
 * moving is deliberate, and it is Sandeep's rule: where it stands is the author's choice, so when
 * something has to give it is the size.
 */
export function fitOnTopScale({ centerX, standoff, outerRadius, cakeRadius }) {
  if (!(outerRadius > 0)) return 1;
  // Solve for the radius, not for the whole reach. The far foot sits at |centerX| + radius, and only
  // the RADIUS shrinks — the position is fixed. Scaling the reach instead (which is what I wrote
  // first) leaves the offset un-shrunk, so the answer overshoots by exactly centerX and a band still
  // hangs off the edge.
  //
  // The standoff eats into the room across, because the footprint is a circle: standing a rainbow
  // back on a round cake leaves it less width, not the same width further away.
  const across = Math.sqrt(Math.max(0, cakeRadius * cakeRadius - standoff * standoff));
  const room = across - Math.abs(centerX);
  if (room <= 0) return 0.05;      // the position itself is off the cake — as small as is drawable
  return Math.min(1, room / outerRadius);
}

/**
 * Bend a flat arch around the tier so it lies ON the wall.
 *
 * `x` in the flat path is a distance ALONG the wall, so it becomes an angle by dividing by the
 * radius — arc length over radius, which keeps each rope the length it was drawn as. Height is
 * untouched, because the wall is vertical: a foot that rested on the board still does.
 *
 * Every point ends the same distance from the axis, which is what hugging means and what a flat
 * plane cannot do — laid against a round cake its middle touches and its ends float.
 */
export function wrapToWall(points, { radius, theta0 = 0, proud = 0, seat = 0 }) {
  // `seat` lifts the CENTRELINE clear of the wall by half a rope, the same rule the feet follow: a
  // path point is the middle of the tube, so a rope laid at exactly radius+proud is half buried.
  const r = radius + proud + seat;
  return points.map(p => {
    // Divided by the rope's OWN radius, not the cake's. Arc length is r·θ, so θ = x/r is what keeps
    // the rope the length it was drawn as — dividing by the cake's radius while placing it further
    // out stretched every rope by the ratio between them, quietly making it more fondant to roll.
    const th = theta0 + p.x / r;
    return new THREE.Vector3(Math.sin(th) * r, p.y, Math.cos(th) * r);
  });
}

/**
 * How far back the rainbow must stand so no part of it is INSIDE the cake.
 *
 * The cake is a cylinder. Anything below its top has to be outside its footprint — and the footprint
 * is a distance in the PLANE, hypot(x, z), not a distance in x. That was the hole: a descending leg
 * can be well clear in x and still be inside the cake, because the arch itself stands only a little
 * way back. At a standoff of 1.08 on a 1.2 cake, a leg at x = 0.42 is 1.16 out — through the icing.
 *
 * So for every point that dips below the top, the arch is pushed back until that point clears, with
 * the rope's own width counted. The authored standoff is a MINIMUM, never a cap: what somebody typed
 * cannot make a decoration pass through the cake.
 */
export function requiredStandoff(points, { cakeRadius, topY, thickness }) {
  const clear = cakeRadius + thickness / 2;
  // A hair of tolerance, and it is not cosmetic. A foot RESTING on the cake top sits at exactly
  // topY + thickness/2, so its underside comes back as topY ± 1e-16 — and on the wrong side of that
  // it reads as being inside the cake. An arch standing neatly on the cake was then shoved backwards
  // to escape a cake it was already on top of, which showed up as it hanging off the far edge.
  const EPS = 1e-9;
  let need = 0;
  for (const pt of points) {
    if (pt.y - thickness / 2 >= topY - EPS) continue;     // above the cake — its footprint is irrelevant
    const spare = clear * clear - pt.x * pt.x;
    if (spare > 0) need = Math.max(need, Math.sqrt(spare));
  }
  return need;
}

/**
 * Every band of a rainbow, sized against the cake it stands on.
 *
 * `cake` is the geometry it must fit: { radius, topY, boardY }. Ratios become world units here and
 * ONLY here, so every caller — the canvas, the studio preview, the guide — reads one answer.
 */
export function rainbowBands(params = {}, cake = {}) {
  const p = { ...RAINBOW_DEFAULTS, ...params };
  const R = cake.radius ?? 1;
  const topY = cake.topY ?? 0;
  const boardY = cake.boardY ?? 0;

  // ── Order matters here, and it bit once ──────────────────────────────────────────────────────
  // Sizes are settled BEFORE anything is derived from them. The seat lift is half a rope, so working
  // it out first and shrinking the ropes afterwards left the feet hovering above the cake by the
  // difference — a gap nothing in the picture explained.
  // Size multiplies all three together, so the proportions survive it — see `scale`.
  const size = p.scale ?? 1;
  let thickness = p.thickness * R * size;
  let gap = p.gap * R * size;
  let innerRadius = p.innerRadius * R * size;
  const standoff = (p.standoff ?? 0) * R;

  // ON THE WALL BOTH ENDS ARE LEVEL. A rainbow LEANS only because it has two surfaces to reach —
  // the cake top on one side, the board on the other. A wall is one surface, so an arch pressed onto
  // it is symmetric: two ends at the same height, always. Letting the feet differ there produced one
  // end stopping mid-wall while the other ran down to the board, which is not a thing anybody makes.
  //
  // footLeft is the authority and footRight is ignored, rather than both being read and disagreeing.
  const onWall = p.surface === 'side';
  const rawLeft  = legFootY(p.footLeft, { topY, boardY });
  const rawRight = onWall ? rawLeft : legFootY(p.footRight, { topY, boardY });
  let outerRadius = bandRadius(p.bands - 1, { innerRadius, thickness, gap });

  // A number stands; null derives. Deriving MOVES the rainbow when any size changes, which is why
  // it is no longer the default — see offsetX. The RAW foot heights go in, before the seat lift:
  // comparing the seated ones against topY would never match, since they sit half a rope above it.
  // Which way it leans: +1 when the falling foot is on the right, -1 when it is on the left. Both
  // feet alike (standing on the cake, or a backdrop on the board) has no lean, so it keeps +1 and
  // offsetX reads as a plain position.
  const fallsRight = rawLeft === topY && rawRight !== topY;
  const fallsLeft  = rawRight === topY && rawLeft !== topY;
  const leanSign = fallsLeft ? -1 : 1;

  const centerX = p.offsetX != null
    ? p.offsetX * R * leanSign
    : archCenterX({ footLeftY: rawLeft, footRightY: rawRight, outerRadius, cakeRadius: R, topFootAt: p.topFootAt, topY });

  // Standing on the cake? Then it fits on the cake. Both feet on the top means the whole thing has to
  // be within the footprint — a foot over the edge rests on nothing. The proportions shrink together
  // until it fits; the position stays exactly where it was put.
  // On the WALL there is nothing to clear and nothing to fit: the ropes are pressed onto the tier at
  // its own radius, so the standoff, the step-back and the top-fit all stop meaning anything, and
  // `centerX` becomes a distance ALONG the wall for wrapToWall to turn into an angle.
  const standingOnTop = !onWall && rawLeft === topY && rawRight === topY;
  let placedX = centerX;
  if (standingOnTop) {
    // Position is the author's — except it cannot be somewhere the cake is not. A standing arch
    // placed past the rim has nothing under it, and no amount of shrinking fixes that, so this is
    // the one case the position is clamped. It keeps a quarter of the cake in reserve, or the "fix"
    // would be an arch scaled to nothing balanced on the very edge.
    const across = Math.sqrt(Math.max(0, R * R - standoff * standoff));
    const limit = across * 0.75;
    placedX = Math.max(-limit, Math.min(limit, centerX));
    const k = fitOnTopScale({ centerX: placedX, standoff, outerRadius, cakeRadius: R });
    if (k < 1) { innerRadius *= k; thickness *= k; gap *= k; outerRadius *= k; }
  }


  // Seat the rope's UNDERSIDE on the surface, not its centreline. A path point is the middle of the
  // tube, so a foot placed exactly on the cake top buries half a rope in the cake. Same rule the
  // stickers follow with seatHalf: an element rests ON a surface, it does not intersect it.
  let seat = thickness / 2;
  let footLeftY  = rawLeft  == null ? null : rawLeft  + seat;
  let footRightY = rawRight == null ? null : rawRight + seat;
  // The springing point, measured up from the BOARD through the cake's height — so a taller cake
  // pushes it up in proportion and the rainbow keeps its relationship to the cake rather than to a
  // number. Never below the HIGHER foot: the arc has to start above whichever leg is shorter, or
  // that side would bend downwards to reach its own foot.
  const cakeHeight = Math.max(0, topY - boardY);
  const springAt = () => Math.max(
    Math.max(footLeftY ?? boardY, footRightY ?? boardY),
    boardY + cakeHeight * (p.spring ?? 1),
  );
  let archY = springAt();

  // How far back the arch must stand to keep out of the cake. Wanted BEFORE the support fit below,
  // because a step-back moves the feet away from the axis too — fitting against the authored
  // standoff and then stepping back lands the foot outside the surface it was just fitted to.
  const stepBack = (t, th) => (onWall ? 0 : Math.max(standoff, requiredStandoff(t, { cakeRadius: R, topY, thickness: th })));
  const pathsFor = (inner, th, g, so) => {
    const rs = [];
    for (let i = 0; i < p.bands; i++) rs.push(bandRadius(i, { innerRadius: inner, thickness: th, gap: g }));
    return { rs, pts: rs.flatMap(radius =>
      bandPath({ radius, archY, footLeftY, footRightY, standoff: so, centerX, arcSegments: p.arcSegments })) };
  };

  let { pts: trial } = pathsFor(innerRadius, thickness, gap, standoff);
  let clearStandoff = stepBack(trial, thickness);

  // A FALLING foot has to land on something too.
  //
  // What that something IS depends on the tier: the board off the bottom one, the tier below on any
  // other. NEITHER grows. A board is a thing the baker buys, sized to the cake and priced with it, so
  // widening it silently is changing the order to fit the decoration — and a tier cannot be widened
  // at all. So the standing-on-top rule applies again, measured against what is actually under the
  // foot rather than what the arch stands on.
  //
  // The caller says what is under it, through `cake.supportRadius`. Absent means nothing limits it.
  //
  // Without it the outer bands hang in the air, and that does not read as broken in a picture — the
  // arch looks whole and only a second look finds the ends stopping over nothing. At the authored
  // size on a 0.92 tier the six feet land at 0.98 … 1.51 across a tier ending at 1.20: half the
  // rainbow unsupported, by default.
  const support = cake.supportRadius;
  // A foot that FALLS is one that exists and lands lower than the cake top. `!== topY` was the test,
  // and it read `null` as falling — so an end with NO foot counted as one. A curled end has no foot
  // (nor does a 'none' end), and nothing that has no foot can put a foot off the board, yet a curled
  // rainbow was being shrunk to 0.83 at size 1.6 to make an imaginary one land.
  const fallsAt = raw => raw != null && raw < topY;
  const falling = !onWall && !standingOnTop && (fallsAt(rawLeft) || fallsAt(rawRight));
  let supportFit = 1;
  if (falling && Number.isFinite(support) && support > 0) {
    // Solved by iteration, because the two rules feed each other. Shrinking the arch does NOT reduce
    // the step-back the way you would expect — the position is fixed, so a smaller arch sits closer
    // in and needs MORE room to clear the tier, which eats the width it was just given. One pass
    // fitted a 0.64x arch and then stepped it back from 0.27 to 0.49, putting the foot at 1.30 on a
    // surface ending at 1.20: fitted, and still hanging off.
    //
    // Each round shrinks and re-measures. It settles because the step-back is bounded by the tier
    // and the scale only falls; a dozen rounds is far more than it takes, and stopping early with
    // the foot still out is caught by the tests rather than shipped.
    for (let i = 0; i < 12; i++) {
      // Less half a rope, so the whole tube lands rather than its centreline: fitting the centreline
      // to the rim leaves the outer half curling over the edge, and then the measurement and the fit
      // disagree by exactly thickness/2 — which reads as the rule not working.
      const k = fitOnTopScale({
        centerX: placedX, standoff: clearStandoff, outerRadius, cakeRadius: support - thickness / 2 });
      // Tight, because each round's leftover is a foot still over the edge. Stopping at 0.999 left
      // it 0.0003 out — invisible, and exactly the kind of "nearly" a test should not accept.
      if (k >= 0.99999) break;
      supportFit *= k;
      innerRadius *= k; thickness *= k; gap *= k; outerRadius *= k;
      // Everything measured off the rope's thickness moves with it: a thinner rope seats lower, and
      // a smaller arch needs a higher springing point to clear the same top.
      seat = thickness / 2;
      footLeftY  = rawLeft  == null ? null : rawLeft  + seat;
      footRightY = rawRight == null ? null : rawRight + seat;
      archY = springAt();
      ({ pts: trial } = pathsFor(innerRadius, thickness, gap, standoff));
      clearStandoff = stepBack(trial, thickness);
    }
  }

  const radii = [];
  for (let i = 0; i < p.bands; i++) radii.push(bandRadius(i, { innerRadius, thickness, gap }));

  // ── The stack of curls, solved for the whole run at once ──────────────────────────────────────
  // The innermost coil rests on whatever the rainbow stands on; every other one sits on the coil
  // below it. That cannot be worked out band by band, so it is worked out here and each band is told
  // only where IT stops.
  //
  // What it rests ON is the same surface the feet use — the cake top for a rainbow sitting on the
  // cake, the board for one standing beside it — so a curled rainbow is grounded exactly the way a
  // footed one is. Nothing floats.
  const coilR = Math.max(thickness * 0.62, thickness * Math.max(0.6, p.curlSize));
  const restY = legFootY(p.footLeft === 'curl' ? p.footRight : p.footLeft, cake)
             ?? legFootY('board', cake);
  const chain = (p.footLeft === 'curl' || p.footRight === 'curl')
    ? curlChain({ radii, centerX: placedX, archY, restY: restY + thickness / 2, coilR })
    : [];

  const curlArgs = (i) => ({
    arcSegments: p.arcSegments,
    // A band with no place in the stack keeps its foot rather than curling into thin air.
    curlLeft:  p.footLeft  === 'curl' && chain[i] != null,
    curlRight: p.footRight === 'curl' && chain[i] != null,
    curlTurns: p.curlTurns, curlSize: p.curlSize, curlTightness: p.curlTightness,
    endAngle: chain[i] ?? 0,
    thickness, bandIndex: i, bandCount: p.bands,
  });

  const bands = [];
  for (let i = 0; i < p.bands; i++) {
    const radius = radii[i];
    bands.push({
      index: i,
      radius,
      standoff: clearStandoff,
      // Wraps the palette rather than running out: an author who asks for 8 bands from 6 colours
      // gets a repeat, not two undefined ropes.
      color: p.colors[i % p.colors.length],
      path: onWall
        ? wrapToWall(
            bandPath({ radius, archY, footLeftY, footRightY, standoff: 0, centerX: placedX, ...curlArgs(i) }),
            { radius: R, theta0: p.theta ?? 0, proud: (p.proud ?? 0) * R, seat: thickness / 2 },
          )
        : bandPath({ radius, archY, footLeftY, footRightY, standoff: clearStandoff, centerX: placedX, ...curlArgs(i) }),
      thickness,
    });
  }
  return { bands, thickness, gap, archY, footLeftY, footRightY, standoff: clearStandoff, centerX: placedX, cakeRadius: R, supportFit };
}

/**
 * Where each band stops, so the curls form a STACK rather than a scatter.
 *
 * The innermost coil rests ON the cake. The next sits on top of it, the one after on that, and so on
 * — and because each band's arc is one rope further out than the last, "one coil-width away along a
 * circle one rope bigger" lands up AND slightly left every time. The lean is not a setting; it falls
 * out of the geometry, which is why the reference has it without anybody deciding to.
 *
 * Solved as a chain of circle intersections: band i's end is the point on its OWN arc (radius
 * unchanged — the arch is never deformed to make room) at exactly one coil-width from band i-1's
 * end. Exactly, so the coils touch and cannot overlap; on its own circle, so the rainbow keeps its
 * shape.
 *
 * Returns one angle per band, measured the way the arc is: 0 at the springing point, rising toward
 * the top. Nulls where no solution exists — a coil-width bigger than the gap between two arcs has
 * nowhere to sit — and the caller leaves those bands uncurled rather than inventing a position.
 */
export function curlChain({ radii = [], centerX = 0, archY = 0, restY = 0, coilR = 0 }) {
  const out = [];
  const step = 2 * coilR;
  let prev = null;

  for (let i = 0; i < radii.length; i++) {
    const r = radii[i];
    if (!(r > 0)) { out.push(null); continue; }

    if (prev == null) {
      // The first one RESTS: its centre sits one coil-radius above the surface, so the coil touches
      // rather than floating over or sinking into it.
      const wantY = restY + coilR;
      const sin = (wantY - archY) / r;
      if (Math.abs(sin) > 1) { out.push(null); continue; }
      const a = Math.asin(sin);
      prev = { x: centerX + Math.cos(a) * r, y: archY + Math.sin(a) * r };
      out.push(a);
      continue;
    }

    // Where circle(arch centre, r) meets circle(previous coil, one coil-width). Two answers; take
    // the one FURTHER ROUND the arch, which is the one that stacks upward instead of doubling back
    // down the way it came.
    const dx = prev.x - centerX, dy = prev.y - archY;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9 || d > r + step || d < Math.abs(r - step)) { out.push(null); prev = null; continue; }
    const base = Math.atan2(dy, dx);
    const cos = (d * d + r * r - step * step) / (2 * d * r);
    const a = base + Math.acos(Math.max(-1, Math.min(1, cos)));
    prev = { x: centerX + Math.cos(a) * r, y: archY + Math.sin(a) * r };
    out.push(a);
  }
  return out;
}

/**
 * The rainbow's points WHERE IT ACTUALLY STANDS — the arch turned by its own yaw.
 *
 * `rainbowBands` returns the arch in its own frame and `RainbowArch` spins that frame about the
 * cake's axis, so the bands' points are NOT where the rainbow is. Everything that needs to know
 * where the rainbow is has to apply the same spin, and that is a copy of the transform waiting to
 * drift from the renderer's.
 *
 * It already did. The selection box was drawn with `position` then `rotation`, which turns the box
 * about its OWN centre rather than about the cake's axis — so at any yaw but zero the border stood
 * somewhere the rainbow was not, and the rainbow read as ungrabbable.
 *
 * This is the one place that answers the question. Two callers today: the selection box, and the
 * movable contract's test. The renderer is still the second copy of the spin, which is the gap the
 * world-space refactor closes — see movableContract.js.
 */
export function rainbowOffset(params = {}, cake = {}) {
  const R = cake.radius ?? 1;
  if ((params.surface ?? 'top') === 'side') return [0, 0, 0];
  return [(params.px ?? 0) * R, 0, (params.pz ?? 0) * R];
}

export function rainbowPlacedPoints(params = {}, cake = {}) {
  const { bands } = rainbowBands(params, cake);
  const [ox, , oz] = rainbowOffset(params, cake);
  return bands.flatMap(b => b.path.map(p => new THREE.Vector3(p.x + ox, p.y, p.z + oz)));
}

/**
 * How far out the rainbow reaches, so the BOARD can be made big enough to stand it on.
 *
 * A board sized for the cake alone is not a board for a cake with a rainbow leaning off it — the
 * descending leg lands outside the tier, and on a standard board it lands outside the board too,
 * which is a decoration resting on nothing. The cake's own furniture has to answer to what is
 * standing on it, the same way the arch answers to the cake's height.
 *
 * Returns the radius the board needs. The caller takes the larger of this and its normal size:
 * shrinking a board to fit a small rainbow would be the wrong way round.
 */
/**
 * How far out the FALLING foot lands, from the cake's axis, outer edge included.
 *
 * Kept for a caller that can afford a bigger board — the designer's own board does not grow. On any
 * tier above it there is no board — the surface underneath is the tier below, a disc of a fixed
 * radius that cannot be widened. So the same arch that stands fine on the bottom rests on NOTHING
 * one tier up, and the picture does not say so: a foot in mid-air looks exactly like a foot on a
 * surface until you move the camera.
 *
 * Measured at the lowest point of the lowest band, which is the foot that reaches furthest down and
 * out. Returns 0 when nothing falls (both feet on the top, or a wrapped wall rainbow).
 */
export function rainbowFootReach(params = {}, cake = {}) {
  const { bands, thickness } = rainbowBands(params, cake);
  const pts = bands.flatMap(b => b.path);
  if (!pts.length) return 0;

  // EVERY band's foot, not the lowest single point. All six feet seat at the same height, so "the
  // lowest point" is a tie the innermost band wins by being first in the list — and the innermost
  // foot is the one nearest the middle. That reported 1.03 on a rainbow whose outer foot was at
  // 1.51, i.e. it said "lands on the tier" about an arch with half of it hanging off.
  const lowY = Math.min(...pts.map(v => v.y));
  let far = 0;
  for (const v of pts) {
    if (v.y < lowY + thickness * 0.5) far = Math.max(far, Math.hypot(v.x, v.z));
  }
  return far + thickness / 2;
}

export function rainbowBoardReach(params = {}, cake = {}, margin = 0.12) {
  const { bands, thickness, centerX, cakeRadius } = rainbowBands(params, cake);
  let far = 0;
  for (const b of bands) for (const pt of b.path) far = Math.max(far, Math.abs(pt.x), Math.abs(pt.z));
  return far + thickness / 2 + margin * cakeRadius;
}

/**
 * The tube for one band. `flatten` turns a round rope into a pressed ribbon.
 *
 * WHICH WAY it presses depends on where the rope is. A flat arch lies in the XY plane, so squashing
 * world Z presses it against that plane — right. A rope bent round the cake lies AT z ≈ the cake's
 * radius, so the same scale drags the whole thing toward the world centre and straight inside the
 * cake: at flatten 0.55 a wall rainbow's mesh moved from z 1.16–1.27 to 0.52–0.57 on a 1.2 cake, and
 * vanished. It was not missing, it was buried.
 *
 * So on a wall it presses RADIALLY — toward the wall surface, which is what "pressed onto the cake"
 * means there. `wallRadius` says the rope is wrapped and where the wall is.
 */
export function bandGeometry(band, { flatten = 0, tubeSegments = RAINBOW_DEFAULTS.tubeSegments, wallRadius = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(band.path, false, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, band.path.length - 1, band.thickness / 2, tubeSegments, false);
  const squash = 1 - Math.max(0, Math.min(0.95, flatten));
  if (squash === 1) return geo;

  if (wallRadius == null) {
    geo.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, squash));
    return geo;
  }

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-9) continue;
    const k = (wallRadius + (r - wallRadius) * squash) / r;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// Handles speak u in 0…1 and the geometry speaks radians, so both directions WRAP rather than clamp:
// dragging past the back of the cake carries on round it, it does not stick there.
const TAU = Math.PI * 2;
const clamp01 = x => Math.max(0, Math.min(1, x));
const wrapU = x => ((x % 1) + 1) % 1;
const wrapAngle = a => ((a % TAU) + TAU) % TAU;

/**
 * Where a rainbow's drag handle sits — the arch's CENTRE standing on the surface.
 *
 * Not the cake's middle. A leaning rainbow is offset along its own plane, so a handle at the axis
 * would be a dot the customer grabs that is nowhere near the thing it moves.
 *
 * The two surfaces have different words for the same two freedoms, and both maps are exact rather
 * than approximate, because the geometry already thinks in the handle machinery's terms:
 *   over the cake — round is `yaw`, out is `standoff`. A point (0, y, standoff) turned by yaw lands
 *                   at (standoff·sin yaw, y, standoff·cos yaw), which is precisely where a
 *                   top-surface handle is drawn from (angle, radial fraction). Same formula, so the
 *                   handle and the arch cannot drift apart.
 *   on the wall   — round is `theta`, up is `spring`. Those ARE the wall rainbow's two position
 *                   numbers; nothing had to be invented for it.
 */
export function rainbowHandleAt(params = {}, cake = {}) {
  const p = { ...RAINBOW_DEFAULTS, ...params };
  const R = cake.radius ?? 1;
  if (p.surface === 'side') {
    return { surface: 'side', u: wrapU((p.theta ?? 0) / TAU), v: clamp01(p.spring ?? 1) };
  }
  // The EFFECTIVE numbers, not the authored ones. The clearance rule can push an arch further back
  // than it was asked to stand, and a handle drawn from the request would float in front of it.
  const px = p.px ?? 0, pz = p.pz ?? 0;
  return {
    surface: 'top_surface',
    u: wrapU(Math.atan2(px, pz) / TAU),
    v: Math.min(1, Math.hypot(px, pz)),
  };
}

/**
 * The parameters after a drag to (u, v).
 *
 * ── ON THE CAKE, A DRAG MOVES IT ROUND AND DOES NOTHING ELSE ──────────────────────────────────
 * `v` — how far the pointer is from the axis — is deliberately ignored. It used to set how far back
 * the arch stood, by solving hypot(centerX, standoff) = v·R, and that was wrong in two ways at once
 * on the same rainbow:
 *
 *   · DEAD over most of the cake. The arch's centre already stands `centerX` off the axis — 0.85 on
 *     a cake of radius 1.2 for the default lean — so every v below 0.71 has no solution and rests
 *     at zero. Dragging anywhere in the middle 71% of the cake top did nothing at all.
 *   · A LEAP past that. From v = 0.71 to the rim the standoff runs 0 → 0.70, so the arch shoots
 *     backwards away from the cake in the last third of the drag.
 *
 * Reported as "sometimes stuck", "sometimes rotating", "adding space between cake and rainbow" —
 * three symptoms, one cause. The old limit was documented here as honest. It was not: it was most
 * of the control surface doing nothing.
 *
 * So the drag is purely angular, which is also what the card promises the customer — "drag it on
 * the cake to move it round". How far back it stands is authored in the studio, and the arch keeps
 * whatever it was given: the orbit radius is the same at every yaw, so it cannot gain or lose ground
 * on the cake by being moved round it.
 *
 * Holds the lean too. `offsetX` is the arch's SHAPE, not its position — how far it straddles along
 * its own plane is what makes it "over, falling right" rather than "sitting on top", and a drag that
 * quietly flattened it would be moving a different rainbow to where you pointed.
 */
export function rainbowDragTo(params = {}, cake = {}, u = 0, v = 0) {
  const p = { ...RAINBOW_DEFAULTS, ...params };
  // The WALL keeps both freedoms, and they are real ones there: `theta` runs right round and
  // `spring` runs the full height with nothing to make either inert.
  if (p.surface === 'side') return { theta: wrapAngle(u * TAU), spring: clamp01(v) };

  // (u, v) is just the pointer in polar form — the caller measured it off the surface. Turned back
  // into a POSITION here, because that is what a drag means: put it where I pointed.
  const d = clamp01(v);
  return { px: Math.sin(u * TAU) * d, pz: Math.cos(u * TAU) * d };
}

/**
 * What a baker needs, in the only terms that survive them baking a different size.
 *
 * Deliberately NOT millimetres. The cake in the designer is a nominal one; the baker rolls a rope,
 * offers it up and trims. A ratio is true whatever they bake, and it is also how they work.
 * `mmPerUnit` is optional and only appears where an order pins a real size — derived last, never
 * stored, exactly as the X-ray's print template treats tier_width_ratio.
 */
export function rainbowGuide(params = {}, cake = {}, mmPerUnit = null) {
  const { bands, cakeRadius } = rainbowBands(params, cake);
  const cakeWidth = cakeRadius * 2;
  return bands.map(b => {
    const curve = new THREE.CatmullRomCurve3(b.path, false, 'centripetal');
    const length = curve.getLength();
    return {
      index: b.index,
      color: b.color,
      // "This rope is 1.6 times as wide as the cake" — a sentence that stays true at any size.
      lengthOfCakeWidth: +(length / cakeWidth).toFixed(2),
      thicknessOfCakeWidth: +(b.thickness / cakeWidth).toFixed(3),
      lengthMm: mmPerUnit ? Math.round(length * mmPerUnit) : null,
    };
  });
}
