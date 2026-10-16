import { useMemo, useEffect } from 'react';
import { buildWaferSkirt, WAFER_DEFAULTS } from '../geometry/waferPaper.js';
import WaferPaperMaterial from './WaferPaperMaterial.jsx';

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

  useEffect(() => () => geom?.dispose?.(), [geom]);

  if (!geom) return null;
  return (
    <mesh geometry={geom} position={[0, baseY + tierHeight, 0]} castShadow receiveShadow
          onClick={onClick ?? undefined}>
      {/* ⚠️ THE material, mounted — never a hand-written copy of it. Two copies of this element
          drifted in opposite directions before it existed; the whole story is in the component. */}
      <WaferPaperMaterial p={p} geometry={geom} />
    </mesh>
  );
}
