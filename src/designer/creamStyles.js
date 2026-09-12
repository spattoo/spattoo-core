// ── Cream styles — the declarative catalog for the frosting STYLE axis ─────────
//
// Orthogonal to the frosting TYPE (material): style is HOW the cream is finished on the wall — its
// surface technique/geometry. Type gives the material (buttercream/whipped/fondant); style gives the
// wall shape (smooth, combed wave, swirl, rustic spatula). They compose in CakeTier: material from
// type, wall geometry from style.
//
// Each entry is DATA: a label + a `wall` KEY that the geometry layer (geometry/creamWall.js) resolves
// to a displacement strategy. `smooth` is the no-op default (the plain cylinder) — so adding it is a
// zero-change baseline and every existing design keeps rendering identically.
//
// Which styles a given TYPE permits is a capability on the type (frostings: capabilities.styles) —
// cream finishes texture; fondant is a smooth rolled sheet (styles handled later, separately).

// Each style: a `wall` algorithm KEY (resolved in geometry/creamWall.js) + a `params` schema. A param
// is DATA: { key, label, min, max, step, default, user }. `default` is the admin-approved value (so
// untouched designs keep that look); `user: true` = surfaced in the customer designer, the rest are
// advanced/authoring-only. This schema is the seed for the future DB-authored finish config (Phase 2);
// the geometry strategy and the control UI both read it, so a new texture = one entry here.
/* The `piped` param schema, built once and shared by every nozzle row (see the note on those rows).
 * `over` replaces DEFAULTS only — a row may want different numbers, never a different set of knobs.
 *
 * ⚠️ THE TIP'S OWN SHAPE IS NOT IN HERE. Rib count, groove depth, how much the ribs corkscrew: those
 * belong to the nozzle, they live in `geometry/creamPen.js` beside the freehand pen's ten real tips,
 * and a slider here that could contradict them would only ever be a way to get a 1M that is not a
 * 1M. What a wall gets to say is how many strokes go round it and how they were laid.
 */
/* The sliders for a MODELLED wall (`wall: 'strokes'`). Short by design: the mesh already carries
 * everything a nozzle section had to be told — lobe count, rib depth, crease shape, the ripple down
 * the face — so the only things left to author are where the strokes go. Compare pipedParams, which
 * needs nine numbers to describe a tip this one simply has a photograph of. */
