/* A gradient or a stripe set paints the WALL. It must not paint the particles stamped on the wall.
 *
 * `#include <color_fragment>` runs after `#include <map_fragment>`, so on a tier carrying gold leaf
 * or luster dust the shards are already in `diffuseColor` — and both of these effects used to write
 * `diffuseColor.rgb` outright, which repainted every shard in the cake's own colour. It showed up as
 * gold flakes rendering muddy pink on a gradient cake, and it was invisible on a solid one, because
 * without a gradient the shader is never patched at all.
 *
 * These assert the SHADER TEXT rather than a render: what went wrong was an unconditional
 * assignment, and that is a thing you can read. A pixel test would need a GPU and would not say why.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyGradient } from './gradientMaterial.js';
import { applyStripes } from './stripeMaterial.js';

const bbox = () => ({
  min: new THREE.Vector3(-1, 0, -1),
  size: new THREE.Vector3(2, 2, 2),
  center: new THREE.Vector3(0, 1, 0),
});
const GRADIENT = { mode: 'vertical', colors: ['#E8598F', '#9B6FD4'], balance: 0.5 };
const STRIPES  = { colors: ['#E8598F', '#9B6FD4'], count: 2, softness: 0.35 };
const MASK = new THREE.Texture();

/** Compile a patched material the way three would, and hand back the fragment source. */
function frag(mat) {
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main(){\n#include <color_fragment>\n}',
  };
  mat.onBeforeCompile(shader, {});
  return shader.fragmentShader;
}

describe('a gradient spares what the finish stamped', () => {
  it('writes the wall colour outright when there is no finish on the tier', () => {
    const mat = new THREE.MeshPhysicalMaterial();
    applyGradient(mat, GRADIENT, bbox(), (c) => c, null);
    const src = frag(mat);
    expect(src).toContain('diffuseColor.rgb = gcol;');
    expect(src).not.toContain('uGMask');
  });

  it('blends toward the map wherever the particle mask says there is one', () => {
    const mat = new THREE.MeshPhysicalMaterial();
    applyGradient(mat, GRADIENT, bbox(), (c) => c, MASK);
    const src = frag(mat);
    expect(src).toContain('uniform sampler2D uGMask;');
    expect(src).toContain('mix(gcol, diffuseColor.rgb, gMask)');
    expect(src).not.toContain('diffuseColor.rgb = gcol;');
  });

  it('recompiles when the mask appears, instead of keeping the program that paints over it', () => {
    const mat = new THREE.MeshPhysicalMaterial();
    applyGradient(mat, GRADIENT, bbox(), (c) => c, null);
    const before = mat.customProgramCacheKey();
    applyGradient(mat, GRADIENT, bbox(), (c) => c, MASK);
    expect(mat.customProgramCacheKey()).not.toBe(before);
    expect(frag(mat)).toContain('uGMask');
  });
});

describe('stripes spare what the finish stamped', () => {
  it('writes the band colour outright with no finish', () => {
    const mat = new THREE.MeshPhysicalMaterial();
    applyStripes(mat, STRIPES, bbox(), (c) => c, null);
    const src = frag(mat);
    expect(src).toContain('diffuseColor.rgb = bcol;');
    expect(src).not.toContain('uSMask');
  });

  it('blends toward the map under the mask', () => {
    const mat = new THREE.MeshPhysicalMaterial();
    applyStripes(mat, STRIPES, bbox(), (c) => c, MASK);
    const src = frag(mat);
    expect(src).toContain('uniform sampler2D uSMask;');
    expect(src).toContain('mix(bcol, diffuseColor.rgb, sMask)');
  });

  it('recompiles when the mask appears rather than reusing the patched program', () => {
    const mat = new THREE.MeshPhysicalMaterial();
    applyStripes(mat, STRIPES, bbox(), (c) => c, null);
    expect(frag(mat)).not.toContain('uSMask');
    applyStripes(mat, STRIPES, bbox(), (c) => c, MASK);
    expect(frag(mat)).toContain('uSMask');
  });
});
