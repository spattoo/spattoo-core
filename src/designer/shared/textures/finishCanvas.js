import * as THREE from 'three';

// ── Shared canvas plumbing for tier-wall PARTICLE FINISHES (luster dust, gold leaf) ──
// Every particle finish bakes its look into the tier-wall material maps. They all use the
// same canvas sizing (aspect = wall circumference : height, so a particle draws round and
// lands where it was placed), the same no-mipmap upload (fine particles must not average
// away on a minified texture), and the same absolute-value greyscale fills. Centralised here
// so dust + foil (and the unified compositor) never re-derive it.

// Canvas aspect = circumference:height. Cap the width (keeping aspect) so a short/wide tier
// can't make a giant texture that fails to upload (→ a blank wall).
export function finishCanvasSize(radius, height) {
  const WU = 2 * Math.PI * radius;
  const aspect = WU / Math.max(0.01, height);
  let Hc = 512, Wc = Math.round(Hc * aspect);
  if (Wc > 2048) { Wc = 2048; Hc = Math.round(2048 / aspect); }
  Hc = Math.max(8, Hc); Wc = Math.max(8, Wc);
  return { WU, Wc, Hc };
}

export function mkCtx(bg, Wc, Hc) {
  const c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
  const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, Wc, Hc); return x;
}

// No mipmaps + LinearFilter so fine particles survive minification; sRGB only on colour maps.
export function ctxTexture(ctx, srgb = false) {
  const t = new THREE.CanvasTexture(ctx.canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true; return t;
}

// A 0..1 scalar baked as an absolute greyscale fill (so metalness/roughness maps carry the
// real per-pixel value and the material scalar can stay 1 — letting dust and foil coexist on
// one material at different metalness/roughness).
export const gray = v => { const g = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgb(${g},${g},${g})`; };
