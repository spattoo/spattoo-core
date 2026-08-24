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
// `frostingType`/`frostingStyle`/`styleParams` are the tier's FINISH — as essential to the round-trip as
// its gradient or dimensions. Without them a saved non-buttercream cake (fondant, whipped, GLAZE) reloads
// with the finish absent → toCanvasConfig defaults it to buttercream and the finish is silently lost. They
// were missing here; a glaze design would come back plain. (Backward-compatible: absent on an old snapshot
// → still defaults, exactly as before; present on a new one → restored.)
// `grass` and `creamLayers` were missing, and both were lost the same way glaze was: added to the
// cake, never added to this list. A template saved with piped grass on its top came back bald, and
// its THUMBNAIL still showed the grass — the picture is captured from the canvas, not from the
// snapshot, so the two disagreed with nothing to say so. See the round-trip guard in the test.
// `stripes` (several colours up the wall) is a wall treatment exactly like `gradient`, and it is on
// this list from the day it shipped rather than after a baker lost one — the three notes above are
// each a feature that reloaded plain because somebody added it to the cake and not to this line.
// `rainbows` is on it from the same day, for the same reason. Note the shape: an ARRAY, so `pickTierFields`
// keeps it when present — an empty one is dropped, which is right, since no rainbows and no field
// are the same cake.
export const OPTIONAL_TIER_FIELDS = ['radius', 'height', 'shape', 'shapeFamily', 'shapeConfig', 'width', 'depth', 'cornerR', 'frostingType', 'frostingStyle', 'styleParams', 'gradient', 'stripes', 'glaze', 'dusting', 'grass', 'foil', 'creamLayers', 'rainbows'];

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

// ── A message, whichever shape it is in ─────────────────────────────────────────────────────────
// `writings` became a LIST on 2026-08-22: `surface` lives on the writing, so one object could only
// ever be on the top OR the side OR the board, and a cake wanting "9" on the side and a name on the
// board had no way to ask.
//
// Every design saved before then carries a single nullable `writing` OBJECT. This reads both, and it
// lives HERE — beside the serializer — because BOTH ends of the round-trip need it: normalizeDesign
// promotes on the way in, and this promotes on the way OUT. Reading only on the way in was not
// enough; buildDesignSnapshot dropped a legacy message before normalizeDesign ever saw it, so
// re-saving an old cake silently lost its writing. The test found that, not review.
export function writingsOf(design) {
  if (Array.isArray(design?.writings)) return design.writings;
  return design?.writing ? [design.writing] : [];
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
    // A LIST since 2026-08-22: `surface` lives on the writing, so one object could only ever be on
    // the top or the side or the board. Saved designs from before carry a single `writing` object;
    // normalizeDesign promotes it, so nothing downstream has to know both shapes.
    writings: writingsOf(design),           // typed cream lettering, one per placement
    piping:   design.piping ?? [],          // freehand cream-pen strokes
    // Design-level, not per-tier, because the BOARD is: a ring of grass round the cake's foot and a
    // name spelled in fondant cubes both stand on it, not on any one tier.
    boardGrass: design.boardGrass ?? null,
    nameBlocks: design.nameBlocks ?? null,
  };
}
