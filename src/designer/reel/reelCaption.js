/* ── The name on the reel ────────────────────────────────────────────────────────────────────────
 *
 * Every take carries one line of text: the bakery's own name if their plan includes `reel_branding`,
 * otherwise a quiet "made with Spattoo". A baker who HAS that entitlement can also turn the line off
 * entirely for a take — see captionText. See spattoo-docs/plans/reel-for-bakers.md.
 *
 * ── WHY IT IS BURNED INTO THE FRAMES AND NOT LEFT TO THE BAKER ───────────────────────────────────
 * The alternative was "download the video, add your name in Canva". Nobody does the second step at
 * 11pm, and the reel goes out unbranded — so the feature markets the cake and not the bakery, which
 * is the entire reason a baker would use it. One line, already there, is the difference between a
 * marketing tool and a toy.
 *
 * ── AND WHY THE FREE MARK IS NOT UGLY ───────────────────────────────────────────────────────────
 * "made with Spattoo" is set in the same face, the same size and the same restraint as a bakery's own
 * name. The temptation is to make it big enough to be annoying so people upgrade to remove it. That
 * trade is bad: the mark is only worth anything if bakers are WILLING to post the video, and an
 * eyesore gets cropped out or never published. A tasteful mark on a thousand posted reels beats a
 * loud one on fifty.
 *
 * ── ONE SOURCE OF GEOMETRY ──────────────────────────────────────────────────────────────────────
 * The panel shows a live 9:16 preview, and the promise is that what you see is what records. The
 * preview is a DOM overlay and the recording is canvas 2D — two completely different drawing systems
 * that must agree. So the position and size live HERE, as fractions of the frame's height, and both
 * sides derive from them. Hard-coding "50px" in the recorder and "1rem" in the preview is how they
 * drift, and the drift is invisible until a baker posts a reel whose name sits somewhere they never
 * saw.
 *
 * No DOM and no canvas in this module's exports beyond the ctx handed in, so it is all testable in
 * plain node.
 */

/* Fractions of the FRAME HEIGHT, not the width. Height is the stable dimension of a reel — 1920 on
 * every phone — and deriving from it means the preview at 498px tall and the take at 1920px tall
 * produce the same picture. */
export const CAPTION = {
  // How far the text's baseline sits above the bottom edge.
  //
  // ⚠️ NOT a decorative margin. Instagram lays its own furniture over the bottom of a reel — the
  // account row, the caption, the audio ticker — and the right edge carries the like/comment/share
  // column. Anything below about an eighth of the height is sitting underneath that chrome and is
  // simply not visible to a viewer, however good it looks in the preview here.
  bottomFrac: 0.145,
  // ~50px at 1920. Legible on a phone held at arm's length, and small enough to read as a signature
  // rather than a banner.
  sizeFrac: 0.026,
  weight: 600,
  // The app's face. Canvas silently substitutes a default if the font is not loaded — see
  // ensureCaptionFont, which is not optional.
  family: "'Quicksand', system-ui, sans-serif",
  // A signature is not a headline; the tracking is what keeps it quiet.
  trackingFrac: 0.045,   // of the font size
};

export const SPATTOO_MARK = 'made with Spattoo';

