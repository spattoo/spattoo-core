import * as THREE from 'three';
import { mergePenGeometries } from './creamPen.js';

/* ── STAR PIPING, BUILT AS A STACK OF FLAT STARS ──────────────────────────────
 *
 * A second construction for a piped stroke, alongside the swept rope in `creamPen.js`. Sandeep
 * described it and it is worth having literally: cut a sharp star out of card, lay it on the floor,
 * and keep laying more on top. That pile IS a vertical piped stroke.
 *
 * ⚠️ IT IS NOT THE SAME OBJECT AS A SWEPT STAR, even though the two look alike from a distance. A
 * sweep carries the tip's section along a curve and can bend; a stack is `slabs` extrusions of the
 * same flat shape, and what it gains is that every slab is an independent piece — its own size, its
 * own turn — so the stroke breathes up its length the way a real one does, and the slab edges leave
 * the faint horizontal grain a piped stroke has.
 *
 * Kept in `src/` rather than in the harness because it is meant to become a wall, not to stay a
 * demo: `dev/star-piping.jsx` is the page that judges it.
 */

/* ⚠️ `notch` IS THE ANGLE OF THE V, AND IT IS NOT THE DEPTH. Deepening a star narrows its valleys,
 * but by pulling the inner radius in — which thins the whole stroke. A piped line has a NARROW V
 * between BROAD points, so the cut takes only a fraction of each point's share of the circle and the
 * rest stays out at full radius. 1 is a plain star polygon, where the cut begins where the last ended.
 */
export function starSection(points, depth, notch = 1, per = 8) {
  const shape = new THREE.Shape();
  const span = (Math.PI * 2) / points, half = span / 2, nw = notch * half;
  const at = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  let first = true;
  const put = ([x, y]) => { if (first) { shape.moveTo(x, y); first = false; } else shape.lineTo(x, y); };
  for (let k = 0; k < points; k++) {
    const c = k * span, arc = 2 * (half - nw);
    if (arc < 1e-4) put(at(c, 1));
    else for (let j = 0; j <= per; j++) put(at(c - half + nw + arc * (j / per), 1));
    put(at(c + half, 1 - depth));
  }
  shape.closePath();
  return shape;
}

/* ⚠️ A CREASE IS DARK BECAUSE IT IS OCCLUDED, and the scene's light will not do it for you: it is
 * very nearly a uniform dome, so two faces a few degrees apart shade identically and the star reads
 * as ONE MERGED PANEL however sharp the geometry between them is. Measured — sheen, roughness and
 * clearcoat change it by nothing. Baked here from how far a point sits inside the crest, which for
 * this section runs from `1 − depth` to 1.
 */
function bakeCreaseAO(geo, thickness, depth, ao, cx, cz) {
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const crest = thickness, floor = thickness * (1 - depth), span = Math.max(1e-6, crest - floor);
  for (let i = 0; i < pos.count; i++) {
    const d = (Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz) - floor) / span;
    const k = 1 - ao * (1 - Math.min(1, Math.max(0, d)));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/* One stroke: `slabs` flat stars laid one on another, merged into a single mesh.
 *
 * ⚠️ RENDER IT WITH `flatShading`. `ExtrudeGeometry` shares the vertices at the shape's corners, so
 * `computeVertexNormals` averages the two faces meeting there and rolls every edge over into a
 * smooth shoulder — which is the merged look again, from the other direction.
 */
export function buildStarStack({
  points = 8, depth = 0.55, notch = 1, slabs = 220, height = 2, thickness = 0.22,
  wobble = 0.012, turn = 0.002, roll = 0, ao = 0.8, x = 0, z = 0,
} = {}) {
  const shape = starSection(points, depth, notch);
  const slab = height / slabs;
  const parts = [];
  for (let i = 0; i < slabs; i++) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: slab, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);                                   // lay the star flat, extrude upward
    // Every slab its own size and its own turn — the stroke breathes, and no two are identical.
    const wob = 1 + wobble * (Math.sin(i * 0.31) * 0.6 + Math.sin(i * 0.13 + 1.7) * 0.4);
    g.scale(thickness * wob, 1, thickness * wob);
    g.rotateY(roll + i * turn);
    g.translate(x, -height / 2 + i * slab, z);
    parts.push(g);
  }
  const geo = mergePenGeometries(parts);
  return geo && bakeCreaseAO(geo, thickness, depth, ao, x, z);
}

/* A whole tier's worth: `ropes` strokes round a cake of radius `radius`.
 *
 * ⚠️ THE STROKES SIT ON THE SURFACE. Their spines ride the (radius − thickness) circle so the crest
 * lands on the tier's nominal radius, and the body cylinder goes at (radius − 2·thickness), tangent
 * to them. Piping happens on a cake, not in one.
 */
export function starStackWall({ radius = 1, height = 2, ropes = 24, ...rest } = {}) {
  const t = rest.thickness ?? 0.22;
  const Rc = radius - t;
  const parts = [];
  for (let i = 0; i < ropes; i++) {
    const a = (Math.PI * 2 * i) / ropes;
    // ⚠️ Rolled by its OWN angle, or the face a stroke shows depends on where it sits round the cake.
    parts.push(buildStarStack({ ...rest, height, thickness: t, roll: a, x: Rc * Math.cos(a), z: Rc * Math.sin(a) }));
  }
  return parts.filter(Boolean);
}
