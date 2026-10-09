import { mulberry32 } from '../utils/random.js';

// ── Which colour each piece of a coat takes ─────────────────────────────────────────────────────
//
// Sandeep, with three reference cakes: *"double color patterns. we should achieve this."* Two
// different rules, not one:
//
//   ombré   — colour by POSITION. White at the middle of the lid, deepening down the wall.
//   scatter — each piece takes one of a few colours from a palette, mixed.
//
// ⚠️ THIS RETURNS A NUMBER PER SEAT, NOT A COLOUR, and that is deliberate. What a chosen colour
// actually looks like on cream is already decided by `creamAlbedo` / `albedoForLight` — a second
// opinion here would be the preview-versus-render drift INVARIANTS #15 exists to prevent. So this
// owns the only part that is genuinely about the coat: WHERE a piece sits in the pattern. The
// caller turns that into a colour with the functions that already exist.
//
// ⚠️ ONE INSTANCED MESH STILL. Per-piece colour is `setColorAt` on the instance, not a mesh per
// colour — which is what makes multi-colour affordable at all, since a coat is already 200-odd
// pieces and splitting by colour would multiply the draw calls by the palette size.

export const COAT_SHADE_MODES = Object.freeze(['single', 'ombre', 'scatter']);

/* How much of an ombré the LID gets before the wall starts. The references hand the lid roughly a
 * third: the centre is the palest point and the colour has visibly moved by the time it reaches
 * the rim, but most of the travel happens down the wall where there is more of it to see. */
export const OMBRE_LID_SHARE = 0.35;

/**
 * A pattern parameter per seat, in seat order.
 *
 * - `ombre`   → `t` in [0,1]: 0 at the centre of the lid, 1 at the board. Interpolate the palette.
 * - `scatter` → an integer palette index.
 * - `single`  → all zeros.
 *
 * ⚠️ THE OMBRÉ IS ONE CONTINUOUS RUN OVER THREE SURFACES, not a gradient per surface. On the
 * reference cake the colour crosses the top edge without a step: the lid runs centre → rim, the
 * shoulder picks up exactly where the lid stopped, and the wall carries on down. Shading each
 * surface 0→1 separately would restart the gradient twice and draw two bright rings where the
 * surfaces meet — which is precisely the seam the shoulder row exists to hide.
 */
export function coatShade(seats, {
  mode = 'ombre',
  baseY = 0.1,
  tierHeight = 1.45,
  lidReach = null,          // furthest a lid seat sits from the middle; measured if not given
  lidShare = OMBRE_LID_SHARE,
  bands = 0,                // 0 = smooth. >1 quantises the ombré into that many steps
  palette = 3,              // scatter: how many colours to choose between
  seed = 1,
  invert = false,           // deepest at the TOP instead of the bottom
} = {}) {
  const list = seats ?? [];
  if (mode === 'single' || !list.length) return list.map(() => 0);

  if (mode === 'scatter') {
    /* Deterministic per seat, so a cake does not reshuffle its colours on every render — the same
     * reason the seats themselves take a seed. */
    const rand = mulberry32((seed >>> 0) + 104729);
    const n = Math.max(1, Math.floor(palette));
    return list.map(() => Math.floor(rand() * n) % n);
  }

  const topY = baseY + tierHeight;
  const reach = lidReach ?? Math.max(1e-6, ...list
    .filter(s => s.kind === 'top')
    .map(s => Math.hypot(s.p[0], s.p[2])));

  const share = Math.min(1, Math.max(0, lidShare));
  const out = list.map(s => {
    if (s.kind === 'top') {
      // centre → rim, over the lid's share
      return share * Math.min(1, Math.hypot(s.p[0], s.p[2]) / reach);
    }
    if (s.kind === 'rim') return share;        // exactly where the lid left off
    /* The wall, from the lid's share down to 1 at the board. Measured off the seat's height
     * against the tier rather than against the row index: rows are not evenly spaced once the
     * count is ceiled, and an index would band the gradient unevenly. */
    const h = Math.min(1, Math.max(0, (topY - s.p[1]) / Math.max(1e-6, tierHeight)));
    return share + (1 - share) * h;
  });

  const banded = bands > 1
    /* Quantised to the middle of each band, so the palest and deepest bands are as wide as the
       rest — rounding to the band EDGES gives two half-width bands at the ends, which reads as a
       mistake rather than a choice. */
    ? out.map(t => (Math.min(bands - 1, Math.floor(t * bands)) + 0.5) / bands)
    : out;

  return invert ? banded.map(t => 1 - t) : banded;
}
