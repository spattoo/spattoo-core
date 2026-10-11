import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { topperShapes, components, bridgeLoose } from '../geometry/topperShape.js';
import { drawTopperMatcap } from '../geometry/topperMatcap.js';
import { buildSolidWallMaterial } from '../geometry/solidFinishes.js';
import { FONDANT_WRITING_COLOR } from '../constants.js';
import { albedoForLight } from '../shared/albedoForLight.js';

/* ⚠️ MEASURED FOR FONDANT LETTERING, and it is NOT inherited from anything. `buildSolidWallMaterial`
 * takes its colour raw — correct for a relief cut-out's side walls, which were calibrated as part of
 * the print's own exposure model — but a letter standing in the open on a cake wall is a different
 * surface, and a reference light belongs to the surface (INVARIANTS #16). Uncorrected, a mid-grey
 * #808080 rendered 193,189,189 here: a chosen deep rose came back as a pale pink, and a saturated
 * teal lost 105 points on red.
 *
 * Solved the way the recipe in shared/albedoForLight.js asks for: a divisor swept with mid-grey
 * pre-corrected (1.0 → 193, 2.2 → 147, 2.8 → 132, 4.0 → 112) and the two readings that straddle 128
 * interpolated, rather than one division — which overshoots, because the pipeline is not a pure
 * multiply end to end. `scripts/measure-fondant-letters.mjs` prints the table; re-run it after any
 * change to the HDRI, the scene intensity, or SOLID_FINISHES.fondant. */
export const FONDANT_REFERENCE_LIGHT = [3.033, 2.813, 2.791];
/* ⚠️ SWEPT ON THE PALETTE, NOT ON GREY (INVARIANTS #16). Six real colours — two pinks, a teal, a
 * green, a blush and a dark chocolate — mean absolute error per channel then worst channel:
 * 1.5 → 16.8/63, 2.0 → 13.8/54, 2.5 → 12.1/47, 3.0 → 11.5/42, 3.5 → 11.1/38, 4.5 → 11.7/34.
 * 3.5 is the knee: the best mean, with the worst channel still improving. Past it the trade reverses
 * — 4.5 buys 4 points of worst case by taking the mean back up and pulling a pale blush from −17 to
 * −21 on red, because a higher rolloff means LESS correction exactly where pale colours live.
 * ⚠️ AND MY FIRST SWEEP OF THIS WAS WORTHLESS: it passed pre-corrected colours to the harness while
 * the renderer was already correcting, so every reading was corrected twice and the "best" rolloff
 * was whichever least compounded the error. Vary the constant, not the input. */
export const FONDANT_ROLLOFF = 3.5;

/* ── A word cut from one sheet ───────────────────────────────────────────────────────────────────
 *
 * ONE renderer for every place a topper goes, because they are one object.
 *
 * ⚠️ THE SHEET IS ACRYLIC *OR* FONDANT, and the name of this file is historical. `medium` picks the
 * material and nothing else: a fondant letter is cut from rolled paste with the same cutters, in the
 * same outline faces, standing on the same prongs or lying on the same flat — so the geometry, the
 * fit, the poses and the legs are all literally the same object. Forking a `FondantWord` would have
 * copied 100 lines of build to change a `<material>`, which is rule 1 with the serial numbers filed
 * off. Not renamed because `AcrylicWord` is exported from src/index.js and admin imports it.
 *
 * ⚠️ FLAT MEANS FLAT AGAINST THE WALL, and the standoff is the look — not a defect to design around.
 *
 * A rigid sheet cannot follow a round wall. Measured: an 80mm name on a 6-inch cake stands 11mm off
 * the icing at its ends. I took that as a reason side lettering had to be separate per-letter pieces,
 * and it is not — every real one is a single connected piece whose ends lift, and the shadow under
 * that lift is doing half the work in the photographs. So the piece is mounted on the plane TANGENT
 * at its anchor: the middle touches, the ends rise on their own out of the geometry, and it casts a
 * shadow. Pressed flat against the wall it would read as a sticker.
 *
 * The difference between the poses is a pose and a set of legs, nothing more — same geometry, same
 * fit, same finish. Reached by a `pose` key, never by which zone asked.
 *
 *   stand   upright on legs pushed into a surface        — the cake top
 *   flat    upright against a wall, tangent at its anchor — the side
 *   lay     lying face-up on a horizontal surface        — the board
 *
 * ⚠️ `stand` and `flat` are BOTH UPRIGHT. That is easy to misread as "standing vs lying" and it is
 * not: `flat` describes the sheet being flat against a wall, not the word being flat on the ground.
 * Missing that is how the board — which has nothing to lean on — ended up asking for `stand`, and
 * `stand` grows prongs.
 */
