/* ── What an acrylic topper is made of ───────────────────────────────────────────────────────────
 *
 * The finishes actually sold: mirror gold and mirror silver first, rose gold, and the GLOSS BLACK
 * that is the other half of the market — a black topper is not a dark gold, it is a different
 * material. Gold and silver are metal (metalness 1) and are nothing but their reflections; black and
 * white are pigmented acrylic with a clear gloss over them, so they keep a diffuse colour and take a
 * sharp specular highlight instead of an image of the room.
 *
 * ⚠️ NOT metalness 1, and that is the difference between gold and dark olive.
 *
 * A material at metalness 1 has NO DIFFUSE AT ALL — it is only a reflection, so it shows whatever
 * the environment happens to hold in the mirror direction and the lights cannot touch it. Face-on
 * against a cake wall that direction is behind the camera, which in a room is dim, and the piece
 * came out brown. Raising the environment's share did almost nothing, because the problem was never
 * how much room there was to reflect — it was that reflection was the ONLY thing the surface had.
 *
 * At 0.7 the gold keeps its mirror character and gains a diffuse the directional lights can light,
 * so it reads as gold from the front the way the real thing does. Physically it is also the more
 * honest description: these are metallised plastics, not lumps of metal.
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
  /* ⚠️ ROUGHNESS HERE WAS SWEPT FOR THE FRONT-VIEW GLARE AND MAKES NO MEASURABLE DIFFERENCE. Measured
   * on the real cake (`scripts/measure-topper-glare.mjs`, which finds the topper by diffing two
   * renders), mean luminance / contrast at 0.28 / 0.34 / 0.40 / 0.46 came out 176/76, 182/71, 184/69,
   * 171/80 — and then RE-RUNNING the same values gave 183/69 and 181/72. The run-to-run variance is
   * larger than the difference between settings, so this sweep cannot separate them and any winner
   * picked from it would be noise. Do not tune this against that metric without averaging repeats.
   *
   * ⚠️ `envIntensity: 2.0` IS THE UNSWEPT SUSPECT. It doubles the environment for this finish
   * specifically, on top of the scene's own 1.25 — and the environment is nearly all the light a
   * metal has. That is a much larger lever than roughness and is where to look next. */
  gold:   { label: 'Mirror gold',   color: '#d9b642', metalness: 0.70, roughness: 0.28, envIntensity: 2.0 },
  silver: { label: 'Mirror silver', color: '#d5dade', metalness: 0.75, roughness: 0.22, envIntensity: 2.0 },
  rose:   { label: 'Rose gold',     color: '#e3ab9c', metalness: 0.70, roughness: 0.30, envIntensity: 2.0 },
  black:  { label: 'Gloss black',   color: '#141414', metalness: 0.35, roughness: 0.06, envIntensity: 1.4 },
  white:  { label: 'Gloss white',   color: '#f2f0ec', metalness: 0.10, roughness: 0.08, envIntensity: 1.0 },
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
