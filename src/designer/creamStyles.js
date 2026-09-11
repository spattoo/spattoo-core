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
  // Piped — vertical ROPES dragged straight up the wall with a star tip. The same rounded tube as
  // `ribbed` (one shared `ribbedProfile`), turned through ninety degrees: ribbed repeats up the
  // height, this repeats around the circumference. `relief` = rope depth (coeff of radius), `ropes` =
  // how many around, `round` fattens (>1) or flattens (<1) the tube.
  /* `top: 'spiral'` is the OTHER half of the reference cake: the same star tip coiled flat across the
   * lid. It is a separate KEY from `wall` because the two axes are independent — a future style can
   * pipe the sides and leave the top smooth, or the reverse — and because a top is resolved by the
   * same `buildStyledTop(wall, top, …)` switch that `wall` gets, never by a branch on the style name. */
  piped: {
    label: 'Piped Ropes', wall: 'piped', top: 'spiral',
    params: [
      { key: 'relief', label: 'Depth',     min: 0,   max: 0.12, step: 0.005, default: 0.06, user: true },
      { key: 'ropes',  label: 'Ropes',     min: 8,   max: 48,   step: 1,     default: 30,   user: true },
      // ⚠️ BELOW 1, and that is the whole difference between cream and folded card. `round` is an
      // exponent on sin²: at 1.0 the profile sits near zero across a wide band, so the wall is FLAT
      // PANELS meeting at a fold. Below 0.5 it climbs straight off the valley — a narrow groove with
      // a round tube either side, which is what a star tip leaves. Judged on the real scene.
      { key: 'round',  label: 'Roundness', min: 0.3, max: 1.2,  step: 0.05,  default: 0.45, user: false },
      // The two that stop it reading as a turned vase — see displacePiped.
      { key: 'vary',   label: 'Hand vary', min: 0,   max: 0.6,  step: 0.02,  default: 0.28, user: false },
      { key: 'wobble', label: 'Lean',      min: 0,   max: 1.5,  step: 0.05,  default: 0.10, user: false },
      // The star tip's teeth — fine ridges running ALONG each stroke. This is what separates a piped
      // rope from a moulded flute, and no amount of roundness substitutes for it.
      { key: 'teeth',      label: 'Tip points', min: 0, max: 8,   step: 1,    default: 4,    user: false },
      // ⚠️ 0.18, NOT deeper. Rendered 0.10 / 0.18 / 0.30 side by side: at 0.30 the teeth cut most of
      // the way through the stroke and the wall reads SHREDDED — torn paper strips, not cream — and
      // the crown at the rim turns to spikes. At 0.10 the strokes are smooth flutes with no tip in
      // them at all. 0.18 is the one that keeps a whole rounded stroke with the star's lines on it.
      { key: 'teethDepth', label: 'Tip depth',  min: 0, max: 0.4, step: 0.02, default: 0.18, user: false },
      // The top coil. `relief`, `round`, `teeth` and `teethDepth` are SHARED with the wall — it is the
      // same nozzle, so a coil that could be sized apart from the strokes would only ever be set wrong.
      /* ⚠️ 5 BECAUSE THE WALL HAS 30 ROPES, not because 5 looked nice. It is the same nozzle, so the
       * coil has to be as wide as a stroke: a stroke is 2πr/ropes ≈ 0.21r across, a coil's pitch is
       * r/coils, and those agree at coils = ropes/τ ≈ 5. Rendered 4 / 5 / 6 / 7 / 10 — 7 and above
       * read as the groove of a record, and only the widths that match the wall read as one bag of
       * cream finishing a cake. Change `ropes` and this wants changing with it. */
      { key: 'coils',  label: 'Top coils',  min: 3, max: 14,  step: 1,    default: 5,   user: true },
      { key: 'centre', label: 'Top peak',   min: 0, max: 2,   step: 0.1,  default: 0.9, user: false },
    ],
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

export const STYLE_ORDER = ['smooth', 'wave', 'swirl', 'ribbed', 'piped', 'rustic', 'chevron_weave'];
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
