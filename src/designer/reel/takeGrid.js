/* ── A grid floor, for filming only ──────────────────────────────────────────────────────────────
 *
 * Sandeep: *"can we have the grid lines for the canvas like in the marketing site? (only for the
 * video capture)"*
 *
 * The reference is `SpaceGrid.tsx` in spattoo-web/apps/marketing — a plain line grid lying on the
 * ground, receding away from the camera, which is what gives that scene its sense of a room rather
 * than a void. Same idea here: a cake photographed against nothing has no floor, and a grid tells
 * the eye where the table is without putting anything in the frame worth looking at.
 *
 * ⚠️ WRITTEN HERE RATHER THAN IMPORTED. The marketing site is a separate Next app in another repo,
 * so there is no shared module to reach for — this is the look reproduced, not a copy of a thing we
 * already own. The numbers that matter are carried over: its `#6b8f7e` line colour and roughly its
 * one-unit spacing, scaled to a scene whose cake has a radius near 1 rather than 1.1.
 *
 * ⚠️ FILMING ONLY, AND THAT IS NOT A PREFERENCE. A baker approves a cake against the designer's own
 * ground; putting a grid under it would change what they are judging, and a thumbnail with graph
 * paper in it is not the cake they sold. The component that draws this mounts on the take's own
 * window, alongside the lens, and nothing of it exists the rest of the time.
 *
 * ⚠️ LINES, NOT A TEXTURE. A `LineBasicMaterial` is unlit — it cannot pick up the key light, cast a
 * shadow, or bounce anything onto the cake, so the one rule a take must not break (INVARIANTS: the
 * cake's appearance is a contract) is kept by construction rather than by care.
 */

/** The marketing site's own line colour, so the two scenes read as the same product. */
export const GRID_COLOR = '#6b8f7e';

export const GRID = Object.freeze({
  /* ⚠️ SMALL ENOUGH TO STOP SHORT OF THE HORIZON, which is the whole difference between a floor and
     wallpaper. The first cut reached 24 units: this camera sits nearly level with the cake, so a
     ground grid that far away projects into a stack of near-horizontal lines spread right across
     the backdrop — stripes on a wall, not a surface the cake stands on. The marketing grid gets
     away with running to the distance because its camera looks ALONG it and the lines converge on
     a vanishing point; ours orbits at cake height. Ten units is a clear square of floor around a
     cake whose board is about 1.6 across, and the lines end where the eye can still read them as
     receding. */
  extent: 10,
  /* One unit between lines — a cake radius is about 1, so the squares read as a sensible scale next
     to the thing standing on them. */
  step: 1,
  /* A hair above the floor. The painted floor writes no depth, but the shadow catcher does, and a
     grid at exactly y=0 fights it. */
  y: 0.004,
  /* Faint. It is a floor, not a subject — loud enough to place the cake, quiet enough that nobody
     watching the video thinks about it. */
  opacity: 0.34,
});

/**
 * The grid as line-segment vertices: x, y, z triples, two points per line.
 *
 * ⚠️ SQUARE AND CENTRED ON THE CAKE, unlike the marketing one, which runs away from a fixed camera
 * and only needs to exist in front of it. This scene ORBITS — the baker can drive the camera right
 * round — so a grid with a back edge would show its own edge the moment they turned past it.
 */
export function gridPositions({ extent, step } = GRID) {
  const span = Math.max(0, Number(extent) || 0);
  const gap = Math.max(0.001, Number(step) || 1);
  const half = span / 2;
  const n = Math.floor(half / gap);
  const out = [];
  for (let i = -n; i <= n; i++) {
    const at = i * gap;
    out.push(-half, 0, at, half, 0, at);   // running east-west
    out.push(at, 0, -half, at, 0, half);   // running north-south
  }
  return new Float32Array(out);
}

/** How many separate lines `gridPositions` draws, for a caller that wants to say so. */
export function gridLineCount({ extent, step } = GRID) {
  const span = Math.max(0, Number(extent) || 0);
  const gap = Math.max(0.001, Number(step) || 1);
  return (Math.floor(span / 2 / gap) * 2 + 1) * 2;
}

/* ── The vertical half ───────────────────────────────────────────────────────────────────────────
 *
 * Sandeep: *"option for vertical grid lines also."* The marketing grid has these too — horizontal
 * runs at five heights along one wall — and they are most of what makes that scene feel like a room
 * rather than a floor floating in nothing.
 *
 * ⚠️ IT CANNOT BE A FIXED WALL, THOUGH, AND THAT IS THE ONE REAL DIFFERENCE. Their camera is fixed
 * and looks at the wall; ours ORBITS, so a wall nailed to one side of the scene swings round into
 * the foreground and ends up standing between the camera and the cake. This one is placed behind
 * the cake along whatever bearing the camera is on, every frame — always a backdrop, never an
 * obstruction. See TakeGridWall in CakeCanvas.
 */
export const WALL = Object.freeze({
  /* Wider than the floor grid it stands on, so its ends leave the frame rather than showing as two
     vertical edges floating in the middle of the shot. */
  width: 14,
  /* Tall enough to fill the frame behind a two-tier cake on the long lens. */
  height: 6,
  step: 1,
  /* It stands on the far edge of the floor grid, so the two meet in a corner rather than one
     hovering in front of the other. */
  distance: GRID.extent / 2,
  /* Fainter than the floor: it is further away and there is more of it, so matching the floor's
     weight makes the backdrop louder than the thing standing on it. */
  opacity: 0.22,
});

/**
 * The backdrop as line-segment vertices in its OWN plane: x across, y up, z always 0.
 *
 * The caller stands it up behind the cake and turns it to face the camera, so nothing here needs to
 * know where anything is — which is what keeps it testable as arithmetic.
 */
export function wallPositions({ width, height, step } = WALL) {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  const gap = Math.max(0.001, Number(step) || 1);
  const half = w / 2;
  const out = [];
  // Verticals, which are the ones that were asked for.
  const cols = Math.floor(half / gap);
  for (let i = -cols; i <= cols; i++) {
    const x = i * gap;
    out.push(x, 0, 0, x, h, 0);
  }
  // Horizontals, so it reads as a grid rather than as a fence.
  const rows = Math.floor(h / gap);
  for (let j = 0; j <= rows; j++) {
    const y = j * gap;
    out.push(-half, y, 0, half, y, 0);
  }
  return new Float32Array(out);
}
