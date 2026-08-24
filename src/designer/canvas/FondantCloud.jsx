import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { cloudPlacement, CLOUD_DEFAULTS } from '../geometry/cloud.js';
import { getFondantNormalMap } from '../shared/textures/fondantTexture.js';

// Grain size: world units per repeat of the shared fondant map. The same 0.18 the rainbow and the
// GLB path use — a cloud that is subtly smoother than the rainbow above it reads as a different
// material, which is the whole thing this texture exists to prevent.
const FONDANT_TILE = 0.18;

function grainFor(size) {
  const t = getFondantNormalMap().clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const rep = Math.max(1, size / FONDANT_TILE);
  t.repeat.set(rep, rep);
  t.needsUpdate = true;
  return t;
}

// ── A fondant cloud ───────────────────────────────────────────────────────────
// One mesh per lump, not instanced. The same call RainbowArch makes and for the same reason: the
// lumps are all different sizes, so there is nothing to share, and half a dozen small spheres is
// already cheaper than the machinery to avoid them.
//
// The geometry comes from geometry/cloud.js, which the admin studio also calls — one generator, so
// what is tuned there is what a customer gets.
export default function FondantCloud({
  params = CLOUD_DEFAULTS,
  cake,                     // { radius, topY, boardY }
  roughness = 0.9,          // fondant: matte, with just enough sheen to read as sugar not paper
  metalness = 0,
  fondant = true,
}) {
  const p = { ...CLOUD_DEFAULTS, ...params };
  const { lobes, base, thickness, variant } =
    useMemo(() => cloudPlacement(p, cake), [JSON.stringify(p), JSON.stringify(cake)]);

  // One grain per lump: the repeat depends on the lump's own size, so sharing a single texture would
  // stretch the grain on the big balls and squash it on the small ones.
  const grains = useMemo(
    () => (fondant ? lobes.map(l => grainFor(l.r * 2)) : null),
    [lobes, fondant],
  );
  useEffect(() => () => grains?.forEach(t => t.dispose()), [grains]);

  return (
    <group>
      {/* A flat cloud's straight bottom, where a row of circles would leave a scalloped one. It is
          a cut-out, not a bunch of balls seen edge-on. */}
      {base && (
        <mesh position={base.position} rotation={[0, base.rotationY, 0]} castShadow receiveShadow>
          <boxGeometry args={[base.width, base.height, base.thickness]} />
          <meshStandardMaterial color={p.color} roughness={roughness} metalness={metalness} />
        </mesh>
      )}
      {lobes.map((l, i) => (
        // 'YXZ', so the two turns compose as Ry(theta) · Rx(90°): stand the disc up first, then
        // swing it round to face out of the wall. In the default XYZ order the same numbers lay it
        // face-down on the board — a cylinder's axis is Y, and a plaque lying flat is a puddle.
        <mesh key={i} position={l.position}
              rotation={variant === 'flat' ? [Math.PI / 2, l.rotationY, 0, 'YXZ'] : [0, 0, 0]}
              castShadow receiveShadow>
          {/* A ball for the puff, a disc for the plaque. The lumps are the same lumps either way —
              the variant only decides whether they are solid or a silhouette, which is why one
              generator produces both and this is the only place the two differ. */}
          {variant === 'flat'
            // Rotated onto its side so the disc's flat face points out of the wall: a cylinder's
            // axis is Y by default, which would lay the plaque face-down on the board.
            ? <cylinderGeometry args={[l.r, l.r, thickness, 28]} />
            : <sphereGeometry args={[l.r, 24, 18]} />}
          <meshStandardMaterial
            color={p.color}
            roughness={roughness}
            metalness={metalness}
            normalMap={grains ? grains[i] : null}
            // normalScale 1.5 matches the rainbow and the GLB path — at the shipped 0.5 the grain
            // was too faint to see, which is recorded in both places and is just as true on a ball.
            normalScale={grains ? new THREE.Vector2(1.5, 1.5) : undefined}
          />
        </mesh>
      ))}
    </group>
  );
}
