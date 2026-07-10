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
// `width`/`height` are the hit plane's own dimensions and `z` clears the element's front-most point
// (a solid slab or a deep GLB stands proud of its hit plane). No element type, slug or zone reaches
// this component (INVARIANTS #1, #2, #6). The rectangle is centred on the element's origin, so a
// flipX-mirrored element needs no special handling — its hit plane is symmetric.

const LIFT = 0.006;   // local units clear of the element's front-most point (z-fight guard)

export default function SelectionBox({ width, height, z = 0 }) {
  const geometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, height)),
    [width, height],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments position={[0, 0, z + LIFT]} geometry={geometry} renderOrder={1}>
      <lineBasicMaterial color={SELECTION_COLOR} toneMapped={false} depthWrite={false} />
    </lineSegments>
  );
}
