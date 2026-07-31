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

// ── Diagram layout ───────────────────────────────────────────────────────────
// The annotated cake is drawn TWICE — as SVG on screen (XrayCakeDiagram.jsx) and
// onto a canvas in the printable PDF (xrayPdf.js). Where each label sits, which
// side it takes, and how collisions are resolved is the same problem both times,
// so it is solved once, here, in fractions of the diagram box (0..1, y down).
// Each renderer only converts those fractions into its own units. Two copies of
// this would drift, and the drift would be silent: the printed sheet would point
// its leader lines at slightly the wrong piping.

export const DIAGRAM = {
  aspect: 1.7,                    // box w/h
  cakeW: 1 / 1.7,                 // the (square) cake as a fraction of box width
  get cakeX() { return (1 - this.cakeW) / 2; },   // cake's left edge within the box
  minGap: 0.08,                   // min vertical gap between two labels on a side
  bottom: 0.97,                   // labels may not run past this (they'd leave the box)
};

// Push labels apart so none overlaps its neighbour, keeping their vertical order.
function placeColumn(items) {
  const sorted = [...items].sort((a, b) => a.by - b.by);
  let last = -Infinity;
  for (const it of sorted) {
    it.ly = Math.max(it.by, last + DIAGRAM.minGap);
    last = it.ly;
  }
  // If the stack overflowed the bottom, slide the whole column up rather than let
  // the last label fall off the sheet.
  const over = (sorted[sorted.length - 1]?.ly ?? 0) - DIAGRAM.bottom;
  if (over > 0) for (const it of sorted) it.ly -= over;
  return sorted;
}

// items: the report's `diagram` rows. Returns them enriched with, in box fractions:
//   side  'L' | 'R'        which margin the label sits in (alternating, so lines don't cross)
//   ax,ay where the leader line POINTS (the piping itself, projected onto the thumbnail)
//   ly    where the label sits (ay, pushed to avoid its neighbours)
export function layoutDiagram(items = [], snapshotTiers = []) {
  const tiers = normalizeTiers(snapshotTiers);
  if (!items.length) return [];

  // Two kinds of item can arrive together on a mixed order: ones carrying a photo box (anchored
  // directly) and ones needing 3D projection. Projection requires tier geometry, which a photo
  // order does not have — so drop those rather than let them reach anchorWorld with no tier.
  //
  // DROPPING IS THE POINT. The alternative is a leader line drawn from a guessed anchor onto a
  // real photograph, pointing confidently at the wrong part of someone's cake. The whole reason
  // this diagram was designed-orders-only is that such a line is worse than no line at all.
  const drawable = tiers.length ? items : items.filter(it => it.bbox);
  if (!drawable.length) return [];

  const enriched = drawable.map((it, i) => {
    const side = i % 2 === 0 ? 'L' : 'R';
    // A PHOTO order anchors on the box the model reported, because there is no camera to project
    // through — the projection below only works against our own render at a known camera. Same
    // output either way, so nothing downstream has to know which kind of order it is drawing.
    const p = it.bbox
      ? { x: it.bbox[0] + it.bbox[2] / 2, y: it.bbox[1] + it.bbox[3] / 2 }
      : projectToScreen(anchorWorld(tiers[it.tierIndex] ?? tiers[tiers.length - 1], it.zone, side));
    return { ...it, side, ax: DIAGRAM.cakeX + p.x * DIAGRAM.cakeW, ay: p.y, by: p.y };
  });

  return [
    ...placeColumn(enriched.filter(e => e.side === 'L')),
    ...placeColumn(enriched.filter(e => e.side === 'R')),
  ];
}
