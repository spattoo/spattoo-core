import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { composeCalendar, resolveDate, resolveCalendarCfg } from '../shared/textures/calendarArt.js';

/* ── A calendar's texture: drawn from numbers, never fetched ──────────────────────────────────────
 *
 * The text-slot path composites the customer's value ONTO a loaded artwork. A calendar has no
 * artwork — `image_url` is null on the element, deliberately, because 12 months × 31 dates × 2
 * layouts is a per-value asset explosion and the whole point of `calendarArt.js` is that a calendar
 * is a RECIPE. So this cannot be a seventh argument to `useStickerImageTexture`: that hook opens
 * with `useTexture(corsUrl(imageUrl))`, an unconditional suspense hook, and there is nothing to
 * hand it. Hence a sibling that starts from a blank canvas.
 *
 * ⚠️ IT ASKS `composeCalendar`, the same function the admin studio previews with and the print
 * sheet will draw with (INVARIANTS #15). A preview that is tuned towards the render is how the two
 * drift, and the one that drifts is always the one the customer is looking at when they choose.
 *
 * ⚠️ GENERIC FONT FAMILIES ONLY, and that is a constraint this hook is relying on rather than a
 * detail. `drawCalendar` takes `opts.titleFont || 'cursive'` and `opts.bodyFont || 'sans-serif'`,
 * which resolve synchronously. An uploaded WEBFONT would not: `ctx.fillText` with an unloaded
 * FontFace silently falls back to sans-serif and BAKES that into the texture — the exact bug
 * `useSlotFontsReady` exists to prevent. The day anyone passes a real typeface here, this hook needs
 * that same readiness tick, and it will not announce itself: the calendar will simply render in the
 * wrong face on a cold load and the right one after a refresh.
 */

/* 1024 is chosen against the SMALLEST thing on the texture, which is a two-digit day, not the
 * calendar. A month grid is 7 columns wide, so a digit occupies roughly S/7 × 0.5 ≈ 73px here —
 * legible when a sheet covers the cake top and the camera comes in close, which is exactly the shot
 * a customer takes of the date that matters to them. 512 put the same digit at 36px and the ring
 * around it at barely two. Square because the sticker plane is square (STICKER_SIZE both ways). */
const CALENDAR_TEXTURE_PX = 1024;

/**
 * A CanvasTexture of the calendar this instance describes.
 *
 * @param {object|null} calendar  `placement_config.calendar` — the authored recipe (layout, medium,
 *                                ink, accent, paper, ringStyle, rect). Null → no texture, and the
 *                                caller renders nothing.
 * @param {object|null} values    the customer's chosen `{ year, month, day }`. Missing or junk falls
 *                                back to today via `resolveDate`, which also clamps 31 February.
 */
export function useCalendarTexture(calendar, values, layout = null) {
  // The date is resolved OUTSIDE the memo's identity: `values` is a fresh object on every render
  // (useCakeDesign rebuilds the sticker), so keying the memo on it directly would redraw a 1024²
  // canvas on every frame of an unrelated drag. The resolved triple is three numbers.
  const { year, month, day } = resolveDate(values ?? {});
  // Same reasoning for the config: it arrives from placement_config and is a new object each read.
  const cfgKey = useMemo(() => JSON.stringify(calendar ?? null), [calendar]);
  /* ⚠️ THE SHAPE IS A PROP, NOT PART OF THE RECIPE, and forgetting that shipped a bug: the state
   * said 'round', every assertion passed, and the cake went on drawing a grid — oversized, because
   * the SCALE had followed the switch and the DRAWING had not. A recipe offering `layouts` carries
   * no singular `layout` at all, so `{...CALENDAR_DEFAULTS, ...calendar}` quietly resolved to the
   * default. `resolveCalendarCfg` is the one place that decides, and it validates the choice against
   * what the recipe actually offers. */

  const texture = useMemo(() => {
    if (!calendar) return null;
    try {
      const canvas = composeCalendar(
        CALENDAR_TEXTURE_PX,
        { year, month, day },
        resolveCalendarCfg(calendar, layout),
      );
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      // A decal on the cake TOP is viewed at a grazing angle from every side, where isotropic mip
      // filtering smears it — 8 is what the sticker path uses, and the GPU clamps to its own max.
      tex.anisotropy = 8;
      return tex;
    } catch (_) {
      // A calendar that cannot be drawn renders as nothing rather than as a black square. There is
      // no artwork to fall back to here, which is the one way this differs from the sticker path.
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey, layout, year, month, day]);

  // This texture is OURS — nothing else holds it, unlike the drei-cached image the sticker path
  // borrows — so it must be freed when the date changes or the element leaves the cake. Without
  // this, spinning a date picker leaks a 4MB GPU upload per step.
  useEffect(() => () => texture?.dispose(), [texture]);

  return texture;
}

export default useCalendarTexture;
