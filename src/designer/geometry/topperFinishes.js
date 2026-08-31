/* ── What an acrylic topper is made of ───────────────────────────────────────────────────────────
 *
 * The finishes actually sold: mirror gold and mirror silver first, rose gold, and the GLOSS BLACK
 * that is the other half of the market — a black topper is not a dark gold, it is a different
 * material. Gold and silver are metal (metalness 1) and are nothing but their reflections; black and
 * white are pigmented acrylic with a clear gloss over them, so they keep a diffuse colour and take a
 * sharp specular highlight instead of an image of the room.
 *
 * ⚠️ ALL OPAQUE, and that is a deliberate saving. Real acrylic is often transparent, and modelling
 * that means `transmission`, which makes the renderer draw the scene again behind every topper. The
 * preview showed that mirror reads convincingly as acrylic without it, so clear acrylic is not built
 * until somebody asks for it by name.
 *
 * Seeded here and OVERLAID FROM THE DB by `applyTopperFinishConfig`, the same bargain
 * `applyMaterialConfig` and `applyTextureConfig` make: an admin can retune a colour, add a finish or
 * withdraw one without a deploy. Reached by KEY — a new finish is a row, never a branch.
 */
export const TOPPER_FINISHES = {
  gold:   { label: 'Mirror gold',   color: '#d4af37', metalness: 1,    roughness: 0.12, envIntensity: 1.4 },
  silver: { label: 'Mirror silver', color: '#cfd4d8', metalness: 1,    roughness: 0.10, envIntensity: 1.4 },
  rose:   { label: 'Rose gold',     color: '#e0a899', metalness: 1,    roughness: 0.14, envIntensity: 1.4 },
  black:  { label: 'Gloss black',   color: '#141414', metalness: 0.35, roughness: 0.06, envIntensity: 1.1 },
  white:  { label: 'Gloss white',   color: '#f2f0ec', metalness: 0.10, roughness: 0.08, envIntensity: 0.9 },
};

export const DEFAULT_TOPPER_FINISH = 'gold';

// The material props for a finish, falling back rather than throwing — an element carrying a finish
// an admin has since withdrawn still renders, in gold, instead of vanishing off the cake.
export function topperFinish(key) {
  return TOPPER_FINISHES[key] ?? TOPPER_FINISHES[DEFAULT_TOPPER_FINISH];
}

/* Overlay the authored rows. Same shape as the frosting and texture overlays: `{ key, label, config }`,
 * a partial merge onto the seed, and unknown keys ignored.
 *
 * ⚠️ Unknown keys are ignored ON PURPOSE and it is not laziness: a finish is only half data. The
 * numbers are authorable, but "is this metal or is it pigment under gloss" is a decision the
 * renderer has to already understand. A row naming a finish that does not exist in code has no
 * material to merge onto, and inventing a default for it would put an object on a customer's cake in
 * a colour nobody chose.
 */
export function applyTopperFinishConfig(rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (!row?.key) continue;
    const seed = TOPPER_FINISHES[row.key];
    if (!seed) continue;
    TOPPER_FINISHES[row.key] = { ...seed, ...(row.config ?? {}), label: row.label ?? seed.label };
  }
}
