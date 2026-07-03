// ── Design snapshot ─────────────────────────────────────────────────────────────────────────
// The ONE serializer that turns the live cake `design` into the persisted snapshot shape. Shared by
// order placement, template save, and the invite "share the draft" flow — so a design a customer
// RESUMES from an invite is byte-identical to what an order would store, and there is a single place
// to keep in sync when the design model grows (previously copy-pasted across handleOrder +
// handleSaveTemplate, which silently drifted before — e.g. writing/piping were dropped on order).
//
// Note: per-tier `decorations`/`texts`/`ages` are intentionally empty — those live at the TOP level
// (`stickers`/`texts`/`ages`); the per-tier arrays are legacy and kept only for snapshot shape.

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
      ...(t.radius  != null && { radius:  t.radius }),
      ...(t.height  != null && { height:  t.height }),
      ...(t.shape   != null && { shape:   t.shape }),
      ...(t.width   != null && { width:   t.width }),
      ...(t.depth   != null && { depth:   t.depth }),
      ...(t.cornerR != null && { cornerR: t.cornerR }),
      // Per-tier wall treatments (gradient fill, luster dust, gold-leaf foil) — must
      // survive the snapshot + reload round-trip.
      ...(t.gradient != null && { gradient: t.gradient }),
      ...(t.dusting  != null && { dusting:  t.dusting }),
      ...(t.foil     != null && { foil:     t.foil }),
    })),
    texts:    design.texts,
    ages:     design.ages,
    stickers: design.stickers,
    writing:  design.writing ?? null,   // typed cream lettering
    piping:   design.piping ?? [],       // freehand cream-pen strokes
  };
}
