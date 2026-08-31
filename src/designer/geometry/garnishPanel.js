import * as THREE from 'three';
import { isInside } from './regions.js';

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
 */
export function buildPanelGeometry(rings, { scale = 1, thickness = PANEL_THICKNESS } = {}) {
  const closed = (rings ?? []).filter(r => Array.isArray(r) && r.length >= 4);
  if (!closed.length) return null;

  const [outline, ...rest] = closed;
  const shape = new THREE.Shape(toVec2(outline.map(([x, y]) => [x * scale, -y * scale])));

  /* ⚠️ ONLY the rings that are genuinely inside become holes. A ring that merely overlaps is a
   * different piece of chocolate and punching it would cut a notch out of the panel's edge — which
   * is not what a baker who drew two overlapping shapes asked for. */
  for (const r of rest) {
    if (!isInside(r, outline)) continue;
    shape.holes.push(new THREE.Path(toVec2(r.map(([x, y]) => [x * scale, -y * scale]))));
  }

  /* No bevel. A cut edge is square — that is what a knife through set chocolate leaves — and a
   * bevelled one reads as moulded plastic, which is the single tell that separates a chocolate panel
   * from a toy. */
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 12,
  });

  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const size = { w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y, d: bb.max.z - bb.min.z };

  /* Bottom-centre origin, the same convention the piped piece uses — a standing panel turns about the
   * point where it meets the cake, and every caller can assume one rule rather than two. */
  geometry.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  return { geometry, size };
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
