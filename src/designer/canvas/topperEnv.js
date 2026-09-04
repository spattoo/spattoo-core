// ── The acrylic topper's own environment ─────────────────────────────────────────────────────────
//
// ⚠️ THIS EXISTS BECAUSE A MATERIAL CANNOT TURN THE SCENE'S ENVIRONMENT DOWN — only replace it.
// `scene.environment` and `environmentIntensity` are SCENE properties; a material's
// `envMapIntensity` is measurably inert against them (0.5 / 1.0 / 2.0 / 3.0 render bit-identically).
// Four earlier attempts to compensate on the material failed for exactly this reason. Assigning an
// actual `envMap` texture is the one thing that DOES override it:
//
//     scene environment only   mean 215   relative contrast 0.108
//     per-material envMap      mean 163   relative contrast 0.178
//
// ⚠️ AND IT IS SCOPED TO THE TOPPER ON PURPOSE. The first version of this fix changed the SCENE map
// instead, which fixed the topper and dulled every other metal — the faux balls went matte and it
// was reverted the same afternoon. The spike that replaced it selected meshes by `metalness > 0.5`,
// which caught the faux balls again: the same mistake one level down. A mirror-flat letterform and a
// curved ball want opposite things from one light, so the only safe selector is the material that
// actually has the problem. Nothing here touches anything but an acrylic topper.
import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { PMREMGenerator } from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { hdrUrl, TOPPER_HDR_PATH } from './envMap.js';

/* Module-level, because every topper on the cake wants the same texture and a PMREM is expensive to
 * build — keyed by URL so a change of assets base does not serve a stale one. */
const _cache = new Map();

export function useTopperEnv() {
  const gl = useThree((s) => s.gl);
  const url = hdrUrl(TOPPER_HDR_PATH);
  const [tex, setTex] = useState(() => _cache.get(url) ?? null);

  useEffect(() => {
    if (!url || !gl) return;
    if (_cache.has(url)) { setTex(_cache.get(url)); return; }
    let alive = true;
    /* ⚠️ FAILURE IS SILENT AND CORRECT. No assets base in local dev, a 404, a CORS refusal — any of
       them leave `envMap` null, and the topper simply falls back to the scene's environment, which
       is what it used before this file existed. A cake with a slightly glary topper beats one that
       throws. */
    new RGBELoader().load(url, (src) => {
      if (!alive) { src.dispose(); return; }
      const pm = new PMREMGenerator(gl);
      const t = pm.fromEquirectangular(src).texture;
      src.dispose(); pm.dispose();
      _cache.set(url, t);
      setTex(t);
    }, undefined, () => {});
    return () => { alive = false; };
  }, [url, gl]);

  return tex;
}
