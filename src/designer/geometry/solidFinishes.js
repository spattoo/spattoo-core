// Surface FINISHES for a solid relief slab's side walls (placement_config.relief.solidFinish). A flat
// image can't tell us what the element is MADE of, so the author picks a finish in the Relief Studio.
// This is data, not code branches (INVARIANTS): the designer and the studio both read this ONE registry
// and build the wall through the ONE factory below — no drift, add/tune a finish in a single place.
//
// A finish controls only the SURFACE FEEL (roughness / gloss / grain). The wall COLOUR is always the
// print's dominant hue (passed in) — "Chocolate" on a brown element reads glossy brown, on a teal one
// glossy teal. Params are sensible starting points; tune here and every slab follows.
import * as THREE from 'three';
import { getFondantNormalMap } from '../shared/textures/fondantTexture.js';

// `emissiveFactor` scales the wall's self-illumination so the side/back walls read as a slightly-shaded
// version of the front print — present, but never brighter than the cap. It multiplies the `emissive`
// intensity passed in (the print exposure model's `selfLit` term, ~0.65 at neutral — shared/printExposure.js).
//
// CALIBRATION NOTE: these were originally tuned against the OLD wall-emissive input `DECAL_EMISSIVE` (0.22).
// The 0.1.67 exposure refactor changed the input the designer feeds this factory to `printExposure().selfLit`
// (~0.65, ~3× larger) WITHOUT re-tuning here, so the wall emissiveIntensity jumped (fondant 0.22×1.60=0.35 →
// 0.65×1.60=1.04). That over-drive is additive and un-mapped, so it clipped saturated/pale walls toward white
// (a pink bow slab rendered near-white walls). Re-scaled by ~0.34 to restore the known-good absolute intensity
// under the new input (fondant → 0.65×0.54≈0.35, matching the pre-refactor look). Glossy finishes keep the
// same RELATIVE reduction (their reflections already brighten them). Matte finishes now land ≈0.54, not ~1: the
// wall is meant to read a touch DARKER than the light-facing cap (physically correct for a side wall), not equal.
export const SOLID_FINISHES = {
  fondant:     { label: 'Fondant',     roughness: 0.97, envMapIntensity: 0.30, grain: 'fondant', normalScale: 0.60, emissiveFactor: 0.54 },
  buttercream: { label: 'Buttercream', roughness: 0.88, envMapIntensity: 0.35, grain: 'fondant', normalScale: 0.90, emissiveFactor: 0.54 },
  chocolate:   { label: 'Chocolate',   roughness: 0.42, envMapIntensity: 0.85, clearcoat: 0.35, clearcoatRoughness: 0.45, grain: 'fondant', normalScale: 0.25, emissiveFactor: 0.27 },
  ganache:     { label: 'Ganache',     roughness: 0.22, envMapIntensity: 1.00, clearcoat: 0.50, clearcoatRoughness: 0.25, grain: null, emissiveFactor: 0.15 },
  royal_icing: { label: 'Royal icing', roughness: 0.68, envMapIntensity: 0.40, grain: null, emissiveFactor: 0.47 },
  hard_sugar:  { label: 'Hard sugar',  roughness: 0.10, envMapIntensity: 1.00, clearcoat: 0.60, clearcoatRoughness: 0.15, grain: null, emissiveFactor: 0.12 },
};
// Stable display/authoring order (dropdown). Keys are the persisted config values — do not rename.
export const SOLID_FINISH_ORDER = ['fondant', 'buttercream', 'chocolate', 'ganache', 'royal_icing', 'hard_sugar'];
export const DEFAULT_SOLID_FINISH = 'fondant';

// Build the side-wall material for a solid slab: the author-chosen finish's feel + the print's dominant
// colour. Returns a MeshPhysicalMaterial; if the finish carries a grain, its normalMap is a CLONE of the
// shared fondant map (so setting repeat here can't mutate the cake-wall texture) — the caller disposes
// that clone (and the material) on change/unmount.
// `printMap` (optional) switches the walls from ONE flat colour to the print's LOCAL colour at each point
// of the silhouette — a tree's trunk edge reads brown while its leaf edges read green. It samples the SAME
// albedo the front cap uses (so a customer's recolour tracks for free) through the geometry's `uv1` set,
// which buildSolidReliefGeometry fills with the front-print registration, inset from the antialiased rim.
//
// The texture is CLONED because `channel` lives on the texture, not the material: setting channel = 1 on the
// shared albedo would drag the FRONT cap onto the wall's UV set too. The clone shares the image (no second
// decode) but needs its own GPU upload. The caller disposes it alongside the grain clone below.
export function buildSolidWallMaterial(finishKey, colorHex, emissive = 0, { printMap = null } = {}) {
  const f = SOLID_FINISHES[finishKey] || SOLID_FINISHES[DEFAULT_SOLID_FINISH];
  const col = new THREE.Color(colorHex || '#efe6da');
  let map = null;
  if (printMap) {
    map = printMap.clone();
    map.channel = 1;      // read `uv1` (front-print registration), leaving `uv` for the tiling grain
    map.needsUpdate = true;
  }
  const mat = new THREE.MeshPhysicalMaterial({
    // With a printMap the colour comes from the texture; a white tint leaves it exactly the front's colour
    // (map is multiplied by `color`). Without one, the flat dominant/authored hue as before.
    color: map ? new THREE.Color('#ffffff') : col,
    map,
    roughness: f.roughness, metalness: f.metalness ?? 0,
    envMapIntensity: f.envMapIntensity ?? 0.3,
    clearcoat: f.clearcoat ?? 0, clearcoatRoughness: f.clearcoatRoughness ?? 0.3,
    // Match the front print's self-illumination so wall and cap read as one colour (see emissiveFactor).
    // With a printMap the self-illumination must be per-pixel too, or a green leaf's wall glows brown.
    emissive: map ? new THREE.Color('#ffffff') : col.clone(),
    emissiveMap: map,
    emissiveIntensity: Math.max(0, emissive) * (f.emissiveFactor ?? 1),
    side: THREE.DoubleSide,
  });
  if (f.grain === 'fondant') {
    const n = getFondantNormalMap().clone();
    n.wrapS = n.wrapT = THREE.RepeatWrapping;
    n.repeat.set(3, 3);
    n.needsUpdate = true;   // clone shares the image but needs its own GPU upload
    mat.normalMap = n;
    const s = f.normalScale ?? 0.6;
    mat.normalScale = new THREE.Vector2(s, s);
  }
  return mat;
}
