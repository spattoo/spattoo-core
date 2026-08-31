import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCreamWriting } from '../geometry/creamText.js';
import { writingPlaceAt } from '../geometry/surface.js';
import { planeHit, cylinderHit } from '../utils/raycasting.js';
import { useDragPlacement } from '../hooks/useDragPlacement.js';
import { creamMaterialProps, goldMaterialProps, silverMaterialProps, metallicCreamProps, GOLD_FINISH_COLOR, SILVER_FINISH_COLOR, PIPING_SOFTNESS_DEFAULT } from './CakeTier.jsx';

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// One cream-pen message piped onto a chosen cake surface. `writing.surface` selects where:
//   'top'   — flat on the cake top   (placed by offsetX/offsetZ, free-dragged on the top plane)
//   'board' — flat on the cake board (placed by boardX/boardZ,   free-dragged on the board plane)
//   'side'  — wrapped around the cake side (placed by sideAngle/sideY, dragged around & up the side)
// Drag mirrors DraggableTopSticker: grab disables orbit, the message follows the pointer on its
// surface, and a no-move press is treated as a tap → select.
export default function CreamWriting({
  writing, topY, topRadius, shape = 'round', width = 0, depth = 0, shp,
  tiers, boardRadius = 0, boardY = 0.1, boardShp,
  onClick, onMove, onOrbitEnable, selected = false,
}) {
  const { camera, gl } = useThree();
  const surface   = writing?.surface ?? 'top';
  const fit       = writing?.fit ?? 0.8;
  const thickness = writing?.thickness ?? 0.03;
  const isRect    = shape === 'rect';

  // ── Resolve the target surface's radius / footprint ──────────────────────────
  const bottom    = tiers?.[0];
  const cakeBaseR = bottom ? (bottom.shape === 'rect' ? Math.max(bottom.width, bottom.depth) / 2 : bottom.radius) : topRadius;
  /* ⚠️ THE TIER COMES FROM THE WRITING, and the height is read within it. Clamped to what the cake
     actually has, so removing a tier leaves the message on the new top one rather than nowhere. */
  const sideTier  = tiers?.[Math.min(writing?.sideTier ?? 0, (tiers?.length ?? 1) - 1)] ?? bottom;
  const sideY     = writing?.sideY ?? (sideTier ? sideTier.baseY + sideTier.height / 2 : topY / 2);
  const sideRect  = (sideTier?.shape ?? shape) === 'rect';
  const sideR     = sideTier ? (sideRect ? sideTier.depth / 2 : sideTier.radius) : topRadius;
  const sideH     = sideTier?.height ?? 1;

  // Footprint the writing must fit within (world units): top/board use the surface extents,
  // side uses a comfortable arc (≈ fit·2 rad of the side) by tier height.
  const sideFaceW = sideRect ? (sideTier?.width ?? width) : sideR * 2.0;
  let maxW, maxH;
  if (surface === 'side')      { maxW = sideFaceW * fit; maxH = sideH * fit; }
  else if (surface === 'board'){ maxW = maxH = (boardRadius || topRadius) * 0.9 * fit; }
  else                         { maxW = (isRect ? width : 2 * topRadius) * fit; maxH = (isRect ? depth : 2 * topRadius) * fit; }

  const wrapRadius = surface === 'side' && !sideRect ? sideR + 0.006 : 0;

  const geo = useMemo(() => {
    if (!writing?.text?.trim()) return null;
    const text = writing.uppercase ? writing.text.toUpperCase() : writing.text;
    return buildCreamWriting({
      text, font: writing.font, thickness, maxW, maxH,
      lineGap: writing.lineSpacing ?? 1.4, letterSpacing: writing.letterSpacing ?? 0,
      curve: writing.curve ?? 0, wrapRadius,
    });
  }, [writing?.text, writing?.uppercase, writing?.font, thickness, maxW, maxH, writing?.lineSpacing, writing?.letterSpacing, writing?.curve, wrapRadius]);

  // Side-drag vertical bounds (also used by the drag resolver below).
  /* ⚠️ A MESSAGE STAYS ON ITS TIER while it is dragged. The range used to span the whole cake, so a
     drag could slide a message off the tier it belonged to and onto a wall of a different radius —
     where it then floated, because the geometry is built for the radius it started on. Moving
     between tiers is a choice made in the card, not something a thumb does by accident. */
  const bandInset = Math.min(0.14, (sideTier?.height ?? 1) * 0.18);
  const minSideY = (sideTier?.baseY ?? 0) + bandInset;
  const maxSideY = Math.max(minSideY + 0.02, (sideTier?.baseY ?? 0) + (sideTier?.height ?? 1) - bandInset);

  // Drag-to-place: map the pointer ray to a per-surface placement patch; the press/drag/tap plumbing
  // and grabProps are shared (useDragPlacement). Called before the early return to satisfy hook rules.
  const { grabProps } = useDragPlacement({
    camera, gl, onMove, onClick, onOrbitEnable,
    // Intersecting stays here — it needs a camera. WHERE that lands is a rule, and the rule lives
    // in geometry/surface.js so the movable contract can ask it questions.
    resolve: (ray) => {
      const where = { surface, sideRect, sideWidth: sideTier?.width, minSideY, maxSideY,
                      shape: shp, boardShape: boardShp };
      if (surface === 'side' && !sideRect) return writingPlaceAt(where, cylinderHit(ray, sideR));
      if (surface === 'side') {
        // Rect side: intersect the front face plane (z = depth/2), drag in x & y.
        const t = new THREE.Vector3();
        return writingPlaceAt(where,
          ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -(sideR)), t) ? t : null);
      }
      const planeY = surface === 'board' ? boardY : topY;
      return writingPlaceAt(where,
        planeHit(ray, new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY)));
    },
  });

  if (!geo) return null;

  const isGold       = writing.finish === 'gold';
  const isSilver     = writing.finish === 'silver';
  const color = writing.color ?? '#ffffff';
  // Metallic cream: a shiny, shimmery version of the picked cream colour (only when
  // on the plain "Colour" finish — gold/silver are their own metals).
  const isMetalCream = !isGold && !isSilver && !!writing.metallic;
  const isMetal      = isGold || isSilver || isMetalCream;
  const lift  = writing.lift ?? 0.02;
  const yaw   = (writing.yaw ?? 0) * DEG;

  // Resolved placement (per-surface coords, each with a sensible default).
  const ox        = surface === 'board' ? (writing.boardX ?? 0) : (writing.offsetX ?? 0);
  const oz        = surface === 'board' ? (writing.boardZ ?? (cakeBaseR + (boardRadius || cakeBaseR)) / 2) : (writing.offsetZ ?? 0);
  const sideAngle = writing.sideAngle ?? 0;

  // Grab proxy size (from the built geometry's extents).
  const bb = geo.boundingBox;
  const grabW = Math.max((bb.max.x - bb.min.x) + thickness * 3, thickness * 4);
  const grabH = Math.max((bb.max.y - bb.min.y) + thickness * 3, thickness * 4);

  // Emissive: cream lights up purple only when selected; metal finishes carry a constant
  // glow (so they read as metal without a strong env map) and brighten a touch when selected.
  // Selection highlight glows in the writing's OWN colour (never a fixed purple) — a
  // tinted emissive would shift saturated hues (green→teal, red→pink), so the picked
  // hex always renders true whether selected or not. (Same fix as the cream piping.)
  const emissive = isGold ? '#3a2a05' : isSilver ? '#23272d'
    : isMetalCream ? color
    : (selected ? color : '#000000');
  const emissiveIntensity = isGold || isSilver ? (selected ? 0.6 : 0.4)
    : isMetalCream ? (selected ? 0.22 : 0.12)   // a faint self-lit shimmer in its own colour
    : (selected ? 0.15 : 0);
  const metalProps = isGold ? goldMaterialProps(GOLD_FINISH_COLOR)
    : isSilver ? silverMaterialProps(SILVER_FINISH_COLOR)
    : isMetalCream ? metallicCreamProps(color)
    : null;
  const material = (
    <meshPhysicalMaterial
      {...(metalProps ?? creamMaterialProps(writing.softness ?? PIPING_SOFTNESS_DEFAULT, color))}
      emissive={emissive}
      emissiveIntensity={emissiveIntensity}
    />
  );
  const grabPlane = (z = 0.005) => (
    <mesh position={[0, 0, z]} {...grabProps}>
      <planeGeometry args={[grabW, grabH]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false}
          side={THREE.DoubleSide} /* or it is not a target from behind, and the decoration
          becomes ungrabbable the moment the cake is turned past it */ />
    </mesh>
  );

  // ── Side: geometry is already wrapped & vertical, centred on +Z. Rotate around Y
  // to the drag angle, raise to the drag height. ──────────────────────────────────
  if (surface === 'side' && !sideRect) {
    return (
      <group rotation={[0, sideAngle, 0]}>
        <group position={[0, sideY, 0]}>
          <mesh geometry={geo} castShadow>{material}</mesh>
          {/* tangent grab plane just in front of the wrapped text */}
          <mesh position={[0, 0, bb.max.z + 0.01]} {...grabProps}>
            <planeGeometry args={[grabW, grabH]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false}
          side={THREE.DoubleSide} /* or it is not a target from behind, and the decoration
          becomes ungrabbable the moment the cake is turned past it */ />
          </mesh>
        </group>
      </group>
    );
  }
  if (surface === 'side') {
    // Rect cake: flat decal on the front face (faces +Z, text already upright).
    return (
      <group position={[writing.offsetX ?? 0, sideY, sideR + lift]}>
        <mesh geometry={geo} castShadow>{material}</mesh>
        {grabPlane(bb.max.z + 0.01)}
      </group>
    );
  }

  // ── Top / Board: lay the XY text flat onto the horizontal plane. ────────────────
  const baseY = surface === 'board' ? boardY + 0.006 : topY + lift;
  return (
    <group position={[ox, baseY, oz]} rotation={[0, yaw, 0]}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={geo} castShadow>{material}</mesh>
        {grabPlane()}
      </group>
    </group>
  );
}