function strokeParams(over = {}) {
  const d = (key, fallback) => (over[key] ?? fallback);
  return [
    /* ⚠️ THE TIP'S OWN SIZE, IN INCHES, and the cause rather than the effect — the same axis the
     * swept rows author, for the same reason. The stroke mesh is STRETCHED to the tier's height (a
     * stroke is dragged from the board to the rim, so a taller cake gets a longer one) and SCALED to
     * this width. Scaling it uniformly instead made a taller cake's strokes wider, which reads as
     * the baker having swapped nozzles because the cake grew.
     *
     * 0.93 is the tip the approved stroke was measured at: 4.4 times as tall as it is wide on a
     * 1.2-tall tier is 0.28 world across, which is 0.93in. The swept `piped_rope` row arrived at
     * 0.91in from the same photograph, independently. */
    { key: 'width',   label: 'Nozzle (in)', min: 0.3, max: 1.6, step: 0.05, default: d('width', 0.93), user: true },
    /* ⚠️ WHERE THIS MESH STOPS BEING A FOOT AND STARTS BEING A TIP, as fractions of its own length —
     * and the reason the wall can be any height without the stroke distorting. The scan's own height
     * at this tip is 3.98in, almost exactly a standard tier; every cake is taller, so the extra
     * length has to go somewhere. Measured in 24 bands: the bottom 29% is the splayed foot, the top
     * 15% is the lift-off tip, and the 56% between them holds within ±5% of the body radius — a
     * straight extrusion with no feature along its length. The ends are carried rigid and the middle
     * takes all of it. ⚠️ FACTS ABOUT THE ASSET, not preferences: a different scan wants different
     * ones, which is why they are overlaid alongside `strokeGlb` rather than hardcoded. */
    { key: 'foot',    label: 'Foot ends at',  min: 0,    max: 0.45, step: 0.01, default: d('foot', 0.29), user: false },
    { key: 'tip',     label: 'Tip starts at', min: 0.55, max: 1,    step: 0.01, default: d('tip', 0.85),  user: false },
    /* ⚠️ AN OVERLAP, NOT A COUNT. The stroke's size is fixed by the tier's HEIGHT (one stroke spans
     * the side, which is what a piped stroke does), so the count falls out of the circumference —
     * and a 6" and a 10" cake get strokes of the same size rather than the same number. Authored as
     * a count, every change of cake size silently re-piped the cake with a different tip.
     *
     * 0.39 is the value the placement was judged at: 28 strokes round a 0.9-radius tier. Below
     * about 0.3 the cake shows between them; above about 0.45 the strokes merge and the side reads
     * as a ribbed drum instead of as separate pipes, which is the groove that makes it look piped. */
    { key: 'overlap', label: 'Overlap', min: 0.1, max: 0.6, step: 0.02, default: d('overlap', 0.39), user: true },
    /* How hard the tip was held against the cake. 0 = laid on the surface, all of it showing, which
     * is what piping is; see pipedParams' note — this axis exists for the same reason and defaults
     * the same way. */
    { key: 'press', label: 'Press in', min: 0, max: 1, step: 0.05, default: d('press', 0), user: false },
    /* ⚠️ ONE MESH REPEATED IS THE WORST CASE OF THE "MACHINED" LOOK — the swept wall at least varied
     * its own section between strokes. This buys the cheapest honest difference: a little size, a
     * little roll. It may only make a stroke FATTER; a thinner one stops reaching its neighbour. */
    { key: 'vary', label: 'Hand variation', min: 0, max: 1, step: 0.05, default: d('vary', 0.35), user: true },
  ];
}

