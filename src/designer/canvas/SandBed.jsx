import { useMemo } from 'react';
import { buildSandGrain, buildSandMound, thinOutward, varyGrainSize, SAND_DEFAULTS } from '../geometry/sand.js';
import { useSeatedInstances, useSurfaceSeats, outwardBand } from './useSeatedInstances.js';

/* ── A drift of sand banked around the foot of a cake ────────────────────────────────────────────
 *
 * One InstancedMesh over a twenty-triangle grain, however many grains there are — the same split
 * GrassPatch made and for the same reason: a drift is thousands of pieces, and thousands of meshes
 * is thousands of things for the renderer to walk every frame.
 *
 * ⚠️ IT PLACES NOTHING ITSELF. The ring is `outwardBand` (the board's reach) with the cake punched
 * out as a `hole`, both already written and both already proven on the grass board ring. What is
 * new here is only the grain and the thinning.
 *
 * ⚠️ A BANK PLUS CRUMBS, AND NOT CRUMBS ALONE. The first version was grains only and read as small
 * stones — Sandeep: *"its like small stones but not like sand."* Grains cannot carry it: a real
 * grain on a 15cm cake is sub-millimetre, so making them illegible individually needs ~65,000 of
 * them. Sand near the cake is a continuous MASS and only breaks into separate pieces at its edge,
 * so the mass is a surface (`buildSandMound`) and the crumbs garnish it.
 *
 * ⚠️ THIS IS NOT GRASS'S FIELD CAP IN DISGUISE. That cap is flat and exists because blades are
 * sparse enough to show the board between them. This one is the sand: banked at the wall,
 * feathering to nothing, uneven, and flat-shaded so its own facets do the speckling.
 */
export default function SandBed({
  shape, topY,
  colour    = SAND_DEFAULTS.colour,
  width     = SAND_DEFAULTS.width,
  spacing   = SAND_DEFAULTS.spacing,
  jitter    = SAND_DEFAULTS.jitter,
  grainSize = SAND_DEFAULTS.grainSize,
  sizeVary  = SAND_DEFAULTS.sizeVary,
  falloff   = SAND_DEFAULTS.falloff,
  shadeVary = SAND_DEFAULTS.shadeVary,
  rise       = SAND_DEFAULTS.rise,
  moundNoise = SAND_DEFAULTS.moundNoise,
  moundGrain = SAND_DEFAULTS.moundGrain,
  edgeBreak  = SAND_DEFAULTS.edgeBreak,
  roughness = SAND_DEFAULTS.roughness,
  seed      = SAND_DEFAULTS.seed,
  onPick    = null,
}) {
  const band = useMemo(() => outwardBand(shape, width), [shape, width]);
  // `hole` is the cake's own outline, so the drift starts at the wall on a heart or a sheet as
  // faithfully as on a circle — the same argument grassSeats makes for its board ring.
  const hole = useMemo(() => ({ shape, scale: 1 }), [shape]);
  const raw  = useSurfaceSeats({ shape: band, spacing, jitter, inset: 1, seed, hole });

  const inner = shape.radius ?? Math.max(shape.halfW ?? 0, shape.halfD ?? 0) ?? 1;
  const seats = useMemo(
    () => varyGrainSize(
      thinOutward(raw, { inner, outer: inner * (1 + width), falloff, seed: seed + 3 }),
      { sizeVary, seed: seed + 5 }),
    [raw, inner, width, falloff, sizeVary, seed]);

  const geo   = useMemo(() => buildSandGrain({ seed: seed + 1 }), [seed]);
  const mound = useMemo(
    () => buildSandMound(shape, { width, rise, moundNoise, moundGrain, edgeBreak, seed: seed + 11 }),
    [shape, width, rise, moundNoise, moundGrain, edgeBreak, seed]);

  /* `size` is the grain's real radius; the spread rides on each seat's own scale (varyGrainSize),
     because the hook multiplies the two. `shadeVary` is what stops a drift reading as one flat
     colour — the only lever an InstancedMesh has on the flatness of a packed field. */
  const ref = useSeatedInstances(seats, topY, { geo, size: grainSize, shadeVary, laySeed: seed + 7 });

  return (
    <>
      {/* The mass. Dry and matte — sand has no sheen at all, and any gloss reads as wet sugar. */}
      <mesh geometry={mound} position={[0, topY, 0]} castShadow receiveShadow
        onClick={onPick ? (e) => { e.stopPropagation(); onPick(); } : undefined}>
        <meshStandardMaterial color={colour} roughness={roughness} metalness={0} flatShading />
      </mesh>
      {/* The crumbs, sitting ON the bank — they ride its height so they are not half-buried at the
          wall and floating at the lip. */}
      {!!seats.length && (
        <instancedMesh ref={ref} args={[geo, undefined, seats.length]} castShadow receiveShadow
          onClick={onPick ? (e) => { e.stopPropagation(); onPick(); } : undefined}>
          <meshStandardMaterial color={colour} roughness={roughness} metalness={0} flatShading />
        </instancedMesh>
      )}
    </>
  );
}
