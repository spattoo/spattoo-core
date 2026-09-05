// ── Rendering the colour that was actually chosen ────────────────────────────────────────────────
//
// A baker picks a colour. The renderer multiplies it by whatever light falls on it, so the screen
// shows something brighter and — once values crowd the ceiling — less saturated. Hand the material
// the chosen colour and the cake shows a paler cousin of it.
//
// The correction is to divide the albedo by how much light the surface receives, in LINEAR light,
// so `albedo × light` lands back on the chosen colour.
//
// ⚠️ IN LINEAR, NOT sRGB. sRGB ratios are meaningless here — a renderer multiplies in linear light.
// Correcting in sRGB nearly works for dark colours and fails on saturated mid-tones, which is
// exactly where a teal turns to mint. That mistake cost two rounds on the garnish fix.
//
// ⚠️ IT IS A MULTIPLY, WHICH IS WHY DIVIDING IS EXACT. Rendering BLACK comes back black, and an
// additive white cannot do that. Four earlier attempts on the garnish assumed an additive specular
// and every one failed; the single measurement that separates the two cases is a black surface.
// Because it is a multiply, this is not a fitted constant and it does not clamp at the dark end the
// way subtracting a white would.
//
// ⚠️ THE REFERENCE LIGHT BELONGS TO THE SURFACE, NOT TO THIS FILE. Two surfaces in the same scene
// receive different amounts of light — different roughness, clearcoat, sheen and geometry all change
// it — so each caller measures its own and passes it in. That is why this takes a parameter instead
// of owning a constant: a single shared number would be wrong for everything except whatever was
// measured last. `printExposure.js` measures 1.54 for a print; a garnish measures 2.40.
//
// ⚠️ AND EVERY REFERENCE LIGHT IS MEASURED, NEVER DERIVED. Adding the lighting rig up on paper gives
// the wrong answer — the render is the authority. The recipe: render a mid-grey (#808080) on the
// surface, read it back, and solve for the value that lands it on 128. One division usually
// OVERSHOOTS, because the pipeline is not a pure multiply end to end — tone mapping compresses
// differently at the higher albedo a smaller divisor produces — so take TWO measured points and
// interpolate between them. Re-measure after any change to the HDRI, the scene intensity, the lamps,
// or the surface's own material.

const toLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** '#rgb' | '#rrggbb' | 'rgb(r, g, b)' → [r, g, b] 0–255, or null if it is none of those.
 *
 * ⚠️ `rgba()` IS DELIBERATELY REFUSED, and a unit test holds the line. Matching it would read the
 * three channels and silently discard the alpha, so a half-transparent colour would come back fully
 * opaque and slightly wrong — a guess dressed up as a correction. Returning null leaves the caller's
 * colour untouched, which is the honest failure. */
export function parseColour(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const m = s.match(/^rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = s.replace(/^#/, '');
  if (h.length === 3) return [...h].map(c => parseInt(c + c, 16));
  if (h.length === 6) return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return null;
}

/**
 * color           the colour the baker chose
 * referenceLight  how much light this surface receives, MEASURED (see above). A single number when
 *                 the light is neutral, or `[r, g, b]` when it is not.
 *
 * ⚠️ THREE NUMBERS WHEN THE LIGHT HAS A CAST, and that is not over-engineering — it is what the
 * measurement asks for. An HDRI is a photograph of somewhere, so it need not be neutral: lebombo is
 * an outdoor sky and lifts red more than blue. On a tier wall an asked NEUTRAL #808080 came back
 * 133,125,120 under a single scalar — a spread of 13 across channels that no one scalar can remove,
 * because it is not a difference of amount but of colour. Solving each channel separately is the
 * whole fix. Use a scalar where a grey measures grey; reach for a triple only when it does not.
 *
 * Returns the albedo to hand the material so the RENDER is the chosen colour. Anything unparseable
 * comes back untouched — a caller passing a texture name or a THREE.Color should not have it mangled
 * into a string, and an uncorrected colour is a far smaller failure than a broken one.
 */
export function albedoForLight(color, referenceLight, { rolloff = 0 } = {}) {
  const rgb = parseColour(color);
  if (!rgb) return color;
  const L = Array.isArray(referenceLight) ? referenceLight : [referenceLight, referenceLight, referenceLight];
  if (!L.every(v => v > 0)) return color;
  /* ⚠️ THE CORRECTION FADES TOWARD WHITE, AND IT HAS TO. A flat divide assumes the renderer is a
     pure multiply, and near the top of the range it is not — tone mapping rolls the highlights off,
     so the light actually delivered to a pale surface is LESS than the reference measured at
     mid-grey. Dividing by the full amount there pushes a colour down a curve it cannot climb back
     up: measured on a tier, pure white rendered 215 and the common blush #F6DCE2 came back 35 points
     dark. A white cake must look white.
     ⚠️ THE WEIGHT COMES FROM LUMINANCE, NOT PER CHANNEL. Fading each channel by its own value would
     pull the channels apart by different amounts and SHIFT THE HUE as a colour gets lighter — the
     correction would introduce the very cast it exists to remove. One weight, from the colour's
     luminance, moves all three together. */
  /* ⚠️ OFF BY DEFAULT, because it is a property of the SURFACE, not of the maths. A garnish is a
     small flat piece whose colours were measured and CONFIRMED correct with a pure divide; switching
     a fade on for everybody moved its mid-grey from 128 to 132 and shifted a confirmed-good table
     for no reason. A caller opts in only where the measurement asks for it.
     ⚠️ WEIGHTED BY LUMINANCE, AND A PER-CHANNEL FADE WAS TRIED AND IS WORSE. The reasoning for
     per-channel is appealing — clipping happens per channel, so fade per channel — and the sweep
     refuted it: a #45d345 green went from +59 to +64 on red, a #d34545 red from −8 to +18, a magenta
     from −7 to +17. One weight for all three channels keeps the correction from pulling them apart.
     Do not re-derive this from first principles; it was measured. */
  const lum = (0.2126 * toLinear(rgb[0] / 255) + 0.7152 * toLinear(rgb[1] / 255) + 0.0722 * toLinear(rgb[2] / 255));
  const keep = rolloff > 0 ? Math.min(1, Math.max(0, lum)) ** rolloff : 0;   // 0 at black … 1 at white

  const [r, g, b] = rgb.map((c, i) => {
    const asked = toLinear(c / 255);
    const full = asked / L[i];
    const lin = full + (asked - full) * keep;              // full correction dark, none at white
    return Math.round(Math.max(0, Math.min(255, toSrgb(lin) * 255)));
  });
  return `rgb(${r}, ${g}, ${b})`;
}
