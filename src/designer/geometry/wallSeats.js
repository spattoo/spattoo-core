import { perimeter, isRoundWall, rectSidePlacement } from './surface.js';
import { occupantRadius } from '../placement.js';
import { mulberry32 } from '../utils/random.js';

/* ── Where pieces go on a cake WALL ──────────────────────────────────────────────────────────────
 *
 * `grassSeats` is the one distribution system for a SURFACE you look down on: it covers a top,
 * rings a rim, puts a clump here, keeps out of there. Every seat it returns sits at one height,
 * because every surface it describes is flat. A wall is the other kind, and it cannot be bent into
 * that shape: its seats differ in HEIGHT as well as in where they are round the cake, and the
 * direction a piece points is the wall's own outward normal rather than "up".
 *
 * So this is a second distribution, and the thing it does NOT do is re-derive the cake's outline.
 * `perimeter(shape)` already answers "walk the edge of this tier and tell me the point and the
 * outward normal at arc-length s", for a circle, a sheet, a heart or a letter — one interface both
 * cake shapes implement, written so "decoration placement generalises once instead of per-feature"
 * in its own words. A wall band is that walk, crossed with a column of heights.
 *
 * ⚠️ THE BAND IS IN FRACTIONS OF THE TIER'S HEIGHT, never in world units. A 1.45-tall tier and a
 * 0.9-tall one must both put flowers "across the middle third" when the control says so
 * (INVARIANTS #8 — a control means what its name says, and never a hardcoded world dimension).
 *
 * ⚠️ AND IT CLEARS WHAT IS ALREADY ON THE WALL IN THREE DIMENSIONS. On a top surface two things at
 * the same (x, z) are the same place, so the clearance test there is flat. On a wall every seat in
 * a vertical column shares one (x, z) — a flat test would clear the whole column because one rose
 * sits somewhere in it, taking a stripe out of the band from the board to the rim. The test has to
 * know how high each piece is, which is the whole reason this file exists rather than a fourth
 * argument to `useSurfaceSeats`. Same rule, same margin, one dimension more (INVARIANTS #3b).
 */

/* How much further than a thing's own radius the filler keeps off it — the same figure the flat
   path uses, and deliberately the same constant's worth: a sprig is not a point, its blooms sit out
   around the stem, so clearing to the exact footprint still lets them clip. */
const AVOID_MARGIN = 1.15;

/**
 * shape    the tier's outline descriptor (`tierShape(tier)`)
 * height   the tier's height in world units — the band is a fraction of it
 * lo, hi   the band, as fractions of the tier height from its base
 * from, to the arc it covers, as fractions of the perimeter. Equal (or both null) = all the way
 *          round. `to < from` wraps past the back of the cake, which is what a baker drawing
 *          across the front means.
 * bury     how far the cut end is pushed INTO the wall, in world units. On a top surface burying is
 *          downward; on a wall it is inward along the normal, which is the same gesture — a hand
 *          pushing a stem into buttercream — expressed in the surface's own direction.
 * avoid    `[{ x, z, dy, r }]` already standing on this wall, from `wallOccupants`.
 *
 * Returns `[{ x, z, dy, out, yaw, scale }]`. `dy` is height above the tier's BASE, so the caller
 * seats the field at `tier.baseY`; `out` is the outward bearing `atan2(nx, nz)`, which is what
 * `layAxis` wants to tip a piece away from the cake.
 */
