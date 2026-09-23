// Cream-mixing helper — maps a cake colour (hex) to a gel-colour recipe.
// A cake colour is almost always a TINT (white buttercream + a little gel), so
// we match the HUE to a gel anchor and derive the AMOUNT from how deep/saturated
// the colour is — matching a pale pink directly against a full-strength gel by
// raw distance would mismatch. Starter anchor set (Sugarflair + Americolor),
// meant to be reviewed/extended.

// brand · name · hex = the gel at roughly full strength.
const GELS = [
  { brand: 'Sugarflair', name: 'Christmas Red',  hex: '#C8102E' },
  { brand: 'Americolor', name: 'Super Red',      hex: '#BE1E2D' },
  { brand: 'Sugarflair', name: 'Claret',         hex: '#6E1A2B' },
  { brand: 'Americolor', name: 'Burgundy',       hex: '#6D2433' },
  { brand: 'Sugarflair', name: 'Pink',           hex: '#E94B8A' },
  { brand: 'Americolor', name: 'Electric Pink',  hex: '#E91E8C' },
  { brand: 'Americolor', name: 'Soft Pink',      hex: '#F4A6C0' },
  { brand: 'Sugarflair', name: 'Baby Pink',      hex: '#F6C0CE' },
  { brand: 'Sugarflair', name: 'Grape Violet',   hex: '#6A2C91' },
  { brand: 'Americolor', name: 'Regal Purple',   hex: '#5B2A86' },
  { brand: 'Sugarflair', name: 'Deep Purple',    hex: '#3B1E6D' },
  { brand: 'Americolor', name: 'Electric Purple',hex: '#7E3FBF' },
  { brand: 'Americolor', name: 'Royal Blue',     hex: '#2552A0' },
  { brand: 'Sugarflair', name: 'Navy Blue',      hex: '#1B2A6B' },
  { brand: 'Americolor', name: 'Sky Blue',       hex: '#6FB7E0' },
  { brand: 'Sugarflair', name: 'Baby Blue',      hex: '#A7D3E8' },
  { brand: 'Sugarflair', name: 'Teal',           hex: '#1C7C7C' },
  { brand: 'Americolor', name: 'Turquoise',      hex: '#2EB8B8' },
  { brand: 'Sugarflair', name: 'Holly Green',    hex: '#1E7A35' },
  { brand: 'Americolor', name: 'Forest Green',   hex: '#1F5C3A' },
  { brand: 'Americolor', name: 'Leaf Green',     hex: '#5BA535' },
  { brand: 'Sugarflair', name: 'Mint Green',     hex: '#A7D9B5' },
  { brand: 'Americolor', name: 'Electric Green', hex: '#3CB54A' },
  { brand: 'Sugarflair', name: 'Egg Yellow',     hex: '#F4C430' },
  { brand: 'Americolor', name: 'Lemon Yellow',   hex: '#F6E04B' },
  { brand: 'Americolor', name: 'Gold',           hex: '#D7A12C' },
  { brand: 'Sugarflair', name: 'Tangerine',      hex: '#F0691E' },
  { brand: 'Sugarflair', name: 'Autumn Leaf',    hex: '#D2691E' },
  { brand: 'Americolor', name: 'Warm Brown',     hex: '#7A4A2B' },
  { brand: 'Americolor', name: 'Chocolate Brown',hex: '#4B2E1E' },
  { brand: 'Sugarflair', name: 'Dark Brown',     hex: '#3A2417' },
  { brand: 'Americolor', name: 'Super Black',    hex: '#1A1A1A' },
];

export function normalizeHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return '#' + h.toLowerCase();
}

function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

// ── Can you actually GET there from white? ──────────────────────────────────────────────────────
//
// The first version picked a gel by HUE ALONE and derived the amount from how dark and saturated
// the target was. Hue is the wrong question, and the strip drawn beside the sentence (GelMix.jsx)
// is what exposed it: an olive `#8f9b0f` came back as "white buttercream + Americolor Lemon
// Yellow". Their hues are ten degrees apart, so it scored well — but adding yellow to white cannot
// produce olive. It produces paler yellow. Every tint of one gel lies on the line from white to
// that gel, and olive is nowhere near the yellow line.
//
// Sandeep: *"exactly, i was about to call out the same issue."*
//
// So the question is REACHABILITY, not similarity: for each gel, how close does the white→gel tint
// line pass to the colour we want? The nearest point on that line also tells us the STRENGTH — how
// far along towards neat gel you have to go — which is the amount, measured rather than guessed.
//
// ⚠️ THIS IS A MODEL OF MIXING, NOT MIXING. Pigments are subtractive and buttercream is not a
// screen; a straight line in sRGB is a first approximation of a tint and nothing more. It is a much
// better approximation than "same hue", which is the bar it has to clear. Everything it cannot
// reach is REPORTED rather than rounded off — see `approx` and the second gel below.
//
// ⚠️ DISTANCE IS MEASURED IN LAB, BLENDING HAPPENS IN sRGB. Two different jobs: the blend is what
// the pigment does, the distance is what the eye notices. RGB distance says #8f9b0f and #f6e04b are
// closer than they look, because it counts a change in blue as much as a change in green.

