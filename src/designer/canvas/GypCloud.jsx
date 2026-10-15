import { useMemo, useLayoutEffect } from 'react';
import * as THREE from 'three';
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
  /* What makes the thing read as a bunch rather than a plant: how far down the sprig the blooms
     ride, how far back along each branch, and how much bare stub is left at the bottom. */
  bloomLevels = GYP_DEFAULTS.bloomLevels,
  bloomSpan = GYP_DEFAULTS.bloomSpan,
  baseFrac = GYP_DEFAULTS.baseFrac,
  ao = GYP_DEFAULTS.ao, aoFloor = GYP_DEFAULTS.aoFloor,
  /* How much sprigs differ from one another in brightness. See useSeatedInstances — it is the only
     thing that gives a packed field depth, because every instance shares one geometry. */
  shadeVary = 0.35,
  spacing = 0.13, jitter = 0.7,
  bandInner = null, hole = null, inset = 0.98, overhang = 0, patches = null, patchRadius = null,
  /* ⚠️ `{ height, lo, hi, from, to, bury }` SEATS IT ON THE TIER'S WALL instead of a flat surface,
     and then `topY` is the tier's BASE rather than its top — each seat carries its own height above
     it. A wall is where a real florist puts the other half of the baby's breath, and it is the one
     surface `grassSeats` cannot describe: its seats differ in height, and a piece points out of the
     wall rather than up out of the cake. See geometry/wallSeats.js. */
  wall = null,
  /* [{ u, v, r, inner }] — a ring of sprigs around something already placed, like a rose. `r` is
     how far the halo reaches, `inner` the footprint it must keep clear. See useSurfaceSeats. */
  collars = null,
  /* ⚠️ WHAT IS ALREADY ON THIS SURFACE — `[{ x, z, r }]` from `surfaceOccupants`. The filler never
     grows through a placed thing; it finds the gaps between them. It does not know or care WHAT
     they are: a candle, a topper and a rose all occupy space and the rule is the same for each
     (INVARIANTS #3b, which says in as many words that it is not a per-element rule). */
  avoid = null,
  seed = GYP_DEFAULTS.seed,
  /* Degrees the sprig is tipped over from upright. 0 stands it up (a top surface, where the stem
     really is pushed into buttercream); 90 lays it flat (a board, which is card and cannot be
     pushed into at all). See useSeatedInstances. */
  /* How big each sprig is drawn, as a multiple of the sprig the row was authored with. The baker's
     one word for "these are too small", and the only one of the sprig's numbers that can change
     without rebuilding the geometry. */
  size = 1,
  lay = 0, layVary = 0.35,
  /* ⚠️ HOW DEEP THE CUT END GOES IN, in cake units. A stem is PUSHED INTO buttercream — you do not
     stand it on the surface — so the bare lower part of it is simply not visible on a real cake.
     Seated at the surface, the whole bare length showed and the bunch looked balanced on top of a
     wire: *"such thin stems cant hold the bunch… against physics… lets insert them bit low."*
     Burying is not a cheat for that, it is what the baker's hand does. */
  bury = 0,
  /* ⚠️ TAPPING THE FLOWERS OPENS THEIR CARD. The side stack's own roadmap note names this as the
     work that lets the stack go away: "pointer handlers for grass, letter blocks, luster dust and
     anything else lacking them." Gypsophila was in that set, and on the RIM it is the only way in —
     a band has no position of its own, so it carries no drag handle to tap instead. Sandeep:
     *"gypsophila does not have a popup pointer."* */
  onPick,
  onStats,
}) {
  const geo = useMemo(
    () => buildGypSprig({ height, levels, forks, spread, shrink, droop, thickness,
                          florets, floretSize, floretVary, bloomLevels, bloomSpan, baseFrac,
                          seed, stem, bloom, ao, aoFloor }),
    [height, levels, forks, spread, shrink, droop, thickness, florets, floretSize, floretVary,
     bloomLevels, bloomSpan, baseFrac, seed, stem, bloom, ao, aoFloor],
  );

  const seats = useSurfaceSeats({ shape, spacing, jitter, inset, seed, bandInner, hole, overhang,
                                  patches, patchRadius, collars, avoid, wall });

  /* The seating loop is shared with GrassPatch — same seats, same matrices, same rim tipping. */
  /* On a wall, burying is INWARD and `wallSeats` has already done it, by moving each seat along the
     wall's own normal. Subtracting it from `topY` as well would sink the whole band toward the
     board — the same gesture pointed at the wrong surface. */
  /* ⚠️ BURIAL IS IN UNITS OF THE SPRIG, SO IT SCALES WITH `size`. It did not, and that is why
     growing the flowers made the stems worse: `size` scales the whole piece on the instance
     matrix, so at size 2 the sprig stood twice as tall while the hand pushing it in stayed at the
     same 0.06 — the bare run above the surface DOUBLED. Sandeep: *"i have asked previously to
     increase the size of the flowers. you did it the wrong way."* A depth that does not scale with
     the thing it is burying is a control that stops meaning what its name says (INVARIANTS #8). */
  const ref = useSeatedInstances(seats, topY - (wall ? 0 : bury * size),
    { lay: (lay * Math.PI) / 180, layVary, laySeed: seed, geo, shadeVary, size });
  /* Everything below the surface is hidden by the cake itself, so this costs nothing to draw. */

  useLayoutEffect(() => {
    const { per, total } = instancedTriangleCount(geo, seats.length);
    onStats?.({ sprigs: seats.length, tris: total, perSprig: per });
    /* ⚠️ THE SEATS THE RENDERER ACTUALLY USED, published for measurement. "It skipped the area
       where the roses are" is a precise, countable claim — how wide an arc of the rim carries no
       sprig — and the only honest way to count it is off the seats that were drawn. A script that
       recomputed them from the design would be re-implementing the clearance rule and would agree
       with itself whatever the rule did. */
    if (import.meta.env?.DEV && typeof window !== 'undefined') {
      window.__gypSeats = { seats, avoid: avoid ?? [] };
    }
  }, [seats, geo, onStats, avoid]);

  if (!seats.length) return null;
  return (
    /* ⚠️ `isGypTap` IS NOT DECORATION. The canvas lists it in gesture ownership already, beside the
       clump handles: without it the r3f click LEAKS to the tier underneath and
       `selectExclusive({type:'tier'})` overwrites the selection this tap just made — which from the
       DOM is indistinguishable from a tap that missed, and is the half of the original foil bug
       that got misdiagnosed first time round. */
    <instancedMesh ref={ref} args={[geo, undefined, seats.length]} castShadow receiveShadow
      userData={{ isGypTap: true }}
      onClick={onPick ? (e) => { e.stopPropagation(); onPick(); } : undefined}>
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
      {/* ⚠️ DoubleSide: A PETAL HAS NO BACK. A floret is five petals dished around a centre, and
          single-sided every one of them vanishes the moment it faces away — which is half the
          florets in a cloud at any angle. The same reason the wafer skirt draws both faces. */}
      <meshStandardMaterial vertexColors={!!geo.attributes.color} color="#ffffff"
                            side={THREE.DoubleSide} roughness={0.78} metalness={0} />
    </instancedMesh>
  );
}
