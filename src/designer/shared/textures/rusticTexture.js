import * as THREE from 'three';

// Procedural RUSTIC palette-knife normal map. Fine, directional stroke detail (smears + comb lines)
// is what defines a palette-knife finish — and that's exactly what geometry displacement can't carry
// at sane mesh density but a normal map renders crisply and cheaply. So rustic is a TEXTURE, not a
// displacement: a tileable field of discrete strokes (each a rounded smear, heavier at one end, with
// comb lines running ALONG the drag), max-blended where they overlap, baked to a tangent-space normal
// map. Tiles seamlessly on both axes (cell grid is periodic), so it wraps round the cake with no seam.

// Deterministic per-cell pseudo-random in [0,1) — varies by cell index + salt, so each stroke param
// is independent and reproducible (no Math.random).
function cellRand(i, j, salt) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(salt, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

let _cache = new Map();

// `nu`×`nv` strokes per tile; `strength` scales the baked relief in the normal. Cached per key.
export function getRusticNormalMap(size = 512, nu = 5, nv = 4, strength = 1.0) {
  const key = `${size}:${nu}:${nv}:${strength}`;
  if (_cache.has(key)) return _cache.get(key);

  const COMB = 6;
  const stroke = (ci, cj, px, py) => {
    const wi = ((ci % nu) + nu) % nu, wj = ((cj % nv) + nv) % nv;   // wrap → periodic (tileable)
    const scu = ci + 0.5 + (cellRand(wi, wj, 1) - 0.5) * 0.6;
    const scv = cj + 0.5 + (cellRand(wi, wj, 2) - 0.5) * 0.6;
    const ang = (cellRand(wi, wj, 3) - 0.5) * 0.7;
    const Lx  = 0.80 + cellRand(wi, wj, 4) * 0.7;
    const Ly  = 0.28 + cellRand(wi, wj, 5) * 0.14;
    const ampK = 0.7 + cellRand(wi, wj, 6) * 0.3;
    const du = px - scu, dv = py - scv;
    const c = Math.cos(ang), s = Math.sin(ang);
    const lx = (du * c + dv * s) / Lx, ly = (-du * s + dv * c) / Ly;
    const rr = lx * lx + ly * ly;
    if (rr >= 1) return 0;
    let m = 1 - rr; m = m * m * (3 - 2 * m);
    const taper = 0.70 + 0.30 * lx;                       // heavier at one end
    const comb = 0.72 + 0.28 * Math.cos(ly * Math.PI * COMB);  // comb lines along the drag
    return ampK * m * taper * comb;
  };

  // Height field — max-blended strokes over the 3×3 neighbourhood.
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x / size) * nu, py = (y / size) * nv;
      const cx = Math.floor(px), cy = Math.floor(py);
      let mx = 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const cc = stroke(cx + di, cy + dj, px, py);
        if (cc > mx) mx = cc;
      }
      H[y * size + x] = mx;
    }
  }

  // Sobel → tangent-space normal map (neighbours wrap so the tile is seamless).
  const at = (x, y) => H[((y % size) + size) % size * size + (((x % size) + size) % size)];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength * size * 0.012;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength * size * 0.012;
      const nx = -dx, ny = -dy, nz = 1, len = Math.hypot(nx, ny, nz), o = (y * size + x) * 4;
      data[o]     = Math.round((nx / len * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  _cache.set(key, tex);
  return tex;
}
