/* ── Dropping genuinely broken triangles from a GLB, and nothing else ────────────────────────────
 *
 * Auto-generated meshes — photogrammetry, image-to-3D, a sloppy export — arrive with triangles that
 * are not surface: zero-area slivers left by a failed weld, and needle-thin shards that z-fight and
 * sparkle as the camera moves. Removing those genuinely improves a render, and that is what this
 * does.
 *
 * ⚠️ IT USED TO ALSO DROP ANY TRIANGLE LARGER THAN 50× THE MESH AVERAGE, and that rule is removed.
 * It reads as common sense and is exactly backwards for a DECIMATED mesh, which is what our own
 * optimizer produces: simplification's entire job is to spend few big triangles on flat panels and
 * many small ones around detail, so the better it works the wider that ratio grows. A triangle is
 * not noise for being large — a cake board, a box lid and a flat plaque are all one big triangle
 * pair on a well-optimised model.
 *
 * Measured on the asset that exposed it, a 20,000-triangle makeup palette:
 *
 *     mean triangle area        5.557e-4
 *     the old cap (50x mean)    2.779e-2
 *     largest triangle          1026x the mean
 *     triangles over that cap   55  →  45.3% of the model's entire surface area
 *
 * Fifty-five triangles, and with them the lid panel and the big flat faces. It rendered correctly
 * in a plain viewer and as an open frame on the cake, which is how it was reported: *"it looked
 * fine in manage elements screen. but when its actualy rendered, it shows broken."*
 *
 * The sliver rule keeps what the area rule was reaching for: a stray huge triangle from a broken
 * mesh is a needle spanning the model, and `aspect` catches it on shape rather than on size.
 */

/* A triangle this thin is not a surface anyone modelled. */
export const SLIVER_ASPECT = 150;
/* Below this, three points are a line. Absolute, because it is about float precision rather than
   about this mesh — a mesh-relative threshold is the mistake the area rule made. */
export const MIN_AREA = 1e-7;

/* `positions` is a flat Float32Array (x,y,z per vertex); `index` a flat triangle index array.
   Returns the indices to KEEP, plus a count of what went and why. Pure, so it can be tested
   against a decimated mesh without a GPU. */
export function cleanTriangles(positions, index) {
  const keep = [];
  let tiny = 0, sliver = 0;
  const px = (i, o) => positions[i * 3 + o];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const e1 = [px(b,0)-px(a,0), px(b,1)-px(a,1), px(b,2)-px(a,2)];
    const e2 = [px(c,0)-px(a,0), px(c,1)-px(a,1), px(c,2)-px(a,2)];
    const e3 = [px(c,0)-px(b,0), px(c,1)-px(b,1), px(c,2)-px(b,2)];
    const cr = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]];
    const area = Math.hypot(cr[0], cr[1], cr[2]) * 0.5;
    if (area < MIN_AREA) { tiny++; continue; }
    const lens = [Math.hypot(...e1), Math.hypot(...e2), Math.hypot(...e3)];
    const aspect = Math.max(...lens) / (Math.min(...lens) + 1e-10);
    if (aspect > SLIVER_ASPECT) { sliver++; continue; }
    keep.push(a, b, c);
  }
  return { keep, dropped: { tiny, sliver } };
}
