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

/* ⚠️ HOW MUCH LIGHT THE CAKE SCENE ACTUALLY DELIVERS, in linear units, measured rather than assumed.
 * `CakeCanvas` lights every cake with an ambient at 0.45, a key at 1.1, a fill at 0.4 and an
 * environment at 1.25 — comfortably more than one unit, which is why a colour handed to the material
 * raw comes back lighter than it was asked to be. */
const SCENE_LIGHT = 1.9;

/* ⚠️ AND THIS IS NOT THE WHOLE STORY — WHAT IS LEFT IS MEASURED, NOT GUESSED.
 *
 * With this compensation in place, teal #4EC5B0 (78,197,176) arrives on the cake at 162,210,200.
 * Green is nearly right; RED is lifted by 84. A multiply cannot do that — dividing by light scales
 * every channel — so something is ADDING white, and it is large: solving the two channels in linear
 * space gives roughly `shown = base × 1.1 + 0.32`, and that 0.32 is most of a saturated colour's
 * distance to white.
 *
 * ⚠️ WHAT IT IS NOT. Both suspects were tested on the real cake and both were ruled out:
 *   - `envMapIntensity` forced to 0 → 162,210,200. Unchanged.
 *   - `clearcoat` forced to 0      → 157,209,198. Barely moved.
 * So it is neither the environment reflection nor the lacquer, which is where four earlier attempts
 * all aimed. It also explains why measuring DARK CHOCOLATE said everything was fine: an additive
 * white is invisible on a colour that is already dark, and ruinous on a bright saturated one.
 *
 * ⚠️ WHAT TO BISECT NEXT, in this order, on `dev/garnish-on-cake.html` with a teal piece: the three
 * scene lights one at a time (`CakeCanvas` lines 254-256), then the renderer's tone mapping and
 * exposure, then `material.specularIntensity` / `sheen`. One of those is adding a constant. */
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
export function materialBase(color, gloss) {
  const rgbIn = parseColour(color);
  if (!rgbIn) return color ?? GARNISH_INK;

  /* ⚠️ THE CORRECTION HAS TO BE DONE IN LINEAR LIGHT, NOT IN sRGB. The scene lights a garnish with
   * more than one unit of illumination — three lights plus `SCENE_ENV.intensity` at 1.25 — and a
   * renderer multiplies in LINEAR space. Compensating in sRGB, as this did, is compensating in the
   * wrong space: it very nearly works for dark colours, which is why measuring dark chocolate said
   * everything was fine, and fails badly for saturated mid-tones, which is exactly where a teal
   * turns to pale mint. The error was invisible on the one colour that was measured.
   *
   * So: to linear, divide by the light the scene actually delivers, back to sRGB. */
  const g = gloss ?? GARNISH_GLOSS_DEFAULT;
  const light = SCENE_LIGHT + (0.06 + g * 0.30) * 0.35;   // brighter still under a heavier sheen

  const toLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const toSrgb = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

  const [r, gg, b] = rgbIn.map(c => {
    const lin = toLinear(c / 255) / light;
    return Math.round(Math.max(0, Math.min(255, toSrgb(Math.min(1, lin)) * 255)));
  });
  return `rgb(${r}, ${gg}, ${b})`;
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
