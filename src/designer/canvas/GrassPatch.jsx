import { useMemo, useLayoutEffect } from 'react';
import { albedoForLight } from '../shared/albedoForLight.js';
import { buildGrassTuft, grassSeats, GRASS_DEFAULTS } from '../geometry/grass.js';
import { useSeatedInstances, useSurfaceSeats, instancedTriangleCount } from './useSeatedInstances.js';

// ── A field of piped grass on a surface ───────────────────────────────────────
// The canvas's FIRST instanced path. Everywhere else (ring shells, decoration rings) clones the
// source per position, which is right for a handful of pieces and wrong here: a dense top is ~3000
// tufts, and 3000 clones is 3000 meshes for the renderer to walk every frame.
//
// One InstancedMesh means one draw call over ~120 triangles of real geometry, however many tufts
// there are. That is the difference between grass being usable on a phone and not.

/* ⚠️ GRASS RECEIVES FAR LESS LIGHT THAN A FLAT SURFACE, and it is the strongest case in the library
 * for measuring per surface rather than sharing a constant. A mid-grey #808080 renders 156,143,128
 * here against 184,178,173 on a fondant block and 180,173,168 on the tier wall — thin angled blades
 * self-shadow, so much of the patch never sees the key light at all. It also carries the biggest
 * CAST of any surface measured (28 points between red and blue against an asked neutral), which is
 * why this is three numbers and why blue comes out at 1.0 — needing no correction at all.
 * `SURFACE=grass node scripts/measure-surface-colour.mjs` prints the table. */
/* ⚠️ Interpolated from two measured points; one division gives [1.540, 1.272, 1.000] and leaves grey
 * at 136. Blue stays at 1.0 — grass genuinely needs no correction on that channel. */
const GRASS_REFERENCE_LIGHT = [1.901, 1.358, 1.000];
const GRASS_ROLLOFF = 2.0;

export default function GrassPatch({
  shape, topY, color = '#4caf3d',
  strands = GRASS_DEFAULTS.strands,
  height  = GRASS_DEFAULTS.height,
  spacing = GRASS_DEFAULTS.spacing,
  jitter  = GRASS_DEFAULTS.jitter,
  splay   = GRASS_DEFAULTS.splay,
  droop   = GRASS_DEFAULTS.droop,
  thickness = GRASS_DEFAULTS.thickness,
  lengthVary = GRASS_DEFAULTS.lengthVary,
  bandInner = null, hole = null, inset = 0.98, overhang = 0, patches = null, patchRadius = null, seed = 7,
  onStats,
}) {
  const geo = useMemo(
    () => buildGrassTuft({ strands, height, thickness, splay, droop, lengthVary, seed }),
    [strands, height, thickness, splay, droop, lengthVary, seed],
  );
  const seats = useSurfaceSeats({ shape, spacing, jitter, inset, seed, bandInner, hole, overhang, patches, patchRadius });

  /* The seating loop moved to useSeatedInstances.js when gypsophila needed the identical thing —
     including the rim tipping, whose axis is the part worth not retyping. */
  const ref = useSeatedInstances(seats, topY);

  // ── The cost, counted from the geometry rather than guessed ───────────────────────────────────
  // `tris` is what the studio's cost panel warns on, and it was never reported at all — the panel
  // read a name that existed nowhere and the whole screen threw. Counting it here rather than in the
  // studio keeps it honest: this is the buffer that actually gets drawn, so the number cannot drift
  // from the thing it describes the way a formula in the panel would.
  //
  // The count is what a MERGED patch would cost, which is the number worth warning about. As an
  // InstancedMesh it is one draw call over one tuft; the warning is about the day somebody merges.
  useLayoutEffect(() => {
    const { per, total } = instancedTriangleCount(geo, seats.length);
    onStats?.({ tufts: seats.length, blades: seats.length * strands, tris: total, perTuft: per });
  }, [seats, strands, geo, onStats]);

  if (!seats.length) return null;
  return (
    <instancedMesh ref={ref} args={[geo, undefined, seats.length]} castShadow receiveShadow>
      {/* Flat-ish and slightly waxy, like coloured buttercream — a shiny blade reads as plastic. */}
      <meshStandardMaterial color={albedoForLight(color, GRASS_REFERENCE_LIGHT, { rolloff: GRASS_ROLLOFF })} roughness={0.72} metalness={0} />
    </instancedMesh>
  );
}
