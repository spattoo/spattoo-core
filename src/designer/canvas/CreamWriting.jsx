import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCreamWriting } from '../geometry/creamText.js';
import { topClamp } from '../geometry/surface.js';
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
  const sideY     = writing?.sideY ?? (bottom ? bottom.baseY + bottom.height / 2 : topY / 2);
  const sideTier  = tiers?.find(t => sideY >= t.baseY && sideY <= t.baseY + t.height) ?? bottom;
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
  const minSideY = 0.14, maxSideY = Math.max(minSideY + 0.05, topY - 0.14);

  // Drag-to-place: map the pointer ray to a per-surface placement patch; the press/drag/tap plumbing
  // and grabProps are shared (useDragPlacement). Called before the early return to satisfy hook rules.
  const { grabProps } = useDragPlacement({
    camera, gl, onMove, onClick, onOrbitEnable,
    resolve: (ray) => {
      if (surface === 'side' && !sideRect) {
        const hit = cylinderHit(ray, sideR);
        if (!hit) return null;
        return { sideAngle: hit.theta, sideY: clamp(hit.y, minSideY, maxSideY) };
      }
      if (surface === 'side') {
        // Rect side: intersect the front face plane (z = depth/2), drag in x & y.
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(sideR));
        const t = new THREE.Vector3();
        if (!ray.intersectPlane(plane, t)) return null;
        return { offsetX: clamp(t.x, -sideTier.width / 2, sideTier.width / 2), sideY: clamp(t.y, minSideY, maxSideY) };
      }
      const planeY = surface === 'board' ? boardY : topY;
      const hit = planeHit(ray, new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY));
      if (!hit) return null;
      const cs = surface === 'board' ? (boardShp ?? shp) : shp;
      const p = cs ? topClamp(cs, hit.x, hit.z, 1.0) : hit;
      return surface === 'board' ? { boardX: p.x, boardZ: p.z } : { offsetX: p.x, offsetZ: p.z };
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
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
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
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
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
