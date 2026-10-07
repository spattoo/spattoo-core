/* Swirl must not quietly become a second Linear.
 *
 * It had. The branch read `1.0 - abs(ang / PI)` — an angle about the Y axis, folded so the two ends
 * of the circle meet without a seam. Folded, it is no longer an angle: it is a monotonic ramp along
 * X, which is the exact axis mode 2 (linear) uses, so the two modes differed only in the shape of
 * the ramp. On a piped rim ring they rendered 9.8 mean Δ apart where either against Vertical
 * measured 38–49. Sandeep: "swirl and linear look almost the same."
 *
 * It hid because swirl is only ever offered on stickers and piping rings, and neither wraps the Y
 * axis — a dollop is a compact blob, a sticker is near-flat, and `atan2(z, x)` on both collapses to
 * "which side of the YZ plane". The one surface that would have exposed it, a tier wall, is
 * vertical-only.
 *
 * ⚠️ THIS ASSERTS THE SHADER TEXT, not a render — the same choice finishMask.test.js makes and for
 * the same reason: the fault was one expression, and an expression is a thing you can read. A pixel
 * test would need a GPU and would not say why. What it pins is the PROPERTY that stops the
 * degeneracy: swirl depends on HEIGHT as well as angle. Any formula that does cannot flatten into a
 * side-to-side ramp, whatever the mesh looks like.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyGradient, GRADIENT_MODES } from './gradientMaterial.js';

const bbox = () => ({
  min: new THREE.Vector3(-1, 0, -1),
  size: new THREE.Vector3(2, 2, 2),
  center: new THREE.Vector3(0, 1, 0),
});

/** Compile a patched material the way three would, and hand back the fragment source. */
function frag(gradient) {
  const mat = new THREE.MeshPhysicalMaterial();
  applyGradient(mat, gradient, bbox());
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main(){\n#include <color_fragment>\n}',
  };
  mat.onBeforeCompile(shader, {});
  return shader.fragmentShader;
}

// The swirl arm of the if/else, with comments stripped so prose about the old formula cannot
// satisfy or break an assertion about the code.
function swirlBranch() {
  const src = frag({ mode: 'swirl', colors: ['#d6453f', '#3f6fd6'] })
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  /* The swirl arm is the final `else` of the MODE chain — bounded explicitly rather than found with
     `lastIndexOf('} else {')`, which lands on the colour-mixing else further down and quietly
     returns the wrong block. The bounds are the end of mode 2 and the `clamp` that follows the
     chain, both of which are structure rather than wording. */
  const body = src.slice(src.indexOf('uGMode == 2'));
  return body.slice(body.indexOf('} else {'), body.indexOf('gt = clamp('));
}

describe('swirl is a helix, not a second linear', () => {
  it('depends on the angle about the vertical axis', () => {
    expect(swirlBranch()).toMatch(/atan\(/);
  });

  /* ⚠️ THE ASSERTION THAT MATTERS. Without a height term the mode is a function of direction in the
     XZ plane alone, and on any mesh that does not wrap the Y axis that is one axis — linear's. */
  it('ALSO depends on height, which is what makes it a swirl', () => {
    expect(swirlBranch()).toMatch(/uGMin\.y/);
    expect(swirlBranch()).toMatch(/uGSize\.y/);
  });

  it('is periodic, so the two ends of the turn meet without a seam or a mirror', () => {
    const b = swirlBranch();
    expect(b).toMatch(/cos\(/);
    // The mirror is the specific thing that flattened it. It must not come back.
    expect(b).not.toMatch(/abs\s*\(\s*ang/);
  });

  it('leaves vertical and linear on their single axes', () => {
    const src = frag({ mode: 'vertical', colors: ['#d6453f', '#3f6fd6'] });
    // vertical reads y only, linear reads x only — unchanged by the swirl fix.
    expect(src).toMatch(/uGMode == 1[\s\S]*?vGradLocal\.y - uGMin\.y/);
    expect(src).toMatch(/uGMode == 2[\s\S]*?vGradLocal\.x - uGMin\.x/);
  });

  it('still answers to all three sweep modes', () => {
    for (const mode of GRADIENT_MODES) {
      expect(frag({ mode, colors: ['#d6453f', '#3f6fd6'] })).toContain('diffuseColor.rgb = gcol;');
    }
  });
});
