import { useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCreamWriting } from '../geometry/creamText.js';
import { topClamp } from '../geometry/surface.js';
import { pointerRay, planeHit } from '../utils/raycasting.js';
import { goldMaterialProps, silverMaterialProps, GOLD_FINISH_COLOR, SILVER_FINISH_COLOR } from './CakeTier.jsx';

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// One gold balloon-number standing UPRIGHT on the cake top — the "age candle" decoration.
// Reuses the cream tube-sweep geometry (a fat round tube on a single-stroke digit reads as a
// metallic number) + the gold material; unlike CreamWriting it is NOT laid flat — the XY glyph
// plane stays vertical (facing the camera), base seated on the top surface. Dragged on the top
// plane like the cream writing / top stickers (grab disables orbit; a no-move press = tap → select).
export default function AgeNumber({
  age, topY, topRadius, shape = 'round', width = 0, depth = 0, shp,
  onClick, onMove, onOrbitEnable, selected = false,
}) {
  const { camera, gl } = useThree();
  const isRect    = shape === 'rect';
  const size      = age?.size ?? 0.95;          // standing height (world units)
  const thickness = age?.thickness ?? 0.085;    // tube radius (balloon chunkiness)
  const value     = String(age?.value ?? '').replace(/[^0-9]/g, '');   // digits only

  // Footprint: height = size, width allowed to grow with digit count (uniform scale fits within).
  const maxH = size;
  const maxW = size * Math.max(1, value.length) * 1.4;

  const geo = useMemo(() => {
    if (!value) return null;
    return buildCreamWriting({ text: value, font: age.font, thickness, maxW, maxH, curve: 0, wrapRadius: 0 });
  }, [value, age?.font, thickness, maxW, maxH]);

  const pressedRef = useRef(false);
  if (!geo) return null;

  const isSilver = age.finish === 'silver';
  const metalProps = isSilver ? silverMaterialProps(SILVER_FINISH_COLOR) : goldMaterialProps(GOLD_FINISH_COLOR);
  // Metal finishes carry a constant warm/cool glow so they read as metal without a strong env map,
  // and brighten when selected (mirrors CreamWriting's gold/silver treatment).
  const emissive = isSilver ? '#23272d' : '#3a2a05';
  const emissiveIntensity = selected ? 0.6 : 0.4;

  const yaw = (age.yaw ?? 0) * DEG;
  const ox  = age.offsetX ?? 0;
  const oz  = age.offsetZ ?? 0;

  const bb = geo.boundingBox;
  const grabW = Math.max((bb.max.x - bb.min.x) + thickness * 3, thickness * 4);
  const grabH = Math.max((bb.max.y - bb.min.y) + thickness * 3, thickness * 4);

  const onDown = e => {
    e.stopPropagation();
    pressedRef.current = true;
    onOrbitEnable?.(false);
    try { gl.domElement.setPointerCapture(e.pointerId); } catch (_) {}
    let didDrag = false;
    const start = { x: e.clientX, y: e.clientY };
    const canvas = gl.domElement;
    function move(ev) {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (dx * dx + dy * dy > 25) didDrag = true;
      if (!didDrag || !onMove) return;
      const ray = pointerRay(ev, canvas, camera);
      const hit = planeHit(ray, new THREE.Plane(new THREE.Vector3(0, 1, 0), -topY));
      if (!hit) return;
      const p = shp ? topClamp(shp, hit.x, hit.z, 1.0) : hit;
      onMove({ offsetX: p.x, offsetZ: p.z });
    }
    function up(ev) {
      pressedRef.current = false;
      onOrbitEnable?.(true);
      if (!didDrag && onClick) onClick(ev);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
    }
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
  };

  const grabProps = {
    userData: { isStickerHitPlane: true },
    onPointerEnter: e => { e.stopPropagation(); onOrbitEnable?.(false); },
    onPointerLeave: e => { e.stopPropagation(); if (!pressedRef.current) onOrbitEnable?.(true); },
    onPointerDown: onDown,
    onClick: e => e.stopPropagation(),
  };

  // Stand upright: the XY glyph plane stays vertical (facing +Z). Seat the digits' base on the top
  // surface by lifting the centred geometry up by its lowest point. yaw spins it about the up axis.
  return (
    <group position={[ox, topY, oz]} rotation={[0, yaw, 0]}>
      <group position={[0, -bb.min.y, 0]}>
        <mesh geometry={geo} castShadow>
          <meshPhysicalMaterial {...metalProps} emissive={emissive} emissiveIntensity={emissiveIntensity} />
        </mesh>
        {/* upright grab plane just in front of the number */}
        <mesh position={[0, (bb.min.y + bb.max.y) / 2, bb.max.z + 0.01]} {...grabProps}>
          <planeGeometry args={[grabW, grabH]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
