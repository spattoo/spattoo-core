/* ── Drawing the studio small, without inventing a second studio ─────────────────────────────────
 *
 * One box on the settings screen showing the room as it is currently set — the ground, the shading,
 * and the floor and wall lines if they are on. Sandeep: *"instead there should be only one preview
 * box, based on your selection that changes. for example if you select look and then grid lines it
 * shows both on the preview."*
 *
 * ⚠️ EVERY COLOUR, EVERY STRENGTH AND EVERY LINE COMES FROM THE RENDERER'S OWN FUNCTIONS, which is
 * what keeps this from being a picture OF the studio. INVARIANTS #15: *"a preview and the thing
 * previewed ask ONE function — never tune a 2D preview towards a 3D render."*
 *
 *   the backdrop   `backdropPlan` + `paintBackdrop`, the same pair SceneBackground paints with
 *   the lines      `gridPositions` / `wallPositions`, the same world coordinates the scene draws
 *   their colour   `GRID_COLOR`
 *   their weight   `floorOpacity` / `wallOpacity`, from the baker's own Line strength
 *
 * ⚠️ THE CAMERA IS THE ONE THING THIS OWNS, AND IT IS SAID RATHER THAN HIDDEN. A preview cannot
 * borrow the designer's camera: that one is fitted to the cake every frame (`FitCakeToView`), and
 * there is no cake here. So the projection below is a fixed pinhole at the designer's own resting
 * position, looking at the origin. The grid will not line up pixel for pixel with the canvas, and
 * it is not supposed to — the question this box answers is "what have I turned on, and how strong",
 * which is a question about colour and weight, and those are not approximated at all.
 *
 * ⚠️ AND NO CAKE IN IT. A drawn cake would be the one thing on the screen that is not the product,
 * in a box whose whole claim is that it is. The floor lines give the room its depth without one.
 */

import { CAMERA_POSITION } from './constants.js';
import { GRID, WALL, gridPositions, wallPositions } from './reel/takeGrid.js';

/** The designer's resting eye, and a lens near the editor's 42°. */
export const PREVIEW_CAMERA = Object.freeze({ eye: CAMERA_POSITION, fovDeg: 42 });

/**
 * World point → preview pixel, or null when it is behind the eye.
 *
 * A pinhole looking from `eye` at the origin, with +y up. Written out rather than reached for from
 * three.js because this runs on a 2D canvas with no renderer, no scene and no camera object — and
 * because a preview that needed a WebGL context to draw a gradient would cost more than it tells.
 */
export function projectPoint([x, y, z], w, h, camera = PREVIEW_CAMERA) {
  const [ex, ey, ez] = camera.eye;
  // Forward is from the eye toward the origin; right and up follow from world +y.
  const f = norm([-ex, -ey, -ez]);
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = [x - ex, y - ey, z - ez];
  const depth = dot(d, f);
  if (!(depth > 0.001)) return null;                       // behind the eye, or on it
  const tan = Math.tan((camera.fovDeg * Math.PI) / 360);
  const aspect = w / h;
  return [
    (w / 2) * (1 + dot(d, r) / (depth * tan * aspect)),
    (h / 2) * (1 - dot(d, u) / (depth * tan)),
  ];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/* ⚠️ `WALL.distance`, WHICH IS THE SCENE'S OWN NUMBER — "it stands on the far edge of the floor
   grid, so the two meet in a corner rather than one hovering in front of the other".
   The first version of this line read `(GRID.extent / 2) * WALL_RELATIVE`, which is an OPACITY
   constant used as a distance: `WALL_RELATIVE` is how much fainter the backdrop is than the floor,
   and nothing to do with where it stands. It drew a wall through the middle of the floor and
   looked plausible, which is the whole danger of a preview that reaches for a number instead of
   the one the renderer uses. In the scene the wall turns to the camera's bearing; here the camera
   is fixed, so it simply stands at -z. */
const WALL_Z = -WALL.distance;

/**
 * The line segments to stroke, in preview pixels: `[[x1,y1,x2,y2], …]`.
 *
 * Takes the SAME `Float32Array` of world coordinates the scene feeds to its line geometry, so a
 * change to the grid's extent or spacing reaches this box without anyone remembering it should.
 * A segment with either end behind the eye is dropped rather than clipped — at this size one line
 * at the very edge is not worth a clipper, and dropping is the version that cannot draw a wrong
 * line across the picture.
 */
export function previewSegments({ floor = false, wall = false, w, h, camera = PREVIEW_CAMERA } = {}) {
  const out = { floor: [], wall: [] };
  if (!(w > 0) || !(h > 0)) return out;

  const add = (into, pts, mapPoint) => {
    for (let i = 0; i < pts.length; i += 6) {
      const a = projectPoint(mapPoint([pts[i], pts[i + 1], pts[i + 2]]), w, h, camera);
      const b = projectPoint(mapPoint([pts[i + 3], pts[i + 4], pts[i + 5]]), w, h, camera);
      if (a && b) into.push([a[0], a[1], b[0], b[1]]);
    }
  };

  if (floor) add(out.floor, gridPositions(GRID), (p) => p);
  // The wall's own coordinates are in its local plane (x, y, 0); it stands at the floor's far edge.
  if (wall) add(out.wall, wallPositions(WALL), ([x, y]) => [x, y, WALL_Z]);
  return out;
}
