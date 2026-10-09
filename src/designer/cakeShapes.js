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

/* ── Grouping the catalog by footprint ───────────────────────────────────────
 *
 * "Catalog order" above is the SEED's two keys followed by DB rows in whatever order the API
 * returned them — which is the order an admin happened to create them in, and reads as random by the
 * time there are twelve. Sandeep: *"it would be nice if all round are at one place and all
 * rectangular are at one place. i think we already have root shape."*
 *
 * The root shape is `family`, and it was already here — every entry carries one, derived from its
 * first tier by applyCakeShapeConfig. So this groups by what a shape REPORTS ABOUT ITSELF and never
 * by a list of keys: a hardcoded `['round','tall-round','2-tier']` would be type-driven, and it
 * would go wrong the first time somebody authors a shape in the Cake Shape Studio — which is the one
 * thing that studio exists to make possible without a release.
 *
 * ⚠️ THE LAST GROUP IS A CATCH-ALL, NOT A FILTER, and that is the load-bearing part. If this table
 * does not know a family, that shape lands in "More shapes" — it never disappears. A picker that
 * silently drops a row an admin authored and published is the same failure check:placement-slots
 * exists to prevent one surface over: nothing errors, nothing logs, the tile is simply not there.
 * Any change here must keep a `families: null` entry last.
 *
 * ⚠️ ORDER WITHIN A GROUP IS STILL UNANSWERED. `cake_shapes` has no sort column, so Quarter / Half /
 * Full Sheet come back in API order and will sit in an arbitrary order inside a tidy group. Size is
 * guessable from the `tiers` stack, but "which shape do we show first" is a judgement that belongs
 * to an admin, not to a sort function — so this deliberately preserves catalog order within each
 * group rather than inventing one. The real fix is a column and a field in the studio.
 *
 * Group ORDER is a code-level judgement because families are a code-level concept (the generators in
 * geometry/shapes.js). Round leads because a round single tier is the most-ordered cake there is,
 * which is INVARIANTS #12 — lay a surface out by how often each control is used — and here it
 * happens to agree with grouping, so there is no tension to resolve. */
export const SHAPE_GROUPS = Object.freeze([
  { key: 'round',  label: 'Round',             families: ['circle'] },
  { key: 'rect',   label: 'Rectangle',         families: ['rounded_rect'] },
  { key: 'shaped', label: 'Shaped',            families: ['heart', 'butterfly', 'polygon', 'oval'] },
  { key: 'glyph',  label: 'Letters & numbers', families: ['letter', 'number'] },
  { key: 'more',   label: 'More shapes',       families: null },   // ⚠️ catch-all — must stay last
]);

/**
 * The picker's shapes, bucketed by footprint.
 *
 * @param   {Array} shapes  what the caller is offering — cakeShapeList(), or a filtered subset. Passed
 *                          in rather than read from the module for the reason ShapePicker already
 *                          states: the caller owns the one list the grid and the tier's Shape row
 *                          both read.
 * @returns {Array} `[{ key, label, shapes }]` in SHAPE_GROUPS order, empty groups dropped. Every
 *                  input shape appears in exactly one group.
 */
export function cakeShapeGroups(shapes) {
  const buckets = new Map(SHAPE_GROUPS.map(g => [g.key, []]));
  const catchAll = SHAPE_GROUPS.find(g => g.families == null)?.key ?? SHAPE_GROUPS.at(-1).key;

  for (const s of shapes || []) {
    const fam = s?.family;
    const group = SHAPE_GROUPS.find(g => g.families?.includes(fam));
    buckets.get(group ? group.key : catchAll).push(s);
  }

  return SHAPE_GROUPS
    .map(g => ({ key: g.key, label: g.label, shapes: buckets.get(g.key) }))
    .filter(g => g.shapes.length > 0);
}
