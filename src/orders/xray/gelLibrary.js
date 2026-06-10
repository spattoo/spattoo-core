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

function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const AMOUNTS = [
  { max: 0.12, text: 'a tiny dab' },
  { max: 0.30, text: 'a small amount' },
  { max: 0.55, text: 'a moderate amount' },
  { max: 1.01, text: 'a generous amount (build up gradually)' },
];
function amountFor(strength) {
  return (AMOUNTS.find(a => strength < a.max) ?? AMOUNTS[AMOUNTS.length - 1]).text;
}

// Returns { hex, gel: {brand,name,hex}|null, amount, recipe, approx } or null.
export function gelRecipeFor(targetHex) {
  const hex = normalizeHex(targetHex);
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { h, s, l } = rgbToHsl(rgb);

  // Near-white → no gel.
  if (l > 0.9 && s < 0.12) {
    return { hex, gel: null, amount: null, recipe: 'Plain white buttercream — no gel needed.', approx: false };
  }
  // Near-black → black gel.
  if (l < 0.12) {
    const g = GELS.find(x => x.name === 'Super Black');
    return { hex, gel: g, amount: amountFor(1), recipe: `White buttercream + ${amountFor(1)} of ${g.brand} ${g.name}.`, approx: false };
  }

  // Match by hue (chroma-aware); desaturated dark colours lean brown/black.
  let pool = GELS;
  if (s < 0.18 && l < 0.6) pool = GELS.filter(x => /Brown|Black/.test(x.name));
  const best = pool
    .map(g => ({ g, d: hueDist(h, rgbToHsl(hexToRgb(g.hex)).h) }))
    .sort((a, b) => a.d - b.d)[0];

  const strength = Math.min(1, (1 - l) * (0.35 + 0.65 * s) * 1.6);
  const amount = amountFor(strength);
  const approx = best.d > 22; // hue not a close family match
  return {
    hex,
    gel: best.g,
    amount,
    recipe: `White buttercream + ${amount} of ${best.g.brand} ${best.g.name}.`,
    approx,
  };
}
