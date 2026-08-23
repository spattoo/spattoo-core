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
  innerRadius: 0.55,   // × tier radius — the hole under the arch
  thickness:   0.09,   // × tier radius — one rope's diameter
  gap:         0.012,  // × tier radius — daylight between ropes; 0 = ropes touching
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
  topFootAt: 0.55,
  // Where the arc STARTS, as a fraction of the cake's height: 0 = the board, 1 = the top of the
  // cake, above 1 = clear of it. Pinning it to the top was wrong — that makes the arch straddle the
  // cake like a cage, with a leg standing off each side. On a real one the arc springs from about
  // halfway up and the cake overlaps its lower half.
  spring: 0.6,
  // How far BEHIND the cake it stands, × tier radius. A rainbow is a backdrop, not a hoop the cake
  // sits inside: at 0 it is centred on the cake and the legs come down either side of it, which is
  // the thing no real cake does.
  standoff: 0.9,
  flatten: 0,          // 0 = round rope, → 1 squashes it into a flat band (references 1 and 3)
  lean: 0,             // degrees, tipped back from vertical
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
  let need = 0;
  for (const pt of points) {
    if (pt.y - thickness / 2 >= topY) continue;          // above the cake — its footprint is irrelevant
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

  const thickness = p.thickness * R;
  const gap = p.gap * R;
  const innerRadius = p.innerRadius * R;
  // Seat the rope's UNDERSIDE on the surface, not its centreline. A path point is the middle of the
  // tube, so a foot placed exactly on the cake top buries half a rope in the cake — which is what
  // the first version did, and it read as the rainbow being pushed into the icing. Same rule the
  // stickers follow with seatHalf: an element rests ON a surface, it does not intersect it.
  const seat = thickness / 2;
  const rawLeft  = legFootY(p.footLeft,  { topY, boardY });
  const rawRight = legFootY(p.footRight, { topY, boardY });
  const footLeftY  = rawLeft  == null ? null : rawLeft  + seat;
  const footRightY = rawRight == null ? null : rawRight + seat;
  // The springing point, measured up from the BOARD through the cake's height — so a taller cake
  // pushes it up in proportion and the rainbow keeps its relationship to the cake rather than to a
  // number. Never below the feet: an arc that starts under its own legs is inside out.
  const cakeHeight = Math.max(0, topY - boardY);
  // Never below the HIGHER foot: the arc has to start above whichever leg is shorter, or that side
  // would have to bend downwards to reach its own foot.
  const highestFoot = Math.max(footLeftY ?? boardY, footRightY ?? boardY);
  const archY = Math.max(highestFoot, boardY + cakeHeight * (p.spring ?? 1));
  const standoff = (p.standoff ?? 0) * R;

  const outerRadius = bandRadius(p.bands - 1, { innerRadius, thickness, gap });
  const centerX = p.offsetX != null
    ? p.offsetX * R
    // The RAW foot heights, before the seat lift. Comparing the seated ones against topY would never
    // match — they sit half a rope above it by design — so the arch would quietly stop leaning and
    // the resting feet would go back to hanging beside the cake.
    : archCenterX({ footLeftY: rawLeft, footRightY: rawRight, outerRadius, cakeRadius: R, topFootAt: p.topFootAt, topY });

  // Built twice: once to see where the rope wants to go, then again once we know how far back it has
  // to stand to keep out of the cake. Cheaper than reasoning about which point will be the worst —
  // and the worst point moves as the bands, the spring and the lean all change.
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
      path: bandPath({ radius, archY, footLeftY, footRightY, standoff: clearStandoff, centerX, arcSegments: p.arcSegments }),
      thickness,
    });
  }
  return { bands, thickness, gap, archY, footLeftY, footRightY, standoff: clearStandoff, centerX, cakeRadius: R };
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
