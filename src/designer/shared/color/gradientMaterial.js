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

/* ── Alternating: the one multi-colour mode that is NOT a blend ──────────────────────────────────
 *
 * The three modes above are sweeps — the shader mixes between stops across a surface, because that
 * is what two creams loaded side by side in one bag actually do. Alternating is a different thing a
 * baker does with the same two creams: pipe a shell in red, change bags, pipe the next in blue, and
 * round the ring. There is no blend anywhere in it. Sandeep: *"so one piece red and next piece
 * blue, next red and next blue."*
 *
 * ⚠️ IT IS DELIBERATELY NOT IN `GRADIENT_MODES`, and that list is not an oversight to tidy up.
 * `GRADIENT_MODES` is the set of SHADER modes — every entry has a `MODE_INDEX` and a branch in
 * `gradBody`. Adding 'alternate' to it would give it `MODE_INDEX['alternate'] ?? 0`, which is
 * swirl: a ring asked to alternate would quietly render a swirl and nothing anywhere would
 * disagree. The split happens per PIECE, in the renderer that knows what a piece is.
 *
 * ⚠️ WHICH IS ALSO WHY `applyGradient` TREATS IT AS "NO GRADIENT". A surface that cannot split
 * itself into pieces — a tier wall, a wrap band, a swag strip, a sticker — has nothing to
 * alternate, so the honest fallback is the solid colour it would otherwise have, not a sweep the
 * customer never asked for. Only the ring renderer acts on this mode; everything else sees a
 * material with no gradient on it at all. */
export const ALTERNATE_MODE = 'alternate';

export function isAlternating(gradient) {
  return isGradientActive(gradient) && gradient?.mode === ALTERNATE_MODE;
}

/* The colours an alternating ring cycles through, in order, or null when this gradient is not an
 * alternating one. Two stops give red/blue/red/blue; three give red/blue/green repeating — the
 * cycle is just the stop list, so `PIPING_MAX_STOPS` caps it with no second number to keep in
 * step. Filtered because a pending "+" stop is a null until its colour is picked. */
export function alternateStops(gradient) {
  if (!isAlternating(gradient)) return null;
  const stops = gradient.colors.filter(Boolean);
  return stops.length >= 2 ? stops : null;
}

/* THE cycle, stated once: which colour the piece at ring index `i` is piped in, or null when this
 * gradient does not alternate. The renderer groups pieces by it rather than asking per piece, but
 * it must group by the SAME answer this gives — so the modulo lives here and not at the call site,
 * where a second copy would be free to disagree about whether the count or the index wraps. */
export function alternateColorAt(gradient, i) {
  const stops = alternateStops(gradient);
  if (!stops) return null;
  return stops[((i % stops.length) + stops.length) % stops.length];
}

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

/* ⚠️ A GRADIENT PAINTS THE WALL, NOT THE THINGS STAMPED ON IT.
 *
 * `#include <color_fragment>` runs AFTER `<map_fragment>`, so by the time this snippet sees
 * `diffuseColor` the material's map has already been multiplied in — and on a tier carrying gold
 * leaf or luster dust that map is where the PARTICLES live. Writing `diffuseColor.rgb = gcol`
 * outright therefore repainted every shard in the cake's own colour: reported 2026-09-10 as gold
 * flakes rendering as muddy pink on a pink→lilac cake, with the metalness still applied so they
 * read as dark smears rather than as foil.
 *
 * ⚠️ IT LOOKED FINE ON A SOLID TIER, which is why it shipped. With no gradient the shader is not
 * patched at all, so every measurement and screenshot taken on a solid-colour cake says nothing
 * about this. `dev/garnish-on-cake.html?grad=1` exists so that can never again be an accident.
 *
 * The mask is the finish's own particle map (white where a shard or fleck is, black on bare wall),
 * so the wall takes the gradient and the particles keep the colour the compositor gave them. */
const FRAG_COMMON_MASKED = FRAG_COMMON + '\nuniform sampler2D uGMask;';

/* How many full turns the swirl makes between the base of the form and its top. One is the whole
   point of the mode: the colour band starts facing one way and comes back round having climbed the
   dollop once, which is the attitude cream leaves a star tip in. Less than one does not read as a
   swirl; more reads as stripes. */
const SWIRL_TURNS = 1.0;

