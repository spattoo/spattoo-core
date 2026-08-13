import * as THREE from 'three';

// Build a SOLID relief slab from a 2D sticker's alpha silhouette (placement_config.relief.solid).
//
// A displaced relief sticker is a single curved SHELL (one displaced surface) — from a grazing side
// angle it reads thin/hollow. This builds a REAL extruded solid instead: the alpha silhouette is
// traced to a polygon, extruded to `thickness` (flat front cap = the printed image, side walls, flat
// back cap), then bent around the cake wall EXACTLY like the GLB path (bendStickerScene) so it hugs
// the round tier. From every angle it reads as a solid fondant cut-out.
//
// PURE (canvas + typed arrays + THREE geometry) — no React. The caller disposes the returned geometry.
//
// Coordinate contract (identical to createCurvedPlane / StickerTexture so the albedo lines up):
//   • Local sticker space centred at origin; the plane is `size`×`size` (the normalized master is a
//     square, so the full image maps onto the full square — same stretch-to-square as the flat decal).
//   • FRONT-cap UV = normalized local XY in [0,1] (u = x/size+0.5, v = y/size+0.5), matching the flat
//     decal's full-image mapping — so the printed albedo registers with the cut-out silhouette.
//   • Bend: local radius R = curveRadius / (scale||1) (undo the parent group's scale, as the GLB
//     bend does). Each vertex x → arc angle a = x/R, then place on a cylinder of radius (R + z) with
//     axis at local z = −R: (ρ·sin a, y, ρ·cos a − R), ρ = R + z. z is the extrude depth (0 = back cap
//     on the wall, thickness = front cap proud), so the front sits `thickness` proud radially — the
//     SAME rho-form bendStickerScene uses (front stays parallel to the wall, not a shifted cylinder).
//   • Groups: ExtrudeGeometry emits group 0 = caps (front + back), group 1 = side walls, so a
//     [albedo, matte-fondant] material array shades the printed front vs. the fondant sides.
//
// `thickness` is the LOCAL extrude depth = lift·reliefRadius/scale — the SAME value the displaced path
// feeds displacementScale — so after the group's `scale` the world thickness = lift·reliefRadius,
// matching the raised height of the displaced shell exactly (INVARIANTS #8: a fraction of the live
// tier radius, never absolute, never tied to sticker size).
//
// v1: the LARGEST outer contour only — interior holes (e.g. a donut) are NOT cut. Noted in the report.

const DEFAULT_WORK = 512;   // trace resolution (image long edge): higher → the pixel stair-steps are finer,
                            // so after smoothing + simplify the outline reads clean on the cake. Cheap (O(N)).

// How far INSIDE the silhouette the side walls sample the print for their local colour, as a fraction of
// the sticker's local `size`. Big enough to clear the alpha-antialiased rim (and the dark outline many
// stickers are drawn with), small enough that a narrow feature — a tree trunk, a leaf tip — still samples
// its OWN colour rather than a neighbouring part's. ~2% of the plane ≈ 20px on the 1024 normalized master.
const WALL_SAMPLE_INSET = 0.02;

// Decode the image alpha to a binary foreground grid at `work` resolution (alpha > 0.5 = solid).
function alphaGrid(img, work) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const scale = Math.min(1, work / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale)), h = Math.max(1, Math.round(ih * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = d[i * 4 + 3] > 128 ? 1 : 0;
  return { w, h, g };
}

// Keep only the LARGEST 8-connected foreground component (drops stray specks / detached bits), so the
// traced outline is one clean silhouette rather than whichever noise pixel the raster scan hits first.
function largestComponent(g, w, h) {
  const label = new Int32Array(w * h);
  let bestLabel = 0, bestSize = 0, cur = 0;
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!g[s] || label[s]) continue;
    cur++;
    let size = 0;
    stack.push(s); label[s] = cur;
    while (stack.length) {
      const p = stack.pop(); size++;
      const x = p % w, y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const np = ny * w + nx;
        if (g[np] && !label[np]) { label[np] = cur; stack.push(np); }
      }
    }
    if (size > bestSize) { bestSize = size; bestLabel = cur; }
  }
  if (!bestLabel) return null;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = label[i] === bestLabel ? 1 : 0;
  return mask;
}