/* What the line says.
 *
 * `ownBranding` is the resolved `reel_branding` entitlement. `includeName` is the baker's own choice
 * in the record panel, and it only means anything to somebody who has that entitlement.
 *
 * ── WHY UNTICKING LEAVES THE FRAME BLANK RATHER THAN FALLING BACK TO OUR MARK ────────────────────
 * The obvious reading of "don't put my name on it" is "put the other thing on it", and it is wrong.
 * What the plan sells is the frame: a baker who has paid to keep our mark off does not want a switch
 * whose off position advertises us. And the reason anyone reaches for this is that the reel is going
 * somewhere their name should not be — a client's own account, a collaboration, a piece of Spattoo
 * marketing filmed from a real bakery's login. Every one of those wants NO name, not a different one.
 *
 * ⚠️ ORDER MATTERS, AND ENTITLEMENT IS CHECKED FIRST. Read the other way round, `includeName: false`
 * would clear "made with Spattoo" for a baker who never paid to remove it — the panel does not offer
 * them the control, but this function must not be the place where that is enforced. A UI is not an
 * entitlement check.
 *
 * A baker WITH the entitlement, WITH the box ticked, and with a blank bakery name still falls back to
 * the mark: a reel with nothing on it is worse than one carrying ours, and it is the case that
 * actually happens (the field is optional at signup). That is a fallback from an empty field, not a
 * choice anyone made — which is exactly why unticking has to mean something different from it.
 */
export function captionText({ bakeryName, ownBranding, includeName = true }) {
  if (!ownBranding) return SPATTOO_MARK;
  if (!includeName) return '';
  return (bakeryName ?? '').trim() || SPATTOO_MARK;
}

/* Perceived lightness of a hex colour, 0..1. sRGB luma coefficients: green dominates because eyes
 * are most sensitive to it, which is why a mid-green ground needs dark text where a mid-blue of the
 * same hex-arithmetic brightness would need light. */
export function luminanceOf(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return 1;                                  // unknown ground → assume light → dark text
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/* Ink on a light ground, chalk on a dark one.
 *
 * Neither is pure: #FFFFFF on near-black glares on an OLED phone and #000000 on cream reads as a
 * sticker someone pasted on. Both are pulled toward the ground they sit on, which is what makes the
 * text look printed rather than overlaid. */
export function captionColours(groundHex) {
  return luminanceOf(groundHex) > 0.55
    ? { fill: 'rgba(28, 34, 30, 0.78)', halo: 'rgba(255, 255, 255, 0.55)' }
    : { fill: 'rgba(255, 253, 250, 0.88)', halo: 'rgba(0, 0, 0, 0.45)' };
}

/* Canvas will draw in a fallback face without a word of complaint if Quicksand is not resident, so
 * the take would come out in Helvetica and nobody would know until it was posted. Awaited once,
 * before the first frame.
 *
 * Resolves rather than rejects when the font cannot load: a reel in the wrong face is a blemish, a
 * reel that failed to record is a lost cake. */
export async function ensureCaptionFont(px, fonts = typeof document !== 'undefined' ? document.fonts : null) {
  if (!fonts?.load) return false;
  try {
    await fonts.load(`${CAPTION.weight} ${Math.round(px)}px Quicksand`);
    await fonts.ready;
    return true;
  } catch {
    return false;
  }
}

/* Draw the line onto a 2D context sized `width` × `height`.
 *
 * Centred horizontally: bottom-LEFT is where Instagram puts the poster's own account name, and a
 * second name in the same corner reads as a mistake.
 */
export function drawCaption(ctx, { text, width, height, ground }) {
  if (!ctx || !text) return;
  const size = height * CAPTION.sizeFrac;
  const { fill, halo } = captionColours(ground);

  ctx.save();
  ctx.font = `${CAPTION.weight} ${size}px ${CAPTION.family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Chrome 99+/Safari 17.4+. Older engines ignore the property rather than throwing, so the text is
  // merely tighter there — a degradation nobody will notice, and not worth measuring glyphs by hand
  // to polyfill.
  try { ctx.letterSpacing = `${size * CAPTION.trackingFrac}px`; } catch { /* not supported */ }

  // A soft halo rather than a hard drop shadow. The text usually sits on the flat ground, where it
  // does nothing — but a tall cake on a short frame can reach it, and without this the name
  // disappears into the frosting for exactly the few frames the camera is closest.
  ctx.shadowColor = halo;
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = fill;
  ctx.fillText(text, width / 2, height * (1 - CAPTION.bottomFrac));
  ctx.restore();
}