const gradBody = (masked) => `#include <color_fragment>
{
  float gt;
  if (uGMode == 1) {            // vertical ombre: base → top
    gt = (vGradLocal.y - uGMin.y) / max(uGSize.y, 1e-4);
  } else if (uGMode == 2) {     // linear: side to side
    gt = (vGradLocal.x - uGMin.x) / max(uGSize.x, 1e-4);
  } else {                      // swirl: a HELIX about the vertical axis through the centre.
    /* ⚠️ THE MIRROR USED TO MAKE THIS A SECOND "LINEAR", and it took a cake to see it. The old
       line was 1.0 - abs(ang / PI): 1 at +X, 0 at -X, folded so the two ends of the circle meet
       without a seam. Folded, though, it is no longer an angle at all — it is a monotonic ramp
       along X, which is the exact axis mode 2 uses. The two modes differed only in the SHAPE of
       the ramp, so they rendered 9.8 mean delta apart on a piped rim ring where either against
       Vertical measured 38-49. Sandeep: "swirl and linear look almost the same."

       It survived because swirl is only offered on stickers and piping rings, and neither wraps
       the Y axis: a dollop is a compact blob and a sticker is near-flat, so atan2(z, x) collapses
       to "which side of the YZ plane". A tall cylinder would have shown it, and a tier wall — the
       one surface that would — is vertical-only.

       cos is periodic, so the two ends meet with no seam and no mirror is needed; the HEIGHT term
       is what makes this a swirl rather than a sweep. Colours wind round the form as they climb
       it, which is what a two-tone star tip extrudes, and no amount of flattening the mesh can
       turn a helix back into a side-to-side ramp. */
    float ang = atan(vGradLocal.z - uGCenter.z, vGradLocal.x - uGCenter.x); // -PI..PI
    float h   = (vGradLocal.y - uGMin.y) / max(uGSize.y, 1e-4);             // 0 base .. 1 top
    gt = 0.5 - 0.5 * cos(ang + h * ${SWIRL_TURNS.toFixed(1)} * 6.28318530718);
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
  ${masked
    ? `float gMask = texture2D(uGMask, vMapUv).r;
  diffuseColor.rgb = mix(gcol, diffuseColor.rgb, gMask);`
    : 'diffuseColor.rgb = gcol;'}
}`;

const FRAG_COLOR        = gradBody(false);
const FRAG_COLOR_MASKED = gradBody(true);

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
      uGMask:   { value: null },
    };
  }
  return mat.userData.__gradUniforms;
}

// Apply (or remove) a gradient on one material.
//   gradient : { mode, colors:[hex,…], balance? } | null  (balance 0..1, default 0.5)
//   bbox     : { min:THREE.Vector3, size:THREE.Vector3, center:THREE.Vector3 } in the mesh's local
//              space — used to normalise the vertical/linear blend and to find the swirl axis.
/* albedo  optional transform applied to each stop before it becomes a uniform.
 *
 * ⚠️ THE STOPS MUST GET THE SAME CORRECTION THE BASE COLOUR GETS, or a gradient renders in different
 * colours from the solid it replaces. This module's own note below says the stops match `mat.color`
 * because both go through `new THREE.Color(...)` — that stopped being true the moment cream started
 * correcting its albedo for how much light the surface receives. The caller owns the correction
 * (a reference light belongs to the SURFACE), so it passes the transform in rather than this shared
 * module guessing which surface it is decorating. Absent = identity, which is right for anything
 * uncorrected. */
/* `mask` — the finish's particle map, when the surface carries one. Optional: absent means "this
 * material has nothing stamped on it", which is every gradient outside a tier wall. ⚠️ It is also
 * what decides which PROGRAM compiles, because the masked snippet reads `vMapUv` and that varying
 * only exists when the material has a map. Passing a mask to a material without one would not
 * compile, so the flag rides the cache key. */
export function applyGradient(mat, gradient, bbox, albedo = (c) => c, mask = null) {
  // Alternating is per-piece, not per-pixel — see ALTERNATE_MODE. There is nothing for the shader
  // to do, and pretending otherwise would paint a swirl nobody asked for.
  const active = isGradientActive(gradient) && !isAlternating(gradient);

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
  const masked = !!mask;
  u.uGMask.value = mask ?? null;

  // Three's colour management treats the hex as sRGB and converts to the linear working space —
  // the same conversion `new THREE.Color(color)` on `mat.color` already gets, so stops match.
  for (let i = 0; i < 3; i++) u.uGColors.value[i].set(albedo(colors[Math.min(i, count - 1)]));
  u.uGCount.value = count;
  u.uGMode.value = MODE_INDEX[gradient.mode] ?? 0;
  u.uGBalance.value = typeof gradient.balance === 'number' ? gradient.balance : 0.5;
  if (bbox) {
    u.uGMin.value.copy(bbox.min);
    u.uGSize.value.copy(bbox.size);
    u.uGCenter.value.copy(bbox.center);
  }

  // Gaining or losing the mask swaps the snippet, so it needs a recompile just as switching the
  // gradient on does — otherwise a tier that has just had its first flake added keeps the unmasked
  // program and paints straight over it.
  if (!mat.userData.__gradOn || mat.userData.__gradMasked !== masked) {
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, mat.userData.__gradUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', VERT_COMMON)
        .replace('#include <begin_vertex>', VERT_BEGIN);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', masked ? FRAG_COMMON_MASKED : FRAG_COMMON)
        .replace('#include <color_fragment>', masked ? FRAG_COLOR_MASKED : FRAG_COLOR);
    };
    // Unique per-material key so each gradient material compiles its OWN program. A constant key
    // ('grad:on') made every gradient material share one WebGLProgram; since onBeforeCompile binds
    // the custom uniforms (uGColors/…) to whichever material compiled first, the others never upload
    // their own values and render that first material's colours (GPU/draw-order dependent). Two cake
    // tiers with different gradients hit exactly this. mat.uuid is stable per instance, so each tier
    // gets its own program + its own uniforms — no cross-material contamination.
    mat.customProgramCacheKey = () => `grad:${mat.uuid}:${masked ? 'm' : 'p'}`;
    mat.userData.__gradOn = true;
    mat.userData.__gradMasked = masked;
    mat.needsUpdate = true;
  }
}
