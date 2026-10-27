import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyGradient } from './gradientMaterial.js';
import { applyStripes } from './stripeMaterial.js';
import { applyGlaze } from '../glaze/glazeMaterial.js';
import { setMaterialPatch, patchSignature, PATCH_ORDER } from './materialPatch.js';

const bbox = () => ({ min: new THREE.Vector3(-1, 0, -1), size: new THREE.Vector3(2, 2, 2), center: new THREE.Vector3(0, 1, 0) });
const GRAD    = { mode: 'vertical', colors: ['#3ca8be', '#84becd'], balance: 0.5 };
const STRIPES = { count: 4, palette: ['#111111', '#eeeeee'], weights: [1, 1, 1, 1], softness: 0.4, wobble: 0.1 };
const GLAZE   = { colors: ['#4a2c17', '#c89a63'], flow: 1, warp: 1, contrast: 1, streak: 1 };

/** Compile the material the way three.js would, and report what actually made it into the shader. */
function compiled(mat) {
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>',
  };
  mat.onBeforeCompile?.(shader, {});
  return {
    gradient: 'uGColors' in shader.uniforms,
    stripes:  'uSColors' in shader.uniforms,
    glaze:    'uGlColors' in shader.uniforms,
    key: mat.customProgramCacheKey?.(),
    uniforms: shader.uniforms,
  };
}

/* ── The bug this module exists for ──────────────────────────────────────────────────────────────
 *
 * Sandeep, on a cake loaded from the library: *"when i tried to change the color 1 of the tier its
 * not changing"*, and the measurement that settled it — *"once i saw the issue balance dial did not
 * work"*. Balance is a plain uniform; a uniform that changes nothing means the snippet was never in
 * the compiled program. `TierBody` applies gradient, then stripes, then glaze to ONE material, and
 * each module's teardown used to restore the field the way IT remembered.
 */
describe('three treatments, one material', () => {
  it('a striped cake followed by a gradient cake keeps the gradient', () => {
    const mat = new THREE.MeshStandardMaterial();
    applyGradient(mat, null, bbox());                 // frame 1: stripes only
    applyStripes(mat, STRIPES, bbox());
    applyGradient(mat, GRAD, bbox());                 // frame 2: the new cake's gradient
    applyStripes(mat, null, bbox());                  // …and its stripes go
    const c = compiled(mat);
    expect(c.gradient, 'the gradient survives the stripes teardown').toBe(true);
    expect(c.stripes).toBe(false);
  });

  it('a glazed cake followed by a gradient cake keeps the gradient', () => {
    const mat = new THREE.MeshStandardMaterial();
    applyGlaze(mat, GLAZE, bbox());
    applyGradient(mat, GRAD, bbox());
    applyGlaze(mat, null, bbox());
    const c = compiled(mat);
    expect(c.gradient, 'the gradient survives the glaze teardown').toBe(true);
    expect(c.glaze).toBe(false);
  });

  /* ⚠️ THE CONSTANT KEYS ARE THE OTHER HALF. `'grad:off'` and `'glaze:off'` put every torn-down
     material on ONE program; gradientMaterial's own note records the cost — the program binds
     whichever material compiled FIRST and the rest render that one's colours. On a cake switched
     from the library that is the previous cake's wall on the new cake. */
  it('never gives two materials the same program key, in any state', () => {
    const states = [
      (m) => applyGradient(m, GRAD, bbox()),
      (m) => { applyGradient(m, GRAD, bbox()); applyGradient(m, null, bbox()); },
      (m) => { applyGlaze(m, GLAZE, bbox()); applyGlaze(m, null, bbox()); },
      (m) => { applyStripes(m, STRIPES, bbox()); applyStripes(m, null, bbox()); },
      (m) => { applyGradient(m, GRAD, bbox()); applyStripes(m, STRIPES, bbox()); },
    ];
    for (const put of states) {
      const a = new THREE.MeshStandardMaterial(); const b = new THREE.MeshStandardMaterial();
      put(a); put(b);
      expect(compiled(a).key).not.toBe(compiled(b).key);
      expect(compiled(a).key).toContain(a.uuid);
    }
  });

  /* Paint order is the contract the three modules used to keep between them by accident. */
  it('stripes paint over a gradient, and a glaze over both', () => {
    const mat = new THREE.MeshStandardMaterial();
    applyGradient(mat, GRAD, bbox());
    applyStripes(mat, STRIPES, bbox());
    applyGlaze(mat, GLAZE, bbox());
    const c = compiled(mat);
    expect(c.gradient && c.stripes && c.glaze, 'all three are injected, none clobbered').toBe(true);
    expect(PATCH_ORDER).toEqual(['gradient', 'stripes', 'glaze']);
  });

  /* ⚠️ A COLOUR DRAG MUST NOT REBUILD A PROGRAM. stripeMaterial records what that feels like —
     "chewing through treacle". The signature covers which snippets are live, never a value. */
  /* ⚠️ `needsUpdate` IS WRITE-ONLY on a three Material — it bumps `version`, and reading it back
     gives undefined. The version is what a recompile actually costs, so that is what is asserted. */
  it('does not ask for a recompile when only a value changes', () => {
    const mat = new THREE.MeshStandardMaterial();
    applyGradient(mat, GRAD, bbox());
    const v = mat.version;
    applyGradient(mat, { ...GRAD, colors: ['#ff0000', '#00ff00'], balance: 0.9 }, bbox());
    expect(mat.version, 'a colour/balance change rides the uniforms').toBe(v);
    // …and the new values are the ones the shader would read.
    expect(compiled(mat).uniforms.uGBalance.value).toBeCloseTo(0.9, 9);
    expect(compiled(mat).uniforms.uGColors.value[0].getHexString()).toBe('ff0000');
  });

  it('does ask for one when the set of snippets changes', () => {
    const mat = new THREE.MeshStandardMaterial();
    applyGradient(mat, GRAD, bbox());
    const v = mat.version;
    applyStripes(mat, STRIPES, bbox());
    expect(mat.version).toBeGreaterThan(v);
  });

  it('reports a readable signature and rejects an unknown slot', () => {
    expect(patchSignature({})).toBe('none');
    const mat = new THREE.MeshStandardMaterial();
    expect(() => setMaterialPatch(mat, 'nonsense', { inject: () => {} })).toThrow(/unknown material patch slot/);
    setMaterialPatch(null, 'gradient', null);        // a missing material is simply nothing to do
  });
});
