import { useEffect, useState } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl, corsUrl } from '../utils/assetUrl.js';

// ── The MESH behind a modelled cream style ────────────────────────────────────
//
// A cream style whose `wall` is 'strokes' is piped from a scan of ONE real stroke rather than from a
// swept nozzle section (see buildStrokeWall in geometry/creamWall.js). The style row names the mesh
// by R2 KEY, exactly as every other 3D asset in this app is named, and this module is the one place
// that key becomes a URL and then a geometry.
//
// ⚠️ CONFIGURED WITH THE ASSETS BASE THE WAY envMap.js IS, and for the same reason: a style row is
// plain data loaded long before any React tree exists, so it cannot know the host's CDN. The host
// calls configureStrokeMeshes(cfAssetsBase) once, beside configureEnvMap(cfAssetsBase).
let _base = null;
export function configureStrokeMeshes(cfAssetsBase) { _base = cfAssetsBase || null; }

// key → absolute, CORS-qualified URL, or null when there is no base configured (unresolvable, not a
// guess — the style then renders as a smooth wall rather than as a broken one). An already-absolute
// URL passes through, so a DB row may hold either.
export function strokeMeshUrl(keyOrUrl) {
  const url = assetUrl(keyOrUrl, _base);
  return url ? corsUrl(url) : null;
}

/* ⚠️ NOT `useGLTF`. drei's loader SUSPENDS, and it cannot be called with null — so using it here
 * would mean either a hook behind a condition (illegal) or a wrapper component around the whole
 * tier body, and a tier that suspends takes the cake off screen every time a baker switches style.
 * A plain hook that returns null until the mesh is there lets the wall builder fall back to the
 * smooth side, which is what it is written to do. The cache is module-level, so the second tier of
 * a stacked cake — and every later re-render — costs one map lookup. */
const cache = new Map();                 // url → Promise<BufferGeometry|null>

function load(url) {
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((resolve) => {
    new GLTFLoader().load(url, (gltf) => {
      let geo = null;
      gltf.scene.traverse((o) => { if (!geo && o.isMesh) geo = o.geometry; });
      if (geo) geo.computeBoundingBox();
      resolve(geo);
    }, undefined, (e) => {
      /* A style whose mesh has been deleted from storage must not take the canvas with it — the
         same rule the piping rings' SafeGlb wrapper enforces. Report and render smooth. */
      console.warn('[strokeMesh] failed to load', url, e);
      resolve(null);
    });
  });
  cache.set(url, p);
  return p;
}

// The stroke geometry for a style's mesh key, or null while it loads / when there is none.
export function useStrokeMesh(keyOrUrl) {
  const url = keyOrUrl ? strokeMeshUrl(keyOrUrl) : null;
  const [geo, setGeo] = useState(null);
  useEffect(() => {
    if (!url) { setGeo(null); return; }
    let live = true;
    load(url).then((g) => { if (live) setGeo(g); });
    return () => { live = false; };
  }, [url]);
  return url ? geo : null;
}