function pipedParams(over = {}) {
  const d = (key, fallback) => (over[key] ?? fallback);
  return [
    /* ⚠️ THE NOZZLE'S OWN SIZE, IN INCHES, and it is the cause rather than the effect. A tip leaves
     * the stroke it leaves whether it is dragged up a 6" cake or a 10" one, so what a wall gets to
     * say is how wide the tip is; the number of strokes is what falls out of the tier's
     * circumference. Authored as a stroke COUNT — which is how this shipped — every change of tier
     * size silently changed which nozzle the baker appeared to be holding. */
    { key: 'width',   label: 'Nozzle (in)', min: 0.1, max: 1.2, step: 0.05, default: d('width', 0.5), user: true },
    // How hard neighbours are pressed together. A hand overlaps; butted exactly, a crevice between
    // two ropes can reach the body underneath.
    /* ⚠️ MAY GO NEGATIVE, and that is what makes a rib a RIB. At 0 the strokes are tangent and the
     * valley between two of them only reaches the circle their spines ride — a 7% dip, which reads
     * as a scratch. Spaced slightly APART, the valley floor is the cake's own side a whole stroke
     * further in, and the rib stands up. It cannot show a hole: the body is right there behind. */
    { key: 'overlap', label: 'Overlap',  min: -0.2, max: 0.6, step: 0.02, default: d('overlap', 0.85), user: false },
    /* ⚠️ WITHOUT THIS THE STAR HAS NO VISIBLE SIDES. The scene's light is nearly a uniform dome, and
     * under one of those a surface's brightness barely depends on which way it faces — so two flanks
     * fifteen degrees apart shade identically and the whole stroke reads as one flat panel. Measured:
     * sheen, roughness and clearcoat all change it by nothing. What separates the faces in a
     * photograph is that a crease's own walls block the sky from it. See bakeCreaseAO. */
    /* ⚠️ CALIBRATED AGAINST A PHOTOGRAPH, and 1.0 is the answer rather than a maximum being abused.
     * Scanning one stroke across its middle and reading the luminance: the reference photo runs
     * 110..244, a range of 55% of its own maximum. Ours ran 191..241 — 21%, less than half the
     * contrast, which is every "too flat / too robotic / not like cream" note in this file. The
     * render's output is strongly compressive in albedo (a vertex colour of 0.2 still comes back at
     * 70% luminance), so the dial has to go to the top to reach it: at 1.0 we measure 106..241, a
     * range of 56%. Below 1 is a softer, milkier cream, which is a real look, not a broken one. */
    { key: 'ao',      label: 'Crease shade', min: 0, max: 1, step: 0.05, default: d('ao', 0.6), user: true },
    /* ⚠️ HOW HARD THE TIP WAS HELD AGAINST THE CAKE: 0 = the stroke is tangent to the side, all of
     * it showing — which is the DEFAULT, because that is what piping is. ⚠️ THE PIPING IS ON THE
     * SIDE, NOT SUNK IN. You cannot pipe inside a cake.
     * The body used to be raised until it swallowed the strokes — to stop the board showing through
     * the notches between them — and a star tip's creases run most of the way down a stroke's side,
     * so burying it buried them. The notches have their own answer: a collar at the foot. */
    { key: 'press',   label: 'Pressed in', min: 0, max: 1, step: 0.05, default: d('press', 0), user: true },
    { key: 'vary',    label: 'Hand vary',   min: 0, max: 0.6, step: 0.02, default: d('vary', 0.34),  user: false },
    /* How much each rope's own width breathes along its length, as a fraction of it. See the note
     * in creamWall's `feel`: this is a fraction of the ROPE, so it has to come down as the rope
     * goes up or the silhouette ripples. */
    { key: 'swell',   label: 'Hand swell',  min: 0, max: 0.3, step: 0.01, default: d('swell', 0.16), user: false },
    { key: 'wobble',  label: 'Hand wander', min: 0, max: 1,   step: 0.05, default: d('wobble', 0.85), user: false },
    /* The top. ⚠️ NOT PIPED, and not with the wall's tip. The reference cake's top is nearly flat
     * with a few soft rings in it — a palette knife set in the middle of a smoothed top while the
     * turntable spins. A coil of the same rope up there reads as heavy and busy, and that was the
     * verdict on every version of it. `swirl` is a coefficient of radius, and it is an order of
     * magnitude shallower than a rope on purpose. */
    { key: 'swirlTurns', label: 'Top rings', min: 2, max: 16,   step: 1,     default: d('swirlTurns', 7),  user: true },
    { key: 'swirl',      label: 'Top depth', min: 0, max: 0.04, step: 0.002, default: d('swirl', 0.012),   user: false },
  ];
}

