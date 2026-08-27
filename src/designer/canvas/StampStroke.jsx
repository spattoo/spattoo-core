import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { stampTransforms } from '../geometry/creamPen.js';
import { creamMaterialProps, extractGeo } from './CakeTier.jsx';

// ── GLB stamp stroke ─────────────────────────────────────────────────────────
// Renders one committed stamp stroke (a tap → single stamp, or a drag → row of stamps) by
// cloning the chosen library GLB's mesh at each placement transform. We deliberately strip
// the GLB's own materials and apply the shared cream material (piping renders geometry-only),
// so every stamp matches the pen's colour/softness. Must be mounted under a <Suspense>
// (useGLTF suspends while the model loads).
export default function StampStroke({ stroke, url, color, softness }) {
  const glbUrl = url || stroke.glbUrl;
  const { scene } = useGLTF(glbUrl);

  // ── The RING's preparation, not a second one ─────────────────────────────────────────────────
  // This used to merge every mesh, centre on X/Z and seat on the raw base. Reasonable, and not what
  // a ring does — extractGeo bakes a +90° X rotation into the geometry before any config value is
  // read, takes the FIRST mesh rather than merging, and seats on the base AFTER that turn. So a
  // hand-piped shell started a quarter turn out from a ringed one, and every attempt to fix the
  // orientation by adjusting the ROTATION was correcting the wrong side of the difference. The
  // rotation was never what differed.
  //
  // `sizeY` comes back from the same call, so the height a piped stamp scales by is measured the way
  // the ring measures it too.
  const { geo, footprint, height, bbox } = useMemo(() => {
    const prepared = extractGeo(scene);
    if (!prepared?.geo) return { geo: null, footprint: 1, height: 1, bbox: null };
    const g = prepared.geo;
    g.computeBoundingBox();
    const b = g.boundingBox, size = new THREE.Vector3();
    b.getSize(size);
    return {
      geo: g,
      footprint: Math.max(size.x, size.z),
      height: prepared.sizeY || size.y || 1,
      // Already in the frame the transform rotates — extractGeo has centred and seated it.
      bbox: { min: b.min.toArray(), max: b.max.toArray() },
    };
  }, [scene]);

  const transforms = useMemo(
    () => (geo ? stampTransforms(stroke, { footprint, height, bbox }) : []),
    [geo, footprint, height, bbox, stroke],
  );
  if (!geo) return null;
  const mat = creamMaterialProps(softness ?? stroke.softness, color ?? stroke.color);

  return transforms.map((t, i) => (
    <mesh key={i} geometry={geo} position={t.pos} quaternion={t.quat} scale={t.scale} castShadow>
      <meshPhysicalMaterial {...mat} />
    </mesh>
  ));
}
