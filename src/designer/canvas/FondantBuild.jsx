import { useMemo } from 'react';
import * as THREE from 'three';
import { SHAPES, expandParts } from '../geometry/fondantParts.js';

/* ── Drawing a modelled fondant figure ───────────────────────────────────────────────────────────
 *
 * One mesh per piece, overlapping. ⚠️ NOT a boolean union, and not metaballs — DELIBERATELY.
 *
 * cloud.js settled this for the puff variant and the reasoning carries: "balls rolled and pressed
 * together. SEPARATE lumps, at different depths, so the cluster self-shadows and reads as a bunch.
 * The seams between balls are the point." A fused surface reads as one moulded potato; the crease
 * where two balls meet is what says somebody pressed them together by hand. It is also free —
 * a CSG union or a marching-cubes isosurface costs geometry, time and every piece's colour.
 *
 * The pieces share one material family so the seams read as creases in one material rather than as
 * a join between two objects. Per-piece colour is allowed (a bear's nose) but is the exception.
 */

// One geometry per shape for the whole app — each piece scales a shared unit primitive rather than
// building its own. A bench with thirty balls on it is thirty draw calls, not thirty geometries.
const GEOMETRY_CACHE = new Map();
function unitGeometry(shape) {
  if (!GEOMETRY_CACHE.has(shape)) GEOMETRY_CACHE.set(shape, SHAPES[shape].make());
  return GEOMETRY_CACHE.get(shape);
}

/* ⚠️ Each primitive is authored at a different natural size, so `size` (a half-extent) has to be
 * divided by what the primitive already is — otherwise a rope is three times its stated length and
 * a slab twice its stated width, and the author's numbers mean something different per shape.
 *
 *   ball/egg  SphereGeometry(1)            → radius 1        → scale = size
 *   rope      CapsuleGeometry(1, 2)        → half-height 2   → y scale = size.y / 2
 *   cone      ConeGeometry(1, 2)           → half-height 1   → y scale = size.y
 *   disc      CylinderGeometry(1, 1, 1)    → half-height 0.5 → y scale = size.y * 2
 *   ring      TorusGeometry(1, 0.35)       → radius 1.35 in XY, 0.35 in Z
 *   slab      BoxGeometry(2, 2, 2)         → half-extent 1   → scale = size
 */
const SHAPE_SCALE = {
  ball: (s) => s,
  egg:  (s) => s,
  rope: (s) => [s[0], s[1] / 2, s[2]],
  cone: (s) => [s[0], s[1], s[2]],
  disc: (s) => [s[0], s[1] * 2, s[2]],
  ring: (s) => [s[0] / 1.35, s[1] / 1.35, s[2] / 0.35],
  slab: (s) => s,
};

function Piece({ part, color, material, onPointerDown, selected }) {
  const scale = useMemo(
    () => (SHAPE_SCALE[part.shape] ?? ((s) => s))(part.size ?? [1, 1, 1]),
    [part.shape, part.size],
  );

  return (
    <mesh
      geometry={unitGeometry(part.shape)}
      position={part.pos}
      rotation={part.rot ?? [0, 0, 0]}
      scale={scale}
      castShadow
      receiveShadow
      onPointerDown={onPointerDown}
      // Carried so a click can be traced back to the STORED piece even when it landed on the
      // mirrored copy — selecting a reflection has to select the row that produced it, or the
      // author edits a thing that is not saved anywhere.
      userData={{ partId: part.id.replace(/~m$/, ''), reflected: part.reflected }}
    >
      <meshStandardMaterial
        color={part.color ?? color}
        // Fondant: matte with a faint sheen, never plastic. Matches the material the rest of the
        // designer gives sugar so a modelled figure sits beside a rolled cut-out convincingly.
        roughness={material?.roughness ?? 0.72}
        metalness={0}
        emissive={selected ? '#2b6cb0' : '#000000'}
        emissiveIntensity={selected ? 0.28 : 0}
      />
    </mesh>
  );
}

/* `parts` is the authored list; mirrored pieces are expanded here rather than stored, so the caller
 * never has to remember to do it. `selectedId` highlights BOTH copies of a mirrored piece, which is
 * the honest thing to show: editing it moves both.
 */
export default function FondantBuild({
  parts, color = '#C9A227', material = null, selectedId = null, onPickPart = null,
}) {
  const drawn = useMemo(() => expandParts(parts), [parts]);

  return (
    <group>
      {drawn.map(p => (
        <Piece
          key={p.id}
          part={p}
          color={color}
          material={material}
          selected={selectedId != null && p.id.replace(/~m$/, '') === selectedId}
          onPointerDown={onPickPart
            ? (e) => { e.stopPropagation(); onPickPart(p.id.replace(/~m$/, ''), e); }
            : undefined}
        />
      ))}
    </group>
  );
}
