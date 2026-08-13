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

// The seed is ONLY the two shapes that must exist: `round` and `rect` are what existing designs already
// store (or nothing, which means round), so the code has to be able to render them with no DB at all.
//
// Every OTHER shape is AUTHORED — a row admin creates in the Cake Shape Studio from one of the curves
// in geometry/shapes.js, saved when its proportions look right. The code ships the CURVES; it does not
// ship a heart. Seeding a "Heart" here (or in the migration) would be the code deciding what a heart
// looks like, which is a decision that belongs to whoever is looking at the cake.
export const CAKE_SHAPES = {
  round: { label: 'Round',     family: 'circle',       config: {} },
  rect:  { label: 'Rectangle', family: 'rounded_rect', config: {} },
};

// A design tier → the { width, depth, height } stack entry the studio sliders and starterDesign speak.
// A round tier is sized by RADIUS (its diameter is the width); every other footprint by width/depth.
function stackEntry(t) {
  const dia = t?.radius != null ? t.radius * 2 : undefined;
  return { width: t?.width ?? dia, depth: t?.depth ?? dia, height: t?.height };
}

// Overlay DB-authored rows onto the seed. An unknown key simply becomes a new entry — which is the
// point: a new shape is a row, not a release.
//
// A row now carries a self-contained `design` (the SAME shape as a cake_templates.design) — its
// geometry lives on the design's tiers (shapeFamily + shapeConfig), not in its own columns. We still
// derive `family`/`config`/`tiers` onto the catalog entry so the studio and the legacy render fallback
// read one field name regardless; rows that predate `design` fall back to their own columns unchanged.
export function applyCakeShapeConfig(rows) {
  for (const row of rows || []) {
    if (!row?.key) continue;
    const design = row.design ?? null;
    const t0 = design?.tiers?.[0];
    CAKE_SHAPES[row.key] = {
      label: row.label ?? row.key,
      family: t0?.shapeFamily ?? row.family ?? CAKE_SHAPES[row.key]?.family ?? 'circle',
      config: t0?.shapeConfig ?? row.config ?? {},
      // The STACK this shape starts a cake with — [{width, depth, height}, …]. Empty means "one tier at
      // the designer's default", which is what every row meant before shapes could be multi-tier, so an
      // empty stack is an answer and not a gap.
      tiers: design?.tiers ? design.tiers.map(stackEntry) : (Array.isArray(row.tiers) ? row.tiers : []),
      // A FRONT VIEW of this shape, rendered through the real designer renderer when it was saved. The
      // picker draws this rather than a live 3D tile — an <img> costs nothing at any catalog size.
      thumbnailKey: row.thumbnail_key ?? null,
      // The whole self-contained starter design. "New cake → this shape" loads this exactly as a
      // template would, so a starter authored with a stack/frosting comes back intact. Seed round/rect
      // have none and are built on the fly by starterDesign.
      design,
    };
  }
}

// The geometry a tier renders as — its family curve and that curve's proportions — read from the TIER
// ITSELF, so a design describes its own shape and never depends on the catalog still holding (or still
// agreeing with) the row it was cut from. A design authored before geometry was self-contained carries
// only a `shape` KEY; that path resolves through the catalog (the seed + the DB overlay), which is why
// both still exist. This is the ONE place the resolution lives — tierShape (surface.js) and
// toCanvasConfig both call it, so the two can never drift.
export function tierGeometry(tier) {
  if (tier?.shapeFamily) return { family: tier.shapeFamily, config: tier.shapeConfig ?? {} };
  const def = cakeShapeDef(tier?.shape);
  return { family: def.family, config: def.config ?? {} };
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
