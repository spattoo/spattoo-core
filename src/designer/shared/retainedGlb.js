/* ── Giving a 3D model back when the last piece using it goes ────────────────────────────────────
 *
 * The same lifetime a sticker's artwork got (CakeCanvas → stickerAlbedoCache), for the thing that
 * turned out to cost far more. Measured on the catalogue's "Cricket bat", live in the designer:
 *
 *     empty cake                     8 textures / 17 geometries    0.3 MB
 *     one GLB topper placed         11 textures / 19 geometries   16.3 MB
 *     removed, and 177s later       11 textures / 18 geometries    0.3 MB
 *
 * ⚠️ ZERO TEXTURES CAME BACK, EVER. `useGLTF` caches a parsed model by URL and disposes nothing —
 * `useGLTF.clear` appeared in no file in this repo — so a model stayed uploaded for the life of the
 * page. A baker who tries five textured toppers and keeps one has paid for all five.
 *
 * ⚠️ AND 16.3 OF THE 16.6 MB IS TEXTURE, which is the number that decides what this walk has to
 * reach. A textured GLB carries three 1024 maps (colour, normal, roughness/metal) at ~5.6 MB each;
 * its twenty thousand triangles are rounding error beside them. Freeing geometry and leaving the
 * maps would look like a fix and give back almost nothing. The catalogue's own ingest stats agree:
 * every element recorded at 16.6 MB has `texture_max_dim` 1024, and every untextured one is ~1 MB.
 *
 * ⚠️ IT CANNOT DISPOSE ON UNMOUNT, which is the obvious version and a worse bug — the same trap the
 * albedo fix nearly shipped. Models are SHARED: a ring of twenty roses is one parsed GLB, and
 * freeing it when any one rose goes would blank the other nineteen. Hence the ref count: pinned
 * while any user is mounted, released when the last leaves, disposed after the idle grace.
 *
 * ⚠️ AND THE DISPOSE MUST CLEAR DREI'S ENTRY IN THE SAME BREATH. Dispose the GPU resources but
 * leave `useGLTF`'s cache entry and the next placement is handed a disposed model — an invisible
 * or broken decoration, intermittent, and far worse than the leak it replaces.
 *
 * ── What this does NOT free ─────────────────────────────────────────────────────────────────────
 * Each placed instance makes its OWN copies: `cleanGlbScene` clones every geometry, and each
 * instance clones its materials so two hearts can be two colours. Those are per-instance, they are
 * not shared, and they are not this file's to reclaim — freeing them belongs on unmount, not after
 * a grace, and the textures inside those cloned materials still point at the cached model's. That
 * is a separate piece of work; what is here is the 16.3 MB.
 */

import { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { makeRefCountedCache } from './refCountedCache.js';

/**
 * Free every GPU resource a parsed GLB owns: geometries, materials, and every texture hanging off
 * those materials. three.js has no `scene.dispose()` — a scene is a tree of objects that each own
 * their own resources — so this is the walk, in one place rather than at each call site.
 *
 * Materials and textures are gathered into sets BEFORE anything is disposed, because a GLB routinely
 * points several meshes at one material and several materials at one texture. Disposing as we walk
 * would call dispose on the same texture repeatedly; harmless in three.js, but the set also makes
 * the count honest if this ever needs to report what it freed.
 *
 * Exported for its test, which builds a small scene by hand and checks every resource in it was
 * reached — the one assertion that cannot be made by reading the code.
 */
export function disposeGlbScene(scene) {
  if (!scene?.traverse) return;
  const materials = new Set();
  scene.traverse(o => {
    if (!o.isMesh && !o.isLine && !o.isPoints) return;
    try { o.geometry?.dispose?.(); } catch { /* best-effort */ }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m) materials.add(m);
  });
  const textures = new Set();
  for (const m of materials) {
    // Every texture-valued property, rather than a hand-written list of map names: a GLB can carry
    // any of a dozen (map, normalMap, roughnessMap, metalnessMap, aoMap, emissiveMap, clearcoatMap…)
    // and a list would silently miss whichever one a new asset starts using.
    for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    try { m.dispose?.(); } catch { /* best-effort */ }
  }
  for (const t of textures) { try { t.dispose?.(); } catch { /* best-effort */ } }
}

const glbCache = makeRefCountedCache({
  dispose: ({ scene, url }) => {
    disposeGlbScene(scene);
    try { useGLTF.clear(url); } catch { /* drei may have evicted it already */ }
  },
});

/**
 * `useGLTF`, plus a lifetime. Drop-in: returns exactly what useGLTF returns, so a call site changes
 * one word and cannot half-apply the change — there is no separate "remember to retain" step to
 * forget, which is the shape the texture version has and the reason this one is a wrapper.
 *
 * ⚠️ FETCHED MODELS ONLY. `CakeCoat` calls this with `''` when a tier has no coat, and a studio may
 * hand it a blob: URL it built itself; neither is a shared catalogue asset and neither has anything
 * to reclaim, so both are left exactly as they are today. Same guard, same reasoning, as the
 * `data:`/`blob:` one on the albedo.
 */
export function useRetainedGlb(url) {
  const gltf = useGLTF(url);
  const managed = /^https?:|^\//i.test(url ?? '');
  // Seeded during render so the entry exists before the mount effect retains it — a render that
  // never commits leaves it on the expiry clock, exactly as makeRefCountedCache intends.
  if (managed) glbCache.get(url, () => ({ scene: gltf.scene, url }));
  useEffect(() => {
    if (!managed) return undefined;
    glbCache.retain(url);
    return () => glbCache.release(url);
  }, [url, managed]);
  return gltf;
}
