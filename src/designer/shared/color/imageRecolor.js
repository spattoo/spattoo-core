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
// with `matcher` above — adding a method here AND there is all it takes. `multi: true` marks a
// technique that yields MANY recolourable regions (per-region colours via groupColors), not one.
export const RECOLOR_METHODS = [
  { value: 'opaque',        label: 'Whole image',        param: null },
  { value: 'saturated',     label: 'Coloured fill (keep black/white lines)', param: 'sat' },
  { value: 'blue_gt_green', label: 'Blue-dominant fill (keep gold/white)',   param: 'guard' },
  { value: 'hue_regions',   label: 'Auto colour regions (recolour each hue)', param: 'sat', multi: true },
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

// ── Multi-region recolour (method: 'hue_regions') ─────────────────────────────────────────────
// The `saturated`/`blue_gt_green` methods above recolour ONE region to ONE colour. `hue_regions`
// instead CLUSTERS the coloured pixels by hue and exposes each dominant colour as its own
// recolourable region — so a two-tone sticker (orange body + yellow belly) gets a colour per part.
// The designer feeds these into the SAME groupColors/"Customise colours" path GLB part-groups use.
// Clustering is by HUE only, so same-hue/different-lightness areas group together (brown ⊂ orange).

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, x | 0)).toString(16).padStart(2, '0')).join('');
}
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const nearestHue = (hue, hues) => { let k = 0, bd = Infinity; for (let j = 0; j < hues.length; j++) { const dd = hueDist(hue, hues[j]); if (dd < bd) { bd = dd; k = j; } } return k; };

// Detect the image's dominant colours → [{ hue, hex, share }] sorted by share desc. `hex` is the
// region's average colour (the swatch). Peaks are read off the RAW hue histogram (NOT smoothed —
// smoothing spreads a dominant colour's skirt over an adjacent minority colour and hides it); one
// colour spread across adjacent bins is re-joined by the 16° merge. Deterministic for a given image.
export function extractRegions(data, width, height, { minSat = 0.18, minAlpha = 8, maxRegions = 5, minShare = 0.02 } = {}) {
  const BINS = 36, span = 360 / BINS;
  const hist = new Float64Array(BINS);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < minAlpha) continue;
    const [hue, sat] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (sat < minSat) continue;
    hist[Math.min(BINS - 1, Math.floor(hue / span))]++; total++;
  }
  if (!total) return [];
  const thresh = total * 0.02;                             // a peak must hold ≥2% of coloured pixels (absolute)
  const peaks = [];
  for (let b = 0; b < BINS; b++) {
    if (hist[b] < thresh) continue;
    if (hist[b] >= hist[(b + BINS - 1) % BINS] && hist[b] >= hist[(b + 1) % BINS]) peaks.push({ hue: (b + 0.5) * span, weight: hist[b] });
  }
  peaks.sort((a, b) => b.weight - a.weight);
  const hues = [];                                         // strongest peaks ≥16° apart (distinct hues)
  for (const p of peaks) { if (hues.every(h => hueDist(h, p.hue) >= 16)) hues.push(p.hue); if (hues.length >= maxRegions) break; }
  if (!hues.length) return [];

  const sr = new Float64Array(hues.length), sg = new Float64Array(hues.length), sb = new Float64Array(hues.length), cnt = new Uint32Array(hues.length);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < minAlpha) continue;
    const [hue, sat] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (sat < minSat) continue;
    const k = nearestHue(hue, hues);
    sr[k] += data[i]; sg[k] += data[i + 1]; sb[k] += data[i + 2]; cnt[k]++;
  }
  return hues
    .map((hue, k) => ({ hue, hex: rgbToHex(sr[k] / Math.max(cnt[k], 1), sg[k] / Math.max(cnt[k], 1), sb[k] / Math.max(cnt[k], 1)), share: cnt[k] / total }))
    .filter(r => r.share >= minShare)
    .sort((a, b) => b.share - a.share);
}

// Recolour each hue cluster (peakHues[k], in the extractRegions order) to targetsHex[k], mutating in
// place. Pixel→region labels are computed ONCE from the ORIGINAL pixels, so recolouring one region
// can't re-capture another's already-changed pixels. Luminance-preserving per region. A null/empty
// target leaves that region as-is (so a region the customer hasn't touched renders unchanged).
export function recolorRegions(data, width, height, peakHues, targetsHex, { minSat = 0.18, minAlpha = 8 } = {}) {
  if (!peakHues?.length) return;
  const K = peakHues.length, n = data.length / 4;
  const label = new Int16Array(n).fill(-1), sumL = new Float64Array(K), cnt = new Uint32Array(K);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (data[i + 3] < minAlpha) continue;
    const [hue, sat, li] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (sat < minSat) continue;
    const k = nearestHue(hue, peakHues);
    label[p] = k; sumL[k] += li; cnt[k]++;
  }
  const refL = Array.from({ length: K }, (_, k) => (cnt[k] ? sumL[k] / cnt[k] : 0.5));
  const t = targetsHex.map(hex => (hex ? rgbToHsl(...hexToRgb(hex)) : null));   // null → leave region as-is
  for (let p = 0; p < n; p++) {
    const k = label[p]; if (k < 0 || !t[k]) continue;
    const i = p * 4;
    const ll = rgbToHsl(data[i], data[i + 1], data[i + 2])[2];
    const nl = Math.min(1, Math.max(0, t[k][2] + (ll - refL[k])));
    const [r, g, b] = hslToRgb(t[k][0], t[k][1], nl);
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
}
