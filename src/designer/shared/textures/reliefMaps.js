import * as THREE from 'three';
import { heightfieldToNormalMap } from './heightfieldNormal.js';

// Raise a flat 2D sticker into a fondant cut-out (the runtime half of placement_config.relief, ported from
// the admin Relief Sticker Studio). From the image's ALPHA (silhouette) + luminance, bake:
//   • a DISPLACEMENT map — the macro form: a ROUNDED-bevel shoulder (a smooth ramp at the silhouette, no
//     vertical cliff → no grid sawtooth) blended slab↔dome. Drives real GPU lift + shadow on a dense mesh.
//   • a NORMAL map — that form + a luminance high-pass (spots/eye/detail) + optional fondant grain.
// Pure (canvas/typed-array); the normal packing REUSES heightfieldToNormalMap. flipY ("flip green") is a
// material concern (normalScale.y sign), not a bake concern, so it's not handled here.

const WORK = 1024;   // bake resolution — image capped to this on the long edge (crisper relief, bounded cost)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Separable, multi-pass, CLAMPING box blur — O(r) per pixel, so the relief's LARGE radii (dome blur ≤80,
// edge round ≤48) stay cheap. (imageNormalMap's boxBlur is O(r²) + WRAPPING, built for small tileable
// radii — the wrong tool here.) `src` is a w·h row-major Float array; returns a blurred copy.
function boxBlur(src, w, h, radius, passes = 1) {
  radius = Math.max(1, Math.round(radius));
  let a = Float32Array.from(src), b = new Float32Array(w * h);
  const norm = 1 / (2 * radius + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const base = y * w; let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += a[base + clamp(k, 0, w - 1)];
      for (let x = 0; x < w; x++) { b[base + x] = sum * norm; sum += a[base + clamp(x + radius + 1, 0, w - 1)] - a[base + clamp(x - radius, 0, w - 1)]; }
    }
    [a, b] = [b, a];
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += a[clamp(k, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) { b[y * w + x] = sum * norm; sum += a[clamp(y + radius + 1, 0, h - 1) * w + x] - a[clamp(y - radius, 0, h - 1) * w + x]; }
    }
    [a, b] = [b, a];
  }
  return a;
}

