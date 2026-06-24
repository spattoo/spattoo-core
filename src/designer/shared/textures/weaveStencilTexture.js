// ── Woven stencil finish — the pressed-comb basketweave buttercream texture ────
//
// In real life this look is made by pressing a textured acetate / comb STENCIL into the buttercream:
// a repeating geometric tiling where every cell is filled with fine PARALLEL grooves and the groove
// direction alternates between neighbours (a pinwheel of +45°/−45° hatching) so the cells interlock
// into a woven/linen weave. The cream squeezed out of each groove leaves a raised lip on either side.
//
// We carry it the same way `imageNormalMap` carries photo relief — ONE height field drives BOTH a
// shallow REAL geometry displacement (genuine groove shadow + a subtle silhouette break at the rim —
// a normal map alone reads flat/inward, see the cream-wave finding) AND a Sobel-baked normal map for
// the crisp thin lines the mesh can't resolve. This module owns the field, the tiling, and the bake.

import { normalTextureFromField } from './imageNormalMap.js';

// A seamless UNIT tile of the pinwheel basketweave: a 2×2 block of sub-squares, each hatched with
// parallel diagonal grooves whose direction flips (+45° when (si+sj) is even, −45° when odd) so the
// four cells interlock. Returns a SIGNED height field centred at 0 — flat wall = 0, groove valleys < 0
// (cream pressed in), squeezed-up lips > 0 — normalised so the deepest groove ≈ −1. Periodic on both
// axes, so it wraps seamlessly when tiled around the cake. `grooves` = lines per cell; `width` widens
// each line; `border` is a faint fold groove along the cell edges so the woven cells read as distinct.
export function makeWeaveField(size = 512, { grooves = 5, width = 0.5, border = 0 } = {}) {
  const w = size, h = size, height = new Float32Array(w * h);
  // Groove cross-section: a recessed valley with only a FAINT squeezed-up lip (LIP≪1) — a clean
  // pressed line, not a raised cord. (A full Laplacian-of-Gaussian, LIP=1, renders ropey/threaded.)
  // `t` is the signed distance (in groove-spacing units) to the nearest groove centre; `sigma` widens.
  const LIP = 0.06;   // barely-there squeeze; a strong lip catches light and reads as a bright stripe
  const sigma = Math.max(0.08, width * 0.5);
  const groove = (t) => {
    const x = t / sigma;
    return -(1 - LIP * x * x) * Math.exp(-0.5 * x * x);   // <0 valley, tiny >0 lip, →0 far
  };
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const u = px / w, v = py / h;                       // 0..1 across the unit tile
      const si = Math.floor(u * 2) % 2, sj = Math.floor(v * 2) % 2;   // which sub-square (2×2)
      const lu = (u * 2) % 1, lv = (v * 2) % 1;           // local 0..1 within the sub-square
      const diag = ((si + sj) & 1) === 0;                 // +45° hatch on even cells, −45° on odd
      // Coord across the lines, scaled so grooves land at integer/`grooves` — i.e. groove centres sit
      // exactly on the cell edges/corners (s = 0, ±1). A neighbour cell's grooves then meet these at
      // the SAME points, so the diagonals continue as clean chevrons across the border instead of the
      // mismatched dashes that read as stitching. (A /√2 here misaligns the lattice → stitched seams.)
      const s = diag ? (lu - lv) : (lu + lv);
      const phase = s * grooves;
      let hgt = groove(phase - Math.round(phase));        // distance to nearest groove centre
      if (border > 0) {
        // faint fold groove along the sub-square borders → the woven cells read as separate tiles
        const e = Math.min(Math.min(lu, 1 - lu), Math.min(lv, 1 - lv)) * 2;   // 0 at a border, 1 mid-cell
        hgt += -border * Math.exp(-0.5 * (e / 0.06) * (e / 0.06));
      }
      height[py * w + px] = hgt;
    }
  }
  let peak = 1e-6;                                          // normalise so deepest groove ≈ −1
  for (let i = 0; i < height.length; i++) peak = Math.max(peak, Math.abs(height[i]));
  for (let i = 0; i < height.length; i++) height[i] /= peak;
  return { height, w, h };
}

// Cells around the cake & up the wall for a unit-tile of physical size `cellFrac` × radius. INTEGER
// around so the tile meets seamlessly at the cylinder seam; rows chosen to keep cells ~square. Both the
// displacement (creamWall) and the normal map (CakeTier) call this with the SAME args, so the two
// reliefs land at identical frequency and the grooves line up instead of ghosting.
export function weaveTiles(radius, height, cellFrac = 0.8) {
  const cell = Math.max(0.1, cellFrac) * radius;
  const around = Math.max(2, Math.round((2 * Math.PI * radius) / cell));
  const up = Math.max(1, Math.round(height / cell));
  return { around, up };
}

// Fine, tileable buttercream micro-grain (value-noise, the same recipe as getCreamGrainNormalMap) —
// ADDED to the field just before the normal bake so ONE map carries both the pressed weave AND the
// soft cream surface. Without it the flat areas between grooves read as glossy plastic. It lives only
// in the NORMAL map, never the displacement (grain in real geometry only aliases). Lattice wraps mod L
// so the tile stays seamless; the second octave runs at ×2 frequency (integer → still tileable).
function grainSampler(seed, L = 64) {
  const rand = new Float32Array(L * L);
  let s = seed;
  const nx = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < L * L; i++) rand[i] = nx();
  const at = (a, b) => rand[((b % L + L) % L) * L + ((a % L + L) % L)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const fx = u * L, fy = v * L, xi = Math.floor(fx), yi = Math.floor(fy), tx = sm(fx - xi), ty = sm(fy - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}
function addCreamGrain(field, amp) {
  if (amp <= 0) return field;
  const { height, w, h } = field;
  const n1 = grainSampler(99173, 64), n2 = grainSampler(424243, 64);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h;
    const g = (n1(u, v) - 0.5) * 0.7 + (n2(u * 2, v * 2) - 0.5) * 0.3;
    height[y * w + x] += g * amp;
  }
  return field;
}

// Tangent-space normal map of one weave tile (Sobel of the field, with cream grain folded in). The
// groove field is left at strength 1 — line crispness rides on the material's normalScale, like rustic.
export function getWeaveNormalMap({ size = 512, grooves = 5, width = 0.5, border = 0, grain = 0.12, strength = 1 } = {}) {
  return normalTextureFromField(addCreamGrain(makeWeaveField(size, { grooves, width, border }), grain), strength);
}
