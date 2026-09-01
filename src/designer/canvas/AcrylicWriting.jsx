import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useDragPlacement } from '../hooks/useDragPlacement.js';
import { writingPlaceAt, writingSurface } from '../geometry/surface.js';
import { loadTopperFace } from '../geometry/topperFaces.js';
import { acrylicCfg, acrylicFitAspect } from '../geometry/acrylicConfig.js';
import AcrylicWord from './AcrylicWord.jsx';

/* ── A typed message, cut from acrylic instead of piped in cream ─────────────────────────────────
 *
 * The SAME message object as cream writing — same `surface`, same `sideAngle`/`sideY`, same drag,
 * same footprint. Only the material and the geometry differ, which is exactly what a Look should
 * mean: switching between them keeps what the customer typed and where they put it.
 *
 * ⚠️ It takes its surface and its drag from the SHARED pieces on purpose. `writingSurface` decides
 * which tier a message is on (from its height, never a stored key — see the note there), and
 * `useDragPlacement` owns the press/drag/tap plumbing. A second copy of either is how one material
 * ends up disagreeing with another about where the same message is.
 *
 * ── ON THE SIDE IT LIES FLAT, AND THE ENDS LIFT ──
 * A rigid sheet cannot follow a round wall. Measured, an 84mm name on a 6-inch cake stands 11.5mm
 * off the icing at its ends, and that is the look rather than a fault — every real one is a single
 * connected piece whose ends rise, with a shadow under the lift. AcrylicWord mounts it on the plane
 * tangent at its anchor, so the lift comes out of the geometry instead of being drawn on.
 */
export default function AcrylicWriting({
  writing, topY, topRadius, shape = 'round', width = 0, depth = 0, shp,
  tiers, boardRadius = 0, boardY = 0.1, boardShp,
  onClick, onMove, onOrbitEnable, mmPerUnit,
}) {
  const { camera, gl } = useThree();
  const {
    surface, cakeBaseR, sideY, sideTier, sideRect, sideR, maxW, minSideY, maxSideY,
  } = writingSurface({ writing, tiers, topY, topRadius, shape, width, depth, boardRadius });

  /* An outline face is ~100KB fetched on demand, so this is a load and not a lookup — and it has to
   * finish before there is anything to draw. Rendering nothing meanwhile is right: a half-loaded
   * font would flash the fallback face and then jump. */
  const [font, setFont] = useState(null);
  useEffect(() => {
    let live = true;
    loadTopperFace(writing?.font).then(f => { if (live) setFont(f); });
    return () => { live = false; };
  }, [writing?.font]);

  const { grabProps } = useDragPlacement({
    camera, gl, onMove, onClick, onOrbitEnable,
    resolve: (ray) => {
      const where = { surface, sideRect, sideWidth: sideTier?.width, minSideY, maxSideY,
                      shape: shp, boardShape: boardShp };
      if (surface === 'side' && !sideRect) {
        const hit = new THREE.Vector3();
        const d = ray.origin.clone(), dir = ray.direction.clone();
        // The wall as a cylinder, solved in the XZ plane — the same surface the piece lies against.
        const a = dir.x * dir.x + dir.z * dir.z;
        const b = 2 * (d.x * dir.x + d.z * dir.z);
        const c = d.x * d.x + d.z * d.z - sideR * sideR;
        const disc = b * b - 4 * a * c;
        if (disc < 0) return null;
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (!(t > 0)) return null;
        hit.copy(d).addScaledVector(dir, t);
        return writingPlaceAt(where, hit);
      }
      if (surface === 'side') {
        const t = new THREE.Vector3();
        return writingPlaceAt(where,
          ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -sideR), t) ? t : null);
      }
      const planeY = surface === 'board' ? boardY : topY;
      const t = new THREE.Vector3();
      return writingPlaceAt(where,
        ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), t) ? t : null);
    },
  });

  if (!font || !writing?.text?.trim()) return null;

  /* Standing or lying, decided by the SURFACE — the top and the board are things to stand on, a wall
   * is a thing to lie against. Legs and the base bar go with standing: a flat piece has nothing to
   * push into and prongs would point at the customer. */
  const standing = surface !== 'side';
  /* ⚠️ Every number comes from acrylicConfig, none from here. This component used to carry its own
   * bar ratio, leg length, bury depth, bridge flag and line gap — so the studio could author all
   * five, save, and change nothing. A renderer with a number of its own is a number an admin cannot
   * reach. `mmPerUnit` is optional and only arrives where an order pins a real size; without one the
   * nominal in acrylicConfig applies, and that nominal is an assumption written down rather than a
   * conversion the designer actually has. */
  const cfg = {
    ...acrylicCfg(writing, { standing }),
    fitAspect: acrylicFitAspect(writing, maxW, mmPerUnit),
  };

  const finish = writing.finish === 'silver' ? 'silver' : (writing.acrylicFinish ?? writing.finish ?? 'gold');
  const grabH = Math.max(0.2, maxW * 0.4);

  const word = (
    <AcrylicWord font={font} text={writing.text} cfg={cfg} finish={finish}
                 pose={standing ? 'stand' : 'flat'} span={maxW} mount={{}} />
  );

  if (surface === 'side' && !sideRect) {
    // Round wall: rotate to the drag angle, raise to the drag height. AcrylicWord places itself on
    // the tangent plane, so the lift at the ends is geometry rather than decoration.
    return (
      <group rotation={[0, writing.sideAngle ?? 0, 0]}>
        <group position={[0, sideY, sideR + (cfg.thickness / 2)]}>
          {React.cloneElement(word, { mount: { x: 0, z: 0, y: 0, yaw: 0 } })}
          <mesh position={[0, 0, 0.02]} {...grabProps}>
            <planeGeometry args={[maxW, grabH]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </group>
    );
  }
  if (surface === 'side') {
    return (
      <group position={[writing.offsetX ?? 0, sideY, sideR + cfg.thickness / 2]}>
        {React.cloneElement(word, { mount: { x: 0, z: 0, y: 0, yaw: 0 } })}
        <mesh position={[0, 0, 0.02]} {...grabProps}>
          <planeGeometry args={[maxW, grabH]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  }

  // Top or board: it stands, on legs pushed into the surface.
  const ox = surface === 'board' ? (writing.boardX ?? 0) : (writing.offsetX ?? 0);
  const oz = surface === 'board'
    ? (writing.boardZ ?? (cakeBaseR + (boardRadius || cakeBaseR)) / 2)
    : (writing.offsetZ ?? 0);
  const planeY = surface === 'board' ? boardY : topY;
  return (
    <group>
      {React.cloneElement(word, {
        mount: { topY: planeY, x: ox, z: oz, yaw: (writing.yaw ?? 0) * Math.PI / 180 },
      })}
      <mesh position={[ox, planeY + 0.01, oz]} rotation={[-Math.PI / 2, 0, 0]} {...grabProps}>
        <planeGeometry args={[maxW, grabH]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