// Trace the outer boundary of a filled mask as an ordered pixel loop (Moore-neighbour / radial-sweep
// boundary following — the outer-contour half of marching squares). Start = the first foreground pixel
// in raster order, whose west neighbour is background; sweep the 8-neighbourhood clockwise from the
// backtrack direction to find the next boundary pixel, until we return to the start. `guard` bounds a
// pathological loop.
function traceContour(mask, w, h) {
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : mask[y * w + x];
  let sx = -1, sy = -1;
  for (let y = 0; y < h && sy < 0; y++) for (let x = 0; x < w; x++) { if (mask[y * w + x]) { sx = x; sy = y; break; } }
  if (sx < 0) return [];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const contour = [];
  let cx = sx, cy = sy, bx = sx - 1, by = sy;   // backtrack starts west (background for the first raster pixel)
  const guardMax = w * h * 8;
  let guard = 0;
  do {
    contour.push([cx, cy]);
    let bi = 0;
    for (let i = 0; i < 8; i++) { if (cx + dirs[i][0] === bx && cy + dirs[i][1] === by) { bi = i; break; } }
    let found = false;
    for (let k = 1; k <= 8; k++) {
      const i = (bi + k) % 8;
      const nx = cx + dirs[i][0], ny = cy + dirs[i][1];
      if (at(nx, ny)) { bx = cx; by = cy; cx = nx; cy = ny; found = true; break; }
    }
    if (!found) break;                       // isolated pixel
    if (++guard > guardMax) break;
  } while (!(cx === sx && cy === sy));
  return contour;
}

// Round off the marching-squares pixel stair-steps: a few passes of neighbour averaging on the CLOSED
// contour (wrap-around window) before simplification, so the extruded silhouette reads smooth instead of
// jagged. Cheap and shape-preserving at a small window; RDP afterwards drops the now-redundant points.
function smoothClosed(pts, passes = 3, win = 2) {
  let p = pts;
  const n = pts.length;
  if (n < 8) return p;
  for (let s = 0; s < passes; s++) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, c = 0;
      for (let k = -win; k <= win; k++) { const q = p[((i + k) % n + n) % n]; sx += q[0]; sy += q[1]; c++; }
      out[i] = [sx / c, sy / c];
    }
    p = out;
  }
  return p;
}

// Perpendicular distance of p from the line a→b.
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}

