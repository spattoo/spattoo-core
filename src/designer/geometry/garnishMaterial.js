import { mediumOf } from './pipingMedia.js';
import { albedoForLight, parseColour } from '../shared/albedoForLight.js';

// ── The look of set chocolate, in ONE place ──────────────────────────────────────────────────────
//
// ⚠️ THE STUDIO MUST SHOW WHAT THE CAKE WILL SHOW, and two copies of these numbers is how it stops.
// The studio drew the piece as a flat 2D stroke with no material at all, so it read dull next to the
// same piece on the cake — every choice made in the studio was a guess, which is the one thing a
// preview must never be. A second material tuned to "look right" would put the lie back, just
// slower: the piece would match today and drift the first time either side was touched.
//
// ⚠️ A THIN ROPE IS ALMOST ALL GRAZING ANGLE, which is why the drip's settings wash a garnish out.
// Fresnel makes a clearcoat reflect hardest at grazing incidence: on a broad drip most pixels face
// the viewer and show base colour, but on a swept tube nearly every visible pixel is near the
// silhouette, so a strong clearcoat covers the whole piece in white-ish reflection and the chocolate
// underneath never appears. Side by side, the studio showed near-black brown and the placed piece
// pale taupe — the colour was buried, not under-lit, which is why RAISING the gloss twice made it
// worse. So the lacquer comes down rather than up, and the env boost with it.

export const GARNISH_GLOSS_DEFAULT = 0.45;


/* ⚠️ AND THIS IS NOT THE WHOLE STORY — WHAT IS LEFT IS MEASURED, NOT GUESSED.
 *
 * With this compensation in place, teal #4EC5B0 (78,197,176) arrives on the cake at 162,210,200.
 * Green is nearly right; RED is lifted by 84. A multiply cannot do that — dividing by light scales
 * every channel — so something is ADDING white, and it is large: solving the two channels in linear
 * space gives roughly `shown = base × 1.1 + 0.32`, and that 0.32 is most of a saturated colour's
 * distance to white.
 *
 * ⚠️ WHERE IT COMES FROM, BISECTED ON THE REAL CAKE with a teal piece (asked 78,197,176):
 *     baseline                                  161,210,199
 *     ambient light off                         158,207,197   — barely moves
 *     SCENE ENVIRONMENT off                       0, 76, 64   — collapses
 * The scene's environment is providing nearly all the light on a garnish, and the HDRI is bright, so
 * it washes saturated colours towards white. The three lamps are almost incidental.
 *
 * ⚠️ AND IT CANNOT BE TURNED DOWN PER MATERIAL, which is the awkward part. `envMapIntensity` on this
 * material was measured at 0, 0.15 and 0.4 and produced 162,210,200 / 161,210,199 / 161,210,199 —
 * no effect at all, while the scene-level `environmentIntensity` has total effect. So the usual lever
 * is not connected here, and lowering the scene's own intensity is not available: it is what makes a
 * poured glaze read wet (see SCENE_ENV in CakeCanvas).
 *
 * ⚠️ SO THE REMAINING ROUTE IS THIS CONSTANT, CALIBRATED RATHER THAN DERIVED. `SCENE_LIGHT` is a
 * guess at 1.9 and the residual says it is too low. Binary-search it against a measured teal until
 * the cake reads 78,197,176, then confirm on a dark and a pale colour — the transform is not a pure
 * multiply, so one colour is not enough to fit it. */
export const GARNISH_INK = '#4A2C1B';

/**
 * Props to spread onto a `<meshPhysicalMaterial>` for a chocolate garnish — on the cake, in the
 * studio preview, and anywhere else a piece is shown. Spread it; do not read values out of it and
 * re-state them, which is the same drift by another route.
 */
/* Reads `#rrggbb` or `rgb(r, g, b)`. Both, because these values get passed between functions here and
 * reading only one form once made a test silently compare a colour with itself. */

