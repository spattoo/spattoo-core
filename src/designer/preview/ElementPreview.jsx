import { useEffect } from 'react';
import { useCakeDesign } from '../hooks/useCakeDesign.js';
import { CakePreview } from '../canvas/CakeCanvas.jsx';
import { zoneMode } from '../placement.js';
import { ZONES, PLACEMENT_MODES } from '../constants.js';

/* ─────────────────────────────────────────────────────────────────────────────────────────────────
 * One catalogue element, on a cake, exactly as the designer would draw it.
 *
 * Built so an admin can LOOK at a decoration before any baker sees it. An admin cannot sign in as a
 * baker, so without this there is no way to see your own work at all — which is why elements have
 * been going live and being checked afterwards, in the one place a mistake is a baker's problem.
 *
 * ── WHY THIS LIVES IN CORE ──────────────────────────────────────────────────────────────────────
 * "How an element becomes a placed sticker" is designer knowledge — seeding, de-overlap, edge seats,
 * hug fill, the per-zone mode. Put it in the admin app and admin owns a second copy of that
 * knowledge, which will agree on the day it is written and drift after. This repo has already paid
 * that bill: the phone bar and the desktop rail each kept their own copy of the nav list, drifted,
 * and Uploads existed on one and not the other until a baker had no route to their own images.
 *
 * So this does not MAP an element onto a cake. It calls `addSticker` — the same function the
 * designer calls when a baker taps a decoration — and hands the result to `CakePreview`, which is
 * the designer's own scene (`CakeThumbnailScene`: same SceneLights, same SceneEnv, same CakeTier,
 * same StickerFace with the full prop set). What the preview omits is the EDITING chrome —
 * selection outlines, grips, toolbars — not the rendering.
 *
 * ── WHAT IT THEREFORE CANNOT TELL YOU ───────────────────────────────────────────────────────────
 * Whether the element HANDLES correctly: drag, which zones actually accept it, whether the resize
 * grips hit sensible bounds, snapping. All of that lives in CakeCanvas's interactive layer, which
 * this deliberately does not mount. This answers "does it render", never "does it work" — see
 * plans/element-preview-and-publish.md, where the staging cohort answers the second question.
 *
 * ── placement_config MUST BE THE DESIGNER'S COPY ────────────────────────────────────────────────
 * The admin element GET returns placement_config with RAW R2 keys ("admin keeps raw keys for
 * editing"); the designer-facing GET expands the nested ones — the photo-frame mask and overlay, the
 * alternate piping GLBs — to public URLs. Hand this component the admin shape and a photo frame
 * previews with no mask, silently and only for that one element type. The caller must pass the
 * expanded shape (spattoo-backend exposes it at GET /api/admin/elements/:id/preview).
 * ───────────────────────────────────────────────────────────────────────────────────────────────*/
export default function ElementPreview({
  element,
  // Which zone to seat it in. Defaults to the element's own first allowed zone, so the common case
  // needs no decision — but an element that allows several should be looked at in each, because a
  // placement rule that only works in the zone it was authored against is exactly the bug this
  // screen exists to catch.
  zone = null,
  // Tier RADIUS is resolved from the tier's index (`TIER_RADII[i]` in toCanvasConfig), so the honest
  // way to preview at another size is to build the cake that has that size — not to fake a radius.
  // A 1-tier cake previews at the widest; tier 2 of a 3-tier at the narrowest.
  tierCount = 1,
  tierIndex = 0,
  autoRotate = true,
  style,
}) {
  const { design, addSticker, addTier, resetDesign } = useCakeDesign();

  useEffect(() => {
    if (!element) return;
    // Sequential functional updates compose — addTier and addSticker each read the previous design,
    // so the sticker seats against the tier stack this effect just built rather than the old one.
    resetDesign();
    for (let i = 1; i < Math.min(tierCount, 4); i++) addTier();

    const z = zone ?? element.allowed_zones?.[0] ?? ZONES.TOP_SURFACE;
    // The per-zone mode is the element's own (`stand` | `hug` | `perch` | `verge` | …), read through
    // the same helper the designer reads it with, so a hugging element hugs here too.
    const mode = zoneMode(element.placement_config, z, PLACEMENT_MODES.STAND);
    addSticker(element, z, Math.min(tierIndex, Math.max(0, tierCount - 1)), mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element?.id, element?.image_url, zone, tierCount, tierIndex]);

  return <CakePreview design={design} autoRotate={autoRotate} style={style} />;
}
