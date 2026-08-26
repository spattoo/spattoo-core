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
  bandInner = null, hole = null, inset = 0.98, overhang = 0, patches = null, patchRadius = null, seed = 7,
  onStats,
}) {
  const geo = useMemo(
    () => buildGrassTuft({ strands, height, thickness, splay, droop, lengthVary, seed }),
    [strands, height, thickness, splay, droop, lengthVary, seed],
  );
  // Patches arrive as the handles store them — polar (u, v) against the surface, the same convention
  // FinishHandles drags dust and foil in — and the seat loop wants world x/z. Converting HERE, inside
  // the memo, is deliberate: doing it at the call site would build a fresh array every render and
  // rebuild every seat on every frame, which for a few thousand tufts is the whole frame budget.
  const seats = useMemo(() => {
    const R = patchRadius ?? shape.radius ?? 1;
    const world = patches?.length
      ? patches.map(p => ({
          x: p.v * R * Math.sin(p.u * Math.PI * 2),
          z: p.v * R * Math.cos(p.u * Math.PI * 2),
          r: p.r ?? 0.35,
        }))
      : null;
    return grassSeats({ shape, spacing, jitter, inset, seed: seed + 1, bandInner, hole, overhang, patches: world });
  }, [shape, spacing, jitter, inset, seed, bandInner, hole, overhang, patches, patchRadius]);

  const ref = useRef(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), tip = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3();
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    seats.forEach((s, i) => {
      // Yaw, and — only for a tuft at the rim — a tip OUTWARD so its blades drape over the side.
      // Tipping is wrong anywhere else: mid-surface it would lift a clump's blades off the cake on
      // one side and bury them on the other. At the edge there is nothing underneath to bury into,
      // which is exactly what makes the drape possible. grassSeats decides which seats qualify.
      q.setFromAxisAngle(up, s.yaw);
      if (s.lean) {
        // Rotating about (sin·out, 0, cos·out) × up tips +Y toward the outward direction: the axis
        // is horizontal and perpendicular to it, so the clump falls away from the cake, not along it.
        axis.set(Math.cos(s.out), 0, -Math.sin(s.out));
        tip.setFromAxisAngle(axis, s.lean);
        q.premultiply(tip);
      }
      pos.set(s.x, topY, s.z);
      scl.setScalar(s.scale);
      mesh.setMatrixAt(i, m.compose(pos, q, scl));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [seats, topY]);

  // ── The cost, counted from the geometry rather than guessed ───────────────────────────────────
  // `tris` is what the studio's cost panel warns on, and it was never reported at all — the panel
  // read a name that existed nowhere and the whole screen threw. Counting it here rather than in the
  // studio keeps it honest: this is the buffer that actually gets drawn, so the number cannot drift
  // from the thing it describes the way a formula in the panel would.
  //
  // The count is what a MERGED patch would cost, which is the number worth warning about. As an
  // InstancedMesh it is one draw call over one tuft; the warning is about the day somebody merges.
  useLayoutEffect(() => {
    const perTuft = geo?.index
      ? geo.index.count / 3
      : (geo?.attributes?.position?.count ?? 0) / 3;
    onStats?.({
      tufts: seats.length,
      blades: seats.length * strands,
      tris: Math.round(seats.length * perTuft),
    });
  }, [seats, strands, geo, onStats]);

  if (!seats.length) return null;
  return (
    <instancedMesh ref={ref} args={[geo, undefined, seats.length]} castShadow receiveShadow>
      {/* Flat-ish and slightly waxy, like coloured buttercream — a shiny blade reads as plastic. */}
      <meshStandardMaterial color={color} roughness={0.72} metalness={0} />
    </instancedMesh>
  );
}
