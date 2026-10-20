import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { disposeGlbScene, disposeGlbInstance, disposeGlbGeometries } from './retainedGlb.js';

/* A GLB's cost is its TEXTURES — 16.3 of the 16.6 MB measured on the catalogue's Cricket bat — so
   the one thing worth asserting is that the walk reaches them. Freeing geometry and leaving three
   1024 maps behind would pass every gate, look like a fix, and give back nothing. */

function spyOn(obj) { obj.dispose = vi.fn(); return obj; }

function sceneWith({ sharedTexture = false, sharedMaterial = false, multiMaterial = false } = {}) {
  const root = new THREE.Group();
  const texA = spyOn(new THREE.Texture());
  const texB = spyOn(new THREE.Texture());
  const matA = spyOn(new THREE.MeshStandardMaterial({ map: texA, normalMap: texB }));
  const matB = spyOn(sharedMaterial ? matA : new THREE.MeshStandardMaterial({
    map: sharedTexture ? texA : spyOn(new THREE.Texture()),
  }));
  const geoA = spyOn(new THREE.BoxGeometry());
  const geoB = spyOn(new THREE.BoxGeometry());
  const meshA = new THREE.Mesh(geoA, multiMaterial ? [matA, matB] : matA);
  const meshB = new THREE.Mesh(geoB, matB);
  // Nested, because a GLB is a tree and not a flat list.
  const inner = new THREE.Group();
  inner.add(meshB);
  root.add(meshA); root.add(inner);
  return { root, texA, texB, matA, matB, geoA, geoB };
}

describe('disposeGlbScene — give a parsed model back', () => {
  it('frees every geometry, material and texture in the tree', () => {
    const s = sceneWith();
    disposeGlbScene(s.root);
    for (const k of ['geoA', 'geoB', 'matA', 'matB', 'texA', 'texB']) {
      expect(s[k].dispose, `${k} was never disposed`).toHaveBeenCalled();
    }
  });

  /* The maps are the whole point, and a hand-written list of map names would miss whichever one a
     new asset starts using. Every texture-valued property is reached, not just `map`. */
  it('reaches a map that is not called "map"', () => {
    const root = new THREE.Group();
    const emissive = spyOn(new THREE.Texture());
    const clearcoat = spyOn(new THREE.Texture());
    const mat = new THREE.MeshPhysicalMaterial({ emissiveMap: emissive, clearcoatMap: clearcoat });
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));
    disposeGlbScene(root);
    expect(emissive.dispose).toHaveBeenCalled();
    expect(clearcoat.dispose).toHaveBeenCalled();
  });

  /* A GLB routinely points several meshes at one material and several materials at one texture.
     Disposing twice is harmless in three.js, but the sets keep the walk honest. */
  it('handles a texture shared by two materials', () => {
    const s = sceneWith({ sharedTexture: true });
    disposeGlbScene(s.root);
    expect(s.texA.dispose).toHaveBeenCalledTimes(1);
  });

  it('handles a material shared by two meshes', () => {
    const s = sceneWith({ sharedMaterial: true });
    disposeGlbScene(s.root);
    expect(s.matA.dispose).toHaveBeenCalledTimes(1);
    expect(s.geoA.dispose).toHaveBeenCalled();
    expect(s.geoB.dispose).toHaveBeenCalled();
  });

  it('handles a mesh with an array of materials', () => {
    const s = sceneWith({ multiMaterial: true });
    disposeGlbScene(s.root);
    expect(s.matA.dispose).toHaveBeenCalled();
    expect(s.matB.dispose).toHaveBeenCalled();
  });

  it('survives being handed nothing', () => {
    expect(() => disposeGlbScene(null)).not.toThrow();
    expect(() => disposeGlbScene(undefined)).not.toThrow();
    expect(() => disposeGlbScene({})).not.toThrow();
  });

  /* A GLB can carry a light or a camera; the walk must step over them rather than reach for a
     geometry that is not there. */
  it('steps over non-renderable nodes', () => {
    const root = new THREE.Group();
    root.add(new THREE.PointLight());
    root.add(new THREE.PerspectiveCamera());
    const geo = spyOn(new THREE.BoxGeometry());
    root.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));
    expect(() => disposeGlbScene(root)).not.toThrow();
    expect(geo.dispose).toHaveBeenCalled();
  });
});

/* ── The instance's copies are the OPPOSITE rule ─────────────────────────────────────────────────
 * A placed piece clones the cached model's geometries and materials, but a cloned material still
 * POINTS AT the cached model's maps — `material.clone()` copies the reference, not the picture. So
 * freeing a piece must stop one level short, and the bent copy a wall-hugging piece renders must
 * stop two: it borrows the unbent clone's materials outright.
 *
 * These two tests are the whole reason the functions are named rather than inlined. Get them the
 * wrong way round and every other copy of that decoration on the cake goes black, while the cache
 * sits there believing it still owns maps that have been disposed. */
describe('freeing one placed piece', () => {
  it('frees its geometries and materials but NEVER the shared maps', () => {
    const root = new THREE.Group();
    const sharedMap = spyOn(new THREE.Texture());          // lives on the cached model
    const ownMaterial = spyOn(new THREE.MeshStandardMaterial({ map: sharedMap }));
    const ownGeometry = spyOn(new THREE.BoxGeometry());
    root.add(new THREE.Mesh(ownGeometry, ownMaterial));

    disposeGlbInstance(root);

    expect(ownGeometry.dispose).toHaveBeenCalled();
    expect(ownMaterial.dispose).toHaveBeenCalled();
    expect(sharedMap.dispose, 'the cached model\'s map must survive').not.toHaveBeenCalled();
  });

  it('a borrowed-material scene gives back geometry only', () => {
    const root = new THREE.Group();
    const borrowed = spyOn(new THREE.MeshStandardMaterial());   // the unbent clone still renders it
    const bentGeometry = spyOn(new THREE.BoxGeometry());
    root.add(new THREE.Mesh(bentGeometry, borrowed));

    disposeGlbGeometries(root);

    expect(bentGeometry.dispose).toHaveBeenCalled();
    expect(borrowed.dispose, 'the unbent clone still needs it').not.toHaveBeenCalled();
  });

  it('both survive being handed nothing', () => {
    expect(() => disposeGlbInstance(null)).not.toThrow();
    expect(() => disposeGlbGeometries(undefined)).not.toThrow();
  });
});
