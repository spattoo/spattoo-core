import * as THREE from 'three';
import { displaceCreamWaveCylinder, creamWaveFieldFor } from '../shared/textures/creamWaveTexture.js';
import { makeWeaveField, weaveTiles } from '../shared/textures/weaveStencilTexture.js';
import { buildPipingStroke, mergePenGeometries, NOZZLE_BY_KEY, DEFAULT_NOZZLE } from './creamPen.js';
import { NOMINAL_MM_PER_UNIT } from '../constants.js';

// One inch, in world units. ⚠️ Asked of the scale the rest of the app already uses (an 8" cake is
// 2.4 units across) rather than declared again here — a second opinion about how big an inch is
// would put a nozzle's output at the wrong size on every cake.
const INCH = 25.4 / NOMINAL_MM_PER_UNIT;

// ── Styled cream walls — geometry strategies for the frosting STYLE axis ───────
//
// `buildStyledWall(wall, radius, height)` returns a tier-body BufferGeometry for a textured cream
// finish, or `null` for 'smooth' (the caller then uses the plain cylinder + lid path, unchanged).
// Each non-smooth style is a radial DISPLACEMENT of a dense cylinder's SIDE wall (caps stay flat),
// so the texture genuinely projects and breaks the silhouette — a normal map can't. Amplitudes scale
// with `radius` so the relief stays a constant fraction of the cake across tier sizes.

const TAU = Math.PI * 2;

// Side tessellation dense enough to resolve the displacement without faceting. `heightSeg` matters
// most for WAVE's thin proud lines — too coarse and the lines break up; the wave case asks for more.
function denseCylinder(radius, height, radial = 220, heightSeg = 140) {
  return new THREE.CylinderGeometry(radius, radius, height, radial, heightSeg);
}

// Displace only side vertices (|normal.y| small) radially by fn(u,v); recompute normals so the
// shading is real. u = angle (−π..π, seamless), v = 0..1 up the wall.
function displaceSide(geo, fn) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, yMin = bb.min.y, yH = (bb.max.y - bb.min.y) || 1;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nor, i);
    if (Math.abs(n.y) > 0.5) continue;          // cap vertex — leave flat
    p.fromBufferAttribute(pos, i);
    const r = Math.hypot(p.x, p.z) || 1e-6;
    const u = Math.atan2(p.z, p.x);
    const v = (p.y - yMin) / yH;
    const sc = (r + fn(u, v)) / r;
    pos.setXYZ(i, p.x * sc, p.y, p.z * sc);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// SWIRL — helical corrugation: ridges that wrap diagonally up the cake (a piped-rope swirl). `lobes`
// ridges around, `twist` turns up the height. Integer lobes keep the seam at ±π continuous. `amp` is
// a coefficient of radius (so the relief stays proportional across tiers).
function displaceSwirl(geo, radius, { amp, lobes, twist }) {
  const a = amp * radius;
  return displaceSide(geo, (u, v) => a * Math.sin(lobes * u + twist * v * TAU));
}

// RIBBED — fat rounded HORIZONTAL ribs stacked up the wall (the "rib-comb" buttercream finish):
// `bands` semicircular tubes, each sitting proud with a thin shadow groove between, constant all the
// way around (no undulation). One shared 0..1 profile so the geometry AND the relief sampler read the
// SAME shape. sin²(π·frac) is a rounded tube — 0 at the groove, 1 at the crest; `round` is an exponent
// that fattens (>1) / flattens (<1) the tube. POSITIVE-only (ribs project outward, unlike wave's
// zero-net lines) → the wall radius grows ~amp/2, like real piled-on ribs.
export function ribbedProfile(v, bands, round = 1) {
  const frac = v * bands - Math.floor(v * bands);
  const s = Math.sin(Math.PI * frac);
  return Math.pow(s * s, round);
}

// `amp` is a coefficient of radius (relief stays proportional across tiers).
function displaceRibbed(geo, radius, { amp, bands, round }) {
  const a = amp * radius;
  return displaceSide(geo, (_u, v) => a * ribbedProfile(v, bands, round));
}

/* PIPED — the SAME rounded tube, stood on end: vertical ropes run bottom to top, the way a star tip
 * is dragged straight up a chilled cake. `ribbedProfile` on the ANGLE axis instead of the height one,
 * and that is the whole difference between the two finishes.
 *
 * ⚠️ WHY NOT `swirl` WITH twist 0, which also gives vertical ridges. Two reasons, both visible:
 *   • swirl is a plain `sin`, so the crest is as sharp as the groove and the wall reads as a PLEATED
 *     lampshade. `ribbedProfile` is sin²(π·frac) — a rounded tube with a thin shadow groove between,
 *     which is what a piped rope actually looks like.
 *   • swirl is ZERO-NET: half the wave cuts INSIDE the original radius. The flat cap stays at full
 *     radius, so it overhangs the grooves and you see daylight under the rim — visible on the real
 *     scene at amp 0.09. This profile is POSITIVE-ONLY, like `ribbed`: the wall only ever grows
 *     outward, so the cap sits flush on the groove line and there is nothing to see under.
 *
 * Integer `ropes` keeps the ±π seam continuous, the same rule swirl's integer lobes follow: u/τ+0.5
 * runs 0..1 across the seam and sin(0) = sin(π) = 0, so the groove lands exactly on the join. */
/* ── PIPED — REAL ROPES, SWEPT FROM THE CREAM PEN'S OWN TIPS ─────────────────────────────────────
 *
 * ⚠️ THIS IS NOT A DISPLACED CYLINDER, and three attempts at making it one is why it kept coming
 * back. "You are looking at these as grooves, but here is what it is" — piped cream is not a groove
 * cut into a wall, it is a ROPE LAID ON one. A rope has a side that overhangs, a cap where the bag
 * lifted off, and a cross-section that belongs to a specific tip. A radial displacement of a
 * cylinder can express none of those: every point on it is one radius at one angle, so the best it
 * can ever do is a fluted column, which is exactly what it looked like.
 *
 * ⚠️ AND THE TIPS ALREADY EXISTED. `geometry/creamPen.js` carries ten real ones — Open Star 1M,
 * 6-Star, Closed Star, Jumbo, French, Fine French, Round, Bead, Drop, Petal — as cross-sections,
 * with `buildPipingStroke` to sweep one along a path, complete with the lift-off taper and the end
 * caps. The freehand pen has been piping with them in admin the whole time. A second star profile
 * invented here was a worse copy of one that was already right (CLAUDE.md rule 1), so the wall now
 * asks the pen for its geometry and the two can never disagree about what a 1M leaves behind.
 *
 * The style's `nozzle` is therefore a CREAM PEN TIP KEY. A new tip is a row in creamStyles naming
 * one of those keys — no code here, and none there either.
 */
