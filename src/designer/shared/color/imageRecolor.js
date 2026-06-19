// Pixel-based recolour for 2D image stickers — the runtime half of a "recolourable region"
// asset (e.g. a card butterfly's wings). Pure (no React/THREE) so it's unit-testable and shared
// by the designer runtime and admin authoring. NEVER element-type aware: the element's
// placement_config.recolor describes WHICH pixels recolour (a region descriptor), this applies
// the customer's chosen colour to them while preserving each pixel's shading.
//
// Region descriptor (placement_config.recolor):
//   { method: 'blue_gt_green', guard?: number }  — wing fill is blue-dominant; gold edges
//     (green > blue) and white highlights (blue ≈ green) are excluded structurally.
// New methods (baked mask, hue band, …) slot in via `matcher` without touching callers.

export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex ?? '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hslToRgb(h, s, l) {
  h /= 360;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)].map(x => Math.round(x * 255));
}

// Returns a predicate (data, i) → is this opaque pixel part of the recolourable region?
// `i` is the pixel index × 4 (RGBA stride). Method-driven, never type-driven.
function matcher(region) {
  if (!region) return () => false;                         // no descriptor → recolour nothing
  const method = region.method ?? 'opaque';
  if (method === 'opaque') {
    return (d, i) => d[i + 3] >= 8;                         // every non-transparent pixel (whole image)
  }
  if (method === 'blue_gt_green') {
    const guard = region.guard ?? 12;                        // blue must exceed green by this margin
    return (d, i) => d[i + 3] >= 8 && (d[i + 2] - d[i + 1]) >= guard;
  }
  if (method === 'saturated') {
    // The vivid coloured fill, regardless of hue — recolours any colour while leaving black/grey/
    // white lines untouched (their saturation ≈ 0). For "one colour + black" decals.
    const sat = region.sat ?? 0.25;
    return (d, i) => d[i + 3] >= 8 && rgbToHsl(d[i], d[i + 1], d[i + 2])[1] >= sat;
  }
  return () => false;                                        // unknown method → recolour nothing
}

// The recolour methods, for admin authoring UIs (label + which param it takes). Keep in sync
// with `matcher` above — adding a method here AND there is all it takes.
export const RECOLOR_METHODS = [
  { value: 'opaque',        label: 'Whole image',        param: null },
  { value: 'saturated',     label: 'Coloured fill (keep black/white lines)', param: 'sat' },
  { value: 'blue_gt_green', label: 'Blue-dominant fill (keep gold/white)',   param: 'guard' },
];

// Recolour the matched region of an RGBA buffer (mutates in place) to `targetHex`, preserving each
// pixel's brightness relative to the region average — so highlights/shadows survive while the overall
// tone becomes the picked colour (dark stays dark, vivid stays vivid). No-op if nothing matches.
export function recolorImageData(data, width, height, targetHex, region) {
  const match = matcher(region);
  const [tH, tS, tL] = rgbToHsl(...hexToRgb(targetHex));

  // Pass 1 — region average lightness, so we can re-centre tone on the target.
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (!match(data, i)) continue;
    sum += rgbToHsl(data[i], data[i + 1], data[i + 2])[2]; n++;
  }
  if (!n) return;
  const refL = sum / n;

  // Pass 2 — target hue/sat/lightness; re-add each pixel's deviation from the average.
  for (let i = 0; i < data.length; i += 4) {
    if (!match(data, i)) continue;
    const ll = rgbToHsl(data[i], data[i + 1], data[i + 2])[2];
    const nl = Math.min(1, Math.max(0, tL + (ll - refL)));
    const [r, g, b] = hslToRgb(tH, tS, nl);
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
}
