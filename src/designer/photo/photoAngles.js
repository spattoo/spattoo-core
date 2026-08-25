/* ── Where the camera stands ─────────────────────────────────────────────────────────────────────
 *
 * A one-tap shortcut, NOT a fixed set of shots. The baker drags the cake to frame it — that control
 * already exists and is the only one that can know which side of THIS cake has the name piped on it.
 * What these do is move the camera somewhere sensible so the dragging starts from a good place
 * instead of from wherever the last edit happened to leave it.
 *
 * ⚠️ Which is why they only set a DIRECTION and never a distance. The radius comes from where the
 * camera already is, so tapping an angle after pinching in keeps the framing the baker chose and
 * simply walks around the cake. A preset that also reset the zoom would undo half of their work
 * every time they tried the other side.
 *
 * ── THE ANGLES ARE NOT EVENLY SPACED, BECAUSE CAKES ARE NOT ─────────────────────────────────────
 * There is no "back": the back of a cake is the join, the smudge and the side the baker did last. A
 * tool that offers it will eventually have someone photograph one by accident.
 *
 * No three.js import — the maths is plain trigonometry, so this is testable in node.
 */

// three.js spherical convention: phi is measured DOWN from +Y (0 = directly overhead, 90 = level
// with the subject), theta is measured around from +Z toward +X. The designer's front is +Z — the
// same axis FrontMarker sits on — so theta 0 is face-on.
export const PHOTO_ANGLES = [
  {
    key: 'front', label: 'Front', theta: 0, phi: 78,
    // Slightly above level, not dead-on. A cake shot from exactly its own height loses the top
    // surface entirely, and the top is where the writing goes.
    hint: 'Face-on, a little above — shows the writing',
  },
  {
    key: 'three-quarter', label: 'Three-quarter', theta: 38, phi: 72,
    // The default for a reason: it is the only angle that shows the front, a side and the top at
    // once, so a tiered cake reads as an object rather than as a silhouette.
    hint: 'Front, side and top at once — the usual product shot',
  },
  {
    key: 'side', label: 'Side', theta: 90, phi: 80,
    hint: 'Straight on to the side — for a tall cake, or piping that runs round it',
  },
  {
    key: 'above', label: 'From above', theta: 24, phi: 26,
    // For the cakes whose whole design is on the lid: a single-tier with a scene piped on top is
    // almost invisible from any standing angle.
    hint: 'Looking down — for a cake decorated on top',
  },
];

export const DEFAULT_ANGLE = 'three-quarter';

export function angleByKey(key) {
  return PHOTO_ANGLES.find(a => a.key === key) ?? PHOTO_ANGLES.find(a => a.key === DEFAULT_ANGLE);
}

const RAD = Math.PI / 180;

/* Camera position for an angle, around `target` at `radius`.
 *
 * ⚠️ phi is CLAMPED off both poles. At phi 0 the camera sits exactly on the axis it is looking
 * down, the up-vector and the view direction become parallel, and the view matrix degenerates — the
 * picture flips or goes blank depending on the driver. OrbitControls guards its own dragging the
 * same way; a preset that jumps straight there would walk round it.
 */
export function anglePosition(target, radius, thetaDeg, phiDeg) {
  const t = { x: target?.x ?? 0, y: target?.y ?? 0, z: target?.z ?? 0 };
  const r = Number(radius) > 0 ? Number(radius) : 1;
  const phi = Math.min(174, Math.max(6, Number(phiDeg) || 0)) * RAD;
  const theta = (Number(thetaDeg) || 0) * RAD;
  const sinPhi = Math.sin(phi);
  return {
    x: t.x + r * sinPhi * Math.sin(theta),
    y: t.y + r * Math.cos(phi),
    z: t.z + r * sinPhi * Math.cos(theta),
  };
}

/* Which preset a camera position corresponds to, or null when the baker has dragged away from all
 * of them.
 *
 * ⚠️ Exists so the panel can STOP highlighting a preset the camera is no longer at. Presets that
 * stay lit after a drag claim the shot is the one they name, and the whole promise here is that the
 * preview is the truth — a lit "Front" over a three-quarter view is a small lie in the one place
 * this feature cannot afford one.
 *
 * The tolerance is deliberately loose: this answers "is the camera still essentially here", not
 * "did it move at all", and a hairline drag while reaching for a swatch should not blank the row.
 */
export function angleAt(target, position, tolDeg = 7) {
  const dx = (position?.x ?? 0) - (target?.x ?? 0);
  const dy = (position?.y ?? 0) - (target?.y ?? 0);
  const dz = (position?.z ?? 0) - (target?.z ?? 0);
  const r = Math.hypot(dx, dy, dz);
  if (r < 1e-6) return null;
  const phi = Math.acos(Math.min(1, Math.max(-1, dy / r))) / RAD;
  let theta = Math.atan2(dx, dz) / RAD;
  const near = (a, b) => {
    // Wrap: 359° and 1° are two degrees apart, not 358. The %360/+540/-180 dance folds the
    // difference into (-180, 180] so the comparison is against a real distance either way round.
    const d = ((a - b) % 360 + 540) % 360 - 180;
    return Math.abs(d) <= tolDeg;
  };
  return PHOTO_ANGLES.find(a => near(theta, a.theta) && Math.abs(phi - a.phi) <= tolDeg)?.key ?? null;
}
