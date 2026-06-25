import * as THREE from 'three';
import { heightfieldToNormalMap } from './heightfieldNormal.js';

// Shared FONDANT surface — one procedurally-built, tileable, colour-agnostic NORMAL map reused by
// every element flagged `placement_config.useSharedFondantTexture`. It adds the soft sugar-paste
// micro-grain that makes a flat recolourable part read as fondant rather than plastic, under ANY
// chosen colour (the map carries surface bumps only, never colour). Built once, cached.

let _normalMap = null;

// Smooth value-noise height field → Sobel → tangent-space normal map (RGB), wrap-tiled so box-UVs
// can repeat it without visible seams at grain scale.
function buildFondantNormalMap(size = 256, strength = 0.6) {
  // tileable value noise: a small lattice of random heights, wrapped, bilinearly sampled + a finer
  // octave, so the result tiles seamlessly (lattice indices taken modulo the lattice size).
  const L = 16; // lattice cells across the texture (keeps it seamless on repeat)
  const rand = new Float32Array(L * L);
  // deterministic pseudo-random (no Math.random — keeps the build reproducible)
  let s = 1234567;
  const next = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < L * L; i++) rand[i] = next();
  const latt = (xi, yi) => rand[((yi % L + L) % L) * L + ((xi % L + L) % L)];
  const smooth = t => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const tx = smooth(x - xi), ty = smooth(y - yi);
    const a = latt(xi, yi),     b = latt(xi + 1, yi);
    const c = latt(xi, yi + 1), d = latt(xi + 1, yi + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  // height = two octaves of the tiling noise
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * L, v = y / size * L;
    H[y * size + x] = noise(u, v) * 0.7 + noise(u * 2, v * 2) * 0.3;
  }

  // Sobel gradient → normal (shared packer; wrapped neighbours keep it seamless)
  return heightfieldToNormalMap(H, size, size, strength * size * 0.02);
}

export function getFondantNormalMap() {
  if (!_normalMap) _normalMap = buildFondantNormalMap();
  return _normalMap;
}

// Recompose parts export geometry with positions + normals only (no UVs). Box-project a UV from the
// vertex's dominant-normal axis so a tiling normal map maps cleanly; seams are invisible at grain
// scale. `tile` controls grain density (world units per texture repeat). Mutates the geometry.
export function applyBoxUVs(geometry, tile = 0.12) {
  if (!geometry?.attributes?.position) return;
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (nor) n.fromBufferAttribute(nor, i); else n.set(0, 0, 1);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    let u, w;
    if (ax >= ay && ax >= az)      { u = p.z; w = p.y; } // project on X-facing
    else if (ay >= ax && ay >= az) { u = p.x; w = p.z; } // Y-facing
    else                           { u = p.x; w = p.y; } // Z-facing
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = w / tile;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
