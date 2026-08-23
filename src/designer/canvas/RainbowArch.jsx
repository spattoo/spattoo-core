import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { rainbowBands, bandGeometry, RAINBOW_DEFAULTS } from '../geometry/rainbow.js';
import { getFondantNormalMap } from '../shared/textures/fondantTexture.js';

// Grain size: world units per repeat of the shared fondant map. The same 0.18 the GLB path uses, so
// a rainbow and a fondant bow on the same cake carry the SAME sugar-paste grain — a decoration that
// is subtly smoother than its neighbours reads as a different material, which is the whole thing
// this texture exists to prevent.
const FONDANT_TILE = 0.18;

// The shared grain, repeated to suit ONE band.
//
// Not applyBoxUVs, which the GLB path uses: that projects each vertex along its dominant axis, and
// on a tube the dominant axis flips as you travel round it — a seam every quarter turn. A tube comes
// with clean UVs already (along the length, around the circumference); all they need is a repeat
// that makes the grain the same size in both directions as it is on everything else.
function bandGrain(lengthAlong, circumference) {
  const t = getFondantNormalMap().clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(1, lengthAlong / FONDANT_TILE), Math.max(1, circumference / FONDANT_TILE));
  t.needsUpdate = true;
  return t;
}

// ── A fondant rainbow, standing against the cake ──────────────────────────────
// One mesh per band, NOT instanced — the opposite call to GrassPatch, and for the opposite reason.
// Grass instances because a dense top is ~3000 identical tufts. Here every band is a different
// radius AND a different colour, so there is nothing to share: six meshes of a few hundred triangles
// is already cheaper than the machinery to avoid them.
//
// The geometry is built by geometry/rainbow.js, which the admin studio also calls. One generator,
// so what is tuned there is what a customer gets — the same rule ChocolateDripStudio states and
// GrassStudio repeats.
export default function RainbowArch({
  params = RAINBOW_DEFAULTS,
  cake,                       // { radius, topY, boardY } — the geometry it has to fit
  yaw = 0,                    // where it stands around the cake
  roughness = 0.88,           // fondant: matte, with just enough sheen to read as sugar not paper
  metalness = 0,
  fondant = true,             // the shared sugar-paste grain; off renders a clean tube
}) {
  const p = { ...RAINBOW_DEFAULTS, ...params };
  const { bands } = useMemo(() => rainbowBands(p, cake), [JSON.stringify(p), JSON.stringify(cake)]);

  // On a wall, `flatten` has to press the rope toward the WALL, not toward the world's centre —
  // squashing world Z drags a wrapped rope straight inside the cake. Passing the tier radius is what
  // tells bandGeometry which of the two it is.
  const wallRadius = p.surface === 'side' ? (cake?.radius ?? null) : null;
  const geometries = useMemo(
    () => bands.map(b => bandGeometry(b, { flatten: p.flatten, tubeSegments: p.tubeSegments, wallRadius })),
    [bands, p.flatten, p.tubeSegments, wallRadius],
  );

  // A tube per band per slider drag, and nothing else frees them. Grass gets away without this by
  // building ONE tuft; here a studio session would leak a geometry for every value the author tried.
  useEffect(() => () => geometries.forEach(g => g.dispose()), [geometries]);

  // One grain texture per band: the repeat depends on the band's own length, and an outer band is
  // half again as long as an inner one, so sharing a single texture would stretch the grain on some
  // ropes and squash it on others.
  const grains = useMemo(() => {
    if (!fondant) return null;
    return bands.map(b => {
      let length = 0;
      for (let i = 1; i < b.path.length; i++) length += b.path[i].distanceTo(b.path[i - 1]);
      return bandGrain(length, Math.PI * b.thickness);
    });
  }, [bands, fondant]);

  useEffect(() => () => grains?.forEach(t => t.dispose()), [grains]);

  return (
    <group rotation={[0, yaw, 0]}>
      {bands.map((b, i) => (
            <mesh key={b.index} geometry={geometries[i]} castShadow receiveShadow>
              {/* normalScale matches the GLB path's 1.5 — at the shipped 0.5 the grain was too faint
                  to see, which is recorded there and is just as true on a rope. */}
              <meshStandardMaterial
                color={b.color}
                roughness={roughness}
                metalness={metalness}
                normalMap={grains ? grains[i] : null}
                normalScale={grains ? new THREE.Vector2(1.5, 1.5) : undefined}
              />
            </mesh>
      ))}
    </group>
  );
}
