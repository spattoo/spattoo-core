import { albedoForLight } from '../shared/albedoForLight.js';

// ── What cream looks like ────────────────────────────────────────────────────────────────────────
//
// ONE answer, asked by everything made of buttercream: a piped stroke, a heap, a hand-piped stamp,
// a brushstroke painted on the wall. Two of those rendering the same hex differently is the failure
// INVARIANTS #15 describes, and it is invisible until somebody puts them side by side on one cake.
//
// ⚠️ A LEAF MODULE, AND THAT IS THE WHOLE REASON IT IS A FILE. This lived in CakeTier.jsx, which is
// fine for the designer and fails the moment a STUDIO needs it: exporting it from there makes
// CakeTier an exported scene-lighting entry point, and `check:env-map` then — correctly — demands it
// configure the HDRI. `finish.js` hit this first and the note there is the rule: *"the difference is
// what a module IMPORTS, not what it does."* This imports one pure function and nothing else.
//
// CakeTier re-exports all four names, so every existing caller is untouched.

export const PIPING_SOFTNESS_DEFAULT = 0.7;

/* ⚠️ MEASURED, PER SURFACE, AND NOT A GUESS. The reference light is read off a grey patch under this
   scene's own rig — see shared/albedoForLight.js for the recipe and INVARIANTS #16 for why grey is
   the only patch that exposes a cast. Re-measure after any change to the HDRI or the tone mapping. */
export const CREAM_REFERENCE_LIGHT = [3.254, 2.974, 2.679];
export const CREAM_ROLLOFF = 2.0;   // pale cream must not go grey

/* The same correction the solid colour gets, exposed so a GRADIENT's stops can take it too — a
 * gradient replaces the base colour per pixel, so uncorrected stops would render a gradient in
 * different colours from the solid it stands in for. */
export const creamAlbedo = (color) =>
  albedoForLight(color, CREAM_REFERENCE_LIGHT, { rolloff: CREAM_ROLLOFF });

/* ⚠️ CREAM'S GRAZING HIGHLIGHT IS NOT WHITE AT FULL STRENGTH, and leaving three.js's default was
   costing every thin cream edge in the product. `specularIntensity` defaults to 1, which is a clean
   dielectric: at a grazing angle the Fresnel term runs to 1 and the reflection is the environment's
   own colour, i.e. white. On a piped rope that is a highlight along the top and reads as cream. On a
   surface that RAMPS DOWN to the cake — the edge of a brushstroke, the skirt of any thin film — it
   is a wide desaturated band, and it reads as a white shadow drawn round the shape.
   Measured on a brushstroke band, pale pixels along one scan line: 143 with the default, 63 with
   specular off, while `sheen: 0` gives 148 and `envMapIntensity: 0` gives 143 — so it is this term
   and not the other two (the last also confirming INVARIANTS #18, that envMapIntensity does nothing
   here). Sandeep, three times on the same artefact: *"not fixed yet."*
   0.3 rather than 0: buttercream is not matte, and a rope with no highlight at all reads as felt.
   This is the ONE function that says what cream looks like (INVARIANTS #15), so the number is here
   and not on the brushstroke — a second opinion about cream is the thing that file exists to
   prevent. */
export const CREAM_SPECULAR = 0.3;

export function creamMaterialProps(softness, color) {
  const s = Math.min(1, Math.max(0, softness ?? PIPING_SOFTNESS_DEFAULT));
  const albedo = creamAlbedo(color);
  return {
    color: albedo,
    roughness:      0.5 + 0.5 * s,   // 0.5 wet … 0.85 (default) … 1.0 matte
    sheen:          (0.4 / 0.7) * s, // 0 … 0.4 (default) … ~0.571 velvety
    sheenRoughness: 0.9,
    sheenColor:     albedo,
    specularIntensity: CREAM_SPECULAR,
  };
}
