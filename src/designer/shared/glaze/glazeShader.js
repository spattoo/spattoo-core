// ── Chocolate-glaze marble — the GLSL, isolated from any THREE wiring ─────────────────────────────
//
// A poured mirror/chocolate glaze evaluated as a CONTINUOUS 3D field in the body's own object space, so
// it flows unbroken over top → rounded rim → wall on ANY geometry (round, heart, number, tiers) with no
// UVs, no bake, and no per-shape branch. This is the shader half of that; `glazeMaterial.js` injects it
// into the tier's MeshPhysicalMaterial via onBeforeCompile (the same seam gradientMaterial.js uses).
//
// The field is a domain-warped marble, SQUASHED vertically (uGYS) so it reads as 2D swirls on the flat
// top and elongates into running DRIPS down the wall — the poured-glaze behaviour. Colour blends SMOOTHLY
// through the palette (a glaze has no hard bands). One colour = a solid glaze; two–five = a marble.
//
// The look was dialled in the admin Glaze Studio (makeMarbleField); this is its GLSL twin — same
// structure (two-octave domain warp → directional sweep → sharpened sine → smooth palette). It uses a
// hash value-noise rather than the studio's precomputed lattice, so the pattern's CHARACTER matches, not
// its exact pixels (v1 — a later pass can unify both onto one source).

// Object-local position carried to the fragment stage (before the instance scale/translate) — the stable
// frame the field is evaluated in, independent of where/how big the tier is placed.
export const GLAZE_VERT_COMMON = '#include <common>\nvarying vec3 vGlazeLocal;';
export const GLAZE_VERT_BEGIN  = '#include <begin_vertex>\nvGlazeLocal = position;';

// Fragment preamble: uniforms + the noise/marble/palette helpers.
export const GLAZE_FRAG_COMMON = /* glsl */`#include <common>
varying vec3 vGlazeLocal;
uniform vec3  uGlColors[5];
uniform int   uGlCount;
uniform float uGlFlow;
uniform float uGlWarp;
uniform float uGlContrast;
uniform float uGlStreak;
uniform float uGlSeed;
uniform vec3  uGlMin;      // body-local bbox min / size / center — normalise so the marble scale is
uniform vec3  uGlSize;     // consistent whatever the tier's real dimensions are.
uniform vec3  uGlCenter;

// Hash-based 3D value noise + 4-octave fbm.
float glHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float glVNoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(glHash(i + vec3(0,0,0)), glHash(i + vec3(1,0,0)), f.x),
                 mix(glHash(i + vec3(0,1,0)), glHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(glHash(i + vec3(0,0,1)), glHash(i + vec3(1,0,1)), f.x),
                 mix(glHash(i + vec3(0,1,1)), glHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float glFbm(vec3 p){ float s = 0.0, a = 0.5, n = 0.0; for (int i = 0; i < 4; i++){ s += a * glVNoise(p); n += a; a *= 0.5; p *= 2.0; } return s / n; }

// Smooth blend across 1..5 palette stops (t in [0,1]).
vec3 glPalette(float t){
  if (uGlCount <= 1) return uGlColors[0];
  float f = clamp(t, 0.0, 1.0) * float(uGlCount - 1);
  vec3 c = uGlColors[0];
  for (int j = 0; j < 4; j++){
    if (j >= uGlCount - 1) break;
    c = mix(c, uGlColors[j + 1], clamp(f - float(j), 0.0, 1.0));
  }
  return c;
}

// The glaze colour at a body-local position.
vec3 glGlazeColor(vec3 localPos){
  // Normalise the position to the tier bbox, then remap into the studio's cake units (xz≈±1.2, y 0..1.45)
  // so the marble's feature scale is the same on a tiny cupcake tier and a big base tier.
  vec3 ln = (localPos - uGlCenter) / max(0.5 * uGlSize, vec3(1e-4));   // ≈ [-1,1] per axis
  vec3 p  = vec3(ln.x * 1.2, (ln.y * 0.5 + 0.5) * 1.45, ln.z * 1.2);
  float y = p.y * 0.22;                                                // vertical squash → vertical drips on the wall
  // Two 3D domain-warp fields → organic marble folds; Y pre-squashed so drips wander slowly down.
  float wx = glFbm(vec3(p.x * 0.85,       y * 0.85,       p.z * 0.85)       + uGlSeed)        - 0.5;
  float wz = glFbm(vec3(p.x * 0.85 + 5.2, y * 0.85 + 2.1, p.z * 0.85 + 9.3) + uGlSeed * 1.7)  - 0.5;
  // Directional sweep + warp = long flowing veins; streak adds fine striations.
  float coord = (p.x * 0.8 + p.z * 1.0) + uGlWarp * 1.05 * (wx + wz)
              + (glFbm(vec3(p.x * 2.4, y * 2.4, p.z * 2.4) + uGlSeed) - 0.5) * uGlStreak * 6.0;
  float t = 0.5 + 0.5 * sin(coord * uGlFlow * 3.3);
  float s = max(0.5, uGlContrast) * 0.5;                               // vein sharpness
  t = 0.5 + tanh((t - 0.5) * 2.0 * s) / (2.0 * tanh(s));
  return glPalette(clamp(t, 0.0, 1.0));
}`;

// Replace the diffuse base colour with the glaze marble (lighting — clearcoat/roughness/env — untouched).
export const GLAZE_FRAG_COLOR = /* glsl */`#include <color_fragment>
{
  diffuseColor.rgb = glGlazeColor(vGlazeLocal);
}`;
