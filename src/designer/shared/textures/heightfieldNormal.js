import * as THREE from 'three';

// ── Heightfield → tangent-space normal map ────────────────────────────────────────────────────
// The ONE place the "central-difference gradient of a tileable height field → normal map" packing
// lives. Every procedural surface (cream wave, cream/foam micro-grain, fondant grain, image-derived
// relief) baked its own byte-identical copy of this loop; they now all call this.
//
//   nx = -(H[x+1] - H[x-1]) · slope ,  ny = -(H[y+1] - H[y-1]) · slope ,  nz = 1
//   → normalised, packed RGB (+255 alpha) into a Uint8 RGBA DataTexture with RepeatWrapping (so the
//     wrap seam is invisible). Neighbours wrap in both axes.
//
// `H` is a w·h Float array, row-major. `slope` is the per-pixel multiplier on the raw central
// difference: a constant gain, OR a function (x, y) → gain to fold in a relief mask / falloff. This is
// the only thing callers vary; dims may be rectangular (square is just w === h).
export function heightfieldToNormalMap(H, w, h, slope) {
  const gainAt = typeof slope === 'function' ? slope : () => slope;
  const at = (x, y) => H[(((y % h) + h) % h) * w + (((x % w) + w) % w)];
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const m = gainAt(x, y);
    const nx = -(at(x + 1, y) - at(x - 1, y)) * m;
    const ny = -(at(x, y + 1) - at(x, y - 1)) * m;
    const nz = 1, len = Math.hypot(nx, ny, nz), o = (y * w + x) * 4;
    data[o]     = Math.round((nx / len * 0.5 + 0.5) * 255);
    data[o + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
    data[o + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // THREE.DataTexture defaults to NearestFilter on BOTH filters with generateMipmaps=false — unlike
  // CanvasTexture/TextureLoader, which inherit Texture's Linear + LinearMipmapLinear + mipmaps. A normal
  // map is sampled in the FRAGMENT shader and is heavily minified whenever the surface is small on screen,
  // so point-sampling makes each pixel snap to one arbitrary texel: the high-frequency normals scatter the
  // specular/sheen incoherently and average into a desaturated grey haze. Mipmaps + linear + anisotropy is
  // what makes a normal map read as a surface rather than as dust.
  //
  // (Lesson: the raised-fondant sticker looked flat and "dusty" in the designer but crisp in the admin
  // Relief Studio. Same maps, same material — but the studio builds CanvasTextures (mipmapped by default,
  // anisotropy 8) and renders the decal ~2x larger. Core point-sampled a 1024x1024 grain-baked normal map
  // minified ~17x. Nothing was wrong with the relief; it was being sampled to death.)
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;                       // matches goldLeafTexture.js; the GPU clamps to its max
  tex.colorSpace = THREE.NoColorSpace;      // a normal map is DATA, never sRGB — never let it be decoded
  tex.needsUpdate = true;
  return tex;
}
