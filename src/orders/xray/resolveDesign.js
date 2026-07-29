// ── Which design does X-Ray read for this order? ─────────────────────────────────────────────────
// An order can carry its design in one of three places, and every X-Ray surface — the screen, the
// printable PDF, the launcher that decides whether to offer the report at all — has to pick the
// same one. So the choice is made ONCE, here, for the same reason report.js computes the report's
// CONTENT once: two copies of this rule would drift, and the drift would be silent. The sheet in
// the kitchen would be built from a different design than the screen in the office.
//
//   design_snapshot          the baker built it in the 3D designer. Authoritative, measured.
//   design_estimate_edited   the baker corrected what the model read off a reference photo.
//   design_estimate          what the model read off a reference photo, untouched.
//
// PRECEDENCE, and why it is that way round:
//
// A real snapshot always wins. A designed order needs nothing inferred, and letting an estimate
// shadow an authored design would replace measured data with a guess.
//
// Corrections beat the raw estimate, because a baker who fixed the tier count knows the cake and
// the model did not. But the raw estimate is NEVER overwritten by those corrections — it is kept
// immutably alongside them (spattoo-backend migration 022), because the difference between what
// the model said and what the baker changed is the only honest measure of how good the reading
// was. That is the whole reason there are two columns rather than one.
//
// `estimated` is the flag every consumer must respect: a report built from an estimate is a
// READING OF A PHOTO, not a measurement, and both the screen and the printed sheet have to keep
// saying so. A baker must never mistake an inferred tin plan for one derived from a real design.

export function resolveXrayDesign(order) {
  const snapshot = order?.design_snapshot;
  if (snapshot) {
    return { design: snapshot, estimated: false, edited: false, meta: null, coverage: null };
  }

  const edited   = order?.design_estimate_edited;
  const estimate = order?.design_estimate;
  const design   = edited ?? estimate ?? null;
  if (!design) {
    return { design: null, estimated: false, edited: false, meta: null, coverage: null };
  }

  const meta = order?.design_estimate_meta ?? null;
  return {
    design,
    estimated: true,
    edited: !!edited,
    meta,
    // What the model could NOT identify. Surfaced deliberately: harvest.js warns that a checklist
    // which silently omits is worse than no checklist, because it is believed. An estimate that
    // quietly drops the decorations it could not read would be exactly that failure, one step
    // earlier — so the gaps travel with the design and get their own block on the sheet.
    coverage: meta?.coverage ?? null,
  };
}

// Is there anything for X-Ray to render? The launcher's question, kept here so it cannot answer it
// differently from the way the report resolves it.
export function hasXrayDesign(order) {
  return !!resolveXrayDesign(order).design;
}
