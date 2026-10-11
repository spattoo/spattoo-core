import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { buildWaferSkirt, WAFER_DEFAULTS } from '../geometry/waferPaper.js';
import { WAFER_PAPER_MATERIAL, waferFibreTexture } from '../geometry/waferPaperMaterial.js';

// ── Wafer paper round a tier ────────────────────────────────────────────────────────────────────
//
// A fence of thin translucent sheets, cut from wafer paper, pleated by hand and pressed onto the
// buttercream along their top edge so the hem hangs free. The technique, the parameters and why
// each one exists are all in `geometry/waferPaper.js` — this file only puts the skirt on the cake.
//
// ⚠️ THIS IS THE ONE RENDERER, and WaferPaperStudio in admin is the tuner for it. Several studios
// in that folder open by admitting they are "the admin prototype copy; it ports to spattoo-core
// verbatim" — that is the old order and it is how a tuned version and a rendered version drift
// apart (root CLAUDE.md rule 1, INVARIANTS #15). The geometry was already core's; this makes the
// MESH core's too, so the studio and the cake cannot disagree about what a number does.

/* ⚠️ MEASURED FROM THE RIM, NOT FROM THE BOARD. `buildWaferSkirt` returns a geometry with y = 0 at
 * the tier's TOP edge, because the top edge is the only part of a real panel whose position is
 * known — it is where the paper is stuck on, and everything else hangs from it. So the mesh is
 * positioned at the rim and the skirt falls from there. */
export default function CakeWafer({ wafer, shp, tierHeight, baseY, radius, onClick = null }) {
  const p = useMemo(() => ({ ...WAFER_DEFAULTS, ...(wafer ?? {}) }), [wafer]);

  const geom = useMemo(
    () => (wafer ? buildWaferSkirt({ shape: shp, tierHeight, radius, ...p }) : null),
    [wafer, shp, tierHeight, radius, p]);

  /* Generated, not shipped: it is noise, and a procedural one scales to any panel without a UV
     budget. Regenerated only when the grain strength changes. */
  const fibre = useMemo(
    () => (typeof document === 'undefined' ? null
      : waferFibreTexture({ strength: p.fibre ?? WAFER_PAPER_MATERIAL.fibre })),
    [p.fibre]);

  /* A generated texture is not garbage-collected with the material — every change of grain would
     leak one otherwise, and this is a control a baker drags. */
  useEffect(() => () => fibre?.dispose?.(), [fibre]);
  useEffect(() => () => geom?.dispose?.(), [geom]);

  if (!geom) return null;
  return (
    <mesh geometry={geom} position={[0, baseY + tierHeight, 0]} castShadow receiveShadow
          onClick={onClick ?? undefined}>
      {/* ⚠️ DoubleSide: a sheet of paper has no back. Single-sided, every panel on the far side of
          the cake vanishes the moment it turns — and that is half of them at any angle.

          ⚠️ AND NO `transparent` / `opacity` WHILE TRANSMISSION IS ON. Setting that pair puts the
          mesh on the alpha-blended path, so every pixel becomes a flat lerp toward what is behind
          it and the transmission is thrown away: two overlapping panels come out the same flat
          colour instead of getting denser where they cross, which is the single most paper-like
          thing about the references.

          The numbers live in WAFER_PAPER_MATERIAL so the studio and the cake agree. */}
      <meshPhysicalMaterial
        color={p.colour ?? '#fbf7f2'}
        side={THREE.DoubleSide}
        roughness={p.roughness ?? WAFER_PAPER_MATERIAL.roughness}
        transmission={p.transmission ?? WAFER_PAPER_MATERIAL.transmission}
        thickness={p.thickness ?? WAFER_PAPER_MATERIAL.thickness}
        ior={WAFER_PAPER_MATERIAL.ior}
        sheen={p.sheen ?? WAFER_PAPER_MATERIAL.sheen}
        sheenRoughness={WAFER_PAPER_MATERIAL.sheenRoughness}
        specularIntensity={p.specular ?? WAFER_PAPER_MATERIAL.specular}
        roughnessMap={fibre}
      />
    </mesh>
  );
}
