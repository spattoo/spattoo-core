import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildGarnishGeometry } from '../geometry/garnishPiece.js';
import { buildPanelGeometry, panelsFrom } from '../geometry/garnishPanel.js';
import { garnishPlacement, garnishDragTo } from '../geometry/garnishPlacement.js';
import { mediumOf } from '../geometry/pipingMedia.js';
import { useDragPlacement } from '../hooks/useDragPlacement.js';
import { planeHit } from '../utils/raycasting.js';

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

export default function Garnishes({
  garnishes = [], tierData = [], onSelect, onMove, onOrbitEnable, selectedId = null,
}) {
  const top = tierData[tierData.length - 1];
  if (!top || !garnishes.length) return null;

  const cake = { radius: top.radius, topY: top.baseY + top.height, boardY: 0.1 };
  const bottom = tierData[0] ?? top;
  return (
    <>
      {garnishes.map(g => (
        /* ⚠️ THE BOARD IS ITS OWN SURFACE, at its own height and its own reach. Handing a board piece
           the tier's numbers leaves it floating above the cake at the tier's edge — it is on the
           board, so the board is what it must be measured against. */
        <Garnish key={g.id} g={g} onSelect={onSelect} onMove={onMove}
          cake={g.zone === 'board'
            ? { radius: (bottom.radius ?? top.radius) * 1.35, topY: 0.1, boardY: 0.1 }
            : cake}
          onOrbitEnable={onOrbitEnable} selected={selectedId === g.id} />
      ))}
    </>
  );
}

function Garnish({ g, cake, onSelect, onMove, onOrbitEnable, selected }) {
  const { camera, gl } = useThree();
  /* Built once per piece, not per frame: the sweep walks every point of every path and a filled
     garnish is a few thousand of them. Keyed on the paths and the scale, which are the only inputs
     that change the MESH — moving or turning a piece changes where it is drawn, not what it is. */
  const built = useMemo(() => {
    const world = (cake.radius ?? 1.2) * 0.75 * (g.scale ?? 1);
    /* ⚠️ TWO WAYS OF BEING MADE, TWO GEOMETRIES. A piped piece is its paths swept into ropes; a cut
       one is its regions extruded into a slab with the inner rings punched out. Rendering a cut piece
       as rope would show a wireframe of a solid panel — which is the shape a baker asked for, made
       the wrong way. */
    if (g.kind === 'cut' && g.rings?.length) {
      const scale = world / (g.plate ?? 420);
      // Only the first panel: a piece is ONE piece of chocolate. Two separate outlines are two
      // garnishes, and quietly merging them would place something nobody made.
      const [panel] = panelsFrom(g.rings);
      return panel ? buildPanelGeometry([panel.outline, ...panel.holes], { scale }) : null;
    }
    return buildGarnishGeometry(g.paths, { rope: g.rope ?? 6, plateSize: g.plate ?? 420, worldSize: world });
  }, [g.kind, g.rings, g.paths, g.rope, g.plate, g.scale, cake.radius]);

  /* ⚠️ THE SAME HOOK EVERY OTHER DRAGGED DECORATION USES. Press, drag, tap-versus-drag and orbit
     suppression are one shared behaviour — AgeNumber and CreamWriting were two copies of it before
     it was extracted, and a third would drift the same way. All this supplies is where the pointer
     lands: the cake-top plane, converted to the polar pair `garnishDragTo` speaks. */
  /* ⚠️ EVERY HOOK BEFORE ANY EARLY RETURN. This was written with `if (!built) return null` above
     the drag hook, so a garnish whose paths failed to build skipped a hook that its neighbours
     called — React treats a changed hook order as fatal and unmounts the whole tree to an error
     boundary. `check:hooks` caught it; the guard is below, after every hook has run. */
  const { grabProps } = useDragPlacement({
    camera, gl, onOrbitEnable,
    onClick: () => onSelect?.(g.id),
    onMove: onMove ? patch => onMove(g.id, patch) : null,
    resolve: ray => {
      const hit = planeHit(ray, new THREE.Plane(new THREE.Vector3(0, 1, 0), -cake.topY));
      if (!hit) return null;
      // Screen point → angle round the cake and fraction out from the middle. Clamping lives in
      // garnishDragTo, so the rim rule is stated once and the contract can ask about it.
      const u = Math.atan2(hit.z, hit.x) / (Math.PI * 2);
      const v = Math.hypot(hit.x, hit.z) / (cake.radius || 1);
      return garnishDragTo(g, cake, u, v);
    },
  });

  if (!built) return null;

  const place = garnishPlacement(g, cake, built.size);
  const medium = mediumOf(g.medium ?? 'chocolate');

  return (
    <mesh
      geometry={built.geometry}
      position={place.position}
      rotation={place.rotation}
      castShadow
      {...grabProps}
    >
      {/* Set chocolate: the same material the pen uses, so a garnish and a piped line on the same
          cake read as the same substance rather than as two different browns. */}
      {/* ⚠️ SET CHOCOLATE IS WET-LOOKING, and the piece was reading as dull grey-brown. Two reasons:
          the gloss default was the DRIP's 0.85, tuned for a thick pour where the shine is broad,
          and a filigree is a thin rope whose highlight is a narrow line — it needs the harder
          finish to catch anything at all. And `envMapIntensity` was left at 1, so the piece
          reflected the scene far more weakly than the cake beside it. */}
      <meshPhysicalMaterial
        side={THREE.DoubleSide}
        /* ⚠️ A THIN ROPE IS ALMOST ALL GRAZING ANGLE, which is why the drip's settings wash a garnish
           out. Fresnel makes a clearcoat reflect hardest at grazing incidence: on a broad drip most
           pixels face the viewer and show base colour, but on a swept tube nearly every visible pixel
           is near the silhouette, so a strong clearcoat covers the whole piece in white-ish
           reflection and the chocolate underneath never appears. Side by side, the studio showed
           near-black brown and the placed piece pale taupe — the colour was buried, not under-lit,
           which is why raising the gloss twice made it worse.

           So the lacquer comes DOWN rather than up, and the env boost with it. `Shine` on the card
           still opens it back up for anyone who wants a wet-looking piece. */
        {...medium.material({ softness: g.gloss ?? 0.45 }, g.color ?? '#4A2C1B')}
        clearcoat={0.25}
        clearcoatRoughness={0.5}
        envMapIntensity={0.6}
        emissive={selected ? '#ffffff' : '#000000'}
        emissiveIntensity={selected ? 0.06 : 0}
      />
    </mesh>
  );
}
