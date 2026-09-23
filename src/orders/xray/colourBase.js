// ── What you actually mix the colour INTO ────────────────────────────────────────────────────────
//
// The decoration colour guide printed one sentence for every decoration on every cake:
//
//     White buttercream + a generous amount of Americolor Gold.
//
// …under a guide whose own steps say to boil sugar to 170°C and pour it on a mat. Pulled from dev,
// the same sentence was being shown for an isomalt splash, a fondant bow and a fondant flower.
//
// It is not a bug in `gelRecipeFor` — that was written for the cake's CREAM COLOURS section, where
// "white buttercream + gel" is exactly right, and the decoration card reused it unchanged. The gel
// MATCH is still the useful half: the pigment in the tub is the same pigment. What was wrong is the
// base it goes into, and for two materials, the tub itself.
//
// ⚠️ WATER-BASED GEL SEIZES CHOCOLATE. This is the reason the module exists rather than a nicer
// sentence: naming an Americolor gel beside a chocolate garnish is not clumsy wording, it is an
// instruction that ruins the batch. Where the gel table does not apply, no gel is named.
//
// ⚠️ MATCHED ON THE GUIDE'S OWN `medium` STRING, which is free text a model wrote ("Isomalt / sugar
// glass", "fondant / sugar paste"). Patterns, not keys, because that field has never been a
// controlled vocabulary and pretending otherwise would fail silently on the next phrasing. An
// unrecognised material names the colour and claims no base — honest, and still useful.

/**
 * @typedef {{ key: string, gel: boolean, line: (amount: string, gel: string) => string }} Base
 */

/* Order matters: the first pattern that matches wins, so the specific sit above the general.
   `chocolate` must be reached before anything that would swallow it. */
const BASES = [
  {
    key: 'isomalt', match: /isomalt|sugar ?glass|pulled ?sugar/i, gel: true,
    // Colour goes in at the pan, not into a bowl of anything. Off the heat, because a cold drop into
    // sugar at 170°C spits.
    line: (a, g) => `A drop of ${g} stirred into the syrup once it is off the heat.`,
  },
  {
    key: 'royal_icing', match: /royal ?icing/i, gel: true,
    line: (a, g) => `${cap(a)} of ${g}, beaten into the royal icing.`,
  },
  {
    key: 'wafer', match: /wafer/i, gel: false,
    // A sheet is bought white and coloured on the surface — there is nothing to mix into.
    line: () => 'Dusted or airbrushed on the sheet, or printed — wafer paper is not coloured by mixing.',
  },
  {
    key: 'chocolate', match: /chocolate|ganache|cocoa ?butter/i, gel: false,
    line: () => 'Oil-based (candy) colour only — a water-based gel will seize chocolate.',
  },
  {
    key: 'fondant', match: /fondant|gum ?paste|sugar ?paste|marzipan/i, gel: true,
    line: (a, g) => `Knead ${a} of ${g} into white paste until the colour is even.`,
  },
  {
    key: 'cream', match: /butter ?cream|whipped|cream/i, gel: true,
    line: (a, g) => `White buttercream + ${a} of ${g}.`,
  },
];

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** The base a material is coloured in, or null when the material is unknown or unstated. */
export function baseFor(medium) {
  if (!medium || typeof medium !== 'string') return null;
  return BASES.find(b => b.match.test(medium)) ?? null;
}

/**
 * The colour sentence for one decoration colour.
 *
 * @param {object|null} recipe  a `gelRecipeFor` result — the matched gel and how much of it
 * @param {string|null} medium  the guide's own `medium`, free text
 * @returns {{ text: string, showGel: boolean }}
 *          `showGel` is false when the gel table does not apply to this material, and the mix strip
 *          must not be drawn: a white-plus-gel picture beside "oil-based only" contradicts it.
 */
export function colourAdvice(recipe, medium) {
  const base = baseFor(medium);

  // Nothing to colour at all — the plain-white case gelRecipeFor already answers for itself.
  if (recipe && !recipe.gel) return { text: recipe.recipe, showGel: false };

  const gelName = recipe?.gel ? `${recipe.gel.brand} ${recipe.gel.name}` : null;
  const amount  = recipe?.amount ?? 'a small amount';

  if (!base) {
    /* Unknown or unstated material. Name the colour, claim no base — the old behaviour claimed
       buttercream for everything, which is how an isomalt splash came to be mixed into a bowl. */
    return {
      text: gelName ? `Colour to match: ${gelName}.` : 'Mix to match the colour shown.',
      showGel: false,
    };
  }
  if (!base.gel) return { text: base.line(), showGel: false };
  return { text: base.line(amount, gelName ?? 'a matching gel'), showGel: !!gelName };
}
