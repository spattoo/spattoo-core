import { mediumOf } from './pipingMedia.js';

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
function parseColour(v) {
  const hex = /^#([0-9a-f]{6})$/i.exec(v ?? '');
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = /^rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*\)$/i.exec(v ?? '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

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
export function materialBase(color) {
  const rgbIn = parseColour(color);
  if (!rgbIn) return color ?? GARNISH_INK;

  /* ⚠️ FITTED TO MEASUREMENTS, NOT DERIVED FROM A MODEL. Four attempts reasoned about what the
   * renderer does to a colour — a white specular, an environment reflection, a linear-space multiply
   * — and every one was wrong in a way only the cake revealed. Measuring six colours through the real
   * scene (`scripts/measure-garnish-colour.mjs`) shows something much simpler: every colour is MIXED
   * TOWARDS A LIGHT GREY. Solving two of them gives
   *
   *     shown ≈ asked × 0.58 + 84
   *
   * which is an affine mix, and affine mixes invert. So the base handed to the material is the value
   * that comes back as the colour that was asked for.
   *
   * ⚠️ THE MEASUREMENT IS THE SPEC. If the scene's lighting or environment changes, these two numbers
   * are wrong and the script that produced them is how you get the new ones — do not re-derive them
   * by reasoning, which is what cost four rounds.
   *
   * ⚠️ THE EXTREMES CLAMP, AND THAT IS HONEST. A colour darker than the grey being mixed in would need
   * a negative base; it holds at black and comes back a few points light. Teal's red lands at about
   * 84 against an asked-for 78 — visible only side by side, where before it was 161. */
  const KEEP = 0.58;                    // how much of the asked colour survives
  const LIFT = 84;                      // what the scene adds regardless

  const [r, g, b] = rgbIn.map(c => Math.round(Math.max(0, Math.min(255, (c - LIFT) / KEEP))));
  return `rgb(${r}, ${g}, ${b})`;
}

export function garnishMaterialProps({ medium = 'chocolate', gloss, color } = {}) {
  const g = gloss ?? GARNISH_GLOSS_DEFAULT;
  return {
    /* ⚠️ PRE-COMPENSATED, so what the renderer produces is the colour that was chosen — see
     * `materialBase`. Handing it the raw colour is what made a teal piece arrive as pale mint. */
    ...mediumOf(medium).material({ softness: g }, materialBase(color ?? GARNISH_INK, g)),
    /* ⚠️ THE LACQUER FOLLOWS THE SLIDER. These three were FIXED constants spread AFTER the medium's
     * own material, so they overwrote whatever Shine had just decided — the control moved, the
     * numbers underneath changed, and the render used the constants regardless. Shine at 1.00 looked
     * exactly like Shine at 0.
     *
     * They are still held DOWN relative to a drip, and that part was right: a thin rope is almost all
     * grazing angle, and Fresnel makes a clearcoat reflect hardest there, so a full-strength coat
     * covers the whole piece in white-ish reflection and buries the chocolate — which is why raising
     * the gloss twice made it worse. The fix is to let the slider move within a range that suits a
     * rope, not to pin it to one end of that range. */
    /* ⚠️ A CLEARCOAT REFLECTS THE ROOM, AND THE ROOM IS WHITE. On top of a saturated colour that
     * reflection is added, not blended, so a teal piece arrives on the cake as pale mint — the
     * studio shows the chocolate's own colour and the cake shows the colour plus a sheet of white.
     * The two disagreed by a lot, and colour is the thing a baker chose deliberately.
     *
     * A garnish is a small object seen against a large pale cake, so it needs LESS environment than
     * the drip it inherited these numbers from, not more. Both come down: the lacquer still moves
     * with Shine, but across a range where the chocolate underneath keeps the upper hand. */
    clearcoat: 0.06 + g * 0.30,
    clearcoatRoughness: 0.7 - g * 0.5,
    envMapIntensity: 0.25 + g * 0.45,
  };
}