export function wallSeats(shape, {
  spacing = 0.07, jitter = 0.7, seed = 7,
  height = 1.45, lo = 0.18, hi = 0.68,
  from = null, to = null,
  bury = 0, avoid = null,
} = {}) {
  if (!shape || height <= 0 || spacing <= 0) return [];
  const per = perimeter(shape);
  const len = per.length;
  if (!(len > 0)) return [];

  const loY = Math.min(lo, hi) * height;
  const hiY = Math.max(lo, hi) * height;
  /* A band of zero height is still one row of flowers, not none: a baker who drags both edges
     together has asked for a line round the cake, which is a real thing to ask for. */
  const tall = Math.max(hiY - loY, spacing);

  /* The arc, in arc-length. Both null is the whole way round; `to` behind `from` wraps past the
     back, so `at()` is always given a wrapped distance below rather than a negative one. */
  const whole = from == null || to == null || from === to;
  const sFrom = whole ? 0 : from * len;
  const span  = whole ? len : (((to - from) % 1) + 1) % 1 * len || len;

  const cols = Math.max(1, Math.round(span / spacing));
  const rows = Math.max(1, Math.round(tall / spacing));
  const dCol = span / cols, dRow = tall / rows;

  /* ⚠️ SEEDED HERE AND NOWHERE ELSE. A PRNG is a stream, so a generator handed in from outside
     continues where the last run stopped and re-seats every piece on every re-run — the fault that
     made the board ring shake on every frame. */
  const rand = mulberry32((seed + 7919) >>> 0);

  const seats = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const s = sFrom + (c + 0.5 + jitter * (rand() - 0.5)) * dCol;
      const y = Math.min(hiY, Math.max(loY, loY + (r + 0.5 + jitter * (rand() - 0.5)) * dRow));
      const p = per.at(((s % len) + len) % len);
      seats.push({
        // Pushed INWARD by `bury`: the bare lower stem is inside the cake, as it is on a real one.
        x: p.x - p.nx * bury,
        z: p.z - p.nz * bury,
        dy: y,
        out: Math.atan2(p.nx, p.nz),
        yaw: rand() * Math.PI * 2,
        scale: 0.8 + 0.4 * rand(),
      });
    }
  }
  return avoid?.length ? withoutWallOccupants(seats, avoid) : seats;
}

/* ⚠️ THREE DIMENSIONS, AND THAT IS THE WHOLE POINT. The flat filter this mirrors
 * (`withoutCollarCentres`) compares (x, z) because on a top surface that IS the place. Here a
 * column of seats shares one (x, z) and differs only in height, so the same test would take a
 * vertical stripe out of the band for every rose on the wall. Squared distances, for the same
 * reason the flat one uses them: a few thousand seats against a handful of occupants runs this
 * often enough that a `Math.hypot` per pair is worth not paying. */
export function withoutWallOccupants(seats, occupants) {
  if (!occupants?.length) return seats;
  return seats.filter((s) => !occupants.some((o) => {
    const dx = s.x - o.x, dz = s.z - o.z, dy = s.dy - o.dy;
    const r = o.r * AVOID_MARGIN;
    return dx * dx + dz * dz + dy * dy < r * r;
  }));
}

/* ── What is already standing on this wall ───────────────────────────────────────────────────────
 *
 * The wall's answer to `surfaceOccupants`, and it has to be its own function because a side
 * decoration is not stored in (x, z) at all: a round wall keeps `theta` round the cylinder, a
 * faceted one keeps `u` along the perimeter, and both keep a world `y`. `surfaceOccupants` filters
 * on `x != null && z != null`, so against a wall it returns nothing — which reads exactly like "the
 * cake is empty" and would have let the filler grow straight through every rose on the side.
 *
 * ⚠️ IT ASKS WHAT IS THERE, NEVER WHAT IT IS. A rose, a candle, a butterfly and a monogram are all
 * a footprint at a place, and the clearance rule is the same for each (INVARIANTS #3b: "ONE rule
 * for this and it is not per-element").
 */
export function wallOccupants(stickers, {
  tierIndex, shape, baseY = 0, zones = ['side', 'middle_tier'],
  radiusOf = () => null, skipId = null,
} = {}) {
  if (!shape) return [];
  const round = isRoundWall(shape);
  const R = shape.radius ?? 1;
  return (stickers ?? [])
    .filter(s => s.id !== skipId && s.tierIndex === tierIndex && zones.includes(s.zone) && s.y != null)
    .map((s) => {
      const place = round
        ? { x: R * Math.sin(s.theta ?? 0), z: R * Math.cos(s.theta ?? 0) }
        : rectSidePlacement(shape, s.u ?? 0, 0);
      /* ⚠️ `occupantRadius`, NOT A SECOND FALLBACK. "How much room does this thing take up" is one
         question and placement.js already answers it — measured radius when there is one, a
         quarter of STICKER_SIZE when there is not, times the piece's own scale. A number invented
         here would be a second answer, and the one that drifts is whichever is edited second. */
      return { x: place.x, z: place.z, dy: s.y - baseY,
               r: occupantRadius(s, radiusOf(s)), id: s.id };
    });
}
