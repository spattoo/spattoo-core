/* ── A backdrop for a take: a studio sweep, not a picture ────────────────────────────────────────
 *
 * Sandeep, on a finished build video: *"technically our video is great, i completely liked it. but
 * something is still missing - it does not look visually professionally. i am thinking a background
 * could fix."*
 *
 * ⚠️ THE MISSING THING IS NOT A DARKER COLOUR — the take already offers two. `TAKE_GROUNDS` has
 * Slate (#2E3A36) and Ink (#14181A), and a cake filmed on either still reads flat. What every
 * reference he showed has in common is not a hue: it is a GRADIENT. Light pools somewhere and falls
 * off, which is what tells the eye there is a room with a lamp in it rather than a colour swatch
 * behind a cutout.
 *
 * ⚠️ SO IT IS GENERATED FROM THE GROUND HE ALREADY PICKED, NOT A SECOND PALETTE. The baker chose
 * Cream or Ink for a reason; a backdrop that ignores that is a second colour decision to keep in
 * step with the first, and `TAKE_GROUNDS`' own note records why the ground is a short list rather
 * than a free picker ("somebody records a cake on neon pink"). One knob, one answer.
 *
 * ⚠️ AND IT IS A FLAT FULLSCREEN IMAGE, WHICH IS THE WHOLE REASON IT CAN BE AN IMAGE AT ALL. A
 * texture on `scene.background` is drawn across the viewport and does NOT move with the camera —
 * so it behaves exactly like a photographer's paper sweep, and the take's orbit cannot catch its
 * edge. That is the trap `takeGrid` already records for geometry placed in the scene: *"This scene
 * ORBITS — the baker can drive the camera right round — so a grid with a back edge would show its
 * own edge the moment they turned past it."* Anything stood up behind the cake has to track the
 * camera (see TakeGridWall); a background does not have to exist in the world at all.
 *
 * ⚠️ IT CANNOT LIGHT THE CAKE. `SceneBackground` sets `scene.background` only, never
 * `scene.environment` — "verified: the tier colour table is byte-identical with it on". A take is a
 * picture OF the cake the baker approved, so that contract holds here: this changes what is behind
 * the cake and nothing about the cake.
 *
 * The maths is here and the painting is here; what is NOT here is any decision about when to use it
 * — that is the panel's.
 */

import { hexToRgb, rgbToHsl, hslToRgb, rgbToHex } from '../shared/color/imageRecolor.js';

/** The looks a baker can pick. `flat` is the behaviour that shipped before any of this. */
export const BACKDROP_LOOKS = Object.freeze([
  { key: 'flat',  label: 'Flat',    hint: 'One colour, as before' },
  { key: 'sweep', label: 'Sweep',   hint: 'Light from above, falling to the floor' },
  { key: 'pool',  label: 'Pool',    hint: 'A glow behind the cake' },
  { key: 'duo',   label: 'Duotone', hint: 'Two tones of the same colour' },
]);

export const BACKDROP_DEFAULT = 'pool';
/** How far the gradient travels from the base colour. The baker's dial; 0 is indistinguishable from flat. */
export const BACKDROP_STRENGTH_DEFAULT = 0.55;

/**
 * Move a hex towards white (`d` > 0) or black (`d` < 0), by mixing in RGB.
 *
 * ⚠️ NOT BY DROPPING LIGHTNESS IN HSL, WHICH TURNS CREAM ORANGE. HSL keeps saturation while it
 * takes lightness away, and a pale warm ground has enough of it that the hue comes screaming out
 * of the shadows: Cream (#FBF3E7) darkened that way gives **#e2a953**, a strong amber, for a
 * backdrop that is supposed to be the same colour a shade deeper. Mixing towards black desaturates
 * on the way down, which is what a shadow actually does.
 *
 * ⚠️ AND IT KEEPS SOME TRAVEL AT BOTH ENDS. A ground already near an end has little room in that
 * direction — physically right, and it would leave the gradient invisible on exactly the two
 * grounds a baker reaches for when they want drama. So the mix is mostly proportional to the room
 * available, with a floor under it.
 */
export function shade(hex, d) {
  const [r, g, b] = hexToRgb(hex);
  const [, , l] = rgbToHsl(r, g, b);
  const up = d >= 0;
  const room = up ? (1 - l) : l;
  const amount = Math.min(1, Math.abs(d) * (0.32 + 0.68 * room));
  const t = up ? 255 : 0;
  const mix = (c) => Math.round(c + (t - c) * amount);
  return rgbToHex(mix(r), mix(g), mix(b));
}

/** Rotate a hex's hue by `deg`, for the two-tone look. */
export function hueShift(hex, deg) {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb((h + deg + 360) % 360, s, l);
  return rgbToHex(nr, ng, nb);
}

/**
 * What a look is, as data — so the arithmetic is testable without a canvas.
 *
 * `centre` is in 0…1 of the frame. The pool sits ABOVE the middle because the cake does: the fit
 * aims below the cake to lift it in frame (see photoAngles), so a glow centred on the frame would
 * sit behind the board rather than behind the cake.
 */
export function backdropPlan(base, look = BACKDROP_DEFAULT, strength = BACKDROP_STRENGTH_DEFAULT) {
  const k = Math.min(1, Math.max(0, Number(strength) || 0));
  const safe = /^#?[0-9a-f]{6}$/i.test(base ?? '') ? base : '#ffffff';
  if (look === 'flat' || k === 0) return { kind: 'flat', base: safe, stops: [{ at: 0, color: safe }] };

  if (look === 'sweep') {
    return { kind: 'linear', base: safe, centre: { x: 0.5, y: 0 },
      stops: [
        { at: 0,    color: shade(safe,  0.55 * k) },
        { at: 0.55, color: safe },
        { at: 1,    color: shade(safe, -0.60 * k) },
      ] };
  }
  if (look === 'duo') {
    return { kind: 'linear', base: safe, centre: { x: 0.5, y: 0 },
      stops: [
        { at: 0, color: shade(hueShift(safe, -18),  0.45 * k) },
        { at: 1, color: shade(hueShift(safe,  18), -0.55 * k) },
      ] };
  }
  // pool — a glow behind the cake, falling off to the corners
  return { kind: 'radial', base: safe, centre: { x: 0.5, y: 0.42 },
    stops: [
      { at: 0,    color: shade(safe,  0.60 * k) },
      { at: 0.45, color: safe },
      { at: 1,    color: shade(safe, -0.65 * k) },
    ] };
}

/**
 * Paint a plan onto a 2D context the size of the frame.
 *
 * ⚠️ THE RADIAL IS SIZED OFF THE DIAGONAL, not the width. Sized off the width it stops short of the
 * corners on a 9:16 frame and leaves two hard bands across the top and bottom — the pool has to
 * reach every corner or its own edge becomes the thing you notice.
 */
export function paintBackdrop(ctx, w, h, plan) {
  if (!ctx || !(w > 0) || !(h > 0) || !plan) return;
  if (plan.kind === 'flat') { ctx.fillStyle = plan.base; ctx.fillRect(0, 0, w, h); return; }
  const cx = plan.centre.x * w, cy = plan.centre.y * h;
  let g;
  if (plan.kind === 'radial') {
    const reach = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
  } else {
    g = ctx.createLinearGradient(0, 0, 0, h);
  }
  for (const s of plan.stops) g.addColorStop(Math.min(1, Math.max(0, s.at)), s.color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
