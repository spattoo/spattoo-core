import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildGarnishGeometry } from '../geometry/garnishPiece.js';
import { buildPanelGeometry, panelsFrom } from '../geometry/garnishPanel.js';
import { garnishPlacement, garnishDragTo } from '../geometry/garnishPlacement.js';
import { garnishMaterialProps } from '../geometry/garnishMaterial.js';
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
  const bottom = tierData[0] ?? top;

  /* ⚠️ A GARNISH BELONGS TO A TIER, and until now every one of them was nailed to the TOP. On a
     single-tier cake nobody noticed; on three tiers it made two thirds of the cake unusable for
     chocolate work, and the reference pieces — a fan of petals stepping down a tiered cake — could
     not be built at all. `tierIndex` is what stickers already use, so a garnish now answers the same
     question the same way rather than assuming.
     ⚠️ Absent means the TOP, not tier zero: every piece placed before this was on the top tier, and
     defaulting to the bottom would silently move each of them down the cake. */
  const surfaceFor = (g) => {
    if (g.zone === 'board') {
      /* ⚠️ THE BOARD IS ITS OWN SURFACE, at its own height and its own reach. Handing a board piece a
         tier's numbers leaves it floating above the cake at the tier's edge. */
      return { radius: (bottom.radius ?? top.radius) * 1.35, topY: 0.1, boardY: 0.1 };
    }
    const i = Number.isInteger(g.tierIndex) ? g.tierIndex : tierData.length - 1;
    const t = tierData[Math.max(0, Math.min(tierData.length - 1, i))] ?? top;
    return { radius: t.radius, topY: t.baseY + t.height, boardY: 0.1 };
  };

  return (
    <>
      {garnishes.map(g => (
        <Garnish key={g.id} g={g} onSelect={onSelect} onMove={onMove}
          cake={surfaceFor(g)}
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
    /* ⚠️ ONE MESH WEARS ONE MATERIAL, so a piece made of two chocolates is several meshes — one per
       colour. They are built TWICE: once to learn the whole piece's bounds, then again inside that
       shared frame. Without the second pass each part centres on itself, and a white circle drawn in
       the corner of a dark triangle lands dead centre on top of it. `parts` is absent on every piece
       placed before this existed, and those still take the single-colour path below. */
    if (g.parts?.length > 1) {
      const raw = g.parts.map(pt => buildPart(pt, g, world)).filter(Boolean);
      if (!raw.length) return null;
      const frame = new THREE.Box3();
      for (const r of raw) frame.union(r.built.bounds);
      const framed = g.parts.map(pt => {
        const r = buildPart(pt, g, world, frame);
        return r && { geometry: r.built.geometry, color: pt.color };
      }).filter(Boolean);
      return { geometry: framed[0].geometry, size: sizeOf(frame), pieces: framed };
    }
    /* ⚠️ TWO WAYS OF BEING MADE, TWO GEOMETRIES. A piped piece is its paths swept into ropes; a cut
       one is its regions extruded into a slab with the inner rings punched out. Rendering a cut piece
       as rope would show a wireframe of a solid panel — which is the shape a baker asked for, made
       the wrong way. */
    /* ⚠️ A SET BRUSHSTROKE IS A SLAB, NOT A ROPE. It is chocolate smeared thin and peeled off
       acetate, so physically it is the same object a cut piece is — an outline with a thickness —
       and it must build the same way. Sweeping it as a piped path would give a fat line following
       the spine and throw away the shape the spatula made, which is the entire piece. */
    if ((g.kind === 'cut' || g.kind === 'brushed') && g.rings?.length) {
      const scale = world / (g.plate ?? 420);
      // Only the first panel: a piece is ONE piece of chocolate. Two separate outlines are two
      // garnishes, and quietly merging them would place something nobody made.
      const [panel] = panelsFrom(g.rings);
      return panel ? buildPanelGeometry([panel.outline, ...panel.holes], { scale }) : null;
    }
    return buildGarnishGeometry(g.paths, { rope: g.rope ?? 6, plateSize: g.plate ?? 420, worldSize: world });
  }, [g.kind, g.rings, g.paths, g.parts, g.rope, g.plate, g.scale, cake.radius]);

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

  /* Every part shares the piece's placement and its grab handlers — they are one garnish that happens
     to be made of two chocolates, so a press anywhere on it drags the whole thing. */
  const pieces = built.pieces ?? [{ geometry: built.geometry, color: g.color }];

  return (
    <group position={place.position} rotation={place.rotation}>
    {pieces.map((pc, i) => (
    <mesh
      key={i}
      geometry={pc.geometry}
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
      {/* ⚠️ SHARED WITH THE STUDIO PREVIEW — see geometry/garnishMaterial.js. Two copies of these
          numbers is how the studio starts lying about what the cake will look like. */}
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
        {...garnishMaterialProps({ medium: g.medium, gloss: g.gloss, color: pc.color ?? g.color })}
        emissive={selected ? '#ffffff' : '#000000'}
        emissiveIntensity={selected ? 0.06 : 0}
      />
    </mesh>
    ))}
    </group>
  );
}

/* One colour's worth of a piece. `frame` is the whole piece's bounds — see the note at the call. */
function buildPart(part, g, world, frame = null) {
  if ((g.kind === 'cut' || g.kind === 'brushed') && part.rings?.length) {
    const scale = world / (g.plate ?? 420);
    const [panel] = panelsFrom(part.rings);
    const built = panel && buildPanelGeometry([panel.outline, ...panel.holes], { scale, frame });
    return built ? { built } : null;
  }
  const built = buildGarnishGeometry(part.paths, {
    rope: g.rope ?? 6, plateSize: g.plate ?? 420, worldSize: world, frame,
  });
  return built ? { built } : null;
}

const sizeOf = box => ({
  w: box.max.x - box.min.x, h: box.max.y - box.min.y, d: box.max.z - box.min.z,
});
