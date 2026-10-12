import * as THREE from 'three';

/* ── One tapered strand, bowed along its length ──────────────────────────────────────────────────
 *
 * A piped grass blade and a gypsophila twig are the same solid: a thin prism that starts at a point,
 * grows along a direction, tapers as it goes and bows away from its own axis. This lived inside
 * `grass.js` as `pushBlade`; it moved here the moment a second caller needed it, rather than being
 * copied (root CLAUDE.md rule 1 — the rule that gets broken by writing something good twice).
 *
 * ⚠️ THREE SIDES IS DELIBERATE and the default stays three. A strand this thin is seen end-on from
 * every angle a cake is viewed at and nobody counts its faces, so three costs a quarter of a round
 * tube and shades identically. Grass draws thousands of these.
 *
 * ⚠️ `r1` IS THE END RADIUS AND IT MATTERS. A blade of grass ends in a POINT (r1 = 0, the default);
 * a flat top end is the single thing that makes piped grass read as a bundle of cut wires. A twig
 * that forks does NOT end in a point — it hands its thickness to the branches that continue from
 * it, so a sprig passes `r1` and keeps the joint solid.
 */
export const STRAND_SIDES = 3;
export const STRAND_SEGS  = 3;

export function pushStrand(pos, nor, idx, {
  origin, dir, bend, len, r0, r1 = 0, taper = 0.8,
  sides = STRAND_SIDES, segs = STRAND_SEGS,
}) {
  const base = idx.baseIndex;
  const up   = dir.clone().normalize();
  /* A frame around the strand's axis. Any perpendicular will do; pick the one that does not
     collapse when the strand happens to point straight up. */
  const ref  = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u    = new THREE.Vector3().crossVectors(up, ref).normalize();
  const v    = new THREE.Vector3().crossVectors(up, u).normalize();

  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const r = r1 + (r0 - r1) * (1 - t) ** taper;
    /* Bow: the strand leans further from its axis the higher up it goes, quadratically, so the base
       stays planted and the tip is what droops. */
    const centre = origin.clone()
      .addScaledVector(up, len * t)
      .addScaledVector(bend, len * t * t);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const nx = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
      pos.push(centre.x + nx.x * r, centre.y + nx.y * r, centre.z + nx.z * r);
      nor.push(nx.x, nx.y, nx.z);
    }
  }
  for (let s = 0; s < segs; s++) {
    for (let k = 0; k < sides; k++) {
      const a = base + s * sides + k;
      const b = base + s * sides + ((k + 1) % sides);
      const c = a + sides, d = b + sides;
      idx.list.push(a, c, b, b, c, d);
    }
  }
  idx.baseIndex += (segs + 1) * sides;
  /* Where the strand ENDED, so a caller that forks can grow the next one from the right place
     instead of recomputing the curve and drifting away from it. */
  return {
    tip: origin.clone().addScaledVector(up, len).addScaledVector(bend, len),
    dir: up.clone().addScaledVector(bend, 2).normalize(),
  };
}

/* The last four lines of every builder in this folder: hand the arrays to a BufferGeometry, index
   it and compute the bounds. Shared because `check:dup` counted it as a clone the moment a second
   builder existed — which is the gate catching a copy before it was committed rather than after. */
export function finishGeometry(pos, nor, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx.list);
  g.computeBoundingSphere();
  return g;
}
