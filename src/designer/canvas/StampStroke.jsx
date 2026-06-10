import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { stampTransforms } from '../geometry/creamPen.js';
import { creamMaterialProps } from './CakeTier.jsx';

// ── GLB stamp stroke ─────────────────────────────────────────────────────────
// Renders one committed stamp stroke (a tap → single stamp, or a drag → row of stamps) by
// cloning the chosen library GLB's mesh at each placement transform. We deliberately strip
// the GLB's own materials and apply the shared cream material (piping renders geometry-only),
// so every stamp matches the pen's colour/softness. Must be mounted under a <Suspense>
// (useGLTF suspends while the model loads).
export default function StampStroke({ stroke, url, color, softness }) {
  const glbUrl = url || stroke.glbUrl;
  const { scene } = useGLTF(glbUrl);

  // Merge every mesh in the GLB into one geometry, centred on X/Z with its base at y=0, and
  // report the footprint (max x/z extent) so the placement math can scale it to the rope size.
  const { geo, footprint } = useMemo(() => {
    const geos = [];
    scene.traverse(o => { if (o.isMesh && o.geometry) geos.push(o.geometry.clone()); });
    if (!geos.length) return { geo: null, footprint: 1 };
    const merged = geos.length === 1 ? geos[0] : mergeGeos(geos);
    merged.computeBoundingBox();
    const b = merged.boundingBox, size = new THREE.Vector3(), c = new THREE.Vector3();
    b.getSize(size); b.getCenter(c);
    merged.translate(-c.x, -b.min.y, -c.z);
    return { geo: merged, footprint: Math.max(size.x, size.z) };
  }, [scene]);

  const transforms = useMemo(() => (geo ? stampTransforms(stroke, footprint) : []), [geo, footprint, stroke]);
  if (!geo) return null;
  const mat = creamMaterialProps(softness ?? stroke.softness, color ?? stroke.color);

  return transforms.map((t, i) => (
    <mesh key={i} geometry={geo} position={t.pos} quaternion={t.quat} scale={t.scale} castShadow>
      <meshPhysicalMaterial {...mat} />
    </mesh>
  ));
}

// Minimal geometry merge (position only — we recompute normals, and stamps carry no UVs we use).
function mergeGeos(geos) {
  const out = new THREE.BufferGeometry();
  const pos = [];
  for (const g of geos) {
    const p = g.attributes.position;
    const idx = g.index;
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    if (idx) for (let i = 0; i < idx.count; i++) (out._idx ??= []).push(base + idx.getX(i));
    else for (let i = 0; i < p.count; i++) (out._idx ??= []).push(base + i);
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (out._idx) out.setIndex(out._idx);
  out.computeVertexNormals();
  return out;
}
