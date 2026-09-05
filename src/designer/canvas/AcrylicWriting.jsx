import React, { useEffect, useState, useMemo } from 'react';
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

  // How far the built word rises above the cake — see `standH` below. Only the build can measure it.
  const [rise, setRise] = useState(null);

  /* The pose, decided by the SURFACE — each of the three wants a different one.
   *
   *   top     stand   legs pushed into the icing
   *   side    flat    upright against the wall
   *   board   lay     lying face-up on the drum
   *
   * ⚠️ THE BOARD LIES DOWN. It used to be `surface !== 'side'`, which lumped the board in with the
   * top and stood it on prongs — a topper on a gold drum with two spikes going into nothing. A board
   * is not a thing you push legs into; a plaque set on one lies on it.
   *
   * Legs and the base bar follow `standing` below, so this also removes them.
   *
   * Declared ABOVE the drag hook because the clamp needs it — see `reach`. */
  const pose = surface === 'side' ? 'flat' : surface === 'board' ? 'lay' : 'stand';
  const standing = pose === 'stand';

  const { grabProps } = useDragPlacement({
    camera, gl, onMove, onClick, onOrbitEnable,
    resolve: (ray) => {
      /* ⚠️ halfWidth: a topper is not a point. Without it the ANCHOR stops at the rim and half the
       * word — and a leg — hangs over the edge with the prong down the side of the cake.
       *
       * ⚠️ HALF THE WIDTH IS ENOUGH FOR THE LAID POSE TOO — do not "improve" this to the diagonal of
       * width and rise. That was tried. The board is a RING, not a disc, and `topClampInset` only
       * knows the outer edge: raising the margin shrinks the allowed radius, and at
       * `2.3 - hypot(halfW, rise) = 1.585` on a 1.6-radius cake the whole permitted area fell INSIDE
       * the cake, so every drag parked the word under an opaque cylinder.
       *
       * Half the width is sound because the depth only points outward near yaw 180°, and even there
       * the reach is `(boardR - halfW) + rise`, comfortably inside the drum. */
      const where = { surface, sideRect, sideWidth: sideTier?.width, minSideY, maxSideY,
                      shape: shp, boardShape: boardShp, halfWidth: maxW / 2 };
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

  /* ⚠️ Every number comes from acrylicConfig, none from here. This component used to carry its own
   * bar ratio, leg length, bury depth, bridge flag and line gap — so the studio could author all
   * five, save, and change nothing. A renderer with a number of its own is a number an admin cannot
   * reach. `mmPerUnit` is optional and only arrives where an order pins a real size; without one the
   * nominal in acrylicConfig applies, and that nominal is an assumption written down rather than a
   * conversion the designer actually has.
   *
   * ⚠️ MEMOISED, and that is the difference between a drag that follows the finger and one that
   * lurches. AcrylicWord's build keys on `cfg`, so a fresh object literal here invalidated it on
   * EVERY render — and a drag renders on every pointer move. Each of those frames re-ran two full
   * topperShapes passes (the probe and the real one), the bridge search, and an ExtrudeGeometry per
   * part, for a word whose shape had not changed at all. Nothing about the drag was heavy; the
   * geometry was being rebuilt underneath it.
   *
   * Depends on the VALUES, never the writing object — that is a new identity on every move too.
   *
   * ⚠️ ABOVE the early return, with every other hook. Put below it, this crashed the whole canvas
   * with "Rendered more hooks than during the previous render" the moment a font finished loading —
   * because the render before it had returned early and run one hook fewer. That is what
   * `check:hooks` exists for, and running a different gate instead of that one is how it shipped. */
  const cfg = useMemo(() => ({
    ...acrylicCfg(writing, { standing }),
    fitAspect: acrylicFitAspect(writing, maxW, mmPerUnit),
  }), [
    writing.font, writing.tracking, writing.stroke, writing.weight, writing.lineGap,
    writing.maxLines, writing.bridge, writing.sheet, writing.bar, writing.barRatio,
    writing.legs, writing.legLen, writing.bury, writing.minDetail,
    standing, maxW, mmPerUnit,
  ]);

  if (!font || !writing?.text?.trim()) return null;

  const finish = writing.finish === 'silver' ? 'silver' : (writing.acrylicFinish ?? writing.finish ?? 'gold');
  const grabH = Math.max(0.2, maxW * 0.4);
  // How tall the standing piece actually is, reported by the build — a one-line name and a
  // three-line phrase at the same width are nothing like the same height, so the catcher below
  // cannot be sized from the span. `grabH` until the first build lands.
  const standH = Math.max(rise ?? 0, grabH);

  const word = (
    <AcrylicWord font={font} text={writing.text} cfg={cfg} finish={finish}
                 pose={pose} span={maxW} mount={{}} onRise={setRise} />
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

  // Top (standing on legs) or board (lying face-up). Same anchor maths, different pose and catcher.
  const ox = surface === 'board' ? (writing.boardX ?? 0) : (writing.offsetX ?? 0);
  const oz = surface === 'board'
    ? (writing.boardZ ?? (cakeBaseR + (boardRadius || cakeBaseR)) / 2)
    : (writing.offsetZ ?? 0);
  const planeY = surface === 'board' ? boardY : topY;
  const yaw = (writing.yaw ?? 0) * Math.PI / 180;
  return (
    <group>
      {React.cloneElement(word, {
        mount: { topY: planeY, x: ox, z: oz, yaw },
      })}
      {/* ⚠️ THE CATCHER STANDS WITH THE WORD. It used to lie FLAT on the icing — `rotation-x -90°`
          at `planeY` — copied from CreamWriting, where writing on the top really is piped onto the
          surface and a horizontal catcher sits exactly under it.

          A standing topper is not on the surface, it rises off it. The letters are up in the air and
          every click on them passed straight over a catcher lying on the cake, so the piece rendered
          perfectly and could not be picked up. Nothing about the drag plumbing was wrong.

          So: vertical, in the word's own plane, turned by the same yaw so it stays with the word as
          it spins. Only what is GRABBED changes — `resolve` still intersects the horizontal plane at
          the surface to decide where the drag lands, which is right for something moved about a
          cake top. */}
      {/* ⚠️ AND THE CATCHER LIES DOWN WHEN THE WORD DOES. A vertical plane over a word lying on the
          drum is the same bug in mirror image — it would stand up through the piece, so a click on
          the letters misses and the topper cannot be picked up.

          ⚠️ CENTRED ON THE ANCHOR AND DOUBLE DEPTH, because the anchor is the BASELINE, not the
          middle. Reaching only backward by `standH` was measured wrong on screen: the catcher sat
          behind the word and every click on the descenders — the tails of "Happy Birthday" in a
          script face, which hang FORWARD of the baseline — passed straight through and orbited the
          camera instead. A cylinder looks identical under orbit, so the word appeared to move and
          the bug read as a bad clamp for several rounds.

          Spanning ±standH covers the rise behind and any descender in front, whatever the face. A
          grab target that is too big costs nothing here; one that is too small cannot be grabbed. */}
      <group position={[ox, planeY, oz]} rotation={[0, yaw, 0]}>
        {pose === 'lay' ? (
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} {...grabProps}>
            <planeGeometry args={[maxW, standH * 2]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ) : (
          <mesh position={[0, standH / 2, 0.02]} {...grabProps}>
            <planeGeometry args={[maxW, standH]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
    </group>
  );
}
