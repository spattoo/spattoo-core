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
  flatten: 0,          // 0 = round rope, → 1 squashes it into a flat band (references 1 and 3)

  arcSegments: 96,     // along the path
  tubeSegments: 12,    // around the rope
});

// Where the feet stop, in world Y.
//   board — the top of the board, so it stands beside the cake (reference 1)
//   top   — the top of the cake, so it sits on it (references 2 and 4)
//   none  — no legs at all: a bare half-circle
// The distance is never authored, only chosen: `board` on a three-tier stack is a long way further
// than on a single, and that is the whole reason this is not a GLB.
export function legFootY(legs, { topY = 0, boardY = 0 } = {}) {
  if (legs === 'top') return topY;
  if (legs === 'none') return null;
  return boardY;
}

/**
 * The centreline of ONE band, as world points: up the left leg, over the arch, down the right.
 *
 * The leg meets the arc TANGENTIALLY — a semicircle's end tangent is already vertical — so there is
 * no corner between them to round off or crease. That is why this can be sampled as one smooth run
 * of points rather than stitched from separate curves with a join to argue about.
 */
export function bandPath({ radius, archY, footLeftY, footRightY, standoff = 0, centerX = 0, arcSegments = RAINBOW_DEFAULTS.arcSegments }) {
  const pts = [];
  const z = standoff;   // one plane, set back from the cake's centre — a rainbow is flat
  // Each leg is drawn only if its foot is BELOW where the arc springs. A foot at or above that is
  // not a short leg, it is no leg — the arc simply ends there.
  const hasLeft  = footLeftY  != null && footLeftY  < archY;
  const hasRight = footRightY != null && footRightY < archY;
  if (hasLeft) pts.push(new THREE.Vector3(centerX - radius, footLeftY, z));
  // Left (π) round to right (0). Descending so the run reads left-to-right with the legs.
  for (let i = 0; i <= arcSegments; i++) {
    const a = Math.PI - (i / arcSegments) * Math.PI;
    pts.push(new THREE.Vector3(centerX + Math.cos(a) * radius, archY + Math.sin(a) * radius, z));
  }
  if (hasRight) pts.push(new THREE.Vector3(centerX + radius, footRightY, z));
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

  const rawLeft  = legFootY(p.footLeft,  { topY, boardY });
  const rawRight = legFootY(p.footRight, { topY, boardY });
  let outerRadius = bandRadius(p.bands - 1, { innerRadius, thickness, gap });

  // A number stands; null derives. Deriving MOVES the rainbow when any size changes, which is why
  // it is no longer the default — see offsetX. The RAW foot heights go in, before the seat lift:
  // comparing the seated ones against topY would never match, since they sit half a rope above it.
  const centerX = p.offsetX != null
    ? p.offsetX * R
    : archCenterX({ footLeftY: rawLeft, footRightY: rawRight, outerRadius, cakeRadius: R, topFootAt: p.topFootAt, topY });

  // Standing on the cake? Then it fits on the cake. Both feet on the top means the whole thing has to
  // be within the footprint — a foot over the edge rests on nothing. The proportions shrink together
  // until it fits; the position stays exactly where it was put.
  const standingOnTop = rawLeft === topY && rawRight === topY;
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
  const seat = thickness / 2;
  const footLeftY  = rawLeft  == null ? null : rawLeft  + seat;
  const footRightY = rawRight == null ? null : rawRight + seat;
  // The springing point, measured up from the BOARD through the cake's height — so a taller cake
  // pushes it up in proportion and the rainbow keeps its relationship to the cake rather than to a
  // number. Never below the HIGHER foot: the arc has to start above whichever leg is shorter, or
  // that side would bend downwards to reach its own foot.
  const cakeHeight = Math.max(0, topY - boardY);
  const highestFoot = Math.max(footLeftY ?? boardY, footRightY ?? boardY);
  const archY = Math.max(highestFoot, boardY + cakeHeight * (p.spring ?? 1));

  const radii = [];
  for (let i = 0; i < p.bands; i++) radii.push(bandRadius(i, { innerRadius, thickness, gap }));
  const trial = radii.flatMap(radius =>
    bandPath({ radius, archY, footLeftY, footRightY, standoff, centerX, arcSegments: p.arcSegments }));
  const clearStandoff = Math.max(standoff, requiredStandoff(trial, { cakeRadius: R, topY, thickness }));

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
      path: bandPath({ radius, archY, footLeftY, footRightY, standoff: clearStandoff, centerX: placedX, arcSegments: p.arcSegments }),
      thickness,
    });
  }
  return { bands, thickness, gap, archY, footLeftY, footRightY, standoff: clearStandoff, centerX: placedX, cakeRadius: R };
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
export function rainbowBoardReach(params = {}, cake = {}, margin = 0.12) {
  const { bands, thickness, centerX, cakeRadius } = rainbowBands(params, cake);
  let far = 0;
  for (const b of bands) for (const pt of b.path) far = Math.max(far, Math.abs(pt.x), Math.abs(pt.z));
  return far + thickness / 2 + margin * cakeRadius;
}

/** The tube for one band. Flatten squashes the cross-section in Z, turning a rope into a flat band. */
export function bandGeometry(band, { flatten = 0, tubeSegments = RAINBOW_DEFAULTS.tubeSegments } = {}) {
  const curve = new THREE.CatmullRomCurve3(band.path, false, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, band.path.length - 1, band.thickness / 2, tubeSegments, false);
  const squash = 1 - Math.max(0, Math.min(0.95, flatten));
  if (squash !== 1) geo.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, squash));
  return geo;
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