const ropeHash = (i) => {
  // Deterministic per-stroke value in 0..1. A cake must look the same on every reload and on every
  // device — Math.random() here would render the same design differently twice.
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/* The stroke's section, and HOW MANY OF THEM GO ROUND.
 *
 * ⚠️ A PIPED STROKE IS A CYLINDER, and the tip's ribs wrap AROUND it: one faces the viewer, the
 * next two curve away left and right, and between them are deep cavities. It is not a ribbon with
 * ribs laid across a flat face — that was tried, from the reasoning that pressing a tip must spread
 * it, and it renders as a wall of cards. The section is the tip's own `lobedProfile`, unmodified.
 *
 * ⚠️ THE WIDTH BELONGS TO THE NOZZLE, NOT TO THE CAKE. A tip leaves the stroke it leaves — about a
 * third of an inch for the one this style ships with — whether it is dragged up a 6" cake or a 10"
 * one. So `width` is the knob and the COUNT is what falls out: a bigger cake gets more strokes,
 * never fatter ones. Authored the other way round, every change of tier size silently changed which
 * nozzle the baker appeared to be holding.
 *
 * `overlap` lays them CLOSER than their own width, the way a hand does; it does not fatten them.
 * The spines ride the (radius − thickness) circle, which puts the crest on the tier's radius.
 */
export function ropeSection(radius, { width, overlap, nozzle }) {
  const thickness = Math.max(1e-4, width * INCH) / 2;
  /* ⚠️ `w` IS SIDEWAYS AND `d` IS OUT OF THE WALL, and they stopped being the same number when the
   * section learned to spread (see `squash` in creamPen). The nozzle's width still sets how much
   * cake one rope covers — that is what a baker buys a tip for — but a spread rope only stands `d`
   * proud of the side, so that is what the body radius and the centreline must use. */
  const squash = (NOZZLE_BY_KEY[nozzle] ?? NOZZLE_BY_KEY[DEFAULT_NOZZLE]).squash ?? 1;
  const d = thickness * squash;
  const spacing = 2 * thickness / (1 + overlap);
  /* ⚠️ COUNTED ROUND THE CIRCLE THE CENTRELINES ACTUALLY SIT ON, which is `radius − d`. It used to
   * be `radius − thickness`, and that was the same number until the section learned to spread. On a
   * squashed tip it is not: the ropes stand on a wider circle than the count assumed, so the count
   * came out too low and every pair finished a couple of millimetres apart — the wall rendered as
   * thin blades with daylight between them, which looks like a section problem and is arithmetic. */
  const ropes = Math.max(6, Math.round(TAU * (radius - d) / spacing));
  return { thickness, w: thickness, d, ropes };
}

// The stroke's DEPTH — how far it stands off the cake. Kept as its own name because it is what the
// tier's radius, the body and the relief sampler are all expressed in.
export function ropeRadius(radius, p) {
  return ropeSection(radius, p).d;
}

/* Where the CAKE is, under the piping.
 *
 * ⚠️ THE PIPING IS DONE ON THE SIDE OF THE CAKE, NOT SUNK INTO IT, and getting that backwards is
 * what flattened every version of this. The body had been raised until it swallowed the strokes —
 * because a body left too far back showed the board through the notches between them — and the
 * result was a smooth cylinder with slits in it: most of every rope was inside the cake, so the
 * star's creases, which run most of the way down a rope's side, were buried where nobody could see
 * them. The notch problem has its own answer (a collar at the foot, see buildPipedWall); the body
 * does not have to pay for it.
 *
 * So the cake's own side sits a stroke's DIAMETER inside the crest, and `press` — how hard the tip
 * was held against it — buries at most half a stroke:
 *
 *   press 0   the stroke is tangent to the cake: laid on, all of it showing
 *   press 1   half of it is in the frosting
 */
export function pipedBodyRadius(radius, p) {
  const { d } = ropeSection(radius, p);
  return radius - 2 * d + p.press * d;
}

/* Where each rope's centreline runs. The centres ride a circle OUTSIDE the tier's nominal radius,
 * so the wall only ever grows outward — the same rule every other style here follows, and what lets
 * a flat cap sit under it without overhanging anything.
 */
function ropeCentreline(theta, d, cap, radius, height, sway0, seed) {
  const Rc = radius - d;
  const pts = [];
  // ⚠️ FIVE, not eight. The centreline is very nearly a straight line, and `pushSweep` samples the
  // curve at five times the control count — on ninety strokes that is a third of the tier's mesh
  // spent describing a wobble a millimetre wide.
  const N = 4;
  for (let k = 0; k <= N; k++) {
    // ⚠️ TOP TO BOTTOM, because `buildPipingStroke` thins the END of a stroke — that is the
    // lift-off, and on a cake side it belongs at the board, not at the rim where it would open a
    // gap under the lid.
    /* ⚠️ BOTH ENDS ARE TUCKED, because `pushSweep` caps a stroke 0.6 radii BEYOND its last point.
     * Started level with the rim, the caps stand a whole rope proud of the lid and the top silhouette
     * turns into a crown of spikes. Run past the base, and the tapered ends finish inside the board
     * instead of hanging over it as a torn fringe. */
    /* ⚠️ MEASURED IN CAP LENGTHS, NOT IN DEPTHS. `pushSweep` closes a stroke 0.6 RADII beyond its
     * last point, and a squashed section's radius is nothing like its depth — written against the
     * depth, the end caps came out three times longer than the tuck allowed for and hung below the
     * cake as flat white flaps lying on the board. */
    /* ⚠️ THE BOTTOM IS ANCHORED TO THE TIER, THE TOP TO THE ROPE, and writing both in rope radii is
     * what produced a saw-tooth fringe hanging under the cake. `pushSweep` closes a stroke 0.6 radii
     * past its last point, so an overrun measured in radii grows with the rope: at 0.04 wide it put
     * the blunt ends 4% of the tier's height into the board, invisible; at 0.15 — which is what a
     * 1in tip standing 16 to the tier actually is — it hung them 14% below it. The top still tucks
     * by the rope, because what hides it there is the lid, which does not care how tall the cake is. */
    const f = k / N;
    const yTop = height / 2 - 1.3 * cap;
    const yBot = -height / 2 + 0.6 * cap - 0.02 * height;   // cap tip lands just under the base
    const y = yTop - f * (yTop - yBot);
    const sway = sway0 * Math.sin(TAU * (f * (0.7 + ropeHash(seed)) + ropeHash(seed + 500))) / Rc;
    const th = theta + sway;
    pts.push([Rc * Math.cos(th), y, Rc * Math.sin(th)]);
  }
  /* ⚠️ HANDED BACK BOTTOM-FIRST, and the loop above still runs top-down because the tuck at each
   * end is written in terms of the rim. `buildPipingStroke` puts the FOOT FLARE at a stroke's start
   * (see footDias — measured off a real stroke, a rope is a quarter fatter a diameter above the
   * surface it stands on), and on a cake side that belongs at the board, not at the rim. The
   * lift-off taper is off for the wall anyway: neither end of a wall rope is free, the top is cut
   * by the lid and the bottom sits on the board. */
  return pts.reverse();
}

/* ⚠️ A CREASE IS DARK BECAUSE IT IS OCCLUDED, and nothing in this render was doing occlusion.
 *
 * ⚠️ AND THE RANGE IT IS MEASURED OVER IS THE WHOLE TRICK. Taken from the geometry's own minimum
 * and maximum radius, it silently does almost nothing: a swept stroke's END CAP is a cone whose
 * apex sits ON THE AXIS, so the minimum is zero, and a crease — which is only a fraction of a
 * stroke in from the crest — lands two thirds of the way up the ramp. The darkest point on the wall
 * then reaches about a third of the asked-for shade and the whole effect reads as broken. The range
 * is the CREASE to the CREST, worked out from the tip's own profile, and nothing else.
 *
 * Measured before reaching for it: sheen, roughness and clearcoat change a piped stroke by NOTHING.
 * Which is not a surprise once said out loud — the scene's light is very nearly a uniform dome, and
 * under a uniform dome a surface's brightness barely depends on which way it faces. So two flanks
 * fifteen degrees apart come out the same shade and a star reads as ONE MERGED PANEL, however sharp
 * the geometry between them is. The normals were right; there was simply no cue.
 *
 * What makes a crease dark in a photograph is that its own walls block most of the sky from it. That
 * is ambient occlusion, and for this shape it can be baked straight onto the vertices: how far a
 * point sits INSIDE the crest is how occluded it is. No texture, no uv unwrap, no post pass — and it
 * darkens the body between the strokes for the same reason and by the same rule.
 */
/* ⚠️ THE RAMP IS LINEAR IN THE ANGLE ROUND THE LOBE, NOT IN THE RADIUS — and linear-in-radius is
 * why every rib came out as a flat white plateau with a sudden dive into the crease.
 *
 * Measured, on the same scan line, against a photograph of one real stroke:
 *
 *   reference   `##****++==+#%%@@@@@#*++=-`   a continuous roll of tone across each rib
 *   ours        `@@@@@@@@%%#*= :*#%@@@@@@@`   plateau, cliff, plateau
 *
 * The cause is the section. A rosette's radius is `1 + a·cos(Lθ)`, and a cosine is FLAT at its
 * peak: over the middle half of every rib the radius barely changes, so a ramp keyed to radius
 * paints all of it the same value. The angle round the lobe is what varies evenly, and it is
 * recoverable — the normalised radius IS `(cos φ + 1)/2`, so `φ = acos(2d − 1)` gives the position
 * within the lobe from the position alone, with no need to know where the lobe started.
 *
 * `crest`/`floor` are the tip's own max and min radius (see the callers): ⚠️ NOT the geometry's own
 * min and max, whose minimum is an end cap's apex sitting on the axis.
 */
const AO_BODY = 0.30;   // what the CAKE behind the ropes gets — not an extrapolation of their ramp

export function bakeCreaseAO(geo, crest, floor, ao, cx = 0, cz = 0) {
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const span = Math.max(1e-6, crest - floor);
  for (let i = 0; i < pos.count; i++) {
    const d = (Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz) - floor) / span;  // 1 crest, 0 crease
    /* ⚠️ BEHIND THE CREASE LINE IS THE CAKE, NOT A DEEPER CREASE — and running the ropes' ramp on
     * into it is what turned the wall into a row of white pickets over a void. Two different things
     * sit at the bottom of this range: a rope's own crease, which is lit and measures 44% of the
     * crest in the reference photograph, and the BODY CYLINDER, which is below the tip's crease
     * radius altogether. Clamping the body into the ramp's last step gave it whatever the crease
     * got — a 40% grey at ao 0.6, which nobody noticed, and pure black once ao was calibrated to
     * 1.0, so the sliver of cake visible down each channel between two ropes read as a hole cut in
     * the tier. It gets its own shade, and the ropes keep their full range. */
    /* ⚠️ NOT `d < 0`, and the difference is a dark smear down the middle of every other rope. A rope
     * BREATHES along its length (see `swell`), so where it runs thin its own crease falls a little
     * behind the crease radius this range was computed from — 3% of swell puts it at about d = −0.1,
     * and painting that with the cake's flat grey blotches the rope. The body is nowhere near: it
     * sits a whole rope's diameter in, which is about five and a half crest-to-crease depths, so
     * anything past one depth behind the crease line can only be cake. */
    if (d < -1) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = AO_BODY; continue; }
    const u = Math.min(1, Math.max(0, d));
    const phi = Math.acos(2 * u - 1) / Math.PI;                        // 0 on a crest, 1 in a crease
    const k = 1 - ao * phi;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// Merge pen strokes into one mesh, then give the result CYLINDRICAL uvs — the pen's sweep carries
// none, and without them a gradient or a stripe on a piped tier has nothing to read.
function mergeWithCylindricalUv(parts, radius, height) {
  const geo = mergePenGeometries(parts.filter(Boolean));
  if (!geo) return null;
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = Math.atan2(pos.getZ(i), pos.getX(i)) / TAU + 0.5;
    uv[i * 2 + 1] = (pos.getY(i) + height / 2) / height;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeBoundingBox();
  return geo;
}

/* The whole piped wall: a plain body cylinder with a rope piped up it, over and over.
 *
 * The body is at the tier's nominal radius and is never seen — the ropes sit outside it and, with
 * any overlap at all, close over it. It is there so that a gap cannot show the inside of the cake.
 */
/* ── A MODELLED stroke, repeated round the tier ───────────────────────────────
 *
 * `wall: 'strokes'` is the piped side built from a MESH of one real vertical stroke instead of a
 * swept nozzle section. Everything above this line extrudes a profile along a centreline, which is
 * the honest way to model a tip that is being dragged — and it spent a long time not looking like
 * the photograph, because a stroke's surface is not what its tip cuts. Cream tears, folds and
 * slumps on the way out. A scan carries all of that for free.
 *
 * ⚠️ IT IS THE SAME STROKE THAT WAS APPROVED IN THE ONE-STROKE VIEW, PLACED — not a second tuning
 * of it. Nothing here touches the stroke's shape: the only decisions are how big it is (one tier
 * tall), how many go round, and how far each is pressed into the cake. If the single stroke is
 * right and the wall is wrong, the thing to change is in this function, never in the mesh.
 *
 * ⚠️ NO MESH, NO WALL — `null`, so the tier renders its ordinary smooth side. The GLB arrives over
 * the network a moment after the first frame, and a wall built without it would be a naked
 * UNDERSIZED body: the cake would visibly shrink and then grow again as the strokes landed.
 */

// Sizing + spacing, given the stroke mesh's own bounding box. Pure, so the count a tier will draw
// can be asserted without building anything. `size` is the mesh's bbox size (x lateral, y up, z
// radial), which is why this takes it rather than reading a geometry.
export function strokeWallLayout(radius, height, size, p) {
  /* ⚠️ TWO SCALES, NOT ONE, and scaling the mesh uniformly is a bug that looks like a rounding
   * error. A stroke's LENGTH is the tier: it is dragged from the board to the rim, so a taller cake
   * gets a longer stroke. Its WIDTH is the TIP, which does not change because the cake got taller.
   * Scaled uniformly, a 6"-tall cake came out with strokes twice as wide as a 3" one — the baker
   * appearing to have swapped to a bigger nozzle halfway through, which is exactly the failure the
   * swept wall's `width` note describes. So: stretched to the tier's height, scaled to the tip's
   * width, and the mesh is stretched rather than magnified. That is what a fixed tip dragged
   * further actually leaves. */
  const scale = (p.width * INCH) / size.x;               // as wide as the tip that left it
  const wx = size.x * scale;                             // its width along the wall → the spacing
  const wz = size.z * scale;                             // its depth into/out of the wall
  /* ⚠️ HEIGHT IS A SLICE, NOT A SCALE. A stroke has a NATURAL height — this one is 4.28 times its
   * own width, so at a 0.93" tip it is 3.98" tall, almost exactly a standard tier. A cake is taller
   * than that, and stretching the whole mesh to fit puts the extra length everywhere: on the bottom
   * tier every ripple, tear and fold came out 21% longer than the real thing.
   *
   * The stroke says where the extra length may go. Sampled in 24 bands: the bottom 29% is the FOOT
   * (pinched at the very base, then the splayed bulge, +19% at 13–17%, settling by 29%), the top 15%
   * is the TIP where the bag lifted off (−8%, −35%, −75%), and everything between is within ±5% of
   * the body radius the whole way — a genuine straight extrusion with no feature along its length.
   *
   * So the ends are carried RIGID at the tip's own scale and all of the stretch lands in the middle,
   * where there is nothing to distort. On the designer's tiers the middle carries 1.03×–1.38×. */
  const naturalH = size.y * scale;                       // what this stroke is, at this tip
  const rigidH = (p.foot + (1 - p.tip)) * naturalH;      // the foot and the tip, never stretched
  const middleH = (p.tip - p.foot) * naturalH;
  /* ⚠️ A TIER SHORTER THAN THE TWO ENDS CANNOT KEEP THEM, so it stops pretending to: the whole
   * stroke is scaled down instead. Squeezing a fixed foot and a fixed tip into less than their own
   * combined height would fold one through the other. */
  const uniform = height < rigidH * 1.02 ? height / naturalH : null;
  const middleStretch = uniform ? null : (height - rigidH) / middleH;
  /* ⚠️ THE BODY SITS A STROKE-DEPTH INSIDE THE TIER'S RADIUS, so the cake keeps the size the design
   * says. Cream really is added ON TOP of a frosted cake, so the physical thing grows outward — but
   * a 6" cake that renders 6.4" wide the moment a style is picked is a sizing bug, not a finish.
   * Every other style here follows the same rule. `press` buries the stroke deeper. */
  const bodyRadius = radius - wz * (1 - 0.5 * p.press);
  const R = radius - wz / 2 + p.press * wz / 2;          // the circle the strokes' own axes ride
  const spacing = wx * (1 - p.overlap);
  const count = Math.max(6, Math.round(TAU * R / spacing));
  return { scale, wx, wz, R, bodyRadius, count, naturalH, rigidH, middleH, middleStretch, uniform };
}

/* Make a stroke as long as the tier by moving ONLY its middle — see strokeWallLayout for why the
 * ends are the part that must not stretch. `geo` is already at the tip's true scale, seated on y=0.
 *
 * ⚠️ NO MESH SURGERY, and that is the point of doing it as a vertex remap rather than a cut: the
 * triangles that straddle a cut plane simply have their corners moved by different amounts, so the
 * surface bends very slightly there instead of being severed. Nothing can crack, and nothing has to
 * be re-welded. The bend is invisible because the plane sits in the featureless middle — a cut is
 * only needed to TILE the middle, which is the next mechanism and belongs in the asset step.
 */
function stretchMiddle(geo, { naturalH, middleStretch, uniform }, p) {
  const pos = geo.getAttribute('position');
  if (uniform) {                                         // too short to keep both ends — scale it all
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) * uniform);
    pos.needsUpdate = true;
    return geo;
  }
  const y0 = p.foot * naturalH, y1 = p.tip * naturalH;
  const lift = (y1 - y0) * (middleStretch - 1);          // how far the tip is carried up
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y <= y0) continue;                               // the foot: exactly as it was piped
    pos.setY(i, y >= y1 ? y + lift                       // the tip: carried, never stretched
                        : y0 + (y - y0) * middleStretch);
  }
  pos.needsUpdate = true;
  return geo;
}