/**
 * The base colour to HAND THE MATERIAL so that what comes out is the colour that was chosen.
 *
 * ⚠️ THE PREVIEW WAS BEING MOVED TOWARDS THE RENDER, AND THAT WAS THE WRONG DIRECTION. Making the
 * studio wash out until it matched the cake did make them agree — about a colour nobody asked for.
 * What somebody picking teal expects is teal, in both places; the render is the thing that is wrong,
 * not the swatch.
 *
 * So the correction goes into the MATERIAL instead: undo the lighting and the white the renderer is
 * about to add, hand it the colour that lands on the chosen one, and let the studio paint the chosen
 * colour plainly. Same shared model, applied where the error is made.
 *
 * ⚠️ IT CANNOT ALWAYS SUCCEED, and it does not pretend to. A very dark colour under a strong sheen
 * would need a negative base to come back exact; there the clamp holds it at black and the piece
 * renders a little lighter than asked. Better to be as close as the physics allows and say so than
 * to move the swatch to meet it.
 */

/** The light a fully-lit garnish actually receives from the cake rig — a CALIBRATION of the scene.
 *  MEASURED, NOT DERIVED, exactly as `shared/printExposure.js` insists for the same reason.
 *
 *  ⚠️ HOW IT WAS MEASURED, so it can be redone rather than guessed at. Render a mid-grey piece
 *  (#808080) on `dev/garnish-on-cake.html?color=%23808080` and read it back: it came out 190,188,188.
 *  In LINEAR light that is 0.5188 against an asked 0.2158 — a ratio of 2.40. sRGB ratios are
 *  meaningless here; that mistake cost two earlier rounds.
 *
 *  ⚠️ AND IT IS A MULTIPLY, WHICH IS THE FINDING THAT MADE THIS FIXABLE. Rendering black came back
 *  black (0,0,0 → 0,0,0), and an additive white cannot do that. Four earlier attempts assumed an
 *  additive specular and all of them failed; the one measurement that separates the two cases is a
 *  black piece. Because it is a multiply, dividing the albedo by the light is exact — it is not a
 *  fitted constant, and it does not clamp at the dark end the way subtracting a white would.
 *
 *  ⚠️ THIS NUMBER BELONGS TO THE CURRENT HDRI. Measured with the scene environment off, a teal piece
 *  renders 72,53,4 — near black — so the environment is not a contributor to the light here, it is
 *  almost ALL of it. 2.40 is therefore a calibration of that specific environment at
 *  `SCENE_ENV.intensity`, not a property of the material or of three.js.
 *
 *  ⚠️ SO CHANGING THE HDRI SILENTLY INVALIDATES THIS, and the failure is quiet: colours simply drift
 *  again, in whichever direction the new environment is brighter or dimmer. A different HDRI also
 *  need not be NEUTRAL — a warm one lifts red more than blue, which a single scalar cannot correct;
 *  if a colour cast appears after a swap, this has to become three numbers rather than one.
 *
 *  TO RE-CALIBRATE — after any change to the HDRI, `SCENE_ENV.intensity`, or the lamps in
 *  `CakeCanvas`: render #808080 on `dev/garnish-on-cake.html?color=%23808080`, convert both to LINEAR
 *  light, and set this to shown/asked. `scripts/measure-garnish-colour.mjs` prints the whole table.
 *
 *  ── 2026-09-04: re-measured for the studio HDRI, then reverted with it ────────────────────────
 *  The map briefly changed to fix the gold topper's glare and this moved to 1.401 alongside it —
 *  correctly, since the studio map is 0.485× as bright and every colour would otherwise have shipped
 *  ~38 points dark. Both were reverted when the dimmer environment turned the faux balls dull: see
 *  `envMap.js`. Recorded because the pairing is the point — this constant and the HDRI move TOGETHER
 *  or not at all, in either direction.
 *
 *  ⚠️ AND THE ALGEBRA ALONE DID NOT LAND IT, which is worth keeping for the next re-calibration.
 *  Dividing the measured ratio predicted 1.163; that rendered grey at 142 against an asked 128. The
 *  pipeline is not a pure multiply end to end — tone mapping compresses differently at the higher
 *  albedo a smaller divisor produces — so the value has to be INTERPOLATED FROM TWO MEASURED POINTS,
 *  not computed from one. 1.401 was what landed grey at 128,126,127.
 */
export const REFERENCE_LIGHT = 2.40;

/* sRGB ↔ linear. The correction has to happen in linear light because that is where a renderer
 * multiplies; doing it in sRGB nearly works for dark colours and fails on saturated mid-tones, which
 * is exactly where a teal turned to mint. */

