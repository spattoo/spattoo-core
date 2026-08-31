import { useMemo } from 'react';
import * as THREE from 'three';
import { buildGarnishGeometry } from '../geometry/garnishPiece.js';
import { garnishPlacement } from '../geometry/garnishPlacement.js';
import { mediumOf } from '../geometry/pipingMedia.js';

// ── Chocolate garnishes on the cake ──────────────────────────────────────────────────────────────
//
// A garnish is a piece piped OFF the cake in the studio, set, and placed on it — lying flat or
// standing upright. Unlike a pen stroke, which is where the hand went, this is an OBJECT: it has a
// position, an orientation and a size, so it can be moved and it signs the movable contract.
//
// ⚠️ THIS COMPONENT ADDS NO TRANSFORM OF ITS OWN. Position and rotation come from
// `garnishPlacement`, which is the single place that decides where a piece goes — the movable
// contract's first law, and the one the rainbow broke by having its selection box turn about its own
// centre while the arch turned about the cake's axis. If you find yourself adding an offset here,
// the offset belongs in the placement instead.

export default function Garnishes({ garnishes = [], tierData = [], onSelect, selectedId = null }) {
  const top = tierData[tierData.length - 1];
  if (!top || !garnishes.length) return null;

  const cake = { radius: top.radius, topY: top.baseY + top.height, boardY: 0.1 };
  return (
    <>
      {garnishes.map(g => (
        <Garnish key={g.id} g={g} cake={cake} onSelect={onSelect} selected={selectedId === g.id} />
      ))}
    </>
  );
}

function Garnish({ g, cake, onSelect, selected }) {
  /* Built once per piece, not per frame: the sweep walks every point of every path and a filled
     garnish is a few thousand of them. Keyed on the paths and the scale, which are the only inputs
     that change the MESH — moving or turning a piece changes where it is drawn, not what it is. */
  const built = useMemo(
    () => buildGarnishGeometry(g.paths, { rope: g.rope ?? 6, plateSize: g.plate ?? 420,
                                          worldSize: (cake.radius ?? 1.2) * 0.75 * (g.scale ?? 1) }),
    [g.paths, g.rope, g.plate, g.scale, cake.radius],
  );
  if (!built) return null;

  const place = garnishPlacement(g, cake, built.size);
  const medium = mediumOf(g.medium ?? 'chocolate');

  return (
    <mesh
      geometry={built.geometry}
      position={place.position}
      rotation={place.rotation}
      castShadow
      onPointerDown={e => { if (onSelect) { e.stopPropagation(); onSelect(g.id); } }}
    >
      {/* Set chocolate: the same material the pen uses, so a garnish and a piped line on the same
          cake read as the same substance rather than as two different browns. */}
      <meshPhysicalMaterial
        side={THREE.DoubleSide}
        {...medium.material({ softness: g.gloss ?? 0.85 }, g.color ?? '#4A2C1B')}
        emissive={selected ? '#ffffff' : '#000000'}
        emissiveIntensity={selected ? 0.06 : 0}
      />
    </mesh>
  );
}