// sRGB (0-255) → CIE L*a*b*, D65. Enough for "which of these is closer"; CIE76 is coarse for
// near-identical colours and we are never comparing those.
function toLab({ r, g, b }) {
  const f = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
  const R = f(r), G = f(g), B = f(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = k(X), fy = k(Y), fz = k(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const dLab = (p, q) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);

const WHITE = { r: 255, g: 255, b: 255 };
const mix = (base, gel, t) => ({
  r: base.r + (gel.r - base.r) * t,
  g: base.g + (gel.g - base.g) * t,
  b: base.b + (gel.b - base.b) * t,
});

// How far along white→gel to go, and how far off we still are. Sampled rather than solved: the
// distance is measured in Lab, which is not linear in t, so there is no closed form worth having.
// 64 steps is finer than anyone can dose a gel.
function bestBlend(base, gelRgb, targetLab) {
  let best = { t: 0, d: Infinity, rgb: base };
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const rgb = mix(base, gelRgb, t);
    const d = dLab(toLab(rgb), targetLab);
    if (d < best.d) best = { t, d, rgb };
  }
  return best;
}

/* ── HOW MUCH is not HOW FAR ALONG ──────────────────────────────────────────────────────────────
 * The obvious move once the line exists is to read the amount off `t` — how far towards neat gel
 * the answer sits. It is wrong, and a test caught it: a pale tint of Baby Pink came out as "a
 * moderate amount" because Baby Pink is itself a pale gel, so reaching a pale pink means going a
 * long way along a short line. Meanwhile a dab of Super Black takes you most of the way to black.
 *
 * `t` measures distance in COLOUR. Amount is pigment by VOLUME, and the two are related by how
 * strong the pigment is — which nothing here knows. What does predict volume is how DEEP the target
 * is: a wash needs a dab whatever colour it is, a saturated colour needs a lot. That is the old
 * heuristic, and on this one question it was right. Kept, with its reasoning written down so the
 * next person does not "fix" it into `t` again.
 */
const AMOUNTS = [
  { max: 0.12, text: 'a tiny dab' },
  { max: 0.30, text: 'a small amount' },
  { max: 0.55, text: 'a moderate amount' },
  { max: 1.01, text: 'a generous amount (build up gradually)' },
];
function amountFor(targetHsl) {
  const load = Math.min(1, (1 - targetHsl.l) * (0.35 + 0.65 * targetHsl.s) * 1.6);
  return (AMOUNTS.find(a => load < a.max) ?? AMOUNTS[AMOUNTS.length - 1]).text;
}

/* ⚠️ A GAP THIS BIG IS A DIFFERENT COLOUR, NOT A NEARBY ONE. ~6 is where a careful eye starts to
   notice a difference between two flat patches; 12 is "these are not the same colour". Below it,
   say the recipe plainly. Above it, we owe the baker a warning or a second gel, because they are
   about to mix a bowl of something that will not match the cake. */
const CLOSE_ENOUGH = 12;

const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
const rgbToHex = ({ r, g, b }) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

// Returns { hex, gel, amount, recipe, approx, second?, reachedHex? } or null.
export function gelRecipeFor(targetHex) {
  const hex = normalizeHex(targetHex);
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const hsl = rgbToHsl(rgb);
  const { l, s } = hsl;

  // Near-white → no gel. Kept as a special case because the maths would otherwise answer with a
  // tiny dab of whatever gel happens to point that way, and "no gel needed" is the useful answer.
  if (l > 0.9 && s < 0.12) {
    return { hex, gel: null, amount: null, recipe: 'Plain white buttercream — no gel needed.', approx: false };
  }

  const targetLab = toLab(rgb);
  const scored = GELS
    .map(g => ({ g, ...bestBlend(WHITE, hexToRgb(g.hex), targetLab) }))
    .sort((a, b) => a.d - b.d);
  const best = scored[0];

  /* ── The second gel ───────────────────────────────────────────────────────────────────────────
     One gel traces one line, and a colour off every line needs two — which is what a decorator
     does without thinking: green, then a little yellow to warm it. Offered only when the first gel
     alone misses, and only when the second genuinely CLOSES the gap (a third of it, at least), so
     this never pads a good recipe with a pointless second tub.
     Searched from the point the first gel reached, not from white: that is where the bowl actually
     is when the second gel goes in. */
  let second = null;
  if (best.d > CLOSE_ENOUGH) {
    const help = GELS
      .filter(g => g !== best.g)
      .map(g => ({ g, ...bestBlend(best.rgb, hexToRgb(g.hex), targetLab) }))
      .sort((a, b) => a.d - b.d)[0];
    if (help && help.d < best.d * 0.67) second = help;
  }

  const reached = second ?? best;
  const amount = amountFor(hsl);
  const approx = reached.d > CLOSE_ENOUGH;

  /* The second gel is a CORRECTION, and it is described as one. No amount is claimed for it: how
     much it takes depends on the pigment's strength against a bowl that is already coloured, which
     is exactly the judgement a decorator makes by eye and we cannot make for them. "A touch, until
     it matches" is the true instruction. */
  const recipe = second
    ? `White buttercream + ${amount} of ${best.g.brand} ${best.g.name}, then a touch of `
      + `${second.g.brand} ${second.g.name} until it matches.`
    : `White buttercream + ${amount} of ${best.g.brand} ${best.g.name}.`;

  return {
    hex,
    gel: best.g,
    // The second gel, for the strip to draw and the sentence to name. Absent for most colours.
    second: second ? { ...second.g } : null,
    amount,
    recipe,
    approx,
    /* What this recipe actually LANDS ON, so the picture can show the honest result instead of the
       colour that was asked for. A strip whose last chip is always the target says every recipe
       works, which is the claim this whole change exists to stop making. */
    reachedHex: rgbToHex(reached.rgb),
  };
}
