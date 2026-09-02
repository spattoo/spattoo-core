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
/**
 * What a colour LOOKS LIKE once the cake has rendered it.
 *
 * ⚠️ A FLAT FILL AND A LIT MATERIAL CANNOT AGREE BY COINCIDENCE. The studio draws ink on a canvas;
 * the cake shades a surface. Tuning one to match the other by eye works until either is touched, and
 * it was tuned twice here and drifted twice — a teal piece arriving as pale mint. Colour is the thing
 * a baker picks deliberately, so a preview that is wrong about it is worse than no preview.
 *
 * The fix is not a better guess: it is that ONE function decides what a colour looks like, and both
 * sides ask it. The cake asks by rendering with these material props; the studio asks by filling with
 * this. They cannot drift, because there is nothing to keep in step.
 *
 * ⚠️ WHAT THE RENDERER ACTUALLY DOES TO A COLOUR: it lights the surface (which darkens it slightly
 * under this rig) and then ADDS a specular reflection of the environment, which is white. That
 * addition is the whole discrepancy — "the colour, plus a sheet of white". Both terms come from the
 * same numbers the material is built from, so changing the material changes this in step.
 *
 * ⚠️ IT IS EXACT ONLY FACE-ON. A piece standing at an angle catches more environment, so a few per
 * cent of drift remains — but drift of a few per cent is not the same kind of thing as mint versus
 * teal, and the honest answer to the rest is to render the plate itself in 3D.
 */
export function asRendered(color, gloss) {
  const rgbIn = parseColour(color);
  if (!rgbIn) return color ?? GARNISH_INK;
  const g = gloss ?? GARNISH_GLOSS_DEFAULT;

  // The same two numbers the material is given, so the two can never be set independently.
  const clearcoat = 0.06 + g * 0.30;
  const env = 0.25 + g * 0.45;

  const DIFFUSE = 0.94;                 // the rig's key + ambient, face-on
  const white = Math.min(0.35, clearcoat * env * 0.9);

  const mix = c => Math.round(Math.min(255, c * DIFFUSE * (1 - white) + 255 * white));
  const [r, gg, b] = rgbIn.map(mix);
  return `rgb(${r}, ${gg}, ${b})`;
}

/* ⚠️ BOTH FORMS, BECAUSE THESE TWO COMPOSE. `materialBase` returns `rgb(…)` and its result is fed
 * straight back through `asRendered` to check the round trip; reading only `#hex` made that silently
 * return its input unchanged — a test that looked like it passed while comparing a colour with
 * itself. Anything that can be handed one of these can be handed the other. */
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
  const g = gloss ?? GARNISH_GLOSS_DEFAULT;
  const clearcoat = 0.06 + g * 0.30;
  const env = 0.25 + g * 0.45;
  const DIFFUSE = 0.94;
  const white = Math.min(0.35, clearcoat * env * 0.9);

  const undo = c => Math.round(Math.max(0, Math.min(255, (c - 255 * white) / (DIFFUSE * (1 - white)))));
  const [r, gg, b] = rgbIn.map(undo);
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
