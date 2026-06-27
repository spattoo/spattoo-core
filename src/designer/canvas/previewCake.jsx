import { tierShape } from '../geometry/surface.js';
import { buildRoundedPrism } from './CakeTier.jsx';
import { TIER_RADII, BOTTOM_H } from '../constants.js';

// Shared mini-cake scaffold for the small inline 3D previews (PipingPreview, TopperPreview).
// A legible dark-chocolate stand-in cake on a light board — the real cake uses the user's
// colours; these previews just need a consistent, high-contrast backdrop for the decoration.
export const PREVIEW_CAKE_COLOR  = '#3A2418';   // dark chocolate body
export const PREVIEW_CAP_COLOR   = '#46301F';   // slightly lighter top cap
export const PREVIEW_BOARD_COLOR = '#E8E4DD';   // light board/drum

// Build the stacked tier geometry, preserving each tier's shape so a rect cake previews AS a
// rounded-rect prism (round tiers stay cylinders). Returns the placed tiers (with baseY/topY)
// and the total stack height. Falls back to a single default bottom tier when none are passed.
export function buildPreviewTiers(tiers) {
  const geo = (tiers?.length ? tiers : [{ radius: TIER_RADII[0], height: BOTTOM_H }]).map(t => {
    const radius = t?.radius ?? TIER_RADII[0];
    const height = t?.height ?? BOTTOM_H;
    const shp = tierShape({ shape: t?.shape, width: t?.width, depth: t?.depth, radius, cornerR: t?.cornerR });
    const prismGeo = shp.kind === 'rect' ? buildRoundedPrism(shp.halfW, shp.halfD, height, shp.cornerR) : null;
    return { radius, height, shp, prismGeo, color: t?.color };
  });
  let acc = 0;
  const placed = geo.map(t => { const baseY = acc; acc += t.height; return { ...t, baseY, topY: baseY + t.height }; });
  return { placed, totalH: acc };
}

// The board + stacked tier bodies. Rect tiers use the rounded-rect prism (flat top, no cap —
// a cap reads as a stray board on a rectangular cake); round tiers get a thin top cap.
export function PreviewCakeMeshes({ placed }) {
  const bottom = placed[0];
  const R0 = bottom.radius;
  return (
    <>
      {bottom.shp.kind === 'rect' ? (
        <mesh position={[0, -0.04, 0]}>
          <boxGeometry args={[bottom.shp.halfW * 2 * 1.28, 0.08, bottom.shp.halfD * 2 * 1.28]} />
          <meshStandardMaterial color={PREVIEW_BOARD_COLOR} roughness={0.55} metalness={0.1} />
        </mesh>
      ) : (
        <mesh position={[0, -0.04, 0]}>
          <cylinderGeometry args={[R0 * 1.32, R0 * 1.32, 0.08, 56]} />
          <meshStandardMaterial color={PREVIEW_BOARD_COLOR} roughness={0.55} metalness={0.1} />
        </mesh>
      )}
      {placed.map((t, i) => {
        // Match the real on-canvas cake: use this tier's colour, falling back to the dark
        // chocolate stand-in only when no colour is set. Cap follows the body colour too.
        const bodyColor = t.color ?? PREVIEW_CAKE_COLOR;
        const capColor  = t.color ?? PREVIEW_CAP_COLOR;
        return (
        <group key={i}>
          {t.shp.kind === 'rect' ? (
            <mesh geometry={t.prismGeo} position={[0, t.baseY, 0]}>
              <meshStandardMaterial color={bodyColor} roughness={0.85} />
            </mesh>
          ) : (
            <>
              <mesh position={[0, t.baseY + t.height / 2, 0]}>
                <cylinderGeometry args={[t.radius, t.radius, t.height, 48]} />
                <meshStandardMaterial color={bodyColor} roughness={0.85} />
              </mesh>
              <mesh position={[0, t.topY + 0.005, 0]}>
                <cylinderGeometry args={[t.radius - 0.01, t.radius - 0.01, 0.01, 48]} />
                <meshStandardMaterial color={capColor} roughness={0.7} />
              </mesh>
            </>
          )}
        </group>
        );
      })}
    </>
  );
}
