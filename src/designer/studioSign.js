/* ── The bakery's name, painted on the studio wall ───────────────────────────────────────────────
 *
 * Sandeep, 2026-10-29: *"i want the baker name to appear on the wall."* A studio with the bakery's
 * name behind the counter is a bakery; one without it is a render.
 *
 * ⚠️ IT IS DRAWN WITH THE BAKER'S OWN FACE, NOT A BUNDLED SUBSTITUTE, and that is why it is a
 * texture rather than 3D text. `brandFontCss` offers seven faces from flowing script to modern
 * sans, and it is the one reader the app header, the settings preview and the storefront all use —
 * three surfaces that cannot disagree about one stored key. A `<Text>` in the canvas would need a
 * font FILE, the canvas bundles exactly one (NotoSans), and the result would be the same bakery in
 * two different typefaces forty pixels apart. So the name is painted into a 2D canvas with the CSS
 * font the header is already using, and that canvas becomes the map. One function decides what the
 * name looks like, which is INVARIANTS #15 applied to type instead of to colour.
 *
 * ⚠️ THE CALLER WAITS FOR THE FONT. `document.fonts.load` has to have resolved before the paint, or
 * the browser silently substitutes the fallback in the CSS stack — Pacifico becomes cursive, the
 * sign reads wrong, and nothing errors. `signFontSpec` is the string that wait needs.
 *
 * ⚠️ TRANSPARENT, SO THE WALL SHOWS THROUGH. A sign with a background is a board hung on the wall;
 * this is lettering painted on it, so the grid lines run behind the strokes exactly as they run
 * behind everything else on that plane.
 */

/** Pixels per world unit. The sign is a texture on a plane, so this sets how crisp it is up close.
 *  256 keeps a 6-unit-wide sign at 1536px, which is sharp on a 3x phone and still a small upload. */
export const SIGN_PX_PER_UNIT = 256;

/** How much of the wall's width the name may take before it is scaled down to fit. */
export const SIGN_WIDTH_FRACTION = 0.42;

/**
 * The `font` shorthand for a sign, e.g. `600 180px 'Pacifico', cursive`.
 * Also what `document.fonts.load` must be given before painting — the size matters to that call.
 */
export function signFontSpec(cssFamily, px) {
  return `600 ${Math.round(px)}px ${cssFamily}`;
}

/**
 * Paint the name and report the plane to put it on.
 *
 * `makeCanvas(w, h)` is passed in so this can be asked without a DOM (the same shape `baseColourOf`
 * uses). Returns `{ canvas, width, height }` in WORLD units, or null when there is no name — an
 * empty bakery name must leave the wall bare rather than draw an empty box.
 */
export function paintSign({ name, cssFamily, colour, wallWidth, makeCanvas, measureOnly = false }) {
  const text = String(name ?? '').trim();
  if (!text) return null;

  /* Height first: a sign is sized by how tall the letters are, and the width follows the name.
     A long bakery name then shrinks to fit rather than running off the end of the wall. */
  /* ⚠️ SIZED FOR THE SLIVER OF WALL THAT IS ACTUALLY IN SHOT, not for the wall. Only y = 0..2.95
     of a 6-unit wall is ever in frame, so a name set "about half a tier" tall overflowed the top of
     the canvas and arrived cropped. A third of a tier reads as signage behind the counter rather
     than as a banner across the room. */
  const capHeight = 0.40;                       // world units
  const px = capHeight * SIGN_PX_PER_UNIT;

  const probe = makeCanvas(8, 8);
  const pctx = probe.getContext('2d');
  if (!pctx) return null;
  pctx.font = signFontSpec(cssFamily, px);
  const measured = pctx.measureText(text).width / SIGN_PX_PER_UNIT;

  const maxW = wallWidth * SIGN_WIDTH_FRACTION;
  const scale = measured > maxW ? maxW / measured : 1;
  const width = measured * scale;
  const height = capHeight * 1.6 * scale;       // room for descenders and a script's flourishes
  if (measureOnly) return { canvas: null, width, height, scale };

  const cw = Math.max(2, Math.round(width * SIGN_PX_PER_UNIT));
  const ch = Math.max(2, Math.round(height * SIGN_PX_PER_UNIT));
  const cv = makeCanvas(cw, ch);
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, cw, ch);
  ctx.font = signFontSpec(cssFamily, px * scale);
  ctx.fillStyle = colour;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cw / 2, ch / 2);
  return { canvas: cv, width, height, scale };
}
