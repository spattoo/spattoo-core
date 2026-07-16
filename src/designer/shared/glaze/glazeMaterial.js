import * as THREE from 'three';
import { GLAZE_VERT_COMMON, GLAZE_VERT_BEGIN, GLAZE_FRAG_COMMON, GLAZE_FRAG_COLOR } from './glazeShader.js';

// ── Chocolate glaze — object-space marble on a tier's body material ───────────────────────────────
//
// `applyGlaze` injects the glaze marble field (glazeShader.js) into an existing MeshStandard/MeshPhysical
// material via onBeforeCompile — the SAME seam as applyGradient (shared/color/gradientMaterial.js): the
// material's lighting (the wet clearcoat/roughness/env from the `glaze` FROSTINGS entry) is untouched; we
// only swap the per-pixel base colour for the marble. It works on any geometry because the field is
// sampled from object-local position, so a round tier, a heart and a stacked cake all get one continuous
// pour with zero per-shape code.
//
// The glaze finish's WET material and its auto-rounded rim come from the FROSTINGS registry (material +
// edge:{kind:'round'}) and the existing edge path — NOT from here. This module owns ONLY the marble
// colour field. Drips are a separate module (glazeDrip.js, phase 2).

// The design-instance defaults — one solid chocolate (a plain poured glaze); adding stops makes it marble.
// Pattern params match the studio's tuned starting point. `drip` is an AUTHORED finish property (not a
// customer knob) consumed by the drip layer (phase 2), kept here so the whole glaze config has one home.
export const GLAZE_DEFAULTS = { colors: ['#5a3621'], flow: 2.6, warp: 1.1, contrast: 3.2, streak: 0.12, drip: 0.18 };

// Overlay admin-authored glaze defaults (materials.config.glaze) onto the code SEED — so the palette +
// pattern a new glaze tier starts from is retunable in the Glaze Studio without a release (INVARIANTS §1a).
// Mutates the shared object in place, so every importer sees the merged defaults. Absent → the seed stands.
export function applyGlazeDefaults(partial) {
  if (partial && typeof partial === 'object') Object.assign(GLAZE_DEFAULTS, partial);
}

// The marble field only reads as a marble with ≥2 stops; one stop is a solid glaze (rendered by the
// material's own `color`, no shader) exactly like a single-stop gradient falls back to the solid colour.
export function isGlazeMarbleActive(glaze) {
  return !!glaze && Array.isArray(glaze.colors) && glaze.colors.filter(Boolean).length >= 2;
}

function ensureUniforms(mat) {
  if (!mat.userData.__glazeUniforms) {
    mat.userData.__glazeUniforms = {
      uGlColors:   { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
      uGlCount:    { value: 1 },
      uGlFlow:     { value: GLAZE_DEFAULTS.flow },
      uGlWarp:     { value: GLAZE_DEFAULTS.warp },
      uGlContrast: { value: GLAZE_DEFAULTS.contrast },
      uGlStreak:   { value: GLAZE_DEFAULTS.streak },
      uGlSeed:     { value: 1 },
      uGlMin:      { value: new THREE.Vector3() },
      uGlSize:     { value: new THREE.Vector3(1, 1, 1) },
      uGlCenter:   { value: new THREE.Vector3() },
    };
  }
  return mat.userData.__glazeUniforms;
}

// Apply (or remove) the glaze marble on one material.
//   glaze : { colors:[hex,…], flow, warp, contrast, streak, seed? } | null
//   bbox  : { min, size, center } (THREE.Vector3) in the mesh's LOCAL space — normalises the field so the
//           marble scale is stable across tier sizes. (Same bbox applyGradient is handed.)
export function applyGlaze(mat, glaze, bbox) {
  const active = isGlazeMarbleActive(glaze);

  if (!active) {
    if (mat.userData.__glazeOn) {              // was on → tear down and recompile to the stock program
      mat.onBeforeCompile = () => {};
      mat.customProgramCacheKey = () => 'glaze:off';
      mat.userData.__glazeOn = false;
      mat.needsUpdate = true;
    }
    return;
  }

  const colors = glaze.colors.filter(Boolean);
  const count = Math.min(5, colors.length);
  const u = ensureUniforms(mat);
  // Hex is sRGB → three converts to the linear working space, same as `new THREE.Color()` on mat.color.
  for (let i = 0; i < 5; i++) u.uGlColors.value[i].set(colors[Math.min(i, count - 1)]);
  u.uGlCount.value = count;
  u.uGlFlow.value     = glaze.flow     ?? GLAZE_DEFAULTS.flow;
  u.uGlWarp.value     = glaze.warp     ?? GLAZE_DEFAULTS.warp;
  u.uGlContrast.value = glaze.contrast ?? GLAZE_DEFAULTS.contrast;
  u.uGlStreak.value   = glaze.streak   ?? GLAZE_DEFAULTS.streak;
  u.uGlSeed.value     = glaze.seed     ?? 1;
  if (bbox) {
    u.uGlMin.value.copy(bbox.min);
    u.uGlSize.value.copy(bbox.size);
    u.uGlCenter.value.copy(bbox.center);
  }

  if (!mat.userData.__glazeOn) {
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, mat.userData.__glazeUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', GLAZE_VERT_COMMON)
        .replace('#include <begin_vertex>', GLAZE_VERT_BEGIN);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', GLAZE_FRAG_COMMON)
        .replace('#include <color_fragment>', GLAZE_FRAG_COLOR);
    };
    // Per-material key so each glaze tier compiles its OWN program with its OWN uniforms — same reasoning
    // as gradientMaterial (a constant key made tiers share one program and one tier's colours won).
    mat.customProgramCacheKey = () => 'glaze:' + mat.uuid;
    mat.userData.__glazeOn = true;
    mat.needsUpdate = true;
  }
}
