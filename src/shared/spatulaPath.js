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
 * @param noseHalf  how far out the nose's first control point reaches. NOT a tip radius — see the
 *                  warning below about why a radius is the wrong model for this end.
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
  noseHalf = null, gripHalf = handleHalf, gripY = null, neckHalf = handleHalf,
}) {
  const cx = W / 2;
  const nHalf = Math.min(neckHalf, handleHalf);
  const gHalf = Math.max(gripHalf, 1);
  const Ln = cx - nHalf,  Rn = cx + nHalf;     // at the blade's shoulder — the handle's thinnest
  const Lg = cx - gHalf,  Rg = cx + gHalf;     // the grip, the handle's widest
  const Lb = cx - bladeHalf,  Rb = cx + bladeHalf;
  const rEdgeBotY = bladeBotY - rCornerH, flatR = Rb - rCornerW;
  const lEdgeBotY = bladeBotY - lCornerH, flatL = Lb + lCornerW;
  const rSh = bladeFullY - rShoulderY;
  const lSh = bladeFullY - lShoulderY;
  const shaped = noseHalf != null && gripY != null;

  /* ── The nose ────────────────────────────────────────────────────────────────────────────────
   * ⚠️ NOT AN ARC, AND THAT IS THE WHOLE POINT. The first version capped the grip with a
   * semicircle and ran a cubic off it. The tangents matched, so it passed every check — but a
   * circle has CONSTANT curvature (1/r) and the cubic leaves with almost none, and a curvature
   * discontinuity is visible even when the outline is technically smooth. Sandeep: *"tip is very
   * bad. it suddenly started to bend. why dont you see the reference image. its seeless curve."*
   *
   * A radius is also the wrong MODEL. Measured off the photo, its nose goes from nothing to full
   * width over ~100px while the grip is only 65px across — an ellipse about 1:2.2, elongated. A
   * semicircle rounds over exactly its own half-width, so it can never be that shape at any radius.
   *
   * So the whole top is ONE cubic per side, apex to grip, fitted to the photo: control points at
   * `noseHalf` out along the apex's horizontal tangent, and at full width `NOSE_C2` of the way
   * down. Fitted against fourteen measured rows, RMS 0.68px. It widens fast and then approaches
   * full width asymptotically, which is what reads as seamless — and because it arrives at the
   * grip with its curvature already near zero, the neck curve below picks it up without a join. */
  const NOSE_C2 = 0.061;
  const noseLen = shaped ? gripY - capTopY : 0;
  const c2y = capTopY + noseLen * NOSE_C2;
  const noseDown = `C ${cx + noseHalf} ${capTopY} ${Rg} ${c2y} ${Rg} ${gripY}`;
  const noseUp   = `C ${Lg} ${c2y} ${cx - noseHalf} ${capTopY} ${cx} ${capTopY}`;
  /* Grip down to the neck. Control points at 0.45 / 0.72 keep it leaving the grip and arriving at
     the shoulder near-vertically, so neither end shows a corner. */
  const neckDown = (shY) => `C ${Rg} ${gripY + (shY - gripY) * 0.45} ${Rn} ${gripY + (shY - gripY) * 0.72} ${Rn} ${shY}`;
  const neckUp   = (shY) => `C ${Ln} ${gripY + (shY - gripY) * 0.72} ${Lg} ${gripY + (shY - gripY) * 0.45} ${Lg} ${gripY}`;

  /* The parallel bar this drew before any of the above existed: a semicircular cap on a
     constant-width handle. Kept exactly, so a caller that passes no nose is untouched. */
  const capR = handleHalf, capCY = capTopY + capR;
  const plainDown = `A ${capR} ${capR} 0 0 1 ${cx + handleHalf} ${capCY}`;
  const plainUp   = `A ${capR} ${capR} 0 0 1 ${cx} ${capTopY}`;

  return [
    `M ${cx} ${capTopY}`,
    shaped ? noseDown : plainDown,
    shaped ? neckDown(rShoulderY) : `L ${cx + handleHalf} ${rShoulderY}`,
    `C ${shaped ? Rn : cx + handleHalf} ${rShoulderY + rSh * 0.5} ${Rb} ${bladeFullY - rSh * 0.5} ${Rb} ${bladeFullY}`,
    `L ${Rb} ${rEdgeBotY}`,
    `C ${Rb} ${bladeBotY} ${flatR + (Rb - flatR) * 0.45} ${bladeBotY} ${flatR} ${bladeBotY}`,
    `L ${flatL} ${bladeBotY}`,
    `C ${flatL - (flatL - Lb) * 0.45} ${bladeBotY} ${Lb} ${bladeBotY} ${Lb} ${lEdgeBotY}`,
    `L ${Lb} ${bladeFullY}`,
    `C ${Lb} ${bladeFullY - lSh * 0.5} ${shaped ? Ln : cx - handleHalf} ${lShoulderY + lSh * 0.5} ${shaped ? Ln : cx - handleHalf} ${lShoulderY}`,
    shaped ? neckUp(lShoulderY) : `L ${cx - handleHalf} ${capCY}`,
    shaped ? noseUp : plainUp,
    'Z',
  ].join(' ');
}
