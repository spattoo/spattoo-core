import * as THREE from 'three';
import { buildPipingStroke } from './creamPen.js';

// ── A drawn garnish, as a piece you can pick up ──────────────────────────────────────────────────
//
// The studio produces polylines: an outline, and optionally a fill. This turns them into ONE mesh
// with a size and an origin — the missing noun. Until a drawing is an object it cannot be placed,
// cannot be rotated upright, cannot be dragged, and cannot be saved and used on another cake.
//
// ⚠️ IT IS THE SAME SWEEP THE PEN USES. `buildPipingStroke` builds the rope; this only lays the
// paths flat, merges them and moves the result to a sensible origin. Writing a second, "flat"
// rope-builder would be a copy that drifts — and the whole appeal is that a garnish looks like the
// piped chocolate it is, which means it must be made the way the piped chocolate is made.
//
// ⚠️ FLAT IN X/Y, WITH THE ROPE'S OWN DEPTH IN Z. Piped on parchment, a garnish IS flat: a couple of
// rope-widths thick and no more. The thickness is not a parameter to be tuned upward — a garnish
// thick enough to look like a slab is one that would never have set in that shape. It comes from the
// nozzle, which is where it comes from in life.
//
// ⚠️ THE ORIGIN IS THE BOTTOM-CENTRE OF THE PIECE, NOT ITS MIDDLE, and this is what makes standing
// work. A piece stood upright turns about the point where it meets the cake; with a centred origin
// it would sink half its height into the buttercream, and every standing garnish would need a
// compensating offset applied by whoever placed it — which is how two callers end up disagreeing.

/**
 * paths      [[ [x, y], … ], …] in the studio's own 2D space (its plate)
 * rope       the nozzle's rope radius, in the same units
 * plateSize  the width of the plate the paths were drawn on, so the piece can be scaled to the cake
 *
 * Returns `{ geometry, size, ropeWorld }` — geometry centred on x, resting on y = 0, or `null` when
 * there is nothing to build.
 */
export function buildGarnishGeometry(paths, { rope = 6, plateSize = 420, worldSize = 0.9 } = {}) {
  if (!paths?.length) return null;

  // Studio pixels → cake units. Everything scales together, so a garnish drawn large and one drawn
  // small come out the same size on the cake — what the baker drew is the SHAPE, not the size.
  const k = worldSize / plateSize;
  const ropeWorld = Math.max(0.004, rope * k);

  const parts = [];
  for (const path of paths) {
    if (!path || path.length < 2) continue;
    // Studio y runs DOWN the screen; the cake's runs up. Flipping here rather than at draw time
    // keeps the studio's own maths in screen space, where anyone debugging it expects to find it.
    const pts = path.map(([x, y]) => [x * k, -y * k, 0]);
    const geo = buildPipingStroke(pts, 'round', ropeWorld);
    if (geo) parts.push(geo);
  }
  if (!parts.length) return null;

  const merged = mergeGeometries(parts);
  merged.computeBoundingBox();
  const bb = merged.boundingBox;
  const size = {
    w: bb.max.x - bb.min.x,
    h: bb.max.y - bb.min.y,
    d: bb.max.z - bb.min.z,
  };
  // Bottom-centre origin: x centred, y resting on zero. See the note above — this is what lets a
  // standing piece turn about the point where it touches the cake.
  merged.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  return { geometry: merged, size, ropeWorld };
}

/* Merging by hand rather than pulling in three's BufferGeometryUtils for twenty lines.
 *
 * ⚠️ EXPAND THE INDEX FIRST. The pen's sweep IS indexed (`creamPen.js` calls `setIndex`), and the
 * first version of this ignored that and copied only the position buffer — so the triangles were
 * addressed by an index that no longer existed and the garnish rendered as a scatter of stray
 * fragments. It had a comment claiming the sweep returned non-indexed geometry, which I had not
 * checked. `toNonIndexed()` is core THREE, costs a copy that is then discarded, and makes the buffers
 * say exactly what they mean. */
function mergeGeometries(input) {
  const list = input.map(g => (g.getIndex() ? g.toNonIndexed() : g));
  if (list.length === 1) return list[0];
  let posCount = 0;
  for (const g of list) posCount += g.getAttribute('position').count;

  const pos = new Float32Array(posCount * 3);
  const nor = new Float32Array(posCount * 3);
  let at = 0;
  for (const g of list) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    pos.set(p.array.subarray(0, p.count * 3), at * 3);
    if (n) nor.set(n.array.subarray(0, n.count * 3), at * 3);
    at += p.count;
    g.dispose();                       // each part is consumed here and never referenced again
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/**
 * How a piece sits where it was put.
 *
 * ⚠️ A STANDING PIECE IS PUSHED INTO THE BUTTERCREAM. Without that it rests exactly on the surface,
 * which reads as floating — the one tell that separates a render from a photograph, and the same
 * fault the background-replacement prototype hit with a cake board on a pale backdrop. A real garnish
 * is pressed in until it holds, so the insertion is a fraction of the piece's height, floored so a
 * small piece still gets a bite.
 */
export const INSERT_FRACTION = 0.06;
export const insertionDepth = (height, rope) => Math.max(rope * 1.5, height * INSERT_FRACTION);

/** Where the piece's own origin goes for a given mode. `lie` puts it flat on the surface; `stand`
 *  turns it upright and buries the foot. Rotation is about x, so the piece rises toward the viewer
 *  rather than falling away from them. */
export function garnishTransform(mode, { height = 0.5, rope = 0.02, surfaceY = 0 } = {}) {
  if (mode === 'stand') {
    return { rotation: [0, 0, 0], y: surfaceY - insertionDepth(height, rope) };
  }
  // Lying down: rotate flat so the piece's own "up" becomes the surface's outward normal, and lift
  // it by the rope's radius so it rests ON the surface rather than half-sunk in it.
  return { rotation: [-Math.PI / 2, 0, 0], y: surfaceY + rope };
}
