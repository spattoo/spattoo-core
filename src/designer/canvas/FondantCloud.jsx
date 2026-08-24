import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { cloudPlacement, CLOUD_DEFAULTS } from '../geometry/cloud.js';
import { getFondantNormalMap } from '../shared/textures/fondantTexture.js';

// Grain size: world units per repeat of the shared fondant map. The same 0.18 the rainbow and the
// GLB path use — a cloud that is subtly smoother than the rainbow beside it reads as a different
// material, which is the whole thing this texture exists to prevent.
const FONDANT_TILE = 0.18;

// The grain at a given size in each direction, in WORLD units.
//
// Getting this wrong is what made the first cut look like embossed fabric. It repeated once across a
// whole ball — `max(1, diameter / 0.18)` on a lump 0.3 wide is 1.6 — so the noise was stretched to
// the size of the object instead of being the micro-grain of the sugar. A sphere's UVs run right
// round it, so the repeat has to be built from the CIRCUMFERENCE, not from the diameter.
function grain(repeatU, repeatV) {
  const t = getFondantNormalMap().clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(1, repeatU), Math.max(1, repeatV));
  t.needsUpdate = true;
  return t;
}

/**
 * The cut piece: one closed outline, extruded and bevelled.
 *
 * The bevel is not decoration. A cut-out with a knife edge reads as paper stuck on a cake; rolled
 * fondant keeps a soft rounded lip wherever it was cut, and that lip is the only thing catching a
 * highlight along the edge. Bevelling both faces and shortening the straight part keeps the total
 * thickness exactly as asked.
 */
function sheetGeometry(outline, { thickness, bevel }) {
  const shape = new THREE.Shape(outline);
  const lip = (thickness * bevel) / 2;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, thickness - lip * 2),
    bevelEnabled: lip > 1e-5,
    bevelThickness: lip,
    bevelSize: lip,
    bevelSegments: 3,
    curveSegments: 1,     // the outline is already a dense polyline; nothing to subdivide
    steps: 1,
  });
  geo.translate(0, 0, lip);   // put the back face on z = 0, so placement is about where it SITS
  return geo;
}

/**
 * Bend a flat sheet round the tier, in place.
 *
 * The same conversion wrapToWall makes for a rope, applied to a solid: `x` is a distance ALONG the
 * wall and becomes an angle by dividing by the radius, so the piece keeps the width it was drawn as.
 * A plaque bent round a cake must not turn into a different amount of fondant to roll.
 *
 * Divided by the WALL's radius rather than each vertex's own, or the front face — a little further
 * out — would sweep a wider angle than the back and the piece would splay.
 */
function bendToWall(geo, { wallR, theta, centerX, baseY }) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const th = theta + (centerX + x) / wallR;
    const out = wallR + z;
    pos.setXYZ(i, Math.sin(th) * out, baseY + y, Math.cos(th) * out);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ── A fondant cloud ───────────────────────────────────────────────────────────
// Two variants, built two ways, because a baker makes them two ways: the puff is separate balls
// pressed together, and the flat one is a single piece cut with a knife. Rendering the flat one as
// overlapping discs was the first cut and it read as paper — every pair of discs left a visible
// circle where they met, and the slab that gave them a straight bottom left a knife edge across the
// front.
//
// The geometry comes from geometry/cloud.js, which the admin studio also calls — one generator, so
// what is tuned there is what a customer gets.
export default function FondantCloud({
  params = CLOUD_DEFAULTS,
  cake,                     // { radius, topY, boardY }
  roughness = 0.85,         // fondant: matte, with just enough sheen to read as sugar not chalk
  metalness = 0,
  fondant = true,
}) {
  const p = { ...CLOUD_DEFAULTS, ...params };
  const { lobes, outline, sheet, variant } =
    useMemo(() => cloudPlacement(p, cake), [JSON.stringify(p), JSON.stringify(cake)]);

  const sheetGeo = useMemo(() => {
    if (!sheet || !outline?.length) return null;
    const geo = sheetGeometry(outline, sheet);
    return sheet.onWall
      ? bendToWall(geo, sheet)
      // Flat surfaces need no bending, only putting where it sits.
      : (geo.translate(sheet.centerX, sheet.baseY, sheet.z), geo);
  }, [outline, sheet]);

  // A geometry per drag of a slider, and nothing else frees them.
  useEffect(() => () => sheetGeo?.dispose(), [sheetGeo]);

  // One grain per ball, because the repeat depends on the ball's own size: sharing one texture would
  // stretch the grain on the big lumps and squash it on the small ones.
  const grains = useMemo(() => {
    if (!fondant) return null;
    if (variant === 'flat') {
      // ExtrudeGeometry's UVs are the shape's own coordinates, already in world units — so the
      // repeat IS one per tile, with no size to divide by.
      return [grain(1 / FONDANT_TILE, 1 / FONDANT_TILE)];
    }
    // A sphere's u runs all the way round and its v from pole to pole.
    return lobes.map(l => grain((2 * Math.PI * l.r) / FONDANT_TILE, (Math.PI * l.r) / FONDANT_TILE));
  }, [lobes, variant, fondant]);
  useEffect(() => () => grains?.forEach(t => t.dispose()), [grains]);

  const material = (map) => (
    <meshStandardMaterial
      color={p.color}
      roughness={roughness}
      metalness={metalness}
      normalMap={map ?? null}
      // normalScale 1.5 matches the rainbow and the GLB path — at the shipped 0.5 the grain was too
      // faint to see, which is recorded in both places and is just as true on a ball.
      normalScale={map ? new THREE.Vector2(1.5, 1.5) : undefined}
    />
  );

  if (variant === 'flat') {
    return sheetGeo ? (
      <mesh geometry={sheetGeo} castShadow receiveShadow>{material(grains?.[0])}</mesh>
    ) : null;
  }

  return (
    <group>
      {lobes.map((l, i) => (
        <mesh key={i} position={l.position} castShadow receiveShadow>
          <sphereGeometry args={[l.r, 28, 20]} />
          {material(grains?.[i])}
        </mesh>
      ))}
    </group>
  );
}
