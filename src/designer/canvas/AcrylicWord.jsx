import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { topperShapes, components, bridgeLoose } from '../geometry/topperShape.js';
import { drawTopperMatcap } from '../geometry/topperMatcap.js';

/* ── A word cut from one sheet of acrylic ────────────────────────────────────────────────────────
 *
 * ONE renderer for every place a topper goes, because they are one object.
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
  const mat = <meshMatcapMaterial matcap={matcap} />;

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