function buildStrokeWall(radius, height, p) {
  const src = p.strokeGeo;
  if (!src) return null;                                 // mesh still loading — smooth wall, not a stub
  if (!src.boundingBox) src.computeBoundingBox();
  const size = new THREE.Vector3();
  src.boundingBox.getSize(size);
  const L = strokeWallLayout(radius, height, size, p);
  const { scale, wz, R, bodyRadius, count } = L;

  const parts = [new THREE.CylinderGeometry(bodyRadius, bodyRadius, height, 96, 1)];
  /* ⚠️ A FOOT, for the reason the swept wall has one: the notch between two strokes is open at the
   * bottom and looks straight down at the board, so a viewer above the cake sees a ring of gold
   * sawteeth round its base. A short collar closes them, and cream squeezed out at the foot of a
   * vertical stroke is what a real one has there anyway.
   *
   * ⚠️ SIZED OFF THE STROKE'S RADIUS, NOT ITS DEPTH, and copying the swept wall's `1.2 * d` without
   * noticing which one `d` was is worth the note: there `d` is a rope's radius, here `wz` is a whole
   * stroke's depth — twice as big — so the collar came out 27% of the tier tall and read as a smooth
   * band that had eaten the bottom quarter of every stroke. It also stays BEHIND the crest line
   * (out at `R`, the strokes' own axis circle): a collar that reaches the crest is visible between
   * the strokes as a ring, which is the fault it was added to fix. */
  const foot = new THREE.CylinderGeometry(R, R, 0.35 * wz, 96, 1);
  foot.translate(0, -height / 2 + 0.175 * wz, 0);
  parts.push(foot);

  /* ⚠️ THE MESH IS CENTRED AND SEATED ONCE, then instanced — not re-prepared per stroke. Its own
   * origin is wherever the generator left it; what the placement needs is a stroke whose axis is at
   * x=z=0 and whose foot is at y=0, so that scaling it by `scale` and standing it at -height/2 puts
   * it on the board however tall the tier is. */
  const c = new THREE.Vector3();
  src.boundingBox.getCenter(c);
  const base = src.clone();
  base.translate(-c.x, -src.boundingBox.min.y, -c.z);
  /* Scaled to the TIP here, once, so `base` is a stroke at its true natural size — and then made as
   * long as the tier needs by moving only the middle. Per-stroke work below is placement and `vary`,
   * never size, so nothing downstream can re-stretch it by accident. */
  base.scale(scale, scale, scale);
  stretchMiddle(base, L, p);

  for (let i = 0; i < count; i++) {
    /* ⚠️ ROLLED TO FACE OUTWARD, AND THE SIGN IS NEGATIVE — the same correction the swept ropes
     * needed. The mesh has a front and a back (its ribs are deepest on the face that was scanned);
     * without the roll, which side a stroke shows the viewer would depend on where it sits round
     * the cake, and the wall comes out patchy. */
    const theta = TAU * i / count;
    /* ⚠️ EVERY STROKE THE TWIN OF ITS NEIGHBOUR IS WHAT MAKES A WALL READ AS MACHINED, and one mesh
     * repeated is the worst case of it — the swept wall at least varied its own section. `vary`
     * buys the cheapest honest difference: a little size, a little roll. It may only make a stroke
     * FATTER, because a thinner one no longer reaches its neighbour and opens a gap. */
    // ⚠️ WIDTH ONLY. `vary` may fatten a stroke, never lengthen it: the length is the cake's.
    const s = 1 + p.vary * 0.10 * ropeHash(i);
    const roll = -theta + p.vary * 0.10 * (ropeHash(i + 700) - 0.5);
    const g = base.clone();
    g.scale(s, 1, s);
    g.rotateY(roll);
    g.translate(R * Math.cos(theta), -height / 2, R * Math.sin(theta));
    parts.push(g);
  }
  const wall = mergePenGeometries(parts);
  wall.computeVertexNormals();
  return wall;
}

