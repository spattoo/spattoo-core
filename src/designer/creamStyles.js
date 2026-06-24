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
      { key: 'ridges',  label: 'Bands',      min: 3,    max: 16,   step: 1,     default: 6,    user: false },
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

export const STYLE_ORDER = ['smooth', 'wave', 'swirl', 'ribbed', 'rustic', 'chevron_weave'];
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
