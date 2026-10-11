import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ALTERNATE_MODE, isAlternating, alternateStops, alternateColorAt,
  isGradientActive, GRADIENT_MODES, applyGradient,
} from './gradientMaterial.js';

const RED = '#d6453f', BLUE = '#3f6fd6', GREEN = '#4fa84a';
const alt = (...colors) => ({ mode: ALTERNATE_MODE, colors });

describe('alternating piping colours', () => {
  // Sandeep: "so one piece red and next piece blue, next red and next blue (assuming red and blue
  // are selected)". This is that sentence, as a test.
  it('two stops give red, blue, red, blue round the ring', () => {
    const g = alt(RED, BLUE);
    expect([0, 1, 2, 3, 4, 5].map(i => alternateColorAt(g, i)))
      .toEqual([RED, BLUE, RED, BLUE, RED, BLUE]);
  });

  // "3 color pieces repeat if 3 selected."
  it('three stops repeat on a cycle of three', () => {
    const g = alt(RED, BLUE, GREEN);
    expect([0, 1, 2, 3, 4, 5, 6].map(i => alternateColorAt(g, i)))
      .toEqual([RED, BLUE, GREEN, RED, BLUE, GREEN, RED]);
  });

  it('is anchored to the ring index, so piece 100 is still on the cycle', () => {
    expect(alternateColorAt(alt(RED, BLUE), 100)).toBe(RED);
    expect(alternateColorAt(alt(RED, BLUE), 101)).toBe(BLUE);
    expect(alternateColorAt(alt(RED, BLUE, GREEN), 99)).toBe(RED);
  });

  it('never returns undefined for a negative index', () => {
    // Not reachable from the ring today, but a modulo that can return undefined is the kind of
    // thing that ships a transparent shell the day someone counts backwards from the front.
    expect(alternateColorAt(alt(RED, BLUE), -1)).toBe(BLUE);
    expect(alternateColorAt(alt(RED, BLUE, GREEN), -1)).toBe(GREEN);
  });

  it('ignores a pending stop that has no colour yet', () => {
    // The "+" chip adds a null until the wheel gives it a colour; it is not a piece's colour.
    const g = { mode: ALTERNATE_MODE, colors: [RED, BLUE, null] };
    expect(alternateStops(g)).toEqual([RED, BLUE]);
    expect(alternateColorAt(g, 2)).toBe(RED);
  });

  it('is not alternating with fewer than two real stops', () => {
    expect(alternateColorAt({ mode: ALTERNATE_MODE, colors: [RED] }, 0)).toBeNull();
    expect(alternateStops({ mode: ALTERNATE_MODE, colors: [RED, null] })).toBeNull();
    expect(isAlternating({ mode: ALTERNATE_MODE, colors: [RED] })).toBe(false);
  });

  it('leaves the three sweep modes alone', () => {
    for (const mode of GRADIENT_MODES) {
      const g = { mode, colors: [RED, BLUE] };
      expect(isAlternating(g)).toBe(false);
      expect(alternateStops(g)).toBeNull();
      expect(alternateColorAt(g, 1)).toBeNull();
      // …and they are still gradients, so the shader path is untouched.
      expect(isGradientActive(g)).toBe(true);
    }
  });

  /* ⚠️ THE OTHER HALF OF THE SAME GUARD, and the one a surface that cannot alternate depends on.
     A tier wall, a wrap band, a swag strip and a sticker all run their gradient through the shader
     and have no pieces to split. Handed an alternating gradient they must fall back to the SOLID
     colour — never a sweep, which is what MODE_INDEX's `?? 0` would otherwise hand them. */
  it('does not patch a shader: an alternating gradient is no gradient to a material', () => {
    const bbox = {
      min: new THREE.Vector3(-1, 0, -1),
      size: new THREE.Vector3(2, 2, 2),
      center: new THREE.Vector3(0, 1, 0),
    };
    const mat = new THREE.MeshPhysicalMaterial();
    applyGradient(mat, alt(RED, BLUE), bbox);
    expect(mat.userData.__gradOn).toBeFalsy();

    // …while a sweep on the same material still does.
    const sweep = new THREE.MeshPhysicalMaterial();
    applyGradient(sweep, { mode: 'vertical', colors: [RED, BLUE] }, bbox);
    expect(sweep.userData.__gradOn).toBe(true);
  });

  /* ⚠️ THE GUARD THAT MATTERS MOST. 'alternate' must never reach MODE_INDEX, where an unknown mode
     falls through to 0 — swirl. A ring asked to alternate would render a sweep and look merely
     wrong rather than broken, which is how it would survive review. */
  it('is not one of the shader modes', () => {
    expect(GRADIENT_MODES).not.toContain(ALTERNATE_MODE);
  });
});
