import * as THREE from 'three';
import { mulberry32 } from '../../utils/random.js';

// ─────────────────────────────────────────────────────────────────────────────
// Gold leaf texture — the crinkled edible gold-foil look pressed along a torn cake
// edge (see the lavender/cream reference). Real gold leaf is a flat patchy foil:
// bright sparkle on the high crinkles, dark creases in the folds, and ragged,
// feathered edges where the flake was torn. We bake that into procedural maps so a
// clean ribbon of geometry reads as hand-applied leaf — NOT a smooth plastic bead.
//
// Returns { map, normalMap }:
//   map        — luminance crinkle in RGB (the material tints it to the gold colour),
//                coverage in ALPHA (ragged borders + sparse pinholes → torn-foil edge)
//   normalMap  — the same crinkle as relief so highlights travel across the foil
//
// Pure texture generator (THREE only) — shared by the designer render and the studio.
// ─────────────────────────────────────────────────────────────────────────────

const smoothstep = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (e1 === e0 ? 0 : (x - e0) / (e1 - e0))));
  return t * t * (3 - 2 * t);
};

// Tiling value noise on a GxG lattice (wraps, so the tile repeats seamlessly along
// the edge). Returns a sampler f(x, y) with x,y in 0..1.
function tilingNoise(seed, G = 48) {
  const rnd = mulberry32(seed >>> 0);
  const grid = new Float32Array(G * G);
  for (let i = 0; i < G * G; i++) grid[i] = rnd();
  return (x, y) => {
    const fx = x * G, fy = y * G;
    const x0 = ((Math.floor(fx) % G) + G) % G, y0 = ((Math.floor(fy) % G) + G) % G;
    const x1 = (x0 + 1) % G, y1 = (y0 + 1) % G;
    const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = grid[y0 * G + x0], b = grid[y0 * G + x1];
    const c = grid[y1 * G + x0], d = grid[y1 * G + x1];
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
}

// Multi-octave crinkle. Integer frequencies keep the tile seamless.
function fbm(noise, x, y) {
  let s = 0, amp = 0.5;
  for (const f of [1, 2, 4, 8]) { s += amp * noise(x * f, y * f); amp *= 0.5; }
  return s;            // ~0..0.94
}

/**
 * @param {object} o
 * @param {number} o.w     tile width  (along the edge)
 * @param {number} o.h     tile height (across the band)
 * @param {number} o.seed
 * @returns {{ map: THREE.CanvasTexture, normalMap: THREE.CanvasTexture }}
 */
export function makeGoldLeafMaps({ w = 256, h = 96, seed = 7, lumFloor = 0.18 } = {}) {
  const crink = tilingNoise(seed, 48);
  const streak = tilingNoise(seed * 31 + 5, 64);   // finer wrinkle lines
  const edgeA = tilingNoise(seed * 7 + 1, 24);      // top-border wobble
  const edgeB = tilingNoise(seed * 13 + 9, 24);     // bottom-border wobble
  const holes = tilingNoise(seed * 53 + 3, 32);     // sparse pinholes

  // Height field (shared by colour luminance and normal relief), plus coverage alpha.
  const H = new Float32Array(w * h);
  const A = new Float32Array(w * h);
  for (let py = 0; py < h; py++) {
    const v = py / (h - 1);
    for (let px = 0; px < w; px++) {
      const u = px / w;
      // wrinkled foil: base crinkle + sharper directional streaks
      const n = 0.65 * fbm(crink, u, v) + 0.35 * fbm(streak, u * 0.5, v * 2.5);
      H[py * w + px] = n;

      // coverage: a band straddling the centre with noisy, feathered borders + holes
      const topB = 0.12 + 0.20 * edgeA(u, 0.3);
      const botB = 0.88 - 0.20 * edgeB(u, 0.7);
      const fdist = Math.min(v - topB, botB - v);
      let a = smoothstep(0, 0.07, fdist);                 // ragged feathered edges
      if (fbm(holes, u * 2, v * 2) < 0.14) a = 0;         // torn pinholes
      A[py * w + px] = a;
    }
  }

  // ── colour map: luminance crinkle (RGB) + coverage (A) ──
  const cc = document.createElement('canvas'); cc.width = w; cc.height = h;
  const cx = cc.getContext('2d');
  const cimg = cx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const n = H[i];
    // mostly bright with sparkle on the high crinkles, dark only in deep creases
    let lum = 0.5 + 0.55 * (n - 0.45);
    lum += 0.45 * smoothstep(0.72, 0.95, n);              // specular sparkle pops
    // lumFloor raises the darkest creases — the default keeps the torn-foil shards' look; the cream
    // gold EDGE passes a higher floor so the crinkle reads as gold variation, not muddy brown creases.
    lum = Math.max(lumFloor, Math.min(1, lum));
    const g = Math.round(lum * 255);
    cimg.data[i * 4 + 0] = g;
    cimg.data[i * 4 + 1] = g;
    cimg.data[i * 4 + 2] = g;
    cimg.data[i * 4 + 3] = Math.round(A[i] * 255);
  }
  cx.putImageData(cimg, 0, 0);

  // ── normal map: relief from the height field (tangent-space) ──
  const nc = document.createElement('canvas'); nc.width = w; nc.height = h;
  const nx = nc.getContext('2d');
  const nimg = nx.createImageData(w, h);
  const STR = 2.2;   // crinkle strength
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const xl = H[py * w + ((px - 1 + w) % w)];
      const xr = H[py * w + ((px + 1) % w)];
      const yt = H[Math.max(0, py - 1) * w + px];
      const yb = H[Math.min(h - 1, py + 1) * w + px];
      const dx = (xl - xr) * STR;
      const dy = (yt - yb) * STR;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (py * w + px) * 4;
      nimg.data[i + 0] = Math.round((dx * inv * 0.5 + 0.5) * 255);
      nimg.data[i + 1] = Math.round((dy * inv * 0.5 + 0.5) * 255);
      nimg.data[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      nimg.data[i + 3] = 255;
    }
  }
  nx.putImageData(nimg, 0, 0);

  const map = new THREE.CanvasTexture(cc);
  const normalMap = new THREE.CanvasTexture(nc);
  for (const t of [map, normalMap]) {
    t.wrapS = THREE.RepeatWrapping;   // tiles along the edge
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
    t.needsUpdate = true;
  }
  return { map, normalMap };
}
