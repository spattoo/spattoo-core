import { creamMaterialProps, chocolateMaterialProps } from '../canvas/CakeTier.jsx';

// ── What is in the bag ───────────────────────────────────────────────────────────────────────────
//
// The pen pipes cream or chocolate. That is ONE tool with two media, and the difference is entirely
// how the rope is shaded and which tips make sense — the sweep, the seating, the auto-shaping, the
// stamps and the whole capture path are identical and must stay that way.
//
// ⚠️ A KEY, NEVER A BRANCH (INVARIANTS #1). No `if (medium === 'chocolate')` anywhere: a stroke
// carries `medium`, this table answers what that means, and a third medium — royal icing, caramel —
// is a row here rather than an edit to the renderer.
//
// ⚠️ WHY CHOCOLATE READ AS CREAM. The pen shaded every stroke with `creamMaterialProps`: sheen on,
// roughness 0.85 — matte and velvety on purpose, because that is what buttercream is. Dark brown
// buttercream is still buttercream. `chocolateMaterialProps` already existed for the drip and does
// the opposite: clearcoat to 1.0 and roughness to 0.08, which is set chocolate through to wet
// ganache. Nothing needed inventing; the two just had never been introduced.
//
// ⚠️ THE ROPE RHYTHM IS A PROPERTY OF THE NOZZLE, NOT OF THE MEDIUM, and this table must not
// duplicate it. The spiral twist and squeeze that make a rope look hand-piped are declared per tip in
// `creamPen.js` — `round` and `bead` already carry twist 0 / ruffle 0, the stars carry 1. So
// chocolate gets a smooth even line by DEFAULTING TO THE ROUND TIP, not by a second switch here.
//
// This did carry its own `character: { twist: 0, ruffle: 0 }` for a while. It read well and nothing
// consumed it — a test asserted it and passed, proving only that the constant was still typed
// correctly. Dead config is worse than none: it invites the next person to "fix" the renderer to
// honour it, duplicating a rule that already has one home.
//
// ⚠️ THE VALUES A BAKER SEES ARE NOT HERE. Colour, thickness and gloss come from `placement_config`
// on the element row, which an admin edits without a deploy (INVARIANTS #1a) — `addPenFromRow`
// already merges that over the defaults below. What stays in code is the material RECIPE, which is a
// shader curve and cannot be a DB row. Do not move tunables in here to "keep them together".

export const MEDIA = {
  cream: {
    label: 'Cream',
    material: (style, colour) => creamMaterialProps(style.softness, colour),
    // Star tips are the point of piped cream — and they are what carry the hand-piped rhythm.
    defaults: { nozzle: 'star5', color: '#ffffff', softness: 0.7 },
  },
  chocolate: {
    label: 'Chocolate',
    // `softness` doubles as gloss: one control, 0 = set and matte, 1 = wet ganache. The drip studio
    // already maps it this way, so a baker who has met one meets the same idea twice.
    material: (style, colour) => chocolateMaterialProps(style.softness, colour),
    defaults: { nozzle: 'round', color: '#4A2C1B', softness: 0.85, thickness: 0.018 },
  },
};

export const DEFAULT_MEDIUM = 'cream';

/** The medium a stroke was piped in. Unknown or missing → cream, because every stroke saved before
 *  chocolate existed has no `medium` at all and must keep rendering exactly as it did. */
export const mediumOf = key => MEDIA[key] ?? MEDIA[DEFAULT_MEDIUM];
