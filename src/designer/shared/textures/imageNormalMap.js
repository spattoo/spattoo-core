import * as THREE from 'three';
import { heightfieldToNormalMap } from './heightfieldNormal.js';

// Turn a photo of a real texture (e.g. a palette-knife stroke on white) into cake-surface relief.
// A flat colour photo can't be used as a height map directly: the white BACKGROUND is bright but must
// read as flat, while glossy HIGHLIGHTS inside the stroke are also bright but must read as raised. So
// we flood-fill the border-connected white as background (height 0) and use luminance only inside the
// stroke (bright glossy ridges → high). From that height field we make BOTH a displacementMap (real
// GPU vertex displacement → genuine 3D, breaks the silhouette) and a normalMap (fine detail). Colour
// is discarded, so it recolours to any frosting colour. Edges wrap, so a tileable source tiles clean.

function readPixels(image, crop, max) {
  const sx = crop?.sx ?? 0, sy = crop?.sy ?? 0;
  const sw = crop?.sw ?? image.width, sh = crop?.sh ?? image.height;
  const scale = Math.min(1, max / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

function boxBlur(H, w, h, r) {
  if (r <= 0) return H;
  const tmp = new Float32Array(H.length);
  const at = (x, y) => H[(((y % h) + h) % h) * w + (((x % w) + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { s += at(x + dx, y + dy); n++; }
    tmp[y * w + x] = s / n;
  }
  return tmp;
}

// Height field ∈ [0,1] from an image. Two background modes:
//   bgMode:'luminance' (proper grayscale height map — dark/transparent bg, light = high): height IS
//      luminance, normalised so the darkest pixel → 0 (flat) and brightest → 1. No flood-fill needed.
//   bgMode:'white' (colour photo on white): flood-fill border-connected white → flat (0); inside the
//      stroke, height = base + (1-base)·luminance (so the body domes and highlights read as ridges).
// `base` only applies to 'white'; `blur` softens cliffs in both.
export function heightFieldFromImage(image, { crop = null, max = 512, base = 0.45, blur = 1, whiteCut = 230, bgMode = 'white' } = {}) {
  const { data, w, h } = readPixels(image, crop, max);
  const N = w * h;
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    lum[i] = (0.299 * data[4 * i] + 0.587 * data[4 * i + 1] + 0.114 * data[4 * i + 2]) / 255;
  }

  let H = new Float32Array(N);
  if (bgMode === 'luminance') {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < N; i++) { if (lum[i] < lo) lo = lum[i]; if (lum[i] > hi) hi = lum[i]; }
    const range = (hi - lo) || 1;
    for (let i = 0; i < N; i++) H[i] = (lum[i] - lo) / range;
  } else {
    const isWhite = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      isWhite[i] = (data[4 * i] > whiteCut && data[4 * i + 1] > whiteCut && data[4 * i + 2] > whiteCut) ? 1 : 0;
    }
    const bg = new Uint8Array(N);
    const stack = [];
    const seed = (x, y) => { const i = y * w + x; if (isWhite[i] && !bg[i]) { bg[i] = 1; stack.push(i); } };
    for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
    for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0;
      if (x > 0) seed(x - 1, y); if (x < w - 1) seed(x + 1, y);
      if (y > 0) seed(x, y - 1); if (y < h - 1) seed(x, y + 1);
    }
    for (let i = 0; i < N; i++) H[i] = bg[i] ? 0 : base + (1 - base) * lum[i];
  }
  H = boxBlur(H, w, h, blur);
  return { height: H, w, h };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Compose a SEAMLESS, full-coverage height tile by STAMPING a single stroke field many times at
// jittered position / rotation / scale, wrapping at the tile edges (both axes) and max-blending. This
// is "build one stroke, repeat it" done right: removes the grid + seams that tiling one stroke makes.
// Stamps are placed where the source height > 0 (the stroke), so the dark background contributes
// nothing. Deterministic (seeded) so it's reproducible.
export function composeStrokeTile(field, { size = 512, count = 40, minScale = 0.5, maxScale = 0.9, seed = 1337, angleBase = 0, angleSpread = Math.PI * 2 } = {}) {
  const { height: src, w: sw, h: sh } = field;
  const srcAt = (x, y) => (x < 0 || y < 0 || x >= sw || y >= sh) ? 0 : src[(y | 0) * sw + (x | 0)];
  const out = new Float32Array(size * size);
  const rnd = mulberry32(seed);
  for (let k = 0; k < count; k++) {
    const cx = rnd() * size, cy = rnd() * size;
    // angleBase ± angleSpread/2: full random (default) makes a cross-hatch crinkle; a tight spread
    // keeps strokes roughly aligned so each bold smear stays a distinct directional stroke.
    const ang = angleBase + (rnd() - 0.5) * angleSpread;
    const sc = minScale + rnd() * (maxScale - minScale);
    const half = sc * Math.max(sw, sh) * 0.6;
    const ca = Math.cos(-ang), sa = Math.sin(-ang);
    for (let ty = Math.floor(cy - half); ty <= cy + half; ty++) {
      for (let tx = Math.floor(cx - half); tx <= cx + half; tx++) {
        const dx = tx - cx, dy = ty - cy;
        const lx = (dx * ca - dy * sa) / sc, ly = (dx * sa + dy * ca) / sc;   // inverse rot+scale
        const hv = srcAt(lx + sw / 2, ly + sh / 2);
        if (hv <= 0) continue;
        const i = (((ty % size) + size) % size) * size + (((tx % size) + size) % size);   // wrap both axes
        if (hv > out[i]) out[i] = hv;
      }
    }
  }
  return { height: out, w: size, h: size };
}

// Grayscale displacement map (THREE samples .r) from a height field.
export function heightTextureFromField({ height, w, h }) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, Math.round(height[i] * 255)));
    data[4 * i] = data[4 * i + 1] = data[4 * i + 2] = v; data[4 * i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Tangent-space normal map (Sobel) from a height field (shared packer).
export function normalTextureFromField({ height, w, h }, strength = 1) {
  return heightfieldToNormalMap(height, w, h, strength * 4);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Load a stroke/texture photo URL → { displacementMap, normalMap, field }. Pass to a material as
// displacementMap (+ displacementScale) and normalMap on a dense mesh for real 3D relief.
// Filled-silhouette coverage from a height field: blur (so the comb GROOVES fill in — they're thin
// dark lines between ridges) then soft-threshold. Used as the alpha mask so the whole stroke reads
// SOLID, with the comb living only in the normal map (relief), not punching transparent holes.
export function coverageFromField({ height, w, h }, blur = 4, cut = 0.06) {
  const B = boxBlur(height, w, h, blur);
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const t = Math.min(1, Math.max(0, (B[i] - (cut - 0.03)) / 0.06));
    out[i] = t * t * (3 - 2 * t);
  }
  return { height: out, w, h };
}

export function loadStrokeMaps(url, opts = {}) {
  return loadImage(url).then(img => {
    let field = heightFieldFromImage(img, opts);
    if (opts.stamp) field = composeStrokeTile(field, opts.stamp);   // seamless multi-stroke tile
    // valueMap = the stroke's grayscale shading as an sRGB ALBEDO, meant to be TINTED by the material
    // colour → the photo's gloss/comb/highlights, recolourable to any frosting colour.
    const valueMap = heightTextureFromField(field);
    valueMap.colorSpace = THREE.SRGBColorSpace;
    return {
      valueMap,
      displacementMap: heightTextureFromField(field),
      normalMap: normalTextureFromField(field, opts.strength ?? 1),
      coverageMap: heightTextureFromField(coverageFromField(field, opts.coverBlur ?? 4, opts.coverCut ?? 0.06)),
      field,
    };
  });
}

// ── Back-compat: normal-map-only from an image (no displacement). ───────────────
export function normalMapFromImage(image, opts = {}) {
  return normalTextureFromField(heightFieldFromImage(image, opts), opts.strength ?? 1);
}
export function loadNormalMapFromUrl(url, opts) {
  return loadImage(url).then(img => normalMapFromImage(img, opts));
}
