// ── PRINT EXPOSURE ────────────────────────────────────────────────────────────────────────────────
// The one rule that decides how bright a 2D print renders on the cake. Pure (no three, no DOM) so it
// is unit-testable and so the designer, the thumbnail and the admin studios cannot drift apart.
//
// THE BUG THIS EXISTS TO KILL
// A decal used to be drawn as an ordinary lit PBR surface with tone mapping switched off, i.e.
//     screen = albedo × (whatever light happens to hit it)
// with no rolloff and nothing tying it back to the artwork. The light a camera-facing decal receives
// from the designer's rig (CakeCanvas: ambient 0.45 + key 1.1·N·L≈0.51 + env≈0.20) is ≈ 1.16, and the
// old self-illumination added another 22% on top — so a print rendered at ≈ 1.41× its own artwork.
// Measured on the real cake: 1.4×. That single defect produced BOTH long-running complaints:
//   • "the print is DULL"        — the original ACES-tone-mapped era: ACES compressed AND desaturated it.
//   • "the print is OVER-BRIGHT" — the fix for dull (tone mapping off + a chroma boost + emissive) landed
//                                  at 1.41×, and with no rolloff every pale colour clips to white.
// Each was then patched with another hand-tuned constant. They were the same bug with opposite signs:
// A PRINT HAD NO DEFINED EXPOSURE. Knobs cannot fix that — the next pale artwork or new zone reopens it.
//
// THE RULE
// A print must read as ITS ARTWORK, by construction, in every zone and on every cake:
//     screen = gain × albedo × ( (1 − shading) + shading × light / REFERENCE_LIGHT )
// The `1 − shading` part is self-illumination: orientation-INDEPENDENT, so it cannot be blown out by
// where the decal happens to sit. The `shading` part still lets the print take some of the cake's own
// light, so it doesn't read as a sticker pasted over the render. At light == REFERENCE_LIGHT the two
// sum to exactly 1 — the print IS the artwork. On the shaded side it falls off gently and can never
// exceed 1, so nothing clips. No per-element calibration required.
//
// Every term is a MULTIPLIER ON THE ALBEDO (not an additive white), which is why chroma survives: the
// old emissive added white light, and additive white is what desaturates a print.

/** The light a fully-lit decal actually receives from the designer's rig — a CALIBRATION of the scene.
 *  MEASURED, NOT DERIVED. Adding up the rig on paper (ambient 0.45 + key 1.1·N·L + env) gives ≈1.16, and
 *  that is WRONG: rendering a print at 1.16 came out a uniform 1.19× too bright across every region of the
 *  artwork (green 1.190, brown 1.198, pale blue 1.193 — measured in LINEAR light on the real cake), which
 *  solves to a true irradiance of ≈1.80. Paper models of a three.js rig miss terms (the env/IBL contribution
 *  and the shader's π factors); the render is the authority.
 *
 *  TO RE-CALIBRATE (do this if the lighting rig in CakeCanvas ever changes — it is ONE number, not a
 *  re-tune of every element): render a print with no `print_finish`, compare its regions against the source
 *  artwork **in linear light** (sRGB ratios are meaningless — that mistake is what produced 1.16), and
 *  scale this constant by the ratio you measure. A correct value renders the print at 1.000× its artwork. */
export const REFERENCE_LIGHT = 1.54;

/** How much of the cake's own light a print takes (0 = fully self-lit/flat, 1 = fully lit/blowable).
 *  0.35 keeps the print seated in the scene — it darkens on the shaded side — while capping the swing
 *  a decal's ORIENTATION can cause at ±35% instead of the ±100% that caused this whole class of bug. */
export const SHADING = 0.35;

/** Chroma pre-boost. NEUTRAL by default: it exists as an artistic choice, never as a correction for a
 *  render that is wrong (the old 1.12 was compensating for the ACES desaturation, and outlived it). */
export const SATURATION = 1.0;

/** The neutral values — a print with NO `print_finish` at all. The admin studios seed their sliders from
 *  this and omit any key still sitting on its neutral value, so the common case writes nothing to config. */
export const PRINT_NEUTRAL = { gain: 1, saturation: SATURATION, shading: SHADING };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Resolve `placement_config.print_finish` into the material terms the renderer sets.
 *   { gain?, shading?, saturation? } — every key OPTIONAL; absent = a faithful print.
 *
 * Returns:
 *   diffuse    → material.color   (scales the albedo, which the scene's light then multiplies)
 *   selfLit    → material.emissive (with emissiveMap = the albedo, emissiveIntensity = 1)
 *   saturation → the albedo's chroma pre-boost, applied when the texture is composited
 *
 * `emissive` is the LEGACY key from the pre-exposure model, where it was a raw additive
 * self-illumination on top of full lighting — i.e. it is exactly the overshoot this module removes.
 * It is deliberately IGNORED rather than honoured: reading it back would reintroduce the 1.4× bug on
 * the very elements that were authored to work around it. Use `gain` to make a print brighter/dimmer.
 */
export function printExposure(printFinish) {
  const gain    = Math.max(0, printFinish?.gain ?? 1);
  const shading = clamp(printFinish?.shading ?? SHADING, 0, 1);
  return {
    diffuse:    gain * shading / REFERENCE_LIGHT,   // × light ≈ gain·shading at the reference
    selfLit:    gain * (1 - shading),               // orientation-independent remainder
    saturation: Math.max(0, printFinish?.saturation ?? SATURATION),
  };
}
