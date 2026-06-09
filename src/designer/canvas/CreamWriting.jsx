import { useMemo } from 'react';
import { buildCreamWriting } from '../geometry/creamText.js';
import { creamMaterialProps, PIPING_SOFTNESS_DEFAULT } from './CakeTier.jsx';

const DEG = Math.PI / 180;

// One cream-pen message piped onto the cake TOP. Given the top tier's surface Y, radius
// and shape, it fits the writing to the top footprint and lays it flat. `writing` is the
// design.writing object: { text, font, color, thickness, fit, softness, yaw, offsetX, offsetZ, lift }.
export default function CreamWriting({
  writing, topY, topRadius, shape = 'round', width = 0, depth = 0,
  onClick, selected = false,
}) {
  const fit       = writing?.fit ?? 0.8;
  const thickness = writing?.thickness ?? 0.03;
  const isRect = shape === 'rect';
  // Footprint the writing must fit within (world X = text width, world Z = text height).
  const maxW = (isRect ? width : 2 * topRadius) * fit;
  const maxH = (isRect ? depth : 2 * topRadius) * fit;

  const geo = useMemo(() => {
    if (!writing?.text?.trim()) return null;
    return buildCreamWriting({ text: writing.text, font: writing.font, thickness, maxW, maxH });
  }, [writing?.text, writing?.font, thickness, maxW, maxH]);

  if (!geo) return null;
  const color = writing.color ?? '#ffffff';
  const lift  = writing.lift ?? 0.02;
  return (
    // outer: place + yaw on the top surface · inner: lay the XY text flat onto XZ
    <group
      position={[writing.offsetX ?? 0, topY + lift, writing.offsetZ ?? 0]}
      rotation={[0, (writing.yaw ?? 0) * DEG, 0]}
      onClick={onClick ? (e => { e.stopPropagation(); onClick(e); }) : undefined}
    >
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={geo} castShadow>
          <meshPhysicalMaterial
            {...creamMaterialProps(writing.softness ?? PIPING_SOFTNESS_DEFAULT, color)}
            emissive={selected ? '#6c47ff' : '#000000'}
            emissiveIntensity={selected ? 0.35 : 0}
          />
        </mesh>
      </group>
    </group>
  );
}