export const CREAM_STYLES = {
  smooth: { label: 'Smooth', wall: 'smooth', params: [] },
  wave: {
    label: 'Cream Wave', wall: 'wave',
    params: [
      { key: 'relief',  label: 'Depth',      min: 0,    max: 0.12, step: 0.005, default: 0.06, user: true },
      { key: 'lobes',   label: 'Waviness',   min: 1,    max: 6,    step: 1,     default: 2,    user: true },
      // 'Ridges', matching the key and what it actually controls. It was labelled 'Bands', which
      // collides with the STRIPES colour feature landing on the same panel — one meaning ridge count
      // on the shape axis, the other colour on the colour axis. user:false, so nothing a baker sees.
      { key: 'ridges',  label: 'Ridges',     min: 3,    max: 16,   step: 1,     default: 6,    user: false },
      { key: 'waveAmp', label: 'Wave swing', min: 0,    max: 1,    step: 0.05,  default: 0.35, user: false },
      { key: 'ribbonW', label: 'Line width', min: 0.02, max: 0.2,  step: 0.01,  default: 0.05, user: false },
      { key: 'falloff', label: 'Top fade',   min: 0,    max: 1,    step: 0.05,  default: 0.4,  user: false },
    ],
  },
  swirl: {
    label: 'Swirl', wall: 'swirl',
    params: [
      { key: 'amp',   label: 'Depth',  min: 0, max: 0.1, step: 0.005, default: 0.045, user: true },
      { key: 'twist', label: 'Twist',  min: 0, max: 8,   step: 0.5,   default: 3.0,   user: true },
      { key: 'lobes', label: 'Ridges', min: 3, max: 18,  step: 1,     default: 9,     user: false },
    ],
  },
  // Ribbed — fat rounded HORIZONTAL ribs (rib-comb finish). Geometry wall (real displacement);
  // `relief` = rib depth (coeff of radius), `bands` = rib count up the wall, `round` shapes the tube.
  ribbed: {
    label: 'Ribbed', wall: 'ribbed',
    params: [
      { key: 'relief', label: 'Depth',     min: 0,   max: 0.12, step: 0.005, default: 0.04, user: true },
      { key: 'bands',  label: 'Ribs',      min: 4,   max: 24,   step: 1,     default: 12,   user: true },
      { key: 'round',  label: 'Roundness', min: 0.4, max: 2,    step: 0.1,   default: 1.0,  user: false },
    ],
  },
  /* Piped — vertical STROKES piped up the wall, and the same rope coiled across the top.
   *
   * ⚠️ ONE ROW PER TIP, AND THE TIP IS A CREAM PEN NOZZLE. `nozzle` names a key in
   * `geometry/creamPen.js` — the ten real tips the freehand pen already pipes with (Open Star 1M,
   * 6-Star, Closed Star, Jumbo, French, Fine French, Round, Bead, Drop, Petal). The wall sweeps that
   * tip's own cross-section, so a 1M on a wall and a 1M in the pen are the same object, and adding
   * "Piped — French tip" is a row here and nothing else anywhere.
   *
   * `wall`, `top` and the schema are identical across the rows; only the tip and its numbers differ.
   */
  /* ⚠️ THE RIB A VIEWER COUNTS IS THE STROKE, NOT A POINT OF THE STAR — which is the whole reason
   * this kept reading as hatching. Counted off a photograph of a finished cake: about 22 ribs across
   * the visible width, each roughly a tenth of the radius. Forty-odd strokes round the tier, and ONE
   * RIB IS ONE STROKE. A twelve-point tip draws twelve slots inside every one of those, so the wall
   * carried five hundred lines where the photograph has forty — sub-pixel detail that adds up to
   * nothing but noise.
   *
   * So the tip is chosen so that a stroke reads as ONE fat column: five points put under two on the
   * face, which is a broad rib with a hint of a line down it, exactly what the photograph shows.
   * `star12` is still in the registry for a close-up, where the twelve do resolve. */
  /* ⚠️ TWELVE POINTS WAS TRIED AND PUT BACK, and the arithmetic is why. Six points land in the
   * visible HALF of a tube, but the two nearest ±90° sit at the SILHOUETTE — edge-on they compress
   * to a line, and on a wall the silhouette is exactly where the neighbouring stroke meets it, so
   * the neighbour covers them too. `lobes/3` read, never `lobes/2`.
   *
   * Which makes twelve points a BIG tip: the ribs a viewer counts are `ropes × lobes/3`, so four
   * ribs per stroke means a quarter as many strokes for the same rib count — 15 strokes each 40% of
   * the radius wide, against 35 at 18%. It renders, and it is in the harness as `?noz=star12`, but
   * it is not this wall. Five points at 0.60in is.
   */
  piped: { label: 'Piped — star tip', wall: 'piped', top: 'spiral', nozzle: 'star5',
           params: pipedParams({ width: 0.6 }) },
  /* ⚠️ KEPT BECAUSE IT IS A LOOK, not because it is a stage on the way to another one. Fine ropes
   * standing close together on the cake's side, each barely wider than a pencil — it reads as a
   * curtain of vertical strands rather than as the bold ribbed wall `piped` is aiming at, and
   * Sandeep asked for it to be saved rather than tuned away. Every number is the state it was in
   * when that was decided; change `piped` freely, leave this alone.
   */
  piped_fine: {
    label: 'Piped — fine ropes', wall: 'piped', top: 'spiral', nozzle: 'star5',
    params: pipedParams({ width: 0.6, overlap: 0.85, press: 0, ao: 0.6, vary: 0.34, wobble: 0.85 }),
  },
  /* ⚠️ THE MEASURED ONE. Every row above guesses at the cross-section a star tip leaves; this one
   * does not. A generated mesh of a single real vertical stroke was sliced at nineteen heights and
   * each r(θ) loop run through a DFT: eight lobes, amplitude 17% of the mean radius, and nothing
   * above the rib frequency — a pure cosine, not a star polygon, and a cut of 29% where our star5
   * and star8 cut 50%. The flat facets were also why the ribs read as one merged panel: under this
   * scene's near-uniform dome a flat face has ONE brightness, so eight of them come out at eight
   * near-equal whites. A rounded rib sweeps its normal across its own width and always carries a
   * bright crest and a dark crease. See rosetteProfile in creamPen.js for the numbers.
   *
   * AO is lower than the star rows because the measurement says so too: the reference photograph's
   * creases are soft grey lines, not black ones. The cue is the gradient over each rib.
   */
  /* ⚠️ ONE INCH AND BUTTED, i.e. SIXTEEN strokes round a 6" cake — and every piped row above draws
   * more than sixty. That is not a taste call either. A piped vertical stroke is 4.2 times as tall
   * as it is wide: measured on a photograph of one (1230px by 290px) and, independently, on a
   * generated mesh of one (1.901 by 0.456). On a 4" tall tier that fixes the VISIBLE width of a
   * stroke at 1.2/4.2 ≈ 0.29 world, and the visible width is the SPACING, not the nozzle — at
   * overlap 0.85 a rope hides 46% of itself in its neighbour, which is the whole reason the wall
   * kept coming out as a lampshade of thin lines. 0.5in at 0.85 gives a stroke of 14.8:1.
   *
   * ⚠️ THIS IS THE APPROVED STROKE, REPEATED — NOT A SECOND TUNING OF IT. The width is derived
   * straight from the stroke that was signed off in the one-stroke view: it measures 4.4 times as
   * tall as it is wide, so on a 1.2-tall tier it is 0.273 across, which is a 0.91in tip, and
   * eighteen of them go round a 0.9 radius touching. ⚠️ Every earlier attempt at this wall changed
   * the tip as well as the placement — a spread section, a different lobe count, a different depth,
   * a heavy overlap — so the thing that reached the cake was never the thing that had been
   * approved. If the single-stroke view is right and the wall is wrong, change the PLACEMENT.
   *
   * ⚠️ NOT the spread section, which is wrong here for a
   * reason worth writing down because it took two goes to see. A squashed rope is widest at its
   * WAIST, not at its crest — so from outside you only ever see the narrow top of each one and its
   * wide part is buried behind its neighbours. The wall came out as thin fins standing off a flat
   * body with daylight between them, and every measurement looked right: the ropes really were
   * 0.30 wide and really did overlap, just not at the height you can see.
   *
   * What covers a wall is round tubes pushed well into each other. Two circles of radius t whose
   * centres are s apart meet at a depth `t − √(t² − (s/2)²)` below the crest, so the valley is
   * shallow only when s is well under the diameter — at 0.95 of it the valley is 68% of a radius,
   * at 0.6 it is a fifth. That is the high-overlap regime that used to hide the ribs, and it
   * stopped mattering at twelve lobes: a rope showing 60% of itself still shows six of them.
   */
  piped_rope: {
    label: 'Piped — rope', wall: 'piped', top: 'spiral', nozzle: 'lobe12',
    params: pipedParams({ width: 0.91, overlap: 0.02, ao: 0.55, swell: 0.05, vary: 0.10, wobble: 0.3 }),
  },
  /* ⚠️ THE MODELLED ONE — the only wall here that is not extruded. Every row above sweeps a nozzle
   * section along a centreline, which is the honest way to model a tip being dragged and is why
   * they were all still being tuned after two days: a stroke's SURFACE is not what its tip cuts.
   * Cream tears as it leaves the tip, folds where the ribs meet and slumps under its own weight, and
   * none of that is in the section. This row pipes a SCAN of one real vertical stroke instead, and
   * the ribs, the ripple down each one and the torn edges come with it.
   *
   * ⚠️ THE MESH IS THE SIGNED-OFF STROKE. It was approved in the one-stroke view beside the
   * reference photograph (aspect 4.4:1 against the photo's 4.35, four creases across the face
   * against four) and it is REPEATED here, not re-tuned. The only numbers in this row are placement
   * numbers. If the wall looks wrong, change them; do not touch the mesh.
   *
   * `strokeGlb` is an R2 key, resolved against the host's assets base by canvas/strokeMesh.js — the
   * same path every other 3D asset in this app takes. The DB may override it (config.strokeGlb), so
   * a re-scanned stroke is an admin edit rather than a release.
   */
  piped_modelled: {
    label: 'Piped — star tip (modelled)', wall: 'strokes',
    strokeGlb: 'elements/3D-images/piping-stroke-vertical.glb',
    /* ⚠️ NO `top`. The piped rows above finish with a spiral lid because a swept section can be
     * spiralled onto one; there is no scan of a piped TOP, and faking it with the old spiral would
     * put a different cream on the lid from the sides. The reference photograph is a smooth-topped
     * cake with piped sides, which is what this renders. */
    params: strokeParams({}),
  },
  piped_french: {
    label: 'Piped — French tip', wall: 'piped', top: 'spiral', nozzle: 'french',
    // Sixteen fine flutes instead of five deep points: the ribs are the texture, not the silhouette.
    params: pipedParams({}),
  },
  piped_closed: {
    label: 'Piped — closed star', wall: 'piped', top: 'spiral', nozzle: 'closed',
    params: pipedParams({}),
  },
  piped_round: {
    label: 'Piped — round tip', wall: 'piped', top: 'spiral', nozzle: 'round',
    // A smooth rope reads as one rib where a star reads as five, so it takes a finer, denser stroke
    // to cover the same cake without looking like a bundle of sausages.
    params: pipedParams({ width: 0.38 }),
  },
  // Rustic is a NORMAL-MAP finish (palette-knife strokes are fine directional detail — geometry
  // displacement can't carry comb lines at sane mesh density). wall stays smooth; surfaceMap drives
  // the material. `depth` = normalScale (bump strength); `scale` = stroke-tiling density on the wall.
  rustic: {
    label: 'Rustic', wall: 'smooth', surfaceMap: 'rustic',
    params: [
      { key: 'depth', label: 'Depth',     min: 0, max: 2,  step: 0.1, default: 1.0, user: true },
      { key: 'scale', label: 'Roughness', min: 3, max: 20, step: 1,   default: 9,   user: false },
    ],
  },
  // Chevron Weave — first of the stencil-pressed "Weave" finish family. HYBRID relief: a shallow real
  // wall displacement (wall:'weave', the shared weave ENGINE) for true groove shadow + a normal map
  // (surfaceMap:'weave') baked from the same field for crisp lines + buttercream grain. `relief` =
  // groove depth (coeff of radius), `tile` = cell size, `grooves` = lines per cell, `depth` →
  // normalScale. Future siblings (basket_weave, lattice_weave…) reuse wall/surfaceMap 'weave' with a
  // different motif field — the key here is the SPECIFIC pattern; 'weave' is the generic engine.
  chevron_weave: {
    label: 'Chevron Weave', wall: 'weave', surfaceMap: 'weave',
    params: [
      { key: 'relief',  label: 'Depth',      min: 0,   max: 0.06, step: 0.002, default: 0.012, user: true },
      { key: 'tile',    label: 'Cell size',  min: 0.4, max: 1.6,  step: 0.05,  default: 0.8,  user: true },
      { key: 'grooves', label: 'Lines',      min: 2,   max: 10,   step: 1,     default: 5,    user: true },
      { key: 'depth',   label: 'Line crisp', min: 0,   max: 2,    step: 0.05,  default: 0.4,  user: false },
      { key: 'grain',   label: 'Buttercream',min: 0,   max: 0.4,  step: 0.02,  default: 0.12, user: true },
      { key: 'width',   label: 'Line width', min: 0.2, max: 0.9,  step: 0.05,  default: 0.62, user: false },
      { key: 'border',  label: 'Cell edge',  min: 0,   max: 0.8,  step: 0.05,  default: 0,    user: false },
    ],
  },
};

