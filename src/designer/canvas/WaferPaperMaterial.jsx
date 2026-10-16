import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { WAFER_PAPER_MATERIAL, waferFibreTexture } from '../geometry/waferPaperMaterial.js';

/* ── THE material for a sheet of wafer paper ─────────────────────────────────────────────────────
 *
 * ⚠️ THIS EXISTS BECAUSE THREE COPIES OF IT DRIFTED, TWICE, IN OPPOSITE DIRECTIONS. The cake, the
 * admin studio and the dev harness each hand-wrote the same `<meshPhysicalMaterial>`, and each one
 * was missing something the others had:
 *
 *   `sheenColor` — set in both tuners, absent on the CAKE. three.js defaults it to black, so a
 *   sheen of 0.9 added no light at all on the only surface a customer sees. Identical parameters
 *   measured [181,160,157] chroma 23 on the cake against [211,203,199] chroma 12 in the harness.
 *   Sandeep: *"it does not look like white."*
 *
 *   `vertexColors` — set on the cake and in the harness, absent in the STUDIO. The baked gap
 *   occlusion is the whole reason a white skirt is legible on a white cake, and the studio computed
 *   it, uploaded it and ignored it. Sandeep, on the studio: *"the same over exposure problem. total
 *   white and i can hardly see the paper."*
 *
 * Both are the same bug, and a gate on either prop would not have caught the other. The cure is not
 * a third gate: it is that there is one material and every surface mounts it (CLAUDE.md rule 1,
 * INVARIANTS #15). A tuner that cannot disagree with the cake is the entire point of a tuner.
 *
 * ⚠️ `geometry` IS REQUIRED, and not for drawing. It decides `vertexColors`: `bakeWaferAO` writes
 * no colour attribute at `ao: 0`, and a material that asks for vertex colours without one reads
 * undefined data and renders the skirt nearly BLACK — measured [19,17,16]. */
export default function WaferPaperMaterial({ p = {}, geometry = null }) {
  const n = (k) => p[k] ?? WAFER_PAPER_MATERIAL[k];

  /* Generated, not shipped: it is noise, and a procedural one scales to any panel without a UV
     budget. Regenerated only when the grain strength changes, and disposed with it — a generated
     texture is not garbage-collected with the material, and this is a control a baker drags. */
  const fibre = useMemo(
    () => (typeof document === 'undefined' ? null : waferFibreTexture({ strength: n('fibre') })),
    [p.fibre]);                                    // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => fibre?.dispose?.(), [fibre]);

  return (
    /* ⚠️ DoubleSide: a sheet of paper has no back. Single-sided, every panel on the far side of the
       cake vanishes the moment it turns — and that is half of them at any angle.

       ⚠️ AND NO `transparent` / `opacity` WHILE TRANSMISSION IS ON. That pair puts the mesh on the
       alpha-blended path, so every pixel becomes a flat lerp toward what is behind it and the
       transmission is thrown away: two overlapping panels come out the same flat colour instead of
       getting denser where they cross, which is the most paper-like thing about the references. */
    <meshPhysicalMaterial
      color={p.colour ?? '#fbf7f2'}
      vertexColors={!!geometry?.attributes?.color}
      side={THREE.DoubleSide}
      roughness={n('roughness')}
      transmission={n('transmission')}
      thickness={n('thickness')}
      ior={WAFER_PAPER_MATERIAL.ior}
      sheen={n('sheen')}
      sheenRoughness={WAFER_PAPER_MATERIAL.sheenRoughness}
      sheenColor={WAFER_PAPER_MATERIAL.sheenColor}
      metalness={WAFER_PAPER_MATERIAL.metalness}
      specularIntensity={n('specular')}
      roughnessMap={n('fibre') > 0 ? fibre : null}
    />
  );
}
