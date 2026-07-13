// ── Cake shapes — the catalog of footprints a cake can have ───────────────────
//
// A tier names its shape by KEY (`design.tiers[i].shape`); this catalog says what that key MEANS:
// a `family` (the data↔code seam — a generator in geometry/shapes.js, or one of the two analytic
// families below) plus a `config` of proportions. Same shape and same seam as creamStyles /
// textStyles / cake_textures: a code SEED, overlaid by `cake_shapes` DB rows via
// applyCakeShapeConfig, so admin can author a new shape — or retune an existing one — without a
// deploy.
//
// Two families are ANALYTIC and keep their exact existing math in geometry/surface.js:
//   • `circle`       → { kind: 'round' } — the cylinder path, with its lathe, cream wall styles and
//                      finishes. Untouched.
//   • `rounded_rect` → { kind: 'rect' }  — the sheet-cake prism, with its rounded corners and its
//                      arc-length piping ring. Untouched.
// Every other family is an OUTLINE (heart, butterfly, polygon, oval) and renders through the generic
// polygon path. Keeping the two originals analytic is not an optimisation, it is the no-regression
// guarantee: every cake that exists today takes byte-identical code to the one it took before.
//
// The seed keys `round` and `rect` are LOAD-BEARING — they are what existing designs already store
// (`shape: 'rect'`, or absent ⇒ round). They must never be renamed or removed.

// The seed. A host that cannot reach the API (or an empty table) still renders every shape here.
export const CAKE_SHAPES = {
  round:     { label: 'Round',     family: 'circle',       config: {} },
  rect:      { label: 'Rectangle', family: 'rounded_rect', config: {} },
  square:    { label: 'Square',    family: 'rounded_rect', config: { square: true } },
  heart:     { label: 'Heart',     family: 'heart',        config: { plump: 1, cleft: 1 } },
  butterfly: { label: 'Butterfly', family: 'butterfly',    config: { wing: 1 } },
  hexagon:   { label: 'Hexagon',   family: 'polygon',      config: { sides: 6, rotation: 0 } },
  oval:      { label: 'Oval',      family: 'oval',         config: {} },
};

// Overlay DB-authored rows onto the seed. An unknown key simply becomes a new entry — which is the
// point: a new shape is a row, not a release.
export function applyCakeShapeConfig(rows) {
  for (const row of rows || []) {
    if (!row?.key) continue;
    CAKE_SHAPES[row.key] = {
      label: row.label ?? row.key,
      family: row.family ?? CAKE_SHAPES[row.key]?.family ?? 'circle',
      config: row.config || {},
    };
  }
}

// The definition a tier's `shape` key resolves to. An unknown key falls back to ROUND rather than
// throwing or rendering nothing: a design whose shape row was deactivated must still show a cake.
export function cakeShapeDef(key) {
  return CAKE_SHAPES[key] || CAKE_SHAPES.round;
}

// The shapes a picker offers, in catalog order.
export function cakeShapeList() {
  return Object.entries(CAKE_SHAPES).map(([key, def]) => ({ key, ...def }));
}
