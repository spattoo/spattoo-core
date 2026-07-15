// ── Design snapshot ─────────────────────────────────────────────────────────────────────────
// The ONE serializer that turns the live cake `design` into the persisted snapshot shape. Shared by
// order placement, template save, and the invite "share the draft" flow — so a design a customer
// RESUMES from an invite is byte-identical to what an order would store, and there is a single place
// to keep in sync when the design model grows (previously copy-pasted across handleOrder +
// handleSaveTemplate, which silently drifted before — e.g. writing/piping were dropped on order).
//
// Note: per-tier `decorations`/`texts`/`ages` are intentionally empty — those live at the TOP level
// (`stickers`/`texts`/`ages`); the per-tier arrays are legacy and kept only for snapshot shape.

// The optional per-tier fields that must round-trip snapshot ⇄ live design. SINGLE source of truth
// for both directions — buildDesignSnapshot (serialize) and normalizeDesign (hydrate) — so adding a
// new tier treatment is one edit here, never two lists that silently drift (that drift is what
// dropped writing/piping on order before).
// `shapeFamily` + `shapeConfig` make a tier's GEOMETRY self-contained: the outline generator and its
// proportions travel WITH the design, so a saved cake renders identically forever even if its catalog
// row is later retuned or retired (snapshot immutability), and a cake can mix shapes per tier without
// every tier sharing one family. A design authored before these existed carries only the `shape` key
// and resolves geometry through the catalog (see tierGeometry) — that fallback is why they stay optional.
export const OPTIONAL_TIER_FIELDS = ['radius', 'height', 'shape', 'shapeFamily', 'shapeConfig', 'width', 'depth', 'cornerR', 'gradient', 'dusting', 'foil'];

// Copy only the present (non-null) optional tier fields → a spreadable object. Used in both directions.
export function pickTierFields(t) {
  const out = {};
  for (const k of OPTIONAL_TIER_FIELDS) if (t?.[k] != null) out[k] = t[k];
  return out;
}

// Cake shape derived from the bottom tier: a rect with equal sides reads as a square.
export function cakeShapeOf(design) {
  const t0 = design?.tiers?.[0];
  return t0?.shape === 'rect'
    ? (Math.abs((t0.width ?? 0) - (t0.depth ?? 0)) < 1e-3 ? 'square' : 'rectangle')
    : 'round';
}

export function buildDesignSnapshot(design) {
  return {
    shape: cakeShapeOf(design),
    tiers: design.tiers.map(t => ({
      color:         t.color,
      topPipings:    t.topPipings    ?? [],
      bottomPipings: t.bottomPipings ?? [],
      decorations:   [],
      texts:         [],
      ages:          [],
      // Dimensions + wall treatments (gradient/dust/foil) that must survive the round-trip.
      ...pickTierFields(t),
    })),
    texts:    design.texts,
    ages:     design.ages,
    stickers: design.stickers,
    writing:  design.writing ?? null,   // typed cream lettering
    piping:   design.piping ?? [],       // freehand cream-pen strokes
  };
}