function buildPipedWall(radius, height, p) {
  const { thickness, w, d, ropes } = ropeSection(radius, p);
  const t = d;
  const rBody = pipedBodyRadius(radius, p);
  const parts = [new THREE.CylinderGeometry(rBody, rBody, height, 96, 1)];
  /* ⚠️ A FOOT, because the notch between two ropes is open at the bottom and looks straight at the
   * board. The ropes' crest is the tier's radius but the body behind them is a rope-diameter
   * narrower, so a viewer above the cake sees a ring of gold sawteeth around its base — the loudest
   * thing in three renders. A short collar out at the crest line closes them. It is not a cheat:
   * cream squeezed out at the foot of a vertical stroke is what a real one has there. */
  const foot = new THREE.CylinderGeometry(radius - 0.15 * d, radius - 0.15 * d, 1.2 * d, 96, 1);
  foot.translate(0, -height / 2 + 0.6 * d, 0);
  parts.push(foot);
  // ⚠️ The pen's own speed→width cue is OFF here. It reads the SPACING of hand-captured points, and
  // these are machine-even, so it would return a flat 1 and cost the work of finding that out. The
  // variation a wall wants is between one stroke and the next, which is `vary`.
  /* ⚠️ AND THERE IS NO LIFT-OFF. The pen thins the END of a stroke to a point, which is right for a
   * stroke that finishes in mid-air and wrong for forty-six of them arriving together at the board:
   * it came out as a torn fringe with the board showing through it. These strokes do not end, they
   * are CUT OFF by the board — so the taper is off and the centreline runs past the base, putting
   * the blunt end inside the board where nothing can see it. */
  /* ⚠️ EVERYTHING ELSE THE PEN DOES TO KEEP A ROPE ALIVE STAYS ON, and switching it all off is what
   * made the wall read as machined — dead-straight, dead-uniform, every stroke the twin of its
   * neighbour. Three cues, each doing a different job:
   *
   *   swell        the rope thickens and thins slowly along its length. Cream does not extrude at a
   *                constant rate, and a dead-uniform width is the one thing no hand can produce.
   *   rufflePhase  ⚠️ PER STROKE, or every rope swells in the same places and the wall grows
   *                horizontal BANDS. Nothing says machine louder than forty ropes breathing together.
   *   twist        the ribs corkscrew very slightly as the cream leaves the tip. A HINT: the pen's
   *                own 0.03/diameter is sized for a freehand squiggle a few diameters long, and a
   *                wall stroke is twenty — at that length it becomes a barber pole.
   */
  /* ⚠️ THE SWELL IS SIZED TO THE ROPE, so it had to become authorable the moment the rope got
   * bigger. 0.16 was picked when a stroke was a pencil line 0.08 wide, where a sixth of its width is
   * a millimetre of life; on a stroke four times that it is a visible wave and the wall reads as
   * melted. A photographed piped line is very nearly constant width — the life is in its ends and in
   * its neighbours not quite matching, not in its own silhouette rippling. */
  const feel = (i) => ({
    speedWidth: 0, tailDias: 0,
    twistTurnsPerDia: 0.008,
    swellAmp: p.swell,
    rufflePhase: ropeHash(i + 1300) * TAU,
  });
  /* ⚠️ HOW MUCH A ROPE MAY MOVE IS SET BY HOW FAR IT OVERLAPS ITS NEIGHBOUR, and getting that
   * wrong is what made every star tip look like a FRINGE of hanging strips. Two ropes touch with
   * `margin` to spare on each side; if they wander independently by more than that, a gap opens
   * between them and the wall stops being a surface. The wander was an absolute distance before,
   * which happened to be four times the margin — so the ropes were literally coming apart, and no
   * amount of choosing a different tip was ever going to fix it.
   *
   * For the same reason `vary` may only ever make a rope FATTER. A rope 11% thinner than nominal is
   * a rope that no longer reaches its neighbour. */
  const margin = Math.max(0, w - Math.PI * (radius - d) / ropes);
  const sway0 = p.wobble * 0.4 * margin;
  for (let i = 0; i < ropes; i++) {
    const theta = -Math.PI + TAU * (i + 0.5 + p.vary * 0.4 * (ropeHash(i + 700) - 0.5)) / ropes;
    const ti = thickness * (1 + p.vary * 0.5 * ropeHash(i));
    /* ⚠️ ROLLED TO FACE OUTWARD, AND THE SIGN IS NEGATIVE. `rmFrames` starts every vertical stroke
     * from the same world direction, so without a roll the lobe a rope shows the viewer depends on
     * where it sits round the cake — the wall comes out patchy, some ropes a wide flat panel and
     * their neighbours a thin line, which is invisible on a freehand squiggle and unmissable on
     * thirty-six parallel ones.
     *
     * ⚠️ `+theta` was wrong for four months and could not be seen. `pushSweep` rotates the profile
     * the OPPOSITE way round the tier, so `+theta` only lines the section up where the error is a
     * whole multiple of the section's own symmetry — every 45° for an 8-lobe tip, which is why a
     * ROUND rope looked fine and only ever half-fixed the patchiness this comment was written for.
     * Give the same tip a section that is not 8-fold symmetric — one spread against the wall, which
     * is only symmetric about ONE axis — and it shows up as ropes standing on edge between the
     * eight angles where it happens to come right. Measured: the outward extent of a spread rope is
     * 0.0825 at every theta with the sign negative, and wanders to 0.15 between multiples of 45°
     * with it positive. */
    parts.push(buildPipingStroke(
      ropeCentreline(theta, d, d, radius, height, sway0, i), p.nozzle, ti, feel(i), null, -theta, 0));
  }
  /* ⚠️ THE WALL SHADES FROM THE RELIEF IT ACTUALLY HAS, NOT FROM THE TIP'S SECTION — and letting
   * each rope carry its own shade is what made the tier read as thin blades with black gaps between
   * them, for hours, while the geometry was fine all along.
   *
   * A rope alone is a tube, and painting it bright at its crest and dark round to its crease is
   * right: all of it is on show. On a wall the ropes are pushed 60% into each other, so most of
   * every flank is BURIED and only a narrow strip is visible. Painting the tip's whole crest-to-
   * crease ramp across that strip drives it to full dark at both edges, and every seam becomes a
   * black band — the eye reads a gap where the surface is in fact continuous. Sliced properly, this
   * wall runs 0.825 to 0.909 with no bare cake anywhere: a 9% ripple, not a picket fence.
   *
   * So the ropes are swept unshaded and the merged surface is measured and shaded over ITS OWN
   * range. Self-calibrating: overlap them more and the ripple shallows and the shading softens with
   * it, which is what should happen. The caps are skipped — an end cap's apex sits on the axis and
   * would drag the floor to nothing. */
  const merged = mergeWithCylindricalUv(parts, radius, height);
  const pos = merged.getAttribute('position');
  /* ⚠️ MEASURED OVER THE PIPING ONLY, and ⚠️ NOT over every vertex — a wall carries points ON THE
   * AXIS (cylinder cap centres, an end cap's apex) and one of those drags the floor to ZERO. The
   * range then spans 0 to the crest instead of the crease to the crest, the real relief lands in
   * the top tenth of the ramp, and the whole wall shades nearly flat: measured here as
   * `surfaceMin 0, surfaceMax 0.937` when the surface actually runs 0.82 to 0.91. Anything inside
   * the body is not piping and cannot be a crease. */
  const floor = pipedBodyRadius(radius, p) * 0.9;
  let lo = Infinity, hi = 0;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getY(i)) > height * 0.4) continue;
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    if (r < floor) continue;
    if (r < lo) lo = r; if (r > hi) hi = r;
  }
  if (!(lo < hi)) { lo = pipedBodyRadius(radius, p); hi = radius; }
  return bakeCreaseAO(merged, hi, lo, p.ao);
}

