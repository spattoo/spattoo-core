import * as THREE from 'three';
import { isInside } from './regions.js';
import { mergePenGeometries } from './creamPen.js';

// ── A cut panel: chocolate spread, set, and cut ──────────────────────────────────────────────────
//
// The second way a chocolate garnish is made, and the one the reference cakes are built from:
// chocolate spread thin on acetate, left to set, then cut into shapes — triangles standing round a
// rim, circles punched out of them, sometimes two-tone.
//
// ⚠️ THIS IS NOT THE PIPED PATH WITH A THICKER LINE. A piped piece is a PATH swept into a rope; a cut
// piece is a REGION extruded into a slab. Everything differs downstream: a panel is solid where a
// filigree is lacy, its edges are cut rather than rounded, and its build guide says "spread, set,
// cut" where the other says "pipe this line, lift, pipe that one". Building one out of the other is
// how a shape tool ends up producing a fat outline where a solid triangle was wanted.
//
// ⚠️ A HOLE IS A REGION INSIDE A REGION, which `regions.js` already finds and `isInside` already
// tests. THREE.Shape takes holes natively, so the punched circles in the reference are not a special
// case here — they are the same cycles the region walk returns, sorted by what contains what.

/* Real tempered chocolate is spread to a couple of millimetres. On a cake of radius ~1.2 world units
 * (a 6–7 inch cake), that is a hair over 0.01. ⚠️ Not a tunable: a panel thick enough to look like a
 * slab is one that would snap rather than bend, and one thin enough to be invisible edge-on is a
 * decal. The number comes from the material, not from taste. */
export const PANEL_THICKNESS = 0.012;

const toVec2 = ring => ring.map(([x, y]) => new THREE.Vector2(x, y));

/**
 * rings   [[x, y], …][] — closed loops in the studio's plate units. The FIRST is the outline; any
 *         that sit inside it become holes. Anything outside is ignored, because a panel is one piece
 *         of chocolate: two separate outlines are two panels, not one with a detached island.
 * scale   plate units → world units
 *
 * Returns `{ geometry, size }`, or `null` when there is nothing to cut.
 *
 * ⚠️ ONE PANEL. For a whole plate — every outline the baker drew, in the arrangement they drew it —
 * call `buildPanelsGeometry` below. That is what a placed garnish is made of; this is the primitive
 * it is built from.
 */
/* `frame` as in `garnishPiece.js`, and for the same reason: a two-tone panel is several slabs that
 * must be placed in ONE frame, or each centres on itself and the inlay lands on top of its host. */
export function buildPanelGeometry(rings, { scale = 1, thickness = PANEL_THICKNESS, frame = null } = {}) {
  const closed = (rings ?? []).filter(r => Array.isArray(r) && r.length >= 4);
  if (!closed.length) return null;

  const [outline, ...rest] = closed;
  /* ⚠️ ONLY the rings that are genuinely inside become holes. A ring that merely overlaps is a
   * different piece of chocolate and punching it would cut a notch out of the panel's edge — which
   * is not what a baker who drew two overlapping shapes asked for. */
  const holes = rest.filter(r => isInside(r, outline));
  return seat(extrudePanel({ outline, holes }, scale, thickness), frame);
}

/**
 * EVERY panel the rings describe, as ONE geometry — the whole plate, not its largest shape.
 *
 * ⚠️ THIS IS WHAT THE CAKE CALLS, AND IT IS THE FUNCTION THAT WAS MISSING. The renderer took
 * `const [panel] = panelsFrom(rings)` under a comment reasoning that "a piece is ONE piece of
 * chocolate; two separate outlines are two garnishes". That is true about chocolate and wrong about
 * this product: the STUDIO puts every shape on one plate and offers one "Use it on the cake", so a
 * baker who brushed three petals got one, silently. Worse, the `Feathered pull` preset lays THREE
 * ribbons from a single tap and `Wide fan` four — deliberately grouped so they move and colour as
 * one gesture — and those were losing two thirds of themselves the moment they were placed, with
 * nothing on screen to say anything had gone. The build guide had it right all along:
 * `garnishGuide.js` walks every panel and tells the baker to cut all of them.
 *
 * Merging is not "placing something nobody made". A sheet of set chocolate peels off as the shapes
 * that are on it, in the arrangement they were drawn in, which is exactly what this builds. Wanting
 * the petals apart ON THE CAKE is Duplicate or Fan on the placed piece, or a second visit to the
 * studio — it was never a reason to throw two of them away.
 *
 * ⚠️ ONE ORIGIN FOR THE WHOLE SET, applied after the merge. Seating each panel on its own
 * bottom-centre first would stack them all at one point and throw the arrangement away — the same
 * trap `frame` exists to avoid for a two-tone piece.
 */
export function buildPanelsGeometry(rings, { scale = 1, thickness = PANEL_THICKNESS, frame = null } = {}) {
  const panels = panelsFrom(rings);
  if (!panels.length) return null;
  const merged = mergePenGeometries(panels.map(pn => extrudePanel(pn, scale, thickness)));
  return merged ? seat(merged, frame) : null;
}

/* One panel, extruded WHERE IT WAS DRAWN and deliberately not seated — seating is the caller's last
   step, once it knows how many panels the piece is made of. */
function extrudePanel(panel, scale, thickness) {
  const flip = ring => toVec2(ring.map(([x, y]) => [x * scale, -y * scale]));
  const shape = new THREE.Shape(flip(panel.outline));
  for (const r of panel.holes) shape.holes.push(new THREE.Path(flip(r)));
  /* No bevel. A cut edge is square — that is what a knife through set chocolate leaves — and a
     bevelled one reads as moulded plastic, which is the single tell that separates a chocolate panel
     from a toy. */
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 12 });
}

/* Bottom-centre origin, the same convention the piped piece uses — a standing panel turns about the
   point where it meets the cake, and every caller can assume one rule rather than two. */
function seat(geometry, frame) {
  geometry.computeBoundingBox();
  const bb = frame ?? geometry.boundingBox.clone();   // cloned: see garnishPiece.js
  const size = { w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y, d: bb.max.z - bb.min.z };
  geometry.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  return { geometry, size, bounds: bb };
}

/**
 * Sort a set of closed rings into panels: each outline with the holes that sit inside it.
 *
 * ⚠️ NESTING IS ONLY TWO DEEP HERE, deliberately. A hole inside a hole is a solid island — real, and
 * cuttable, and vanishingly rare on a cake garnish. Supporting it would mean tracking parity through
 * arbitrary depth for a case nobody has drawn; refusing it silently would be worse, so the third
 * level is simply treated as a hole of the outermost, which is what it looks like from above.
 */
export function panelsFrom(rings) {
  const closed = (rings ?? []).filter(r => Array.isArray(r) && r.length >= 4);
  // Largest first, so an outline is always considered before the things it might contain.
  const byArea = [...closed].sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
  const panels = [];
  for (const ring of byArea) {
    const host = panels.find(p => isInside(ring, p.outline));
    if (host) host.holes.push(ring);
    else panels.push({ outline: ring, holes: [] });
  }
  return panels;
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return sum / 2;
}
