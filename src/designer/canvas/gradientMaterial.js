import * as THREE from 'three';

// Multi-colour gradient for a single fused GLB mesh — no submeshes, parts, or UVs required.
//
// A baker loads two/three cream colours side-by-side in the piping bag; as it pipes the colours
// blend along the swirl. We reproduce that purely in the shader: `applyGradient` injects a tiny
// snippet into an existing MeshStandard/MeshPhysical material via `onBeforeCompile`, so all of the
// material's lighting — roughness, sheen, clearcoat, the cream look from `creamMaterialProps` — is
// untouched. We only swap the per-pixel base (diffuse) colour for a blend across 2–3 stops.
//
// Eligibility is config-driven (`allowed_actions.gradient`); the actual stops + mode are chosen by
// the user on the design instance (`sticker.gradient = { mode, colors, balance }`). This module is
// the ONE place the gradient is expressed — the sticker and piping render paths both call into it.
//
// `balance` (0..1, default 0.5) biases which stop dominates: 0.5 is the even blend (unchanged
// behaviour for callers that never set it), <0.5 gives stop 0 more of the surface, >0.5 the later
// stops. It only reshapes the blend parameter, so it updates live with no recompile.

export const GRADIENT_MODES = ['swirl', 'vertical', 'linear'];
const MODE_INDEX = { swirl: 0, vertical: 1, linear: 2 };

// A gradient only renders when the user has actually picked ≥2 stops; otherwise the element falls
// back to its solid `color` exactly as before.
export function isGradientActive(gradient) {
  return !!gradient
    && Array.isArray(gradient.colors)
    && gradient.colors.filter(Boolean).length >= 2;
}

const VERT_COMMON = '#include <common>\nvarying vec3 vGradLocal;';
// Object-local position (before the instance scale/translate) — gives a stable frame to blend in,
// independent of where the element is placed or how it's sized on the cake.
const VERT_BEGIN = '#include <begin_vertex>\nvGradLocal = position;';

const FRAG_COMMON = [
  '#include <common>',
  'varying vec3 vGradLocal;',
  'uniform vec3 uGColors[3];',
  'uniform int  uGCount;',
  'uniform int  uGMode;',   // 0 swirl · 1 vertical · 2 linear
  'uniform vec3 uGMin;',
  'uniform vec3 uGSize;',
  'uniform vec3 uGCenter;',
  'uniform float uGBalance;',
].join('\n');

const FRAG_COLOR = `#include <color_fragment>
{
  float gt;
  if (uGMode == 1) {            // vertical ombre: base → top
    gt = (vGradLocal.y - uGMin.y) / max(uGSize.y, 1e-4);
  } else if (uGMode == 2) {     // linear: side to side
    gt = (vGradLocal.x - uGMin.x) / max(uGSize.x, 1e-4);
  } else {                      // swirl: angle around the vertical axis through the centre.
    float ang = atan(vGradLocal.z - uGCenter.z, vGradLocal.x - uGCenter.x); // -PI..PI
    gt = 1.0 - abs(ang / 3.14159265359);  // mirror so ±PI meet (no hard seam): 0 .. 1 .. 0
  }
  gt = clamp(gt, 0.0, 1.0);
  // Balance bias: remap gt by gt^k where k = log(balance)/log(0.5). balance 0.5 → k=1 (identity,
  // the original even blend); <0.5 → k>1 pulls gt toward 0 so stop 0 dominates; >0.5 → k<1 so the
  // later stops dominate. Clamp keeps k finite at the extremes.
  float gk = log(clamp(uGBalance, 0.001, 0.999)) / log(0.5);
  gt = pow(gt, gk);
  gt = smoothstep(0.0, 1.0, gt);
  vec3 gcol;
  if (uGCount <= 1) {
    gcol = uGColors[0];
  } else if (uGCount == 2) {
    gcol = mix(uGColors[0], uGColors[1], gt);
  } else {
    gcol = gt < 0.5 ? mix(uGColors[0], uGColors[1], gt / 0.5)
                    : mix(uGColors[1], uGColors[2], (gt - 0.5) / 0.5);
  }
  diffuseColor.rgb = gcol;
}`;

// Make (or reuse) the uniform bag we share with the compiled shader. Updating `.value` on these
// objects mutates the live uniforms in place, so colour/mode/stop changes never need a recompile —
// only enabling vs disabling the gradient does (handled via customProgramCacheKey + needsUpdate).
function ensureUniforms(mat) {
  if (!mat.userData.__gradUniforms) {
    mat.userData.__gradUniforms = {
      uGColors: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color()] },
      uGCount:  { value: 0 },
      uGMode:   { value: 0 },
      uGMin:    { value: new THREE.Vector3() },
      uGSize:   { value: new THREE.Vector3(1, 1, 1) },
      uGCenter: { value: new THREE.Vector3() },
      uGBalance:{ value: 0.5 },
    };
  }
  return mat.userData.__gradUniforms;
}

// Apply (or remove) a gradient on one material.
//   gradient : { mode, colors:[hex,…], balance? } | null  (balance 0..1, default 0.5)
//   bbox     : { min:THREE.Vector3, size:THREE.Vector3, center:THREE.Vector3 } in the mesh's local
//              space — used to normalise the vertical/linear blend and to find the swirl axis.
export function applyGradient(mat, gradient, bbox) {
  const active = isGradientActive(gradient);

  if (!active) {
    if (mat.userData.__gradOn) {            // was on → tear down and recompile to the stock program
      mat.onBeforeCompile = () => {};
      mat.customProgramCacheKey = () => 'grad:off';
      mat.userData.__gradOn = false;
      mat.needsUpdate = true;
    }
    return;
  }

  const colors = gradient.colors.filter(Boolean);
  const count = Math.min(3, colors.length);
  const u = ensureUniforms(mat);

  // Three's colour management treats the hex as sRGB and converts to the linear working space —
  // the same conversion `new THREE.Color(color)` on `mat.color` already gets, so stops match.
  for (let i = 0; i < 3; i++) u.uGColors.value[i].set(colors[Math.min(i, count - 1)]);
  u.uGCount.value = count;
  u.uGMode.value = MODE_INDEX[gradient.mode] ?? 0;
  u.uGBalance.value = typeof gradient.balance === 'number' ? gradient.balance : 0.5;
  if (bbox) {
    u.uGMin.value.copy(bbox.min);
    u.uGSize.value.copy(bbox.size);
    u.uGCenter.value.copy(bbox.center);
  }

  if (!mat.userData.__gradOn) {
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, mat.userData.__gradUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', VERT_COMMON)
        .replace('#include <begin_vertex>', VERT_BEGIN);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', FRAG_COMMON)
        .replace('#include <color_fragment>', FRAG_COLOR);
    };
    // Distinct key so the renderer compiles a gradient variant rather than reusing the stock cache.
    mat.customProgramCacheKey = () => 'grad:on';
    mat.userData.__gradOn = true;
    mat.needsUpdate = true;
  }
}