// Ramer–Douglas–Peucker on an OPEN polyline (keeps endpoints).
function rdp(points, eps) {
  if (points.length < 3) return points.slice();
  let idx = -1, maxD = 0;
  const a = points[0], b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = segDist(points[i], a, b);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

// Simplify a CLOSED contour: split at the two farthest-apart points into two open polylines, RDP each,
// re-join. Adaptively raise eps until the point count is sane (≤ maxPts) so a jagged silhouette can't
// blow up the poly count.
function simplifyClosed(contour, maxPts = 250) {
  if (contour.length < 4) return contour.slice();
  // farthest pair from the first point (cheap, good enough to split a blob)
  let far = 0, farD = -1;
  for (let i = 1; i < contour.length; i++) {
    const dx = contour[i][0] - contour[0][0], dy = contour[i][1] - contour[0][1];
    const d = dx * dx + dy * dy;
    if (d > farD) { farD = d; far = i; }
  }
  const A = contour.slice(0, far + 1);
  const B = contour.slice(far).concat([contour[0]]);
  let eps = 0.6;   // start tight (smoothing already removed the pixel jitter) → faithful outline
  for (let pass = 0; pass < 14; pass++) {
    const a = rdp(A, eps), b = rdp(B, eps);
    const merged = a.slice(0, -1).concat(b.slice(0, -1));   // drop the shared/duplicated endpoints
    if (merged.length <= maxPts || eps > 24) return merged.length >= 3 ? merged : contour.slice();
    eps *= 1.5;
  }
  return contour.slice(0, maxPts);
}

// Signed area (shoelace) — used to force CCW winding so the extruded FRONT cap faces +Z.
function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Build a solid relief slab BufferGeometry from a sticker image's alpha silhouette.
 * @param {HTMLImageElement|HTMLCanvasElement} maskImage - the sticker's own loaded image (alpha = shape).
 * @param {object} opts
 * @param {number} opts.size       - local plane side length (world units before the parent group scale).
 * @param {number} opts.thickness  - LOCAL extrude depth (= lift·reliefRadius/scale; world thickness after scale).
 * @param {number|null} opts.curveRadius - world surface radius to bend around; null/0 = flat (top surface / sheet).
 * @param {number} opts.scale      - the parent group's scale (undone so the bend matches the world wall).
 * @param {number} opts.work       - trace resolution (image long edge).
 * @returns {THREE.BufferGeometry|null}
 */
export function buildSolidReliefGeometry(maskImage, { size, thickness, curveRadius = null, scale = 1, edgeRadius = 0, work = DEFAULT_WORK } = {}) {
  if (!maskImage) return null;
  const iw = maskImage.naturalWidth || maskImage.width, ih = maskImage.naturalHeight || maskImage.height;
  if (!iw || !ih) return null;
  const depth = Math.max(1e-4, thickness || 0);   // never a zero-thickness (degenerate) extrude

  // 1) alpha → largest silhouette → ordered outer contour → simplified polygon (image pixel space).
  const { w, h, g } = alphaGrid(maskImage, work);
  const mask = largestComponent(g, w, h);
  let contour = mask ? traceContour(mask, w, h) : [];
  if (contour.length >= 8) contour = smoothClosed(contour, 3, 2);   // round the pixel stair-steps first
  contour = simplifyClosed(contour, 250);

  // 2) map contour → local sticker space. Full image → full `size` square (matches the flat decal's
  //    UV stretch), y flipped (image top → local +Y). Fall back to the full square if tracing failed.
  let pts;
  if (contour.length >= 3) {
    pts = contour.map(([px, py]) => new THREE.Vector2((px / w - 0.5) * size, (0.5 - py / h) * size));
  } else {
    const hs = size / 2;
    pts = [new THREE.Vector2(-hs, -hs), new THREE.Vector2(hs, -hs), new THREE.Vector2(hs, hs), new THREE.Vector2(-hs, hs)];
  }
  if (signedArea(pts) < 0) pts.reverse();   // force CCW → front cap normal +Z

  // 3) extrude the silhouette (flat front cap, side walls, flat back cap). ExtrudeGeometry groups
  //    caps (index 0) vs. walls (index 1) so the material array shades the print vs. the fondant sides.
  //    edgeRadius (0..1 of depth) → a bevel that rounds the sharp front/back rim. The straight run is
  //    shortened by the bevel so the front cap still tops out at ≈depth (protrusion unchanged, #8). The
  //    bevel faces belong to the SIDE group, so the rounded rim reads in the fondant wall colour.
  const bevel = Math.max(0, Math.min(1, edgeRadius)) * depth;
  const bevelEnabled = bevel > 1e-5;
  const shape = new THREE.Shape(pts);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: bevelEnabled ? Math.max(1e-4, depth - bevel) : depth,
    bevelEnabled, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 1,
  });

  // 4) UVs. Only the CAP vertices (group materialIndex 0 = front+back lids) take the normalized local-XY
  //    front-print registration (matching createCurvedPlane). The SIDE-WALL vertices (group 1, incl. the
  //    bevel) KEEP ExtrudeGeometry's own world-space UVs so a tiled fondant-grain normal map reads on
  //    them — overwriting every UV (as the shell path could) would collapse the wall UVs and flatten the
  //    grain. Caps and walls own separate vertices, so there's no conflict. Then bend around the cylinder.
  const capVerts = new Set();
  for (const grp of geo.groups) {
    if (grp.materialIndex !== 0) continue;
    const end = grp.start + grp.count;
    for (let k = grp.start; k < end; k++) capVerts.add(geo.index ? geo.index.getX(k) : k);
  }
  const capOnly = capVerts.size > 0;   // fall back to overwrite-all if grouping is unexpectedly absent
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const R = (curveRadius && Number.isFinite(curveRadius)) ? curveRadius / (scale || 1) : null;

  // 4a) `uv1` — a SECOND UV set carrying the front-print registration for the WALL vertices, so the wall
  // material can sample the print's LOCAL colour there (a tree's trunk edge reads brown, its leaf edges
  // green) instead of one flat dominant hue. Read via `map.channel = 1`, which leaves the wall's own `uv`
  // (channel 0) free for the tiling fondant grain — overwriting that would collapse the grain.
  //
  // Sample INWARD, never at the silhouette itself: the outermost pixels are the alpha-antialiased rim, so
  // sampling there paints the wall with a dark halo rather than the body colour. Vertex normals on the
  // UNBENT extrude point straight out in XY for wall vertices, giving the exact local inward direction —
  // `-n.xy`. (Offsetting toward the shape's centroid instead breaks on any concave silhouette: on this
  // tree the leaf tips would sample across empty space.) So: normals first, uv1, THEN bend.
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const inset = WALL_SAMPLE_INSET * size;
  const uv1 = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    let sx = pos.getX(i), sy = pos.getY(i);
    if (capOnly && !capVerts.has(i)) {
      // Wall vertex: step inward along the outward normal's XY. A degenerate (front/back-facing) normal
      // leaves the point where it is rather than pushing it in a meaningless direction.
      const nx = nrm.getX(i), ny = nrm.getY(i);
      const len = Math.hypot(nx, ny);
      if (len > 1e-6) { sx -= (nx / len) * inset; sy -= (ny / len) * inset; }
    }
    uv1[i * 2] = sx / size + 0.5;
    uv1[i * 2 + 1] = sy / size + 0.5;
  }
  geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (!capOnly || capVerts.has(i)) uv.setXY(i, x / size + 0.5, y / size + 0.5);
    if (R !== null) {
      const a = x / R, rho = R + z;
      pos.setXYZ(i, rho * Math.sin(a), y, rho * Math.cos(a) - R);
    }
    // flat (R null): leave (x, y, z) — the parent group orients it (e.g. lies flat on the top surface).
  }
  pos.needsUpdate = true;
  uv.needsUpdate = true;
  geo.computeVertexNormals();   // again: the bend above moved every position
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