// Bilinear sample of a height field at (fu, fv) given in TILE units, wrapping to [0,1) on both axes.
// Shared by the image-relief displacement and the weave relief sampler so both read the field the same.
export function sampleFieldWrap(field, fu, fv) {
  const { height, w, h } = field;
  const fx = (((fu % 1) + 1) % 1) * w;
  const fy = (((fv % 1) + 1) % 1) * h;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = (x0 + 1) % w, y1 = (y0 + 1) % h;
  const tx = fx - x0, ty = fy - y0;
  const a = height[y0 * w + x0], b = height[y0 * w + x1], c = height[y1 * w + x0], d = height[y1 * w + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

// Displace a dense cylinder's SIDE by sampling an image height FIELD (bilinear, wrapping both axes),
// with a rim fade so the top/bottom edges relax to the wall (no spikes) and caps stay flat. For
// photo/stamp-derived rustic finishes. `relief` is in world units; `repeatX/Y` tile the field.
export function displaceByHeightField(geo, field, { repeatX = 1, repeatY = 1, relief = 0.08, rimFade = 0.1 } = {}) {
  const sample = (u, v) => sampleFieldWrap(field, u * repeatX, v * repeatY);
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  geo.computeBoundingBox();
  const bb = geo.boundingBox, yMin = bb.min.y, yH = (bb.max.y - bb.min.y) || 1;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nor, i);
    if (Math.abs(n.y) > 0.5) continue;                 // cap vertex — leave flat
    p.fromBufferAttribute(pos, i);
    const r = Math.hypot(p.x, p.z) || 1e-6;
    const u = Math.atan2(p.z, p.x) / TAU + 0.5;
    const v = (p.y - yMin) / yH;
    const mask = ss(0, rimFade, v) * ss(0, rimFade, 1 - v);   // relax displacement at the rims
    const sc = (r + relief * sample(u, v) * mask) / r;
    pos.setXYZ(i, p.x * sc, p.y, p.z * sc);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/* ONE place that fills in what a `piped` wall did not say. The geometry, the relief sampler and the
 * lid all read the wall's shape, and three copies of `params.ropes ?? 46` is three chances for the
 * cake, the thing seated on it and the lid over it to be built from different numbers.
 *
 * ⚠️ `nozzle` IS A CREAM PEN TIP KEY, not a number, and it rides in the same bag because it reaches
 * here the same way the numbers do: `CakeTier` folds the style entry's `nozzle` into the resolved
 * params. It is looked up in `NOZZLE_BY_KEY`, never branched on.
 */
/* Resolved params for `wall: 'strokes'`. Deliberately SHORT: the mesh already carries everything a
 * nozzle section used to have to be told (lobe count, depth, crease shape, the ripple down its
 * face), so all that is left is where the strokes go. `strokeGeo` is not authored — it is the
 * loaded mesh, handed in by the renderer. */
export function strokeWallParams(params = {}) {
  return {
    // ⚠️ INCHES OF NOZZLE, not a count of strokes and not a fraction of the cake. See ropeSection.
    width:   Math.max(0.1, params.width ?? 0.93),
    /* Where this mesh stops being a foot and starts being a tip, as fractions of its own length.
     * ⚠️ FACTS ABOUT THE ASSET, not preferences — measured off the scan, and a different scan wants
     * different ones, which is why they are overlaid with it rather than hardcoded beside it. */
    foot:    Math.min(0.45, Math.max(0, params.foot ?? 0.29)),
    tip:     Math.min(1, Math.max(0.55, params.tip ?? 0.85)),
    /* ⚠️ AN OVERLAP, NOT A COUNT — the count falls out of it and the tier's circumference, so a 6"
     * and a 10" cake get strokes of the same SIZE rather than the same number. Authored as a count,
     * every change of cake size silently re-piped the cake with a different tip. (Same reasoning as
     * the swept wall's `width`; here the stroke's size is fixed by the tier height, so the only
     * thing left to say is how hard neighbours are pressed together.) */
    overlap: Math.min(0.8, Math.max(-0.2, params.overlap ?? 0.39)),
    press:   Math.min(1, Math.max(0, params.press ?? 0)),
    vary:    Math.min(1, Math.max(0, params.vary ?? 0.35)),
    strokeGeo: params.strokeGeo ?? null,
  };
}

export function pipedParams(params = {}) {
  const nozzle = NOZZLE_BY_KEY[params.nozzle] ? params.nozzle : DEFAULT_NOZZLE;
  return {
    nozzle,
    // ⚠️ INCHES OF NOZZLE, not a count of strokes. See ropeSection.
    width:   Math.max(0.05, params.width ?? 0.6),
    overlap: Math.max(-0.3, params.overlap ?? 0.85),
    /* ⚠️ ZERO. Piping happens ON a surface — there is no reason to bury it, and every value above 0
     * hides a stroke's flanks and leaves one flat face showing. The gaps that opening it up used to
     * leave are closed by `overlap`, which is the right lever: a hand lays strokes into each other,
     * it does not push them into the cake. */
    press:   Math.min(1, Math.max(0, params.press ?? 0)),
    // How dark a crease goes — see bakeCreaseAO. 0 is the render with no occlusion at all.
    ao:      Math.min(1, Math.max(0, params.ao ?? 0.6)),
    vary:    params.vary    ?? 0.34,
    wobble:  params.wobble  ?? 0.85,
    /* The top. ⚠️ A DIFFERENT TOOL, so a different shape: not the tip, and an order of magnitude
     * shallower than a rope. See buildStyledTop. */
    swirl:      params.swirl ?? 0.012,
    swirlTurns: Math.max(1, params.swirlTurns ?? 7),
  };
}

// `params` is the resolved style param set (defaults ← authored overrides) from creamStyles.js.
// `relief`/`amp` are coefficients of radius; the rest map straight onto the field/strategy.
export function buildStyledWall(wall, radius, height, params = {}) {
  if (!wall || wall === 'smooth') return null;          // smooth → caller uses the plain cylinder
  switch (wall) {
    case 'wave': {
      // The admin-approved cream-wave field; schema defaults match its approved params. `relief` is a
      // coefficient of radius (admin tuned on a radius-1 cylinder); mesh height-segs scale with bands.
      const ridges = params.ridges ?? 6;
      const heightSeg = Math.min(440, Math.max(200, ridges * 50));
      const geo = denseCylinder(radius, height, 256, heightSeg);
      return displaceCreamWaveCylinder(geo, {
        relief: (params.relief ?? 0.06) * radius,
        ridges, lobes: params.lobes ?? 2, waveAmp: params.waveAmp ?? 0.35,
        ribbonW: params.ribbonW ?? 0.05, falloff: params.falloff ?? 0.4,
      });
    }
    case 'swirl':  return displaceSwirl(denseCylinder(radius, height, 220, 160), radius,
      { amp: params.amp ?? 0.045, lobes: params.lobes ?? 9, twist: params.twist ?? 3.0 });
    case 'ribbed': {
      // Horizontal ribs need height tessellation that scales with band count (else the tubes facet);
      // around the cake they're constant, so the radial count can stay modest.
      const bands = params.bands ?? 12;
      const heightSeg = Math.min(440, Math.max(200, bands * 24));
      return displaceRibbed(denseCylinder(radius, height, 160, heightSeg), radius,
        { amp: params.relief ?? 0.04, bands, round: params.round ?? 1.0 });
    }
    case 'piped': return buildPipedWall(radius, height, pipedParams(params));
    case 'strokes': return buildStrokeWall(radius, height, strokeWallParams(params));
    case 'weave': {
      // Woven stencil — a shallow REAL displacement of the pinwheel field (the crisp lines ride on top
      // as a normal map, baked from the same field in CakeTier). Tessellation scales with the line
      // count so the grooves don't facet; the normal map carries any detail finer than the mesh.
      const { around, up } = weaveTiles(radius, height, params.tile ?? 0.8);
      const grooves = params.grooves ?? 5;
      // Diagonal grooves alias into "beads" on a coarse quad grid — need dense tessellation on BOTH
      // axes; the normal map carries anything finer than the mesh, so displacement stays shallow.
      const radial    = Math.min(512, Math.max(320, around * grooves * 6));
      const heightSeg = Math.min(512, Math.max(280, up * grooves * 8));
      const field = makeWeaveField(512, { grooves, width: params.width ?? 0.5, border: params.border ?? 0 });
      return displaceByHeightField(denseCylinder(radius, height, radial, heightSeg), field,
        { repeatX: around, repeatY: up, relief: (params.relief ?? 0.015) * radius, rimFade: 0.08 });
    }
    default:       return denseCylinder(radius, height);
  }
}

// Sampler for the SAME wall surface buildStyledWall builds: given a point's geometry angle `theta`
// (= atan2(z, x), radians) and height fraction `v` ∈ [0,1], returns the wall's RADIAL displacement
// (world units) there — i.e. the live surface height, so decor can seat on the wavy wall instead of a
// fixed offset. Mirrors each displacement strategy exactly (reuses the wave field; same swirl formula).
// Returns null for non-displacing walls (smooth / normal-map finishes) → caller treats as flat.
export function makeWallReliefSampler(wall, radius, params = {}, wallHeight = radius) {
  switch (wall) {
    case 'wave': {
      const field  = creamWaveFieldFor({
        ridges: params.ridges, lobes: params.lobes, waveAmp: params.waveAmp,
        ribbonW: params.ribbonW, falloff: params.falloff,
      });
      const relief = (params.relief ?? 0.06) * radius;
      return (theta, v) => relief * field.height(theta / TAU + 0.5, v) * field.reliefMask(v);
    }
    case 'swirl': {
      const a = (params.amp ?? 0.045) * radius;
      const lobes = params.lobes ?? 9, twist = params.twist ?? 3.0;
      return (theta, v) => a * Math.sin(lobes * theta + twist * v * TAU);
    }
    case 'ribbed': {
      const a = (params.relief ?? 0.04) * radius;
      const bands = params.bands ?? 12, round = params.round ?? 1.0;
      return (_theta, v) => a * ribbedProfile(v, bands, round);   // constant around → depends only on v
    }
    case 'piped': {
      /* The rope surface, analytically — there is no height field to share any more, so this is the
       * one place the two descriptions of a piped wall could drift apart. It reads the SAME
       * `pipedParams` and the same geometry: centres on a circle of radius (r + t), so the surface
       * runs from t in the crevice between two ropes to 2t over a rope's spine. The tip's own fine
       * ribs are deliberately not modelled — a decoration seats on the rope, not in a flute.
       */
      const p = pipedParams(params);
      const { d: t, ropes } = ropeSection(radius, p);
      const Rc = radius - t;
      const floor = pipedBodyRadius(radius, p) - radius;        // the cake between two ropes
      /* ⚠️ NEGATIVE, AND THAT IS RIGHT. Every other style grows outward from the nominal radius, so
       * every other sampler returns ≥ 0. Piped ropes are laid INSIDE it — their crest IS the radius —
       * so the surface runs from 0 on a rope's spine down to the crevice between two of them. Decor
       * seats a little inside the nominal wall here, which is exactly where the cream is. */
      return (theta, _v) => {
        const step = TAU / ropes;
        const centre = Math.round(theta / step - 0.5) + 0.5;    // nearest rope, in step units
        const d = Math.abs(theta - centre * step) * Rc;          // arc distance from its spine
        return Math.max(floor, -t + (d < t ? Math.sqrt(t * t - d * d) : 0));
      };
    }
    case 'weave': {
      // Same field & tiling as buildStyledWall's weave case, so decor seats on the real groove relief.
      const { around, up } = weaveTiles(radius, wallHeight, params.tile ?? 0.8);
      const field  = makeWeaveField(256, { grooves: params.grooves ?? 5, width: params.width ?? 0.5, border: params.border ?? 0 });
      const relief = (params.relief ?? 0.015) * radius;
      return (theta, v) => relief * sampleFieldWrap(field, (theta / TAU + 0.5) * around, v * up);
    }
    default: return null;
  }
}

/* ── The tier TOP — a SPATULA SWIRL, not a coil ────────────────────────────────
 *
 * ⚠️ THE REFERENCE CAKE'S TOP IS NEARLY FLAT. It carries a few soft concentric rings, the marks a
 * palette knife leaves when it is set in the middle of a smoothed top and the turntable is spun.
 * Piping a rope coil up there — the same tip the sides were piped with — gives a bold, busy lid that
 * fights the wall for attention, and "not heavy spirals on the top" was the verdict on every one of
 * them. The two surfaces are made with different tools and it shows.
 *
 * So the top is a DISC with a shallow ripple: the spiral is a pattern IN a flat surface, an order of
 * magnitude shallower than a rope, and it carries no tip profile at all because no tip touched it.
 */
export function makeSwirlField({ turns, rOut }) {
  return (r, theta) => {
    // One Archimedean coordinate: a turn inward per revolution, `turns` of them from rim to middle.
    const sp = turns * (1 - Math.min(1, r / rOut)) + theta / TAU;
    return 0.5 - 0.5 * Math.cos(TAU * sp);
  };
}

/* A flat disc as a dense polar GRID.
 *
 * ⚠️ NOT `CircleGeometry`, and not a cylinder cap either: both are triangle FANS — every vertex sits
 * on the rim and there is nothing in between to displace, so a height field applied to one gives a
 * flat disc with a wavy edge. The centre is ONE vertex, not a ring of coincident ones, which would
 * make degenerate triangles and NaN normals.
 */
function polarDisc(rOut, rings, segs, h, skirtY) {
  const pos = [], idx = [], uv = [];
  const push = (x, y, z) => { pos.push(x, y, z); uv.push(x / (2 * rOut) + 0.5, z / (2 * rOut) + 0.5); };
  push(0, h(0, 0), 0);
  for (let j = 1; j <= rings; j++) {
    const r = rOut * j / rings;
    for (let i = 0; i < segs; i++) {
      const theta = -Math.PI + TAU * i / segs;
      push(r * Math.cos(theta), h(r, theta), r * Math.sin(theta));
    }
  }
  const ring = (j) => 1 + (j - 1) * segs;
  for (let i = 0; i < segs; i++) idx.push(0, ring(1) + (i + 1) % segs, ring(1) + i);
  for (let j = 1; j < rings; j++)
    for (let i = 0; i < segs; i++) {
      const a = ring(j) + i, b = ring(j) + (i + 1) % segs;
      const c = ring(j + 1) + i, d = ring(j + 1) + (i + 1) % segs;
      idx.push(a, b, c, b, d, c);
    }
  // A rim skirt, dropped far enough to overlap the tops of the wall's ropes: the lid has an edge
  // instead of ending as a sheet of paper, and there is no ring of daylight under it.
  const base = pos.length / 3;
  for (let i = 0; i < segs; i++) { const o = (ring(rings) + i) * 3; push(pos[o], skirtY, pos[o + 2]); }
  for (let i = 0; i < segs; i++) {
    const a = ring(rings) + i, b = ring(rings) + (i + 1) % segs;
    const c = base + i, d = base + (i + 1) % segs;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

/* The tier TOP for a styled cream finish, or `null` when the style leaves the top flat (every style
 * but `piped` today — the caller then renders the wall's own flat cap, exactly as before).
 *
 * ⚠️ THE RIM LOOKS AFTER ITSELF, and that is worth recording because two commits went on fixing it
 * the hard way. While the wall was a DISPLACED cylinder it grew outward past its own flat cap, so
 * the cap stopped short, daylight showed under the rim, and the lid had to trace the wall's crest
 * line and skirt down to meet it. Ropes are laid INSIDE the nominal radius instead, so a disc that
 * reaches the body radius is covered by their inner halves at every angle, by construction. The fix
 * was to model the thing correctly, not to chase the symptom.
 */
export function buildStyledTop(wall, top, radius, height, params = {}) {
  if (top !== 'spiral') return null;
  const p = pipedParams(params);
  /* ⚠️ THE LID IS THE CAKE'S TOP, SO IT ENDS WHERE THE CAKE DOES — a little past the body, tucked
   * into the strokes' inner halves. Taken all the way out to the crest it becomes a plate
   * overhanging the piping, which is what a tier looked like while the body was swallowing the
   * strokes. The strokes' own ends stand proud of it, and that crown is what a real vertical piped
   * tier has around its rim. */
  const { w } = ropeSection(radius, p);
  /* ⚠️ THE LID IS THE CAKE'S TOP, SO IT ENDS WHERE THE CAKE'S SIDE IS — at the body radius, not a
   * little past it. Reaching into the strokes, it lay OVER their inner halves: from above every
   * stroke's section was half swallowed by the lid, which reads exactly like piping done inside the
   * cake. You cannot pipe inside a cake. The strokes sit ON the side; the top ends where the side
   * begins, and their ends stand proud of it as the crown a real vertical piped tier has. */
  /* ⚠️ OUT TO THE CREST. Left at the body radius the lid stops a whole stroke short, and from
   * DIRECTLY ABOVE the tier becomes a disc ringed by every stroke's cut-off end — a torn-looking
   * crown of star sections, which is not what any cake has. The reference photograph's top is a
   * clean disc with the ribs only on the side. */
  const rLid = radius - 0.15 * ropeSection(radius, p).w;
  const depth = p.swirl * radius;
  const field = makeSwirlField({ turns: p.swirlTurns, rOut: rLid });
  // Rings have to resolve the ripple across the radius; around, it is one wave per revolution.
  return polarDisc(rLid, Math.min(360, Math.max(80, p.swirlTurns * 16)), 180,
    (r, theta) => depth * field(r, theta), -1.2 * w);
}