/** The albedo to hand the material so the RENDER is the colour that was chosen.
 *
 * ⚠️ The MATHS lives in `shared/albedoForLight.js` — a tier needs the same correction with a
 * different reference light, and two copies of this would drift the moment one was re-measured. Only
 * the number below is this surface's. */
export function garnishAlbedo(color) {
  if (!parseColour(color)) return color ?? GARNISH_INK;
  return albedoForLight(color, REFERENCE_LIGHT);
}

export function garnishMaterialProps({ medium = 'chocolate', gloss, color } = {}) {
  const g = gloss ?? GARNISH_GLOSS_DEFAULT;
  return {
    /* ⚠️ THE ALBEDO IS DIVIDED BY THE MEASURED SCENE LIGHT, so what the renderer produces is the
     * colour that was chosen — see `garnishAlbedo`. Handing it the raw colour is what made a teal
     * piece arrive as pale mint. */
    ...mediumOf(medium).material({ softness: g }, garnishAlbedo(color ?? GARNISH_INK)),
    /* ⚠️ NO ADDITIVE WHITE. A clearcoat and an environment reflection are light bouncing OFF the
     * surface rather than through the pigment, so they are not multiplied by the colour — they land
     * on every channel equally. On a dark or saturated colour that constant is most of its distance
     * to white, which is why a teal piece arrived as pale mint and why four compensations aimed at
     * the wrong term. The same defect, and the same fix, as a print: `shared/printExposure.js` turns
     * both off and says "a print is INK".
     *
     * A GARNISH IS SET CHOCOLATE, so the colour must be the chocolate's colour by construction: every
     * term multiplies the albedo, nothing adds to it.
     *
     * ⚠️ AND CHOCOLATE IS GLOSSY, WHICH A PRINT IS NOT. That is served by roughness — a smooth surface
     * still catches a highlight from the LAMPS, which is a small bright spot at one angle and leaves
     * the rest of the piece showing pigment. What is forbidden is the uniform layer the ENVIRONMENT
     * lays over the whole surface. Shine therefore drives roughness, not the reflection.
     *
     * ⚠️ AND THESE THREE ZEROS DO NOT ACTUALLY STOP IT — MEASURED, ON THE REAL CAKE. drei's
     * `<Environment>` sets `scene.environment`, and `environmentIntensity` is a property of the SCENE.
     * A material cannot opt out of it:
     *     material envMapIntensity 0     → teal 181,230,222   (unchanged)
     *     envMapIntensity={0} on the element → 181,230,222    (unchanged)
     *     envMap={null} on the element      → 181,230,222     (unchanged, R3F re-attaches it)
     *     meshStandardMaterial instead      → 193,231,224     (no better)
     *     SCENE environmentIntensity 0      →  72, 53,  4     (collapses — this is the whole light)
     * That is why four separate compensations aimed at the material changed nothing. They were all
     * turning a knob that is not wired to anything.
     *
     * ⚠️ SO THE FIX IS NOT HERE. It has to happen where the scene environment is applied — a second
     * environment layer the garnish is excluded from, a `layers` split, or rendering the piece with a
     * material the scene env does not reach. Until then these zeros are correct-but-inert: they state
     * the intent and cost nothing, and the residual is the scene's, not this file's.
     *
     * ⚠️ AND THE SAME SCENE ENVIRONMENT HURTS A GOLD ACRYLIC TOPPER, BUT THE FIX IS NOT THE SAME —
     * which is why "turn the environment off" cannot become the general rule. A topper reads as glare
     * face-on and reads correctly when the cake is turned slightly: that angle-dependence is the
     * signature of a REFLECTION (a diffuse term does not change as you orbit). A metal has no diffuse
     * colour at all — what you see IS the reflection — so switching the environment off would leave a
     * gold topper black, not fixed.
     *
     * So the two cases want opposite things from the same term:
     *   chosen-colour surfaces (chocolate, print, cream)  → the environment must add NOTHING
     *   metallic surfaces (gold acrylic, foil, age numbers) → the environment is the material, and it
     *     needs STRUCTURE worth reflecting rather than a flat bright field
     * A shared model must therefore be about what a surface IS, not a single switch. */
    roughness: 0.52 - 0.34 * g,
    clearcoat: 0,
    envMapIntensity: 0,
    specularIntensity: 0,
  };
}