export const STYLE_ORDER = ['smooth', 'wave', 'swirl', 'ribbed', 'piped', 'piped_modelled', 'piped_rope', 'piped_fine', 'piped_french', 'piped_closed', 'piped_round', 'rustic', 'chevron_weave'];
export const DEFAULT_STYLE = 'smooth';

export const styleDef = (style) => CREAM_STYLES[style] ?? CREAM_STYLES[DEFAULT_STYLE];

// [{ value, label }] for the style picker, in display order. A FUNCTION (not a const) so it reflects
// any DB overlay applied at runtime via applyTextureConfig (Phase 2).
export const frostingStyleTypes = () => STYLE_ORDER.map(value => ({ value, label: styleDef(value).label }));

// Overlay DB-authored textures (cake_textures) onto the in-code SEED. Each row: { key, label,
// algorithm, config:{ params, surfaceMap } }. Styles absent from the DB keep their seed (so the
// designer still works offline / before the table is seeded). `algorithm` is the wall strategy key.
// Each field falls back to the seed when the DB row omits it, so an older/partial row still renders.
export function applyTextureConfig(rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (!row?.key) continue;
    const seed = CREAM_STYLES[row.key];
    CREAM_STYLES[row.key] = {
      label: row.label ?? seed?.label ?? row.key,
      wall: row.algorithm ?? seed?.wall ?? row.key,
      top: row.config?.top ?? seed?.top,                       // 'spiral' | undefined — the LID strategy
      nozzle: row.config?.nozzle ?? seed?.nozzle,              // 'star' | 'round' — which tip (NOZZLES)
      strokeGlb: row.config?.strokeGlb ?? seed?.strokeGlb,     // R2 key of the stroke MESH (wall:'strokes')
      surfaceMap: row.config?.surfaceMap ?? seed?.surfaceMap,   // normal-map finishes carry this in config
      params: Array.isArray(row.config?.params) ? row.config.params : (seed?.params ?? []),
    };
    if (!STYLE_ORDER.includes(row.key)) STYLE_ORDER.push(row.key);
  }
}

// Param schema for a style; the user-facing subset; and the resolved values (defaults ← overrides)
// that the geometry reads.
export const styleParamSchema = (style) => styleDef(style).params ?? [];
export const userStyleParams = (style) => styleParamSchema(style).filter(p => p.user);
export function resolveStyleParams(style, overrides) {
  const out = {};
  for (const p of styleParamSchema(style)) out[p.key] = overrides?.[p.key] ?? p.default;
  return out;
}
