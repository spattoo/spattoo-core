// ── Fondant letter blocks ─────────────────────────────────────────────────────
// The little iced cubes with a raised letter on one face, lined up to spell a name — around the
// board at a cake's foot, or in a row on top.
//
// ── ONE OBJECT PER WORD, NOT PER BLOCK ──────────────────────────────────────────
// A baker types "EMILY" once and gets five blocks. They read as a unit and move as a unit. The
// alternative — place a cube, choose its letter, repeat, then align them by hand — is precisely the
// tedium the reference photos exist to avoid. So this module turns a STRING into placements; the
// renderer never decides what the word is, and nothing downstream owns a single block.
//
// Per-block overrides (a different colour, the daisy on top) can layer on later without changing
// this: each placement already carries its own char, position and yaw.

export const NAME_BLOCK_DEFAULTS = Object.freeze({
  size:        0.30,   // cube edge, world units (a tier's radius is ~1.2, so this is a real cube)
  gap:         0.035,  // space between neighbouring cubes
  chamfer:     0.16,   // corner radius as a fraction of the edge — fondant is never sharp
  letterScale: 0.52,   // cap height as a fraction of the face
  letterDepth: 0.07,   // how far the letter stands PROUD, as a fraction of the edge
  blockColor:  '#f7f5f2',
  letterColor: '#e9a8c0',
});

/**
 * Placements for one word.
 *
 * `board` arcs the blocks around the cake, each yawed so its lettered face looks OUTWARD — the way
 * you read them walking round the table. `top` lays a straight row facing the front.
 *
 * A SPACE consumes a slot and produces no block, so "A B" reads with a real gap rather than closing
 * up. Returns [{ char, x, z, yaw }] in reading order; y is the caller's business, because a board
 * sits at one height and a tier top at another.
 */
export function nameBlockLayout({
  text = '', zone = 'board', radius = 1.5, angle = 0,
  size = NAME_BLOCK_DEFAULTS.size, gap = NAME_BLOCK_DEFAULTS.gap, offsetX = 0, offsetZ = 0,
}) {
  const chars = String(text).toUpperCase().split('');
  if (!chars.length) return [];
  const pitch = size + gap;
  const mid = (chars.length - 1) / 2;

  return chars.flatMap((char, i) => {
    if (!char.trim()) return [];                       // a space holds its place and shows nothing
    if (zone === 'top') {
      return [{ char, x: offsetX + (i - mid) * pitch, z: offsetZ, yaw: 0 }];
    }
    // Around the board: the angular pitch is the linear pitch divided by the radius, so blocks stay
    // the same distance apart whatever size the cake is — on a small cake the run simply wraps
    // further round. Centred on `angle`.
    const step = pitch / Math.max(radius, 1e-6);
    const a = angle + (i - mid) * step;
    // x = sin, z = cos matches the (u, v) convention the placement handles already use, and a yaw of
    // `a` turns the block's +Z face — the lettered one — to point radially outward.
    return [{ char, x: Math.sin(a) * radius, z: Math.cos(a) * radius, yaw: a }];
  });
}

/**
 * How far from the cake's centre a board run should sit: clear of the wall by half a block, so the
 * cubes stand against the cake rather than under it or adrift on the board.
 * `reach` is the cake's own half-extent at the base (a radius, or a rect's larger half-side).
 */
export function boardRunRadius(reach, size = NAME_BLOCK_DEFAULTS.size) {
  return reach + size * 0.62;
}

/**
 * The run as PLACEMENTS a baker can then move: [{ char, u, v, yaw }] in polar (u, v) against the
 * surface — u = angle/2π, v = fraction of the surface radius.
 *
 * Polar, and not x/z, because that is the currency the placement handles already drag in — it is
 * how a luster-dust splash and a grass clump are stored, so blocks inherit that machinery instead
 * of needing a fourth way to move something. It also survives a resized cake: a block half way out
 * stays half way out.
 *
 * Generated once when the name is set; after that each block is its own placement and a drag moves
 * only that one. Re-running this is the "line them up again" escape hatch.
 */
export function nameBlockRun({
  text = '', zone = 'board', surfaceRadius = 1.8, runRadius = 1.5, angle = 0,
  size = NAME_BLOCK_DEFAULTS.size, gap = NAME_BLOCK_DEFAULTS.gap,
}) {
  const R = Math.max(surfaceRadius, 1e-6);
  const laid = nameBlockLayout({
    text, zone, size, gap, angle,
    radius: zone === 'board' ? runRadius : 0,
  });
  return laid.map(b => {
    // A top row is laid out in x/z and converted; a board arc is already polar in all but name.
    const v = Math.min(0.98, Math.hypot(b.x, b.z) / R);
    const u = ((Math.atan2(b.x, b.z) / (Math.PI * 2)) + 1) % 1;
    return { char: b.char, u, v, yaw: b.yaw };
  });
}

/**
 * The yaw a block should take once it has been dragged to (u, v).
 *
 * On the board the lettered face turns to look OUTWARD — you read the name walking round the table,
 * so a block that keeps its old angle after being dragged ends up showing its blank side. On a tier
 * top there is no "outward" worth speaking of; the row faces the front and stays there.
 */
export function nameBlockYaw(zone, u) {
  return zone === 'board' ? u * Math.PI * 2 : 0;
}
