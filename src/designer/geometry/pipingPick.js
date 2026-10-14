/* ── Which piping layer a click on the CAKE BODY meant ───────────────────────────────────────────
 *
 * Each ring renders its own clickable shell and reports its own `layerId`, so a click that lands ON
 * a ring is never ambiguous. This is the other case: a click on the tier's body near the rim or the
 * foot, where the baker was plainly reaching for a border but did not hit one.
 *
 * ⚠️ IT USED TO ANSWER `tops[0]` — the first layer on the rim, whichever one was clicked. With a
 * single layer that is the only possible answer and it was right for years. With TWO it is a
 * coin-flip dressed as a decision, and the loser is unreachable: Sandeep, on a cake wearing a drip
 * and a ring of chocolate balls on the same rim — *"when chocolate ball is on chocolate drip,
 * chocolate ball is loosing its pointer. when i click on chocolate ball, drip popup opens."* The
 * drip was added first, so the drip won every time.
 *
 * ⚠️ SO IT DECLINES TO GUESS. One layer is unambiguous and still opens. Several is genuinely
 * ambiguous from a body click, and the honest answer is to let the click mean what it would mean
 * with no border there at all — select the tier — rather than to hand the baker a card they did not
 * ask for and hide the one they did. A click on either ring itself still opens that ring.
 *
 * Deliberately NOT nearest-by-radius: a ring's drawn radius is `-reach + extraRadialOffset +
 * userRadialOffset` clamped, computed inside the ring renderer from geometry this function does not
 * have. Reproducing that here to break a tie would be a second copy of the layout maths, and the
 * one that drifts is whichever is edited second.
 */

/* `y` is the click's world height; `topY` and `yBase` bound the tier. The band is a quarter of the
   tier's height at each end, which is the rule this replaces, kept exactly. */
export function pipingLayerAtClick({ tops = [], bottoms = [], y, topY, yBase, height }) {
  const band = height * 0.25;
  if (tops.length && y > topY - band) {
    return tops.length === 1 ? { zone: 'rim', layerId: tops[0].layerId } : null;
  }
  if (bottoms.length && y < yBase + band) {
    return bottoms.length === 1 ? { zone: 'board', layerId: bottoms[0].layerId } : null;
  }
  return null;
}
