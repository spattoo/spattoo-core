import { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { buildGrassTuft, grassSeats, GRASS_DEFAULTS } from '../geometry/grass.js';

// ── A field of piped grass on a surface ───────────────────────────────────────
// The canvas's FIRST instanced path. Everywhere else (ring shells, decoration rings) clones the
// source per position, which is right for a handful of pieces and wrong here: a dense top is ~3000
// tufts, and 3000 clones is 3000 meshes for the renderer to walk every frame.
//
// One InstancedMesh means one draw call over ~120 triangles of real geometry, however many tufts
// there are. That is the difference between grass being usable on a phone and not.
export default function GrassPatch({
  shape, topY, color = '#4caf3d',
  strands = GRASS_DEFAULTS.strands,
  height  = GRASS_DEFAULTS.height,
  spacing = GRASS_DEFAULTS.spacing,
  jitter  = GRASS_DEFAULTS.jitter,
  splay   = GRASS_DEFAULTS.splay,
  droop   = GRASS_DEFAULTS.droop,
  thickness = GRASS_DEFAULTS.thickness,
  lengthVary = GRASS_DEFAULTS.lengthVary,
  bandInner = null, seed = 7,
  onStats,
}) {
  const geo = useMemo(
    () => buildGrassTuft({ strands, height, thickness, splay, droop, lengthVary, seed }),
    [strands, height, thickness, splay, droop, lengthVary, seed],
  );
  const seats = useMemo(
    () => grassSeats({ shape, spacing, jitter, seed: seed + 1, bandInner }),
    [shape, spacing, jitter, seed, bandInner],
  );

  const ref = useRef(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    seats.forEach((s, i) => {
      // Yaw only. A tuft leans within its own geometry; tipping the whole clump would lift blades
      // off the surface on one side and bury them on the other.
      q.setFromAxisAngle(up, s.yaw);
      pos.set(s.x, topY, s.z);
      scl.setScalar(s.scale);
      mesh.setMatrixAt(i, m.compose(pos, q, scl));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [seats, topY]);

  useLayoutEffect(() => { onStats?.({ tufts: seats.length, blades: seats.length * strands }); },
    [seats, strands, onStats]);

  if (!seats.length) return null;
  return (
    <instancedMesh ref={ref} args={[geo, undefined, seats.length]} castShadow receiveShadow>
      {/* Flat-ish and slightly waxy, like coloured buttercream — a shiny blade reads as plastic. */}
      <meshStandardMaterial color={color} roughness={0.72} metalness={0} />
    </instancedMesh>
  );
}
