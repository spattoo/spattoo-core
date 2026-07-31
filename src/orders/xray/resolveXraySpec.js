// ── Which design does X-Ray read for this order? ─────────────────────────────────────────────────
// An order can carry its design in one of three places, and every X-Ray surface — the screen, the
// printable PDF, the launcher that decides whether to offer the report at all — has to pick the
// same one. So the choice is made ONCE, here, for the same reason report.js computes the report's
// CONTENT once: two copies of this rule would drift, and the drift would be silent. The sheet in
// the kitchen would be built from a different design than the screen in the office.
//
//   design_snapshot          the baker built it in the 3D designer. Authoritative, measured.
//   xray_spec_edited   the baker corrected what the model read off a reference photo.
//   xray_spec          what the model read off a reference photo, untouched.
//
// PRECEDENCE, and why it is that way round:
//
// A real snapshot always wins. A designed order needs nothing inferred, and letting a photo
// reading shadow an authored design would replace measured data with a guess.
//
// Corrections beat the raw spec, because a baker who fixed the tier count knows the cake and
// the model did not. But the raw spec is NEVER overwritten by those corrections — it is kept
// immutably alongside them (spattoo-backend migration 022), because the difference between what
// the model said and what the baker changed is the only honest measure of how good the reading
// was. That is the whole reason there are two columns rather than one.
//
// `fromPhoto` is the flag every consumer must respect: a report built from a spec is a
// READING OF A PHOTO, not a measurement, and both the screen and the printed sheet have to keep
// saying so. A baker must never mistake an inferred tin plan for one derived from a real design.

export function resolveXraySpec(order) {
  const snapshot = order?.design_snapshot;
  if (snapshot) {
    return { design: snapshot, fromPhoto: false, edited: false, stale: false, meta: null, coverage: null };
  }

  const edited   = order?.xray_spec_edited;
  const spec     = order?.xray_spec;
  const design   = edited ?? spec ?? null;
  if (!design) {
    return { design: null, fromPhoto: false, edited: false, stale: false, meta: null, coverage: null };
  }

  const meta = order?.xray_spec_meta ?? null;
  return {
    design,
    fromPhoto: true,
    // The reference photo has been replaced since this was read (server-computed — see
    // routes/orders.js xraySpecStale). The guide is not wrong so much as ABOUT A DIFFERENT
    // PICTURE, which is worse: nothing on the sheet looks off, it just describes another cake.
    // Surfaced, never auto-fixed — re-reading spends credits, and nothing should be charged as a
    // side effect of uploading a photo.
    stale: order?.xray_spec_stale === true,
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
export function hasXraySpec(order) {
  return !!resolveXraySpec(order).design;
}
