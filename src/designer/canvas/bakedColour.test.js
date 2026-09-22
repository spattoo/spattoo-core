import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { greysFromColours, peakLuminance, neutraliseBakedColour } from './bakedColour.js';

/* These pin the two things that were actually wrong, and the one that must NOT change.
   The numbers come from the real files, measured 2026-09-22 (see bakedColour.js). */

function meshWith(colours, itemSize = 3) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(colours.length), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colours), itemSize));
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
}

describe('greysFromColours', () => {
  it('takes the hue out — pure red becomes grey', () => {
    const out = greysFromColours([1, 0, 0], 3, 1);
    expect(out[0]).toBeCloseTo(0.2126, 4);
    expect(out[0]).toBe(out[1]);
    expect(out[1]).toBe(out[2]);
  });

  it('keeps the shading — a darker vertex stays darker', () => {
    const out = greysFromColours([0.8, 0, 0, 0.4, 0, 0], 3, peakLuminance([0.8, 0, 0, 0.4, 0, 0], 3));
    expect(out[0]).toBeGreaterThan(out[3]);
    expect(out[3] / out[0]).toBeCloseTo(0.5, 4);
  });

  it('normalises, so a dark bake is not a dimmer', () => {
    // The fondant heart: luminance 0.111–0.233. Ungated, cream over it renders at a quarter strength.
    const dark = [0.52, 0.004, 0.004, 0.25, 0.004, 0.004];
    const out = greysFromColours(dark, 3, peakLuminance(dark, 3));
    expect(Math.max(out[0], out[3])).toBeCloseTo(1, 4);
  });

  it('carries alpha through untouched', () => {
    const out = greysFromColours([1, 0, 0, 0.25], 4, 1);
    expect(out[3]).toBe(0.25);
  });
});

describe('neutraliseBakedColour', () => {
  it('does nothing to a model with no baked colours', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const root = new THREE.Group().add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));
    expect(neutraliseBakedColour(root)).toBe(0);
  });

  it('greys every mesh, and keeps one part darker than another', () => {
    const root = new THREE.Group();
    root.add(meshWith([1, 0, 0]));        // bright part
    root.add(meshWith([0.25, 0, 0]));     // darker part
    expect(neutraliseBakedColour(root)).toBe(2);
    const [a, b] = root.children.map(m => m.geometry.getAttribute('color').array[0]);
    expect(a).toBeCloseTo(1, 4);
    expect(b).toBeCloseTo(0.25, 4);       // relationship BETWEEN meshes survives
  });

  it('clones the geometry — the cached GLB is never written to', () => {
    const mesh = meshWith([1, 0, 0]);
    const shared = mesh.geometry;
    neutraliseBakedColour(new THREE.Group().add(mesh));
    expect(mesh.geometry).not.toBe(shared);
    expect(shared.getAttribute('color').array[0]).toBe(1);   // still pure red
  });
});
