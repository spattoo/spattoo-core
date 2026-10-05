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

export function creamMaterialProps(softness, color) {
  const s = Math.min(1, Math.max(0, softness ?? PIPING_SOFTNESS_DEFAULT));
  const albedo = creamAlbedo(color);
  return {
    color: albedo,
    roughness:      0.5 + 0.5 * s,   // 0.5 wet … 0.85 (default) … 1.0 matte
    sheen:          (0.4 / 0.7) * s, // 0 … 0.4 (default) … ~0.571 velvety
    sheenRoughness: 0.9,
    sheenColor:     albedo,
  };
}
