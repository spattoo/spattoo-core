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

// `emissiveFactor` scales the front print's emissive onto the wall so the two read as the SAME colour
// under the same light (the front self-illuminates; without this the wall sits dimmer). Matte finishes
// match the front fully (~1); glossy ones use less, since their reflections already brighten them.
export const SOLID_FINISHES = {
  fondant:     { label: 'Fondant',     roughness: 0.97, envMapIntensity: 0.30, grain: 'fondant', normalScale: 0.60, emissiveFactor: 1.60 },
  buttercream: { label: 'Buttercream', roughness: 0.88, envMapIntensity: 0.35, grain: 'fondant', normalScale: 0.90, emissiveFactor: 1.60 },
  chocolate:   { label: 'Chocolate',   roughness: 0.42, envMapIntensity: 0.85, clearcoat: 0.35, clearcoatRoughness: 0.45, grain: 'fondant', normalScale: 0.25, emissiveFactor: 0.80 },
  ganache:     { label: 'Ganache',     roughness: 0.22, envMapIntensity: 1.00, clearcoat: 0.50, clearcoatRoughness: 0.25, grain: null, emissiveFactor: 0.45 },
  royal_icing: { label: 'Royal icing', roughness: 0.68, envMapIntensity: 0.40, grain: null, emissiveFactor: 1.40 },
  hard_sugar:  { label: 'Hard sugar',  roughness: 0.10, envMapIntensity: 1.00, clearcoat: 0.60, clearcoatRoughness: 0.15, grain: null, emissiveFactor: 0.35 },
};
// Stable display/authoring order (dropdown). Keys are the persisted config values — do not rename.
export const SOLID_FINISH_ORDER = ['fondant', 'buttercream', 'chocolate', 'ganache', 'royal_icing', 'hard_sugar'];
export const DEFAULT_SOLID_FINISH = 'fondant';

// Build the side-wall material for a solid slab: the author-chosen finish's feel + the print's dominant
// colour. Returns a MeshPhysicalMaterial; if the finish carries a grain, its normalMap is a CLONE of the
// shared fondant map (so setting repeat here can't mutate the cake-wall texture) — the caller disposes
// that clone (and the material) on change/unmount.
export function buildSolidWallMaterial(finishKey, colorHex, emissive = 0) {
  const f = SOLID_FINISHES[finishKey] || SOLID_FINISHES[DEFAULT_SOLID_FINISH];
  const col = new THREE.Color(colorHex || '#efe6da');
  const mat = new THREE.MeshPhysicalMaterial({
    color: col,
    roughness: f.roughness, metalness: f.metalness ?? 0,
    envMapIntensity: f.envMapIntensity ?? 0.3,
    clearcoat: f.clearcoat ?? 0, clearcoatRoughness: f.clearcoatRoughness ?? 0.3,
    // Match the front print's self-illumination so wall and cap read as one colour (see emissiveFactor).
    emissive: col.clone(),
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
