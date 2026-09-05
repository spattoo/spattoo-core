// ── Light a harness the way production lights a cake ─────────────────────────────────────────────
//
// Import this for its side effect from any harness that mounts `CakePreview` / `CakeCanvas`:
//
//     import './scene.js';
//
// ⚠️ WHY THIS EXISTS. A harness that lights its subject differently from the product cannot be used
// to judge the product, and for a long time every one of ours did. The app passes an assets base
// (`cfAssetsBase`) and gets the self-hosted OUTDOOR map; a harness passed nothing, so `envProps` fell
// back to drei's INDOOR `apartment` preset — silently, because a fallback that announces itself is a
// fallback nobody wrote. Of the harnesses mounting the real scene, exactly one configured this, and
// it only did so after the divergence had already cost:
//
//   · three parameter sweeps (rotation, roughness, envIntensity) run and REPORTED against the wrong
//     environment, with their conclusions written into the feature docs as settled findings;
//   · a scene-wide HDRI swap chosen on those conclusions, shipped, and reverted the same day when it
//     turned every faux ball matte.
//
// A metal shows nothing but the reflected environment, so "which map" is not a detail for anything
// touching shine or colour — it is the whole measurement.
//
// ⚠️ IT GOES THROUGH THE VITE PROXY, NOT STRAIGHT TO THE CDN. The CDN's CORS allowlist holds the
// app's ports, not the harness's, and a WebGL texture load with no `access-control-allow-origin`
// fails — which `SafeEnvironment` then swallows, putting us right back in the silent fallback this
// file exists to prevent. `/cdn` is proxied in `vite.config.js`, so the request is same-origin and
// there is no CORS to satisfy. The bytes are the real ones, fetched live, so nothing here can go
// stale the way a checked-in copy would.
//
// ⚠️ AND IT DELIBERATELY DOES NOT PIN A MAP OR AN INTENSITY. Everything else about the scene already
// lives in `CakeCanvas` (`SCENE_ENV`) and `envMap.js` (`ENV_HDR_PATH`) and is shared with production
// by construction. The ONLY thing a harness was missing is the assets base, so that is the only thing
// this supplies — a second place to configure the scene would be a second place for it to drift.
import { configureEnvMap } from '../src/designer/canvas/envMap.js';

export const HARNESS_ASSETS_BASE = '/cdn';

configureEnvMap(HARNESS_ASSETS_BASE);
