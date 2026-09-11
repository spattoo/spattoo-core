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
    { key: 'ao',      label: 'Crease shade', min: 0, max: 1, step: 0.05, default: d('ao', 0.6), user: true },
    /* ⚠️ HOW HARD THE TIP WAS HELD AGAINST THE CAKE: 0 = the stroke is tangent to the side, all of
     * it showing — which is the DEFAULT, because that is what piping is. ⚠️ THE PIPING IS ON THE
     * SIDE, NOT SUNK IN. You cannot pipe inside a cake.
     * The body used to be raised until it swallowed the strokes — to stop the board showing through
     * the notches between them — and a star tip's creases run most of the way down a stroke's side,
     * so burying it buried them. The notches have their own answer: a collar at the foot. */
    { key: 'press',   label: 'Pressed in', min: 0, max: 1, step: 0.05, default: d('press', 0), user: true },
    { key: 'vary',    label: 'Hand vary',   min: 0, max: 0.6, step: 0.02, default: d('vary', 0.34),  user: false },
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

export const STYLE_ORDER = ['smooth', 'wave', 'swirl', 'ribbed', 'piped', 'piped_fine', 'piped_french', 'piped_closed', 'piped_round', 'rustic', 'chevron_weave'];
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