export default function AcrylicWord({
  font, text, cfg = {}, finish = 'gold', pose = 'stand', mount = {}, span = 1.76, castShadow = true,
  /* 'acrylic' (a baked matcap, see below) | 'fondant' (a lit physical material with the fondant
     grain). Default acrylic, so every existing caller — admin's studio included — is untouched. */
  medium = 'acrylic', color = FONDANT_WRITING_COLOR,
  onRise,
}) {
  const built = useMemo(() => {
    if (!font || !text?.trim()) return null;

    // Two builds: one at height 1 to learn the aspect, then the real one at the height that makes
    // the word span what it was asked to span. `capHeight` and `feature` scale linearly with height,
    // so the probe answers the bar thickness too and there is no cycle.
    const probeOpts = {
      height: 1, weight: cfg.weight ?? 0, stroke: cfg.stroke ?? 0.12,
      tracking: cfg.tracking ?? 0, lineGap: cfg.lineGap ?? 1.2,
      maxLines: cfg.maxLines ?? 3, fitAspect: cfg.fitAspect ?? 28,
    };
    const probe = topperShapes(font, text, probeOpts);
    if (!probe.width) return null;
    const height = span / probe.width;

    // ⚠️ Legs and a base bar belong to STANDING. A flat piece has nothing to stand on and nothing to
    // push into — a bar lying against the wall is a stripe under the word, and prongs point at the
    // customer. Config-gated on the pose, so a zone name is never consulted.
    const standing = pose === 'stand';
    const t = topperShapes(font, text, {
      ...probeOpts,
      height,
      baseline: standing && cfg.bar ? { thickness: probe.capHeight * height * (cfg.barRatio ?? 0.13) } : null,
      legs: standing && cfg.legs > 0 ? { count: cfg.legs, length: cfg.legLen ?? 0.42 } : null,
    });
    if (!t.parts?.length) return null;

    const bridges = cfg.bridge === false ? [] : bridgeLoose(t.parts, { width: height * 0.022 });
    const parts = [...t.parts, ...bridges];
    const thickness = cfg.thickness ?? 0.063;

    // One merged geometry — the whole point of the object is that it IS one piece, and the studio
    // has already refused to save anything that is not.
    const geos = parts.map(p => {
      const shape = new THREE.Shape(p.outer.map(q => new THREE.Vector2(q.x, q.y)));
      shape.holes = (p.holes ?? []).map(h => new THREE.Path(h.map(q => new THREE.Vector2(q.x, q.y))));
      /* ⚠️ FLAT ON PURPOSE — a chamfer was tried here and REVERTED, so do not add one back without
       * reading this. The reasoning for it was good and the measurement refused it: a flat face has
       * one normal, so it takes one sample of the matcap and the whole word moves together as the
       * cake turns, which is exactly what was reported. A bevel gives it a spread of normals and
       * should have held a highlight through the turn.
       *
       * It does not. Measured across seven angles, chamfered against flat:
       *     brightness spread across angles   28.3  vs  28.3   (the "changes as a block" symptom)
       *     contrast within the piece        0.595  vs  0.605
       * Identical, and fractionally worse. A matcap is sampled by the normal in VIEW space, and the
       * chamfer's own normals turn with the piece, so they slide across the same picture together
       * with the face — the geometry moved but nothing gained a light the face did not have.
       *
       * ⚠️ AND THE SYMPTOM IS STILL THERE. It is inherent to a flat face reading a baked picture:
       * mean 111 at one edge of the turn, 196 head-on. Fixing THAT needs a surface that responds to
       * the scene, which is what the matcap deliberately gave up. It is a trade, not a bug. */
      const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
      g.translate(0, 0, -thickness / 2);
      return g;
    });

    // Where the object meets the cake, in its own coordinates.
    //   standing  the bottom of the legs, sunk by `bury` — the prongs are the stand, and seating it
    //             on the bar buries them completely and reads as glued down
    //   flat      the middle of the word, so it is centred on its anchor
    const lowest = Math.min(...parts.flatMap(p => p.outer.map(q => q.y)));
    const highest = Math.max(...parts.flatMap(p => p.outer.map(q => q.y)));
    const seat = standing
      ? (t.legs.length ? lowest + Math.min(cfg.bury ?? 0.21, cfg.legLen ?? 0.42) : t.baselineY)
      : 0;

    /* How far the piece rises above where it meets the cake — MEASURED, not a fraction of the span.
     * A one-line name and a three-line phrase at the same width are wildly different heights, so
     * anything that wants to cover this word (a grab plane, say) cannot guess it from the width.
     * The build is the only place that knows, and it already has the bounds. */
    return { geos, seat, thickness, pieces: components(parts).length, width: t.width,
             feature: t.feature, rise: Math.max(0.05, highest - seat) };
  }, [font, text, cfg, pose, span]);

  // Reported UP, because only the build can measure it and only the caller can use it — see `rise`.
  // In an effect rather than during render: this sets state in the parent, and doing that while
  // rendering a child is the loop React warns about.
  useEffect(() => { if (built) onRise?.(built.rise); }, [built, onRise]);

  /* Built per component and disposed with it. ⚠️ Deliberately NOT shared: a 128px canvas gradient is
     cheaper than the bookkeeping to share one, and the last shared GPU resource here was handed out
     after disposal and rendered black. Above the early return — a hook cannot sit under one. */
  const matcap = useMemo(() => {
    const t = new THREE.CanvasTexture(drawTopperMatcap(finish));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [finish]);
  useEffect(() => () => matcap.dispose(), [matcap]);

  /* ⚠️ FONDANT IS LIT, WHERE ACRYLIC IS BAKED — the opposite choice from the matcap below, and the
   * right one for the opposite reason. A matcap exists because a perspex topper's whole appearance
   * IS a stock reflection, and tying that to the scene coupled it to every other metal. Fondant has
   * no reflection to speak of: it is matte paste at roughness 0.97 whose look is its own colour, its
   * grain, and the shadow it sits in. Baking that would freeze the cake's light into the letters.
   *
   * ⚠️ AND IT IS THE SAME FONDANT AS EVERY OTHER FONDANT ON THE CAKE. `buildSolidWallMaterial` is
   * what a relief cut-out's walls already use (`SOLID_FINISHES.fondant` — roughness, env, and the
   * shared grain normal map), so a fondant letter and a fondant bow are the same surface by
   * construction rather than by two tables agreeing. Built here and disposed with the component, as
   * the matcap is: the factory clones the grain texture precisely so a caller can own it. */
  const fondantMat = useMemo(
    () => (medium === 'fondant'
      ? buildSolidWallMaterial('fondant',
          albedoForLight(color || FONDANT_WRITING_COLOR, FONDANT_REFERENCE_LIGHT, { rolloff: FONDANT_ROLLOFF }), 0)
      : null),
    [medium, color],
  );
  useEffect(() => () => {
    if (!fondantMat) return;
    fondantMat.normalMap?.dispose();
    fondantMat.dispose();
  }, [fondantMat]);

  if (!built) return null;
  /* ⚠️ MATCAP, NOT A LIT MATERIAL — the finish is baked, see `topperMatcap.js`. The topper never
   * reflected the cake, only a stock HDRI, and drawing from `scene.environment` coupled it to every
   * other metal: dimming the scene for the lettering turned the faux balls matte, and giving it its
   * own env map produced black toppers when the shared texture was disposed. A matcap needs neither
   * lights nor environment, so neither failure can recur.
   *
   * ⚠️ `topperFinish()` is no longer consulted HERE — metalness, roughness and envIntensity described
   * a lit material and this element no longer has one. The table still owns the finish LIST and its
   * labels, and `topperMatcap.js` keys off the same names, so adding a finish still means one entry
   * in each. Do not re-introduce a lit material to honour those numbers; they are the old model. */
  const mat = fondantMat
    ? <primitive object={fondantMat} attach="material" />
    : <meshMatcapMaterial matcap={matcap} />;

  if (pose === 'stand') {
    const { topY = 0 } = mount;
    return (
      <group position={[mount.x ?? 0, topY - built.seat, mount.z ?? 0]} rotation={[0, mount.yaw ?? 0, 0]}>
        {built.geos.map((g, i) => <mesh key={i} geometry={g} castShadow={castShadow}>{mat}</mesh>)}
      </group>
    );
  }

  /* LAY: the piece lying down ON a horizontal surface — a plaque set on the drum, face up.
   *
   * ⚠️ This is a THIRD pose, and its absence is what put prongs on the board. `stand` and `flat` are
   * both UPRIGHT — one on legs, one against a wall — so a board with nothing to lean on could only
   * be given `stand`, and `stand` means legs. There was no way to ask for this, not a wrong branch.
   *
   * The word is built in XY and extruded along Z, so lying it down is one turn of -90° about X: the
   * word's own "up" goes to -Z (reading away from the front of the cake, which is how a plaque on a
   * board faces) and its THICKNESS becomes height. Hence `+ thickness / 2` — the geometry is centred
   * on its extrusion, so without the lift half the sheet is under the drum.
   *
   * Yaw stays on the OUTER group. Rolled into the same rotation it would be applied in the tilted
   * frame and spin the word about its own face like a clock hand. */
  if (pose === 'lay') {
    const { topY = 0, x = 0, z = 0, yaw = 0 } = mount;
    return (
      <group position={[x, topY + built.thickness / 2, z]} rotation={[0, yaw, 0]}>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {built.geos.map((g, i) => <mesh key={i} geometry={g} castShadow={castShadow}>{mat}</mesh>)}
        </group>
      </group>
    );
  }

  /* Flat: the plane TANGENT to the wall at `theta`, pushed out by half the sheet so the face of the
   * acrylic touches the icing rather than sinking half of itself into it. Everything else — the
   * middle sitting close, the ends lifting — falls out of a flat plane against a round wall, which
   * is exactly what the real object does. `u` is for a faceted wall, where the caller has already
   * resolved the anchor and there is no curvature to speak of. */
  const { radius = 1, theta = 0, y = 0, x, z, yaw } = mount;
  const r = radius + built.thickness / 2;
  const px = x ?? r * Math.sin(theta);
  const pz = z ?? r * Math.cos(theta);
  return (
    <group position={[px, y, pz]} rotation={[0, yaw ?? theta, 0]}>
      {built.geos.map((g, i) => <mesh key={i} geometry={g} castShadow={castShadow}>{mat}</mesh>)}
    </group>
  );
}
