// Projects 3D piping anchor points onto the order's design thumbnail.
//
// The thumbnail is captured from CakeThumbnailCanvas — a fixed, square (1:1)
// render with camera = CAMERA_POSITION, fov = CAMERA_FOV, looking at [0,2,0].
// By rebuilding that exact camera here, any 3D world point projects to the SAME
// pixel it occupies in the thumbnail — so leader lines land precisely on the
// piping, with no image analysis and no re-render.
import * as THREE from 'three';
import { TIER_RADII, BOTTOM_BASE, BOTTOM_H, TIER_HEIGHT_STEP, CAMERA_POSITION, CAMERA_FOV } from '../../designer/constants.js';

// Camera identical to the thumbnail render (aspect 1 — the capture is square).
const CAM = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 1000);
CAM.position.set(CAMERA_POSITION[0], CAMERA_POSITION[1], CAMERA_POSITION[2]);
CAM.up.set(0, 1, 0);
CAM.lookAt(0, 2, 0);
CAM.updateMatrixWorld(true);
CAM.updateProjectionMatrix();

// World point [x,y,z] → { x, y } in 0..1 image fraction (y down).
export function projectToScreen([x, y, z]) {
  const v = new THREE.Vector3(x, y, z).project(CAM);
  return { x: v.x * 0.5 + 0.5, y: -v.y * 0.5 + 0.5 };
}

// Normalize tiers to renderable geometry (legacy snapshots omit radius/height).
// Returns [{ radius, height, baseY }] bottom-first, with cumulative baseY.
export function normalizeTiers(tiers = []) {
  let baseY = BOTTOM_BASE;
  return tiers.map((t, i) => {
    const isRect = t?.shape === 'rect' || t?.shape === 'square';
    const radius = isRect
      ? Math.max(t?.width ?? 2, t?.depth ?? 1.5) / 2
      : (t?.radius ?? TIER_RADII[i] ?? 0.35);
    const height = t?.height ?? (BOTTOM_H - i * TIER_HEIGHT_STEP);
    const tier = { radius, height, baseY };
    baseY += height;
    return tier;
  });
}

// World anchor on a tier's left/right silhouette edge at the rim (top piping) or
// base (bottom piping). side: 'L' | 'R'. zone: 'Rim' | 'Base'.
export function anchorWorld(tier, zone, side) {
  const r = tier.radius;
  const y = zone === 'Rim' ? tier.baseY + tier.height : tier.baseY + 0.06;
  return [side === 'L' ? -r : r, y, 0];
}
