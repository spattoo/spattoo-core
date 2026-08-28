/* ── Getting the fondant to the right colour ─────────────────────────────────────────────────────
 *
 * The step before every other step, and the one a nervous baker actually gets wrong. Rolling a ball
 * is obvious once you see it; mixing a brown that does not come out muddy or grey is not.
 *
 * ⚠️ THIS DESCRIBES GEL COLOUR IN WHITE FONDANT — kneaded in, not painted on. Liquid food colouring
 * is the common mistake and it is a real one: enough liquid to reach a deep shade makes the fondant
 * wet and unworkable, which is why every entry below names gel.
 *
 * ⚠️ AND IT IS ADVICE, NOT A RECIPE. We do not know the brand, the base, or how long it will sit.
 * Nothing here should read as "this will produce exactly that hex" — it names a starting point and
 * the one fact that stops the usual failure (colour deepens on standing, so people over-colour).
 * Same posture as everything else in this feature: it tells a baker what to try, and the baker
 * decides.
 */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r)      h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

/* ⚠️ BROWN IS A DARK, DULL ORANGE — it has no hue of its own, which is exactly why bakers struggle
 * with it and why it cannot be matched by hue alone. It has to be caught BEFORE the orange/yellow
 * families or a teddy bear is described as "orange fondant", and the guide is wrong on the very
 * first step of the commonest figure there is. */
/* ⚠️ DARK **or** DULL, not merely orange-hued. The first cut tested the hue band plus `l < 0.62`,
 * which swallowed a bright pumpkin orange (#FF8C1A, l 0.55, fully saturated) and called it brown —
 * the mirror of the bug it was written to prevent. Brown is orange that has had its light or its
 * saturation taken away; a vivid mid-tone orange is still orange. */
const isBrown = ({ h, s, l }) =>
  h >= 12 && h <= 50 && s > 0.08 && (l < 0.45 || (s < 0.55 && l < 0.7));

const FAMILIES = [
  { name: 'brown',  test: isBrown,
    how: 'Brown gel — or, with no brown to hand, mix a little red and yellow, then knead in the smallest touch of blue or black to knock the orange out of it.',
    warn: 'Add the blue a speck at a time. One speck too many and it turns grey, and grey cannot be taken back out.' },
  { name: 'black',  test: ({ l }) => l < 0.12,
    how: 'Black gel, and more of it than looks sensible.',
    warn: 'Black is the hardest shade to reach — knead it, then let it REST. It will darken a long way on standing, and colouring to black in one go leaves the fondant sticky.' },
  { name: 'white',  test: ({ s, l }) => l > 0.9 && s < 0.12, how: 'No colour needed — plain white fondant.', warn: null },
  { name: 'grey',   test: ({ s }) => s < 0.12,
    how: 'The tiniest touch of black gel in white fondant.', warn: 'Grey goes too dark almost immediately — start with less than you think.' },
  { name: 'ivory',  test: ({ h, s, l }) => h >= 25 && h <= 60 && s < 0.4 && l > 0.75,
    how: 'A speck of ivory or warm-brown gel in white.', warn: null },
  { name: 'pink',   test: ({ h, s, l }) => (h >= 300 || h < 12) && l > 0.6 && s > 0.15, how: 'A little pink or rose gel in white.', warn: null },
  { name: 'red',    test: ({ h }) => h >= 348 || h < 12,
    how: 'Red gel — a "no-taste" or super-red is worth using here.',
    warn: 'Red needs a lot of colour and tastes bitter if you use an ordinary gel. Colour it the day before and let it deepen overnight.' },
  { name: 'orange', test: ({ h }) => h < 45,  how: 'Orange gel, or red and yellow kneaded together.', warn: null },
  { name: 'yellow', test: ({ h }) => h < 70,  how: 'Yellow gel.', warn: null },
  { name: 'green',  test: ({ h }) => h < 170, how: 'Green gel — or yellow with a touch of blue for a warmer leaf green.', warn: null },
  { name: 'blue',   test: ({ h }) => h < 260, how: 'Blue gel.', warn: null },
  { name: 'purple', test: ({ h }) => h < 300, how: 'Purple gel, or blue with a touch of pink.', warn: null },
  { name: 'pink',   test: () => true,          how: 'Pink or rose gel in white fondant.', warn: null },
];

/* Deep / pale is a real instruction ("a deep brown", "a pale pink") and it is the part a baker can
 * judge against the screen, so it is said rather than left to the swatch.
 *
 * ⚠️ Not applied to black, white or grey: "a deep black" says nothing, and those three are already
 * named by their lightness. A qualifier that adds no information only makes the sentence longer. */
const NO_QUALIFIER = new Set(['black', 'white', 'grey']);
function depth({ s, l }, family) {
  if (NO_QUALIFIER.has(family)) return '';
  if (l < 0.32) return 'deep ';
  // Lightness alone. Gating 'pale' on low saturation as well missed every PASTEL — a light
  // pink is highly saturated and is the most obviously pale colour a baker ever mixes.
  if (l > 0.80) return 'pale ';
  return '';
}

/* What to tell a baker to reach this colour. Returns null for no colour, or an unreadable one, rather than
 * inventing a shade — a wrong colour instruction is worse than none, because it is the one step
 * that cannot be undone once it is kneaded in. */
export function colourGuidance(hex) {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  const fam = FAMILIES.find(f => f.test(hsl)) ?? FAMILIES.at(-1);
  const pre  = depth(hsl, fam.name);
  const name = `${pre}${fam.name}`;
  // "Colour your fondant a brown" is not English; "a deep brown" is. The article belongs to the
  // qualifier, not to the colour.
  const article = pre ? 'a ' : '';

  return {
    hex: String(hex).trim(),
    name,
    how: fam.how,
    warn: fam.warn,
    // ⚠️ Said for EVERY colour, not just the awkward ones. Over-colouring is the single commonest
    // fondant mistake and it is invisible at the moment it happens — the fondant looks right in the
    // hand and is two shades too dark an hour later.
    rest: 'Gel colour deepens as the fondant rests, so stop a shade lighter than you want and give it half an hour.',
    instruction:
      `Colour your fondant ${article}${name}. ${fam.how} Knead until there are no streaks left.`,
  };
}

// The amount, in the only terms that mean anything at a bench: how much of the whole figure this
// piece is. Nobody weighs fondant for a teddy bear.
export const clampPercent = (v) => clamp(Math.round(v / 5) * 5, 5, 100);
