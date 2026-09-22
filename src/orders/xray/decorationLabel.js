// ── What to CALL a decoration on the sheet ───────────────────────────────────────────────────────
//
// One function, because the sheet was calling the same decoration two different things at once.
//
// ── THE BUG THIS EXISTS TO PREVENT ───────────────────────────────────────────────────────────────
// A real order, 2026-09-22: a cake with a line-drawn lady on the side, a wide fondant hat on top and
// roses on the brim. The checklist a baker ticks at the bench read:
//
//     1. Rectangle photo frame · side
//     2. Piping flower · top surface
//     3. Elephant · top surface        ← the hat
//
// …while the Decorations section of the SAME sheet read "photo print on the side" and "flower on the
// top". Two names for one object, three lines apart.
//
// The cause is not the model's eyesight. On a photo order every decoration is matched against the
// catalogue, and `xraySpec.js` says what that match is worth: *"matching can be confidently wrong:
// zone, type, colour and mode contribute 0.60 of the score against a 0.35 floor, so a pink fondant
// topper certifies as any other pink fondant topper. A real cake's bow matched 'Fondant doll 1'."*
// A white curved shape on a top surface matched a white elephant figurine the same way.
//
// The backend already writes `seen` — what the model actually reported — beside the match, *"kept
// alongside what it matched to"*, precisely so a reader never has to trust the match. The decoration
// steps used it. The checklist did not, and the checklist is the half a baker works from.
//
// ⚠️ A WRONG NAME IS WORSE HERE THAN ANYWHERE ELSE ON THE SHEET. `harvest.js` is blunt about what a
// checklist claims: *"that this is EVERYTHING … a checklist that silently omits is worse than no
// checklist, because it is believed."* The same trust makes a wrong entry expensive — a baker who
// reads "Elephant" either hunts for an elephant that is not on the cake, or stops believing the
// list. Neither is recoverable by the rest of the sheet being right.
//
// ⚠️ AND `name` IS STILL RIGHT ON A DESIGNED ORDER. There the sticker IS a library element the
// customer placed, so its name is a fact rather than a guess — which is why this prefers `seen` when
// it exists and falls back to `name` when it does not, instead of dropping the match name outright.

const ZONE_WORDS = {
  top_surface: 'top surface', side: 'side', rim: 'rim', base: 'base', board: 'board',
};

/**
 * The noun alone — "flower", "photo print", "hat".
 *
 * `seen.what` is the model's own reading and wins wherever it exists (photo orders). `name` is the
 * matched library element and is only reached on a designed order, where it is authoritative.
 */
export function decorationWhat(sticker) {
  const seen = sticker?.seen ?? {};
  return seen.what || sticker?.name || 'decoration';
}

/** Where it sits, in words a baker uses — or null when nothing said. */
export function decorationWhere(sticker) {
  const seen = sticker?.seen ?? {};
  return ZONE_WORDS[seen.placement] || ZONE_WORDS[sticker?.zone] || null;
}

/** The noun with its place — "flower on the top surface". For surfaces that show one line. */
export function decorationLabel(sticker) {
  const what  = decorationWhat(sticker);
  const where = decorationWhere(sticker);
  return where ? `${what} on the ${where}` : what;
}