// Decode the image → { mask (alpha 0..1), lum (luminance × alpha) }, capped to WORK. Drawn VERTICALLY
// FLIPPED so the baked DataTextures (whose flipY flag three ignores) line up with the sticker's flipY
// albedo texture — otherwise the relief would sit upside-down relative to the colour.
function imageToFields(img) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const scale = Math.min(1, WORK / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale)), h = Math.max(1, Math.round(ih * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.translate(0, h); ctx.scale(1, -1);
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const mask = new Float32Array(w * h), lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = d[i * 4 + 3] / 255; mask[i] = a;
    lum[i] = a * (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  }
  return { w, h, mask, lum };
}

// H = displacement height (rounded-bevel coverage × slab↔dome). Hn = normal height (H + a luminance
// high-pass so spots/eyes read as detail, + optional fondant grain). Grain is added to Hn only, so it
// shades like a powdery satin surface without actually moving geometry.
// `flattenThin` (0 = off) and `flatMask` (optional per-pixel 0..1, 1/absent = no effect) control WHICH parts
// of the sticker stay flush on the wall — both COLOUR-INDEPENDENT (never keyed off brightness):
//   • flattenThin — SHAPE: erode the silhouette so THIN protrusions (spikes, thin edges) drop out of the
//     RAISED area and hug the wall, while the thick body stays raised. A feature narrower than ~2× the radius
//     is removed; the author tunes the radius. Automatic, no per-element painting.
//   • flatMask — EXPLICIT: an authored paint mask (black = flush) the author draws over the exact parts to
//     keep flat, ignoring both shape and colour. Multiplies on top of flattenThin.
function buildFields({ w, h, mask, lum }, { puff = 0.5, detail = 0.4, domeBlur = 34, edgeRound = 16, grain = 0.5, flattenThin = 0, flatMask = null, flatTop = 0 }) {
  const N = w * h;
  const domeRaw = boxBlur(mask, w, h, domeBlur, 2);
  let dmx = 1e-4; for (let i = 0; i < N; i++) if (mask[i] > 0.5 && domeRaw[i] > dmx) dmx = domeRaw[i];
  const cov = boxBlur(mask, w, h, edgeRound, 2);
  const lumBlur = boxBlur(lum, w, h, 2, 1);
  // Thin-feature erosion: a blurred silhouette thresholded at ~0.5 removes features thinner than the radius
  // (their blur never reaches 0.5) while the thick body stays ~1. Radius scales with flattenThin.
  const thinR = flattenThin > 0 ? Math.max(2, Math.round(flattenThin * 55)) : 0;
  const thinCov = thinR ? boxBlur(mask, w, h, thinR, 2) : null;
  // Flat-top plaque (bake.flatTop, 0 = off): blend the per-pixel domed form toward a UNIFORM plateau — the
  // whole silhouette (thin parts INCLUDED) at one flat height, only a small rounded outer edge — so the relief
  // reads as a flat lifted plaque, not a sculpted uneven mound. Uses a SMALL edge radius (vs `edgeRound`, which
  // weights thin features down) so spikes/limbs reach full height too. Normal-map detail still shades on top.
  const plateauCov = flatTop > 0 ? boxBlur(mask, w, h, Math.max(2, Math.round(edgeRound * 0.35)), 2) : null;
  let grainF = null;
  if (grain > 0) {
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) { const s = Math.sin((i % w) * 12.9898 + ((i / w) | 0) * 78.233) * 43758.5453; raw[i] = (s - Math.floor(s)) - 0.5; }
    grainF = boxBlur(raw, w, h, 1, 1);
  }
  const H = new Float32Array(N), Hn = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const coverage = smoothstep(0.30, 0.85, cov[i]);         // rounded shoulder 0..1
    const dome = clamp(domeRaw[i] / dmx, 0, 1);
    let form = coverage * ((1 - puff) + puff * dome);        // domed ↔ slab sculpted form
    if (plateauCov) form = form * (1 - flatTop) + smoothstep(0.35, 0.65, plateauCov[i]) * flatTop;  // → flat plaque
    const thin = thinCov ? smoothstep(0.50, 0.66, thinCov[i]) : 1;   // thin protrusion → 0 (flush on wall)
    const authored = flatMask ? flatMask[i] : 1;                     // painted mask: 0 = flush, 1 = raised
    const macro = form * thin * authored;
    H[i] = macro;
    // flatTop ALSO fades out the image-derived surface detail (spots/eye/feature bumps) so a flat plaque reads
    // truly flat — the print still shows via the albedo, just no 3D relief. detailN = 1 at flatTop 0 (unchanged).
    // Grain keeps its own slider (a uniform fondant texture, not "raised points").
    const detailN = 1 - flatTop;
    let hn = macro + (lum[i] - lumBlur[i]) * detail * coverage * detailN;
    if (grainF) hn += grainF[i] * grain * 0.09 * coverage;
    Hn[i] = clamp(hn, 0, 1.4);
  }
  return { H, Hn, w, h };
}

function dispTexture(H, w, h) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { const g = Math.round(clamp(H[i], 0, 1) * 255); data[i * 4] = g; data[i * 4 + 1] = g; data[i * 4 + 2] = g; data[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  // DataTexture defaults to NearestFilter, which stair-steps the lift across the 96x96 grid. Linear so the
  // displacement interpolates smoothly between texels.
  // NO mipmaps here, deliberately: displacement is sampled in the VERTEX shader, where there are no
  // derivatives and the LOD is always 0 — mipmaps would never be read. Worse, a mipmapped minFilter with
  // no mipmaps generated leaves the texture INCOMPLETE, which samples as black and silently kills the lift.
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;      // a height field is DATA — an sRGB decode would warp the lift
  tex.needsUpdate = true;
  return tex;
}

// Bake { normalMap, displacementMap } for an <img>. `bake` = placement_config.relief.bake. The normal's
// gain (slope 4) matches the studio at WORK resolution; material.normalScale tunes it per instance.
// `flatMaskImg` (optional, a decoded image of placement_config.relief.flatMask — the authored black=flush
// paint-mask) is sampled to the field grid and fed to buildFields as `flatMask`; absent = fully raised
// (behaves exactly as before). It is a RELIEF-level sibling of `bake`, layered on top of `bake.flattenThin`.
export function buildReliefMaps(img, bake = {}, flatMaskImg = null) {
  const fields = imageToFields(img);
  let flatMask = null;
  if (flatMaskImg) {
    const { w, h } = fields;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    // Draw with the SAME vertical flip imageToFields applies, so the authored mask (painted in upright
    // image space in the studio) lines up with the flipped displacement/normal fields.
    ctx.translate(0, h); ctx.scale(1, -1);
    ctx.drawImage(flatMaskImg, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    flatMask = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) flatMask[i] = d[i * 4] / 255;   // RED channel: 0 = flush, 1 = raised
  }
  const f = buildFields(fields, { ...bake, flatMask });
  return {
    normalMap: heightfieldToNormalMap(f.Hn, f.w, f.h, 4),
    displacementMap: dispTexture(f.H, f.w, f.h),
  };
}
