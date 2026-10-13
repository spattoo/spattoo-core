import { useMemo, useLayoutEffect } from 'react';
import { buildGypSprig, GYP_DEFAULTS, GYP_COLOURS } from '../geometry/gypsophila.js';
import { grassSeats } from '../geometry/grass.js';
import { useSeatedInstances, useSurfaceSeats, instancedTriangleCount } from './useSeatedInstances.js';

// ── A cloud of gypsophila on a surface ──────────────────────────────────────────────────────────
//
// One sprig, instanced — the same deal GrassPatch makes, and for the same reason: a rim band is
// hundreds of sprigs, and hundreds of clones is hundreds of meshes for the renderer to walk every
// frame. One InstancedMesh is one draw call over ~344 triangles however many sprigs there are.
//
// ⚠️ SEATS COME FROM `grassSeats`, NOT FROM A SECOND DISTRIBUTION SYSTEM. It already answers every
// placement these references show: cover a top, ring the rim (`bandInner`), put a clump here
// (`patches`), keep out of that (`hole`), drape over the edge (`overhang`) — against any tier
// outline, round or sheet or heart. Writing a gypsophila-shaped copy of it would be a second answer
// to the same question (root CLAUDE.md rule 1), and the one that drifts is whichever is edited
// second.

export default function GypCloud({
  shape, topY,
  stem = GYP_COLOURS.stem,
  bloom = GYP_COLOURS.bloom,
  height = GYP_DEFAULTS.height,
  levels = GYP_DEFAULTS.levels,
  forks = GYP_DEFAULTS.forks,
  spread = GYP_DEFAULTS.spread,
  shrink = GYP_DEFAULTS.shrink,
  droop = GYP_DEFAULTS.droop,
  thickness = GYP_DEFAULTS.thickness,
  florets = GYP_DEFAULTS.florets,
  floretSize = GYP_DEFAULTS.floretSize,
  floretVary = GYP_DEFAULTS.floretVary,
  ao = GYP_DEFAULTS.ao, aoFloor = GYP_DEFAULTS.aoFloor,
  /* How much sprigs differ from one another in brightness. See useSeatedInstances — it is the only
     thing that gives a packed field depth, because every instance shares one geometry. */
  shadeVary = 0.35,
  spacing = 0.13, jitter = 0.7,
  bandInner = null, hole = null, inset = 0.98, overhang = 0, patches = null, patchRadius = null,
  /* [{ u, v, r, inner }] — a ring of sprigs around something already placed, like a rose. `r` is
     how far the halo reaches, `inner` the footprint it must keep clear. See useSurfaceSeats. */
  collars = null,
  seed = GYP_DEFAULTS.seed,
  /* Degrees the sprig is tipped over from upright. 0 stands it up (a top surface, where the stem
     really is pushed into buttercream); 90 lays it flat (a board, which is card and cannot be
     pushed into at all). See useSeatedInstances. */
  lay = 0, layVary = 0.35,
  /* ⚠️ HOW DEEP THE CUT END GOES IN, in cake units. A stem is PUSHED INTO buttercream — you do not
     stand it on the surface — so the bare lower part of it is simply not visible on a real cake.
     Seated at the surface, the whole bare length showed and the bunch looked balanced on top of a
     wire: *"such thin stems cant hold the bunch… against physics… lets insert them bit low."*
     Burying is not a cheat for that, it is what the baker's hand does. */
  bury = 0,
  onStats,
}) {
  const geo = useMemo(
    () => buildGypSprig({ height, levels, forks, spread, shrink, droop, thickness,
                          florets, floretSize, floretVary, seed, stem, bloom, ao, aoFloor }),
    [height, levels, forks, spread, shrink, droop, thickness, florets, floretSize, floretVary,
     seed, stem, bloom, ao, aoFloor],
  );

  const seats = useSurfaceSeats({ shape, spacing, jitter, inset, seed, bandInner, hole, overhang,
                                  patches, patchRadius, collars });

  /* The seating loop is shared with GrassPatch — same seats, same matrices, same rim tipping. */
  const ref = useSeatedInstances(seats, topY - bury,
    { lay: (lay * Math.PI) / 180, layVary, laySeed: seed, geo, shadeVary });
  /* Everything below the surface is hidden by the cake itself, so this costs nothing to draw. */

  useLayoutEffect(() => {
    const { per, total } = instancedTriangleCount(geo, seats.length);
    onStats?.({ sprigs: seats.length, tris: total, perSprig: per });
  }, [seats, geo, onStats]);

  if (!seats.length) return null;
  return (
    <instancedMesh ref={ref} args={[geo, undefined, seats.length]} castShadow receiveShadow>
      {/* ⚠️ NO `albedoForLight` HERE YET, AND THAT IS A GAP, NOT A DECISION. Every surface in this
          library is calibrated against its own measured reference light (INVARIANTS #16) because a
          thin self-shadowing form eats far more light than a flat one — grass needs [1.901, 1.358,
          1.000] to hit the colour it is asked for. Gypsophila is thinner still and will need its
          own numbers. They have not been measured, so nothing is claimed: this draws the colour
          plainly, and `SURFACE=… node scripts/measure-surface-colour.mjs` is where the real figures
          come from once the shape is settled. Inventing three numbers that look calibrated would be
          worse than having none. */}
      {/* ⚠️ `vertexColors` WITH A WHITE BASE. The stem/bloom split rides the geometry's colour
          attribute, so one draw call paints both; a white `color` leaves those values untouched
          (anything else multiplies them and the green goes muddy). The attribute always exists —
          `buildGypSprig` writes it unconditionally — but the flag still reads it off the geometry
          rather than assuming, because a material with `vertexColors` and no attribute renders
          very nearly black. */}
      <meshStandardMaterial vertexColors={!!geo.attributes.color} color="#ffffff"
                            roughness={0.78} metalness={0} />
    </instancedMesh>
  );
}
