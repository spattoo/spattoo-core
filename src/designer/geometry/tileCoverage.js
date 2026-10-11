// ── How far apart can these pieces sit before cake shows through? ───────────────────────────────
//
// ⚠️ THIS EXISTS BECAUSE EVERY CHEAPER PROXY FAILED, AND IT FAILED SILENTLY. Coating a cake needs
// one number — the centre-to-centre spacing at which pieces still tile without a hole. Three
// guesses at it were shipped and each left a visible band of bare cake:
//
//   bounding box          — a spike or a tail makes the box far larger than the shape, so pieces
//                           are spaced for a size they do not have.
//   √2 · radius           — correct for DISCS. A piece is not a disc.
//   percentile of vertices— better, and still wrong for the shape that matters most: a star's
//                           spike tips are a handful of vertices, so a percentile trims off
//                           exactly the parts that interlock with the neighbour's valleys.
//
// Sandeep, after the third: *"i think you are not measuring it. if you cannot measure, you cannot
// fix it. guess work does not work."* Correct, so this measures it.
//
// ── What it does ────────────────────────────────────────────────────────────────────────────────
// Rasterises the piece's SILHOUETTE in its own tangent plane, lays copies of that silhouette out on
// the real packing lattice, and counts the pixels nothing covers. Then it searches for the largest
// spacing where that count is zero. No model of the shape at all — a star, a rose, a leaf and a
// blob are each measured as whatever they are.
//
// ⚠️ SILHOUETTE, NOT VERTICES. What leaves a gap is the area the mesh does not cover when seen
// along the surface normal, and that is a question about faces. Triangles are rasterised; vertex
// density — which varies wildly between a smooth lobe and a sharp spike — never enters into it.

/* Grid resolution for the silhouette. 96 across the piece's own width puts a pixel at roughly 1%
 * of a piece, which is finer than a seam anyone can see and still trivial to compute — the whole
 * search is a few hundred thousand pixel tests. */
const GRID = 96;

/** Rasterise the mesh's silhouette, seen along +Y, into a GRID×GRID occupancy mask.
 *
 * `positions` is a flat [x,y,z,…] array in the piece's own frame, where X and Z span the surface.
 * Returns `{ mask, w, h, minX, minZ, cell }` — `mask` a Uint8Array, row-major in Z then X.
 */
export function silhouette(positions, grid = GRID) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], z = positions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const spanX = maxX - minX || 1e-6, spanZ = maxZ - minZ || 1e-6;
  const cell = Math.max(spanX, spanZ) / grid;
  const w = Math.max(1, Math.ceil(spanX / cell)), h = Math.max(1, Math.ceil(spanZ / cell));
  const mask = new Uint8Array(w * h);

  /* Scanline fill per triangle. A triangle smaller than a pixel still marks the pixel its centroid
   * lands in — dropping it would punch holes in a dense mesh and make the piece read as lacy. */
  for (let t = 0; t + 8 < positions.length; t += 9) {
    const ax = (positions[t] - minX) / cell,     az = (positions[t + 2] - minZ) / cell;
    const bx = (positions[t + 3] - minX) / cell, bz = (positions[t + 5] - minZ) / cell;
    const cx = (positions[t + 6] - minX) / cell, cz = (positions[t + 8] - minZ) / cell;
    const lo = Math.max(0, Math.floor(Math.min(az, bz, cz)));
    const hi = Math.min(h - 1, Math.ceil(Math.max(az, bz, cz)));
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(area) < 1e-12) {
      const px = Math.min(w - 1, Math.max(0, Math.floor((ax + bx + cx) / 3)));
      const pz = Math.min(h - 1, Math.max(0, Math.floor((az + bz + cz) / 3)));
      mask[pz * w + px] = 1;
      continue;
    }
    for (let py = lo; py <= hi; py++) {
      const zc = py + 0.5;
      let xlo = Infinity, xhi = -Infinity;
      // Where this scanline crosses each edge.
      const edge = (x0, z0, x1, z1) => {
        if ((z0 <= zc && z1 > zc) || (z1 <= zc && z0 > zc)) {
          const x = x0 + ((zc - z0) / (z1 - z0)) * (x1 - x0);
          if (x < xlo) xlo = x; if (x > xhi) xhi = x;
        }
      };
      edge(ax, az, bx, bz); edge(bx, bz, cx, cz); edge(cx, cz, ax, az);
      if (xlo > xhi) continue;
      const s = Math.max(0, Math.floor(xlo)), e = Math.min(w - 1, Math.ceil(xhi));
      for (let px = s; px <= e; px++) mask[py * w + px] = 1;
    }
  }
  return { mask, w, h, cell, minX, minZ };
}

