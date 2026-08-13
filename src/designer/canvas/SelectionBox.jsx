import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { SELECTION_COLOR } from '../constants.js';

// The ONE selection cue for a placed element: a rectangle tracing the element's HIT PLANE.
//
// Why the hit plane and not the artwork's silhouette: the hit plane is the only thing that receives
// pointer events (a GLB's own meshes have `raycast` disabled), so it — not the visible art — is what
// the customer is actually grabbing, and what steals a click from a neighbour. A heart on a square
// PNG intercepts clicks across its whole transparent margin. Tracing the art would draw a tight,
// flattering box that hides exactly the fact the customer needs when a decoration underneath won't
// respond: another element's invisible half is lying on top of it. The border shows the truth.
//
// Why a border and not a tint: an emissive highlight is ADDITIVE, so it corrupts the albedo it is
// meant to advertise (a saturated orange decal rendered magenta — B pushed hard, G barely). The
// border is non-destructive; the element keeps its true colour while selected.
//
// It is drawn in the element's LOCAL frame — a sibling of whatever rendered the element — so it
// inherits that element's position, facing, tilt and scale for free, on the top surface, the side
// wall, the rim or the board. It is depth-tested, so an element rotated to the back of the cake has
// its border hidden by the cake exactly as the element itself is.
//
// `width`/`height`/`centerY` are the hit plane's own dimensions and offset (a base-seated element's
// plane stops at its seat, so it is not centred on the origin — see seatedHitBox), and `z` clears the
// element's front-most point (a solid slab or a deep GLB stands proud of its hit plane).
//
// A flat GLB or 2D decal gets the flat rect. A model with real DEPTH (`depth` > 0 — a bent, proud
// bow; an upright topper) gets a 3D wireframe BOX enclosing its actual bounds, centred at `centerZ`.
// A flat plane can only look right head-on: rotate the cake and it slides off the curved/proud model.
// The box wraps the model in all three dimensions, so the cue stays ON the decoration from every
// camera angle. `depth`/`centerZ` come from the RENDERED model's measured Box3 (StickerModel), so the
// box tracks bend, tilt and proud seat for free. No element type/slug/zone reaches this component
// (INVARIANTS #1/#2/#6). See INVARIANTS #5a.

const LIFT = 0.006;   // local units clear of the element's front-most point (z-fight guard)

export default function SelectionBox({ width, height, centerY = 0, z = 0, depth = 0, centerZ = null }) {
  const geometry = useMemo(
    () => new THREE.EdgesGeometry(depth > 1e-4
      ? new THREE.BoxGeometry(width, height, depth)
      : new THREE.PlaneGeometry(width, height)),
    [width, height, depth],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  // 3D box: centre on the model's depth midpoint. Flat rect: sit LIFT proud of the front (z-fight guard).
  const posZ = depth > 1e-4 ? (centerZ ?? z) : z + LIFT;
  return (
    <lineSegments position={[0, centerY, posZ]} geometry={geometry} renderOrder={1}>
      <lineBasicMaterial color={SELECTION_COLOR} toneMapped={false} depthWrite={false} />
    </lineSegments>
  );
}
