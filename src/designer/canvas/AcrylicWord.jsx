import React, { useMemo } from 'react';
import * as THREE from 'three';
import { topperShapes, components, bridgeLoose } from '../geometry/topperShape.js';
import { topperFinish } from '../geometry/topperFinishes.js';

/* ── A word cut from one sheet of acrylic ────────────────────────────────────────────────────────
 *
 * ONE renderer for both places a topper goes, because they are one object:
 *
 *   stand   upright on the cake top, on prongs pushed into the icing
 *   flat    against the side wall, lying in a plane
 *
 * ⚠️ FLAT MEANS FLAT, and the standoff is the look — not a defect to design around.
 *
 * A rigid sheet cannot follow a round wall. Measured: an 80mm name on a 6-inch cake stands 11mm off
 * the icing at its ends. I took that as a reason side lettering had to be separate per-letter pieces,
 * and it is not — every real one is a single connected piece whose ends lift, and the shadow under
 * that lift is doing half the work in the photographs. So the piece is mounted on the plane TANGENT
 * at its anchor: the middle touches, the ends rise on their own out of the geometry, and it casts a
 * shadow. Pressed flat against the wall it would read as a sticker.
 *
 * The difference between the two poses is a pose and a set of legs, nothing more — same geometry,
 * same fit, same finish. Reached by a `pose` key, never by which zone asked.
 */
export default function AcrylicWord({
  font, text, cfg = {}, finish = 'gold', pose = 'stand', mount = {}, span = 1.76, castShadow = true,
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
    const seat = standing
      ? (t.legs.length ? lowest + Math.min(cfg.bury ?? 0.21, cfg.legLen ?? 0.42) : t.baselineY)
      : 0;

    return { geos, seat, thickness, pieces: components(parts).length, width: t.width, feature: t.feature };
  }, [font, text, cfg, pose, span]);

  if (!built) return null;
  const f = topperFinish(finish);
  const mat = (
    <meshStandardMaterial color={f.color} metalness={f.metalness}
                          roughness={f.roughness} envMapIntensity={f.envIntensity ?? 1} />
  );

  if (pose === 'stand') {
    const { topY = 0 } = mount;
    return (
      <group position={[mount.x ?? 0, topY - built.seat, mount.z ?? 0]} rotation={[0, mount.yaw ?? 0, 0]}>
        {built.geos.map((g, i) => <mesh key={i} geometry={g} castShadow={castShadow}>{mat}</mesh>)}
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