/**
 * Does a lattice of this silhouette, at these steps, leave any hole?
 *
 * ⚠️ THE LATTICE IS THE REAL ONE — rows offset by half a step, which is how `rosetteSeats` packs
 * a wall. Testing a square lattice would answer a question nobody asked and would be pessimistic
 * by about 13%.
 *
 * Only the central cell is examined, and that is the whole trick: in an infinite lattice every
 * cell is identical, so one cell answers for the cake. Neighbours within two steps are stamped
 * over it, which is enough — a piece more than two steps away cannot reach.
 */
export function tilesWithoutGaps(sil, stepX, stepZ, { stagger = true, samples = 64 } = {}) {
  const { mask, w, h, cell } = sil;
  const sx = stepX / cell, sz = stepZ / cell;
  if (sx < 1e-6 || sz < 1e-6) return true;
  const cx = w / 2, cz = h / 2;

  for (let iz = 0; iz < samples; iz++) {
    for (let ix = 0; ix < samples; ix++) {
      // A point inside the central cell, in pixel units from the central piece's own origin.
      const px = (ix / samples - 0.5) * sx, pz = (iz / samples - 0.5) * sz;
      let covered = false;
      for (let nz = -2; nz <= 2 && !covered; nz++) {
        for (let nx = -2; nx <= 2 && !covered; nx++) {
          const offX = (nx + (stagger && (nz & 1) ? 0.5 : 0)) * sx;
          const qx = Math.floor(cx + px - offX), qz = Math.floor(cz + pz - nz * sz);
          if (qx >= 0 && qx < w && qz >= 0 && qz < h && mask[qz * w + qx]) covered = true;
        }
      }
      if (!covered) return false;
    }
  }
  return true;
}

/**
 * The largest step at which this piece still tiles with no hole.
 *
 * Searches the RATIO to the piece's own width, so the answer is scale-free: multiply by the width
 * the piece is drawn at and you have the spacing. Returns `{ ratioX, ratioZ }`.
 *
 * ⚠️ BISECTED, NOT SOLVED. Coverage is monotone in the step — widen the lattice and a hole that
 * exists stays — so bisection is exact to its tolerance and needs no model of the shape. 12 steps
 * lands inside 0.03% of a piece width, far below anything visible.
 */
export function maxTileStep(sil, { stagger = true, lo = 0.05, hi = 1.4, iters = 12 } = {}) {
  const width = sil.w * sil.cell, depth = sil.h * sil.cell;
  let a = lo, b = hi;
  if (!tilesWithoutGaps(sil, a * width, a * depth, { stagger })) return { ratioX: lo, ratioZ: lo, gapAtFloor: true };
  if (tilesWithoutGaps(sil, b * width, b * depth, { stagger })) return { ratioX: hi, ratioZ: hi };
  for (let i = 0; i < iters; i++) {
    const m = (a + b) / 2;
    if (tilesWithoutGaps(sil, m * width, m * depth, { stagger })) a = m; else b = m;
  }
  /* The same ratio on both axes, because it was searched on both together. Kept as two fields so a
   * caller can hold them apart later without a signature change — a piece whose spikes run one way
   * genuinely tiles tighter across than along. */
  return { ratioX: a, ratioZ: a };
}
