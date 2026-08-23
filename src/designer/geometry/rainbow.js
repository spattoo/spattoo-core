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
  legs: 'board',       // 'board' | 'top' | 'none'
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
export function bandPath({ radius, archY, footY, arcSegments = RAINBOW_DEFAULTS.arcSegments }) {
  const pts = [];
  const hasLegs = footY != null && footY < archY;
  if (hasLegs) pts.push(new THREE.Vector3(-radius, footY, 0));
  // Left (π) round to right (0). Descending so the run reads left-to-right with the legs.
  for (let i = 0; i <= arcSegments; i++) {
    const a = Math.PI - (i / arcSegments) * Math.PI;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, archY + Math.sin(a) * radius, 0));
  }
  if (hasLegs) pts.push(new THREE.Vector3(radius, footY, 0));
  return pts;
}

/** Centreline radius of band `i`, counting outwards from the arch's hole. */
export function bandRadius(i, { innerRadius, thickness, gap }) {
  return innerRadius + thickness / 2 + i * (thickness + gap);
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
  const footY = legFootY(p.legs, { topY, boardY });
  // The arch springs from the top of the cake — its legs hang BELOW that when they run to the board.
  const archY = topY;

  const bands = [];
  for (let i = 0; i < p.bands; i++) {
    const radius = bandRadius(i, { innerRadius, thickness, gap });
    bands.push({
      index: i,
      radius,
      // Wraps the palette rather than running out: an author who asks for 8 bands from 6 colours
      // gets a repeat, not two undefined ropes.
      color: p.colors[i % p.colors.length],
      path: bandPath({ radius, archY, footY, arcSegments: p.arcSegments }),
      thickness,
    });
  }
  return { bands, thickness, gap, archY, footY, cakeRadius: R };
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
