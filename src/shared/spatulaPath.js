// ── The spatula silhouette ──────────────────────────────────────────────────────────────────────
//
// THE one outline of the rail's spatula. The rail draws it, `dev/spatula-menu.html` tunes it, and
// `dev/logo-placement.html` positions the logo against it.
//
// ⚠️ IT LIVED IN THREE PLACES AND THAT IS WHY IT IS A FILE NOW. `CakeDesigner.jsx` had the shipped
// one, `dev/spatula-menu.jsx` had its own `spatulaPath`, and `dev/logo-placement.html` opens with
// "ported verbatim from CakeDesigner.jsx". A tuner holding a copy of the shape it tunes is the
// drift INVARIANTS #15 is about: the sliders move a curve nobody ships, and the rail keeps whatever
// was last pasted across. CLAUDE.md states it for studios — "THE STUDIO IMPORTS THE GEOMETRY, IT
// DOES NOT CARRY A COPY OF IT".
//
// ⚠️ A LEAF MODULE ON PURPOSE, same reason `creamMaterial.js` is one: it imports nothing, so a
// harness can pull the outline in without pulling a scene, a theme or an API client behind it.
//
// ── Why the handle is not as thin as a real spatula's ───────────────────────────────────────────
// Because the nav labels sit ON it. Measured on the live rail: the labels are centred on the
// column and the widest, "Decorations", is 54.9px (then "Chef's Desk" 52.4, "Dashboard" 49.8), so
// the paint has to stay at least ~55px wide for the whole label band or four labels hang off the
// dark shape onto the page. `handleHalf` 30 is that number with 3px to spare, and it is the reason
// this silhouette can never reach the reference photo's blade-to-handle ratio of 4.5:1.
// `tipHalf` is the part that CAN be thin: above the first label there is nothing but paint.

/**
 * Build the spatula outline.
 *
 * Handle runs from `capTopY` (the grip tip) down to the shoulders; the blade is at the bottom.
 *
 * @param tipHalf   half-width at the very end of the grip, where it rounds off.
 * @param gripHalf  the handle's WIDEST point, at `gripY`. The reference photo's handle is 65px at
 *                  the grip and 36px at the neck — it swells towards the hand. Sandeep: *"there is
 *                  elevation on the bottom part."*
 * @param neckHalf  half-width where the handle meets the blade's shoulder — the THINNEST part of
 *                  the handle, not the thickest. Getting this backwards (tapering towards the tip
 *                  instead) produced a bottle, which is the first thing tried here and rejected.
 *
 * All three default to `handleHalf`, which is the parallel bar this drew before any of it existed.
 *
 * ⚠️ HOW FAR THE SWELL CAN GO IS SET BY THE NAV LABELS, NOT BY THE PHOTO. They are centred on this
 * shape, so the paint under each has to be at least as wide as the label. Measured: "Decorations"
 * needs 27.4 half-width at y=157 and "Customers" 24.1 at y=478 — so the handle cannot neck down to
 * the reference's 26%-of-blade anywhere a label sits. `spatulaPath.test.js` holds every number.
 */
export function spatulaFramePath({
  W, handleHalf, bladeHalf, capTopY,
  lShoulderY, rShoulderY, bladeFullY, bladeBotY,
  lCornerH, lCornerW, rCornerH, rCornerW,
  tipHalf = handleHalf, gripHalf = handleHalf, gripY = null, neckHalf = handleHalf,
}) {
  const cx = W / 2;
  const tHalf = Math.min(tipHalf, handleHalf);
  const capR = tHalf;
  const capCY = capTopY + capR;
  const nHalf = Math.min(neckHalf, handleHalf);
  const Ln = cx - nHalf,  Rn = cx + nHalf;     // at the blade's shoulder — the handle's thinnest
  const Lg = cx - Math.max(tipHalf, gripHalf), Rg = cx + Math.max(tipHalf, gripHalf);
  const Lt = cx - tHalf,  Rt = cx + tHalf;
  const Lb = cx - bladeHalf,  Rb = cx + bladeHalf;
  const rEdgeBotY = bladeBotY - rCornerH, flatR = Rb - rCornerW;
  const lEdgeBotY = bladeBotY - lCornerH, flatL = Lb + lCornerW;
  const rSh = bladeFullY - rShoulderY;
  const lSh = bladeFullY - lShoulderY;
  /* The taper out of the tip. A cubic rather than a straight bevel: a real handle swells out of its
     grip, and a straight line from tip to full width reads as a wedge — which is the "curved edges"
     Sandeep was describing, just at a different angle. Control points sit at 55%/85% so the curve
     leaves the tip almost vertically and arrives at full width almost vertically too, which is what
     makes it read as a rod rather than a cone. */
  /* ── The handle's profile ────────────────────────────────────────────────────────────────────
   * Three points, two cubics: a rounded tip, a swell out to `gripHalf` at `gripY`, then a long
   * gentle narrowing into `neckHalf` where the blade's shoulder takes over. That is the reference
   * photo's handle, measured off it row by row — widest in the hand, thinnest at the blade.
   * Control points keep each curve leaving and arriving near-vertically, so neither join shows as
   * a corner; a straight bevel between the three reads as a faceted cone. */
  const gHalf = Math.max(tHalf, gripHalf);
  const gY = gripY ?? capCY;
  const shaped = gHalf !== nHalf || tHalf !== gHalf;
  const swellDown = (xt, xg) => `C ${xt} ${capCY + (gY - capCY) * 0.55} ${xg} ${capCY + (gY - capCY) * 0.86} ${xg} ${gY}`;
  const swellUp   = (xt, xg) => `C ${xg} ${capCY + (gY - capCY) * 0.86} ${xt} ${capCY + (gY - capCY) * 0.55} ${xt} ${capCY}`;
  const neckDown  = (xg, xn, shY) => `C ${xg} ${gY + (shY - gY) * 0.45} ${xn} ${gY + (shY - gY) * 0.72} ${xn} ${shY}`;
  const neckUp    = (xn, xg, shY) => `C ${xn} ${gY + (shY - gY) * 0.72} ${xg} ${gY + (shY - gY) * 0.45} ${xg} ${gY}`;
  return [
    `M ${cx} ${capTopY}`,
    `A ${capR} ${capR} 0 0 1 ${Rt} ${capCY}`,
    shaped ? swellDown(Rt, Rg) : `L ${Rg} ${capCY}`,
    shaped ? neckDown(Rg, Rn, rShoulderY) : `L ${Rn} ${rShoulderY}`,
    `C ${Rn} ${rShoulderY + rSh * 0.5} ${Rb} ${bladeFullY - rSh * 0.5} ${Rb} ${bladeFullY}`,
    `L ${Rb} ${rEdgeBotY}`,
    `C ${Rb} ${bladeBotY} ${flatR + (Rb - flatR) * 0.45} ${bladeBotY} ${flatR} ${bladeBotY}`,
    `L ${flatL} ${bladeBotY}`,
    `C ${flatL - (flatL - Lb) * 0.45} ${bladeBotY} ${Lb} ${bladeBotY} ${Lb} ${lEdgeBotY}`,
    `L ${Lb} ${bladeFullY}`,
    `C ${Lb} ${bladeFullY - lSh * 0.5} ${Ln} ${lShoulderY + lSh * 0.5} ${Ln} ${lShoulderY}`,
    shaped ? neckUp(Ln, Lg, lShoulderY) : `L ${Ln} ${capCY}`,
    shaped ? swellUp(Lt, Lg) : '',
    `A ${capR} ${capR} 0 0 1 ${cx} ${capTopY}`,
    'Z',
  ].join(' ');
}
