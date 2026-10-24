import { useMemo } from 'react';
import { buildSandGrain, buildSandMound, sandSpan, thinOutward, varyGrainSize,
         ZONES_TOP, SAND_DEFAULTS } from '../geometry/sand.js';
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
/* A shape scaled about its own centre — the patch a top drift covers. Kept here beside its one
   caller rather than added to surface.js, which answers questions about the CAKE's own outline. */
function scaleShape(shape, k) {
  if (shape.kind === 'rect') return { ...shape, halfW: shape.halfW * k, halfD: shape.halfD * k, cornerR: (shape.cornerR ?? 0) * k };
  if (shape.outline) return { ...shape, scale: (shape.scale ?? 1) * k };
  return { ...shape, radius: (shape.radius ?? 1) * k };
}

export default function SandBed({
  shape, topY,
  /* ⚠️ `zone` AND `size` ARE ONE QUESTION ASKED TWICE, which is why size means the same thing in
     both: how much sand there is. On the board that is how far past the cake the drift reaches; on
     the top, how much of the surface it covers. `sandSpan` is the only place that knows the
     difference, so this component never branches on the zone beyond handing it over. */
  zone = 'board',
  size = null,
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
  const onTop = zone === ZONES_TOP;
  const amount = size ?? (onTop ? SAND_DEFAULTS.topSize : width);
  const span = useMemo(() => sandSpan(zone, amount), [zone, amount]);

  /* The crumbs ride the SAME span as the bank. On the board that is a ring outside the cake, so the
     seats come from a grown shape with the cake punched out as a `hole` — the board-ring argument
     `grassSeats` already makes, and the hole is the cake's own outline so it follows a heart or a
     sheet as faithfully as a circle. On the top it is a disc: scale the shape down, nothing to
     punch out. */
  const seatShape = useMemo(
    () => (onTop ? scaleShape(shape, span.outerFrac) : outwardBand(shape, amount)),
    [onTop, shape, span.outerFrac, amount]);
  const hole = useMemo(() => (onTop ? null : { shape, scale: 1 }), [onTop, shape]);
  const raw  = useSurfaceSeats({ shape: seatShape, spacing, jitter, inset: 1, seed, hole });

  const reach = shape.radius ?? Math.max(shape.halfW ?? 0, shape.halfD ?? 0) ?? 1;
  const seats = useMemo(
    /* On the top the crumbs thin toward the rim of the PATCH, which is where a layer breaks up —
       the same rule as the board, measured from the patch's own edge rather than the cake's. */
    () => varyGrainSize(
      thinOutward(raw, { inner: reach * span.innerFrac, outer: reach * span.outerFrac, falloff, seed: seed + 3 }),
      { sizeVary, seed: seed + 5 }),
    [raw, reach, span.innerFrac, span.outerFrac, falloff, sizeVary, seed]);

  const geo   = useMemo(() => buildSandGrain({ seed: seed + 1 }), [seed]);
  const mound = useMemo(
    () => buildSandMound(shape, { ...span, rise, moundNoise, moundGrain, edgeBreak, seed: seed + 11 }),
    [shape, span, rise, moundNoise, moundGrain, edgeBreak, seed]);

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
