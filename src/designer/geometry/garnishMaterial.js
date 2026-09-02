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
export const GARNISH_INK = '#4A2C1B';

/**
 * Props to spread onto a `<meshPhysicalMaterial>` for a chocolate garnish — on the cake, in the
 * studio preview, and anywhere else a piece is shown. Spread it; do not read values out of it and
 * re-state them, which is the same drift by another route.
 */
export function garnishMaterialProps({ medium = 'chocolate', gloss, color } = {}) {
  const g = gloss ?? GARNISH_GLOSS_DEFAULT;
  return {
    ...mediumOf(medium).material({ softness: g }, color ?? GARNISH_INK),
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
